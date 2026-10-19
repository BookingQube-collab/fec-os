-- Security Advisor: reduce RLS Policy Always True warnings where safe.
-- Audit/log inserts require actor_id = auth.uid(); privileged writes get role checks.
-- Intentional authenticated catalog SELECTs (USING true) are left as residual.

-- ---------------------------------------------------------------------------
-- Audit logs: insert-only for self as actor (service_role bypasses RLS)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "attendance_audit_events insert" ON public.attendance_audit_events;
CREATE POLICY "attendance_audit_events insert" ON public.attendance_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS "event_audit_insert" ON public.event_audit_logs;
CREATE POLICY "event_audit_insert" ON public.event_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS "performance_audit_logs_insert" ON public.performance_audit_logs;
CREATE POLICY "performance_audit_logs_insert" ON public.performance_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Attendance import errors: was WITH CHECK (true); HR+ only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "attendance_import_errors write" ON public.attendance_import_errors;
CREATE POLICY "attendance_import_errors write" ON public.attendance_import_errors
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Compliance service history: FOR ALL + USING (true) allowed any auth DELETE.
-- Split read (open) vs write (role >= 40).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "compliance_service_history all" ON public.compliance_service_history;
CREATE POLICY "compliance_service_history read" ON public.compliance_service_history
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "compliance_service_history write" ON public.compliance_service_history
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 40);
CREATE POLICY "compliance_service_history update" ON public.compliance_service_history
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 40)
  WITH CHECK (public.current_user_role_level() >= 40);
CREATE POLICY "compliance_service_history delete" ON public.compliance_service_history
  FOR DELETE TO authenticated
  USING (public.current_user_role_level() >= 40);

-- ---------------------------------------------------------------------------
-- Department budget increases: insert must be self + HR+
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "department_budget_increases insert" ON public.department_budget_increases;
CREATE POLICY "department_budget_increases insert" ON public.department_budget_increases
  FOR INSERT TO authenticated
  WITH CHECK (
    acted_by = auth.uid()
    AND public.current_user_role_level() >= 55
  );

-- ---------------------------------------------------------------------------
-- E3 compliance: write was USING/WITH CHECK true → match compliance_items (>=50)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "e3_compliance_items write" ON public.e3_compliance_items;
CREATE POLICY "e3_compliance_items write" ON public.e3_compliance_items
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 50)
  WITH CHECK (public.current_user_role_level() >= 50);

-- ---------------------------------------------------------------------------
-- Maintenance lookup masters: inserts go through ensure_* DEFINER RPCs;
-- direct INSERT policies were open — require manager+
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "maintenance_categories insert" ON public.maintenance_categories;
CREATE POLICY "maintenance_categories insert" ON public.maintenance_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "maintenance_issue_types insert" ON public.maintenance_issue_types;
CREATE POLICY "maintenance_issue_types insert" ON public.maintenance_issue_types
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Maintenance email log: insert from authenticated request flows; require session
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "maint_email_log insert service" ON public.maintenance_email_log;
CREATE POLICY "maint_email_log insert service" ON public.maintenance_email_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
