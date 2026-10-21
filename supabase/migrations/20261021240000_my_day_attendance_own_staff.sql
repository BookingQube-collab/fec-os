-- My Day attendance calendar: employees must see their own daily summaries and
-- roster rows at every site they worked, including sites before a transfer.
-- Policies were location-only (user_can_access_attendance), so after moving
-- (e.g. Inflata Park → KDS) historical days blanked out when location_ids no
-- longer included the old site. Own staff_id rows stay readable; writes still
-- require site attendance access.

DROP POLICY IF EXISTS "attendance_daily_summary scoped" ON public.attendance_daily_summary;
CREATE POLICY "attendance_daily_summary scoped" ON public.attendance_daily_summary FOR ALL TO authenticated
  USING (
    public.user_can_access_attendance(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id
        AND s.user_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (public.user_can_access_attendance(location_id));

DROP POLICY IF EXISTS "attendance_roster_assignments scoped" ON public.attendance_roster_assignments;
CREATE POLICY "attendance_roster_assignments scoped" ON public.attendance_roster_assignments FOR ALL TO authenticated
  USING (
    public.user_can_access_attendance(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id
        AND s.user_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (public.user_can_access_attendance(location_id));

DROP POLICY IF EXISTS "attendance_leave_records scoped" ON public.attendance_leave_records;
CREATE POLICY "attendance_leave_records scoped" ON public.attendance_leave_records FOR ALL TO authenticated
  USING (
    public.user_can_access_attendance(location_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id
        AND s.user_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (public.user_can_access_attendance(location_id));
