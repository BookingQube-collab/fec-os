-- ============================================================
-- Phase 1 — Reusable event plan templates (tasks / WBS / readiness)
-- Additive only. RLS mirrors events_capability_allows patterns.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.evt_plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  event_type_id uuid REFERENCES public.evt_event_types(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_evt_plan_templates_active
  ON public.evt_plan_templates (is_active, name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.evt_plan_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.evt_plan_templates(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('task', 'wbs', 'readiness')),
  title text NOT NULL,
  description text,
  workstream_code text,
  parent_key text,
  item_key text,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  is_critical boolean NOT NULL DEFAULT false,
  lifecycle_phase text,
  readiness_code text,
  readiness_category text,
  readiness_weight int NOT NULL DEFAULT 10 CHECK (readiness_weight > 0),
  sort_order int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evt_plan_template_items_template
  ON public.evt_plan_template_items (template_id, sort_order);

ALTER TABLE public.evt_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_plan_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evt_plan_templates_select" ON public.evt_plan_templates;
DROP POLICY IF EXISTS "evt_plan_templates_insert" ON public.evt_plan_templates;
DROP POLICY IF EXISTS "evt_plan_templates_update" ON public.evt_plan_templates;
DROP POLICY IF EXISTS "evt_plan_templates_delete" ON public.evt_plan_templates;

CREATE POLICY "evt_plan_templates_select" ON public.evt_plan_templates
  FOR SELECT TO authenticated
  USING (
    public.events_capability_allows('events.view')
    AND (
      location_id IS NULL
      OR public.user_can_access_location(location_id)
    )
  );

CREATE POLICY "evt_plan_templates_insert" ON public.evt_plan_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.events_capability_allows('events.manage')
    AND (
      location_id IS NULL
      OR public.user_can_access_location(location_id)
    )
  );

CREATE POLICY "evt_plan_templates_update" ON public.evt_plan_templates
  FOR UPDATE TO authenticated
  USING (
    public.events_capability_allows('events.manage')
    AND (
      location_id IS NULL
      OR public.user_can_access_location(location_id)
    )
  )
  WITH CHECK (
    public.events_capability_allows('events.manage')
    AND (
      location_id IS NULL
      OR public.user_can_access_location(location_id)
    )
  );

CREATE POLICY "evt_plan_templates_delete" ON public.evt_plan_templates
  FOR DELETE TO authenticated
  USING (
    public.events_capability_allows('events.manage')
    AND (
      location_id IS NULL
      OR public.user_can_access_location(location_id)
    )
  );

DROP POLICY IF EXISTS "evt_plan_template_items_select" ON public.evt_plan_template_items;
DROP POLICY IF EXISTS "evt_plan_template_items_insert" ON public.evt_plan_template_items;
DROP POLICY IF EXISTS "evt_plan_template_items_update" ON public.evt_plan_template_items;
DROP POLICY IF EXISTS "evt_plan_template_items_delete" ON public.evt_plan_template_items;

CREATE POLICY "evt_plan_template_items_select" ON public.evt_plan_template_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evt_plan_templates t
      WHERE t.id = template_id
        AND t.deleted_at IS NULL
        AND public.events_capability_allows('events.view')
        AND (
          t.location_id IS NULL
          OR public.user_can_access_location(t.location_id)
        )
    )
  );

CREATE POLICY "evt_plan_template_items_insert" ON public.evt_plan_template_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.evt_plan_templates t
      WHERE t.id = template_id
        AND t.deleted_at IS NULL
        AND public.events_capability_allows('events.manage')
        AND (
          t.location_id IS NULL
          OR public.user_can_access_location(t.location_id)
        )
    )
  );

CREATE POLICY "evt_plan_template_items_update" ON public.evt_plan_template_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evt_plan_templates t
      WHERE t.id = template_id
        AND t.deleted_at IS NULL
        AND public.events_capability_allows('events.manage')
        AND (
          t.location_id IS NULL
          OR public.user_can_access_location(t.location_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.evt_plan_templates t
      WHERE t.id = template_id
        AND t.deleted_at IS NULL
        AND public.events_capability_allows('events.manage')
        AND (
          t.location_id IS NULL
          OR public.user_can_access_location(t.location_id)
        )
    )
  );

CREATE POLICY "evt_plan_template_items_delete" ON public.evt_plan_template_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evt_plan_templates t
      WHERE t.id = template_id
        AND t.deleted_at IS NULL
        AND public.events_capability_allows('events.manage')
        AND (
          t.location_id IS NULL
          OR public.user_can_access_location(t.location_id)
        )
    )
  );

COMMENT ON TABLE public.evt_plan_templates IS
  'User-managed reusable plan templates (tasks/WBS/readiness) for Event PM Phase 1.';
COMMENT ON TABLE public.evt_plan_template_items IS
  'Items belonging to evt_plan_templates; applied onto events via applyEventPlanTemplate.';
