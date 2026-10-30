-- ============================================================
-- Phase 0a — Events RLS capability enforcement
-- Replaces FOR ALL location-only policies with SELECT vs write
-- policies that also require events.* capabilities (mirroring
-- src/lib/rbac.ts + role_capability_grants).
--
-- Design choices
-- --------------
-- SELECT requires events.view + location access.
-- Assignees without events.view do NOT gain row visibility here:
-- the app already gates every event read on events.view. A future
-- "my assigned tasks" surface for non-view roles is out of scope.
--
-- Finance tables (budgets, lines, invoices, payables) require
-- events.finance for both SELECT and writes.
--
-- events UPDATE allows edit | manage | approve | finance so that
-- health override, lifecycle status, budget contracted_value, and
-- persistScores continue to work under the same app capabilities.
--
-- Rollback (manual)
-- -----------------
-- DROP POLICY IF EXISTS ... (all events_* / event_* policies created below);
-- Recreate prior FOR ALL policies from:
--   20260822120000_event_project_management.sql
--   20260822220000_event_project_phase4.sql
--   20260822230000_event_project_ops_structure.sql
--   20260823170000_event_department_boq_lines.sql
-- DROP FUNCTION IF EXISTS public.events_capability_allows(text);
-- DROP FUNCTION IF EXISTS public.user_can_access_event(uuid);
-- ============================================================

CREATE OR REPLACE FUNCTION public.events_capability_allows(_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.role_capability_grants g
      ON g.role = ur.role
     AND g.capability = _capability
    WHERE ur.user_id = auth.uid()
      AND COALESCE(g.allowed, CASE _capability
        WHEN 'events.view' THEN ur.role::text = ANY (ARRAY[
          'ceo','coo','cfo','regional_ops','branch_gm','duty_manager','auditor','tech_supervisor'
        ])
        WHEN 'events.create' THEN ur.role::text = ANY (ARRAY[
          'ceo','coo','regional_ops','branch_gm','duty_manager'
        ])
        WHEN 'events.edit' THEN ur.role::text = ANY (ARRAY[
          'ceo','coo','regional_ops','branch_gm','duty_manager'
        ])
        WHEN 'events.manage' THEN ur.role::text = ANY (ARRAY[
          'ceo','coo','regional_ops','branch_gm'
        ])
        WHEN 'events.approve' THEN ur.role::text = ANY (ARRAY[
          'ceo','coo','regional_ops','branch_gm'
        ])
        WHEN 'events.finance' THEN ur.role::text = ANY (ARRAY[
          'ceo','coo','cfo','regional_ops'
        ])
        ELSE false
      END)
  );
$$;

COMMENT ON FUNCTION public.events_capability_allows(text) IS
  'Mirrors app CAPABILITIES for events.* with role_capability_grants overrides. SECURITY DEFINER; search_path=public.';

CREATE OR REPLACE FUNCTION public.user_can_access_event(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = _event_id
      AND public.user_can_access_location(e.location_id)
  );
$$;

COMMENT ON FUNCTION public.user_can_access_event(uuid) IS
  'True when the caller may access the event location. Does not check events.* capabilities.';

GRANT EXECUTE ON FUNCTION public.events_capability_allows(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_event(uuid) TO authenticated, service_role;

-- ---------- events ----------
DROP POLICY IF EXISTS "events_scoped" ON public.events;
DROP POLICY IF EXISTS "events_select" ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
DROP POLICY IF EXISTS "events_update" ON public.events;
DROP POLICY IF EXISTS "events_delete" ON public.events;

CREATE POLICY "events_select" ON public.events
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_location(location_id)
    AND public.events_capability_allows('events.view')
  );

CREATE POLICY "events_insert" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_location(location_id)
    AND public.events_capability_allows('events.create')
  );

CREATE POLICY "events_update" ON public.events
  FOR UPDATE TO authenticated
  USING (
    public.user_can_access_location(location_id)
    AND (
      public.events_capability_allows('events.edit')
      OR public.events_capability_allows('events.manage')
      OR public.events_capability_allows('events.approve')
      OR public.events_capability_allows('events.finance')
    )
  )
  WITH CHECK (
    public.user_can_access_location(location_id)
    AND (
      public.events_capability_allows('events.edit')
      OR public.events_capability_allows('events.manage')
      OR public.events_capability_allows('events.approve')
      OR public.events_capability_allows('events.finance')
    )
  );

CREATE POLICY "events_delete" ON public.events
  FOR DELETE TO authenticated
  USING (
    public.user_can_access_location(location_id)
    AND public.events_capability_allows('events.manage')
  );

-- ---------- helpers for child policies ----------
-- Non-finance: view for SELECT; edit for mutate
-- Finance: finance for SELECT + mutate

-- event_team_members
DROP POLICY IF EXISTS "event_children_team" ON public.event_team_members;
DROP POLICY IF EXISTS "event_team_select" ON public.event_team_members;
DROP POLICY IF EXISTS "event_team_insert" ON public.event_team_members;
DROP POLICY IF EXISTS "event_team_update" ON public.event_team_members;
DROP POLICY IF EXISTS "event_team_delete" ON public.event_team_members;

CREATE POLICY "event_team_select" ON public.event_team_members
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_event(event_id)
    AND public.events_capability_allows('events.view')
  );
CREATE POLICY "event_team_insert" ON public.event_team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_event(event_id)
    AND public.events_capability_allows('events.edit')
  );
CREATE POLICY "event_team_update" ON public.event_team_members
  FOR UPDATE TO authenticated
  USING (
    public.user_can_access_event(event_id)
    AND public.events_capability_allows('events.edit')
  )
  WITH CHECK (
    public.user_can_access_event(event_id)
    AND public.events_capability_allows('events.edit')
  );
