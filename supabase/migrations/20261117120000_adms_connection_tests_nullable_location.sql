-- Event-pool devices have location_id NULL. Connection tests must allow the same.

ALTER TABLE public.attendance_adms_connection_tests
  ALTER COLUMN location_id DROP NOT NULL;

COMMENT ON COLUMN public.attendance_adms_connection_tests.location_id IS
  'Site snapshot at test start. NULL when the device is in the event pool (unassigned).';

DROP POLICY IF EXISTS "attendance_adms_connection_tests scoped"
  ON public.attendance_adms_connection_tests;

CREATE POLICY "attendance_adms_connection_tests scoped"
  ON public.attendance_adms_connection_tests
  FOR ALL TO authenticated
  USING (
    (location_id IS NULL AND public.user_can_access_attendance(NULL))
    OR public.user_can_access_location(location_id)
  )
  WITH CHECK (
    (location_id IS NULL AND public.user_can_access_attendance(NULL))
    OR public.user_can_access_location(location_id)
  );