CREATE POLICY "event_team_delete" ON public.event_team_members
  FOR DELETE TO authenticated
  USING (
    public.user_can_access_event(event_id)
    AND public.events_capability_allows('events.edit')
  );

-- event_audit_logs (read stays location-scoped + view; insert needs edit)
DROP POLICY IF EXISTS "event_audit_read" ON public.event_audit_logs;
DROP POLICY IF EXISTS "event_audit_insert" ON public.event_audit_logs;

CREATE POLICY "event_audit_read" ON public.event_audit_logs
  FOR SELECT TO authenticated
  USING (
    (location_id IS NULL OR public.user_can_access_location(location_id))
    AND public.events_capability_allows('events.view')
  );
CREATE POLICY "event_audit_insert" ON public.event_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (location_id IS NULL OR public.user_can_access_location(location_id))
    AND (
      public.events_capability_allows('events.edit')
      OR public.events_capability_allows('events.manage')
      OR public.events_capability_allows('events.approve')
      OR public.events_capability_allows('events.finance')
    )
  );

-- Generic child tables (non-finance)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'event_scope_versions',
    'event_deliverables',
    'event_wbs_nodes',
    'event_tasks',
    'event_task_dependencies',
    'event_milestones',
    'event_baselines',
    'event_risks',
    'event_readiness_items',
    'event_gate_completions',
    'event_issues',
    'event_documents',
    'event_asset_movements',
    'event_boq_lines'
  ];
  old_names text[] := ARRAY[
    'event_children_scope',
    'event_children_deliverables',
    'event_children_wbs',
    'event_children_tasks',
    'event_children_deps',
    'event_children_milestones',
    'event_children_baselines',
    'event_children_risks',
    'event_children_readiness',
    'event_children_gates',
    'event_children_issues',
    'event_children_documents',
    'event_children_assets',
    'event_children_boq_lines'
  ];
  i int;
  write_cap text;
BEGIN
  FOR i IN 1 .. array_length(tables, 1) LOOP
    t := tables[i];
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_names[i], t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);

    -- Gate completions also allow events.approve writers
    IF t = 'event_gate_completions' THEN
      write_cap := $w$(
        public.events_capability_allows('events.edit')
        OR public.events_capability_allows('events.approve')
      )$w$;
    ELSIF t = 'event_baselines' THEN
      write_cap := $w$(
        public.events_capability_allows('events.edit')
        OR public.events_capability_allows('events.finance')
      )$w$;
    ELSE
      write_cap := $w$public.events_capability_allows('events.edit')$w$;
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.user_can_access_event(event_id) AND public.events_capability_allows(''events.view''))',
      t || '_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.user_can_access_event(event_id) AND %s)',
      t || '_insert', t, write_cap
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.user_can_access_event(event_id) AND %s)
         WITH CHECK (public.user_can_access_event(event_id) AND %s)',
      t || '_update', t, write_cap, write_cap
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (public.user_can_access_event(event_id) AND %s)',
      t || '_delete', t, write_cap
    );
  END LOOP;
END $$;

-- event_task_supporters (keyed by task_id, not event_id)
DROP POLICY IF EXISTS "event_children_task_supporters" ON public.event_task_supporters;
DROP POLICY IF EXISTS "event_task_supporters_select" ON public.event_task_supporters;
DROP POLICY IF EXISTS "event_task_supporters_insert" ON public.event_task_supporters;
DROP POLICY IF EXISTS "event_task_supporters_update" ON public.event_task_supporters;
DROP POLICY IF EXISTS "event_task_supporters_delete" ON public.event_task_supporters;

CREATE POLICY "event_task_supporters_select" ON public.event_task_supporters
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_tasks t
      WHERE t.id = task_id
        AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.view')
  );
CREATE POLICY "event_task_supporters_insert" ON public.event_task_supporters
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.event_tasks t
      WHERE t.id = task_id
        AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.edit')
  );
CREATE POLICY "event_task_supporters_update" ON public.event_task_supporters
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_tasks t
      WHERE t.id = task_id AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.edit')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_tasks t
      WHERE t.id = task_id AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.edit')
  );
CREATE POLICY "event_task_supporters_delete" ON public.event_task_supporters
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_tasks t
      WHERE t.id = task_id AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.edit')
  );

-- Budget baselines embed finance snapshots — require events.finance to SELECT.
DROP POLICY IF EXISTS "event_baselines_select" ON public.event_baselines;
CREATE POLICY "event_baselines_select" ON public.event_baselines
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_event(event_id)
    AND (
      (baseline_type IS DISTINCT FROM 'budget' AND public.events_capability_allows('events.view'))
      OR (baseline_type = 'budget' AND public.events_capability_allows('events.finance'))
    )
  );

-- ---------- Finance tables ----------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'event_budgets',
    'event_budget_lines',
    'event_client_invoices',
    'event_payables'
  ];
  old_names text[] := ARRAY[
    'event_children_budgets',
    'event_children_budget_lines',
    'event_children_invoices',
    'event_children_payables'
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(tables, 1) LOOP
    t := tables[i];
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_names[i], t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.user_can_access_event(event_id) AND public.events_capability_allows(''events.finance''))',
      t || '_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows(''events.finance''))',
      t || '_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.user_can_access_event(event_id) AND public.events_capability_allows(''events.finance''))
         WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows(''events.finance''))',
      t || '_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (public.user_can_access_event(event_id) AND public.events_capability_allows(''events.finance''))',
      t || '_delete', t
    );
  END LOOP;
END $$;
