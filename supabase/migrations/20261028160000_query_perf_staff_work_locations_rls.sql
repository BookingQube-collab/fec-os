-- Query performance: staff_work_locations SELECT ~47ms mean under authenticated.
--
-- Prior policy used user_can_access_staff(staff_id), which itself SELECTs from
-- staff_work_locations (home + extra sites). Per-row RLS therefore re-entered
-- the same table and dominated simple staff_id / LIMIT pages.
--
-- New SELECT policy:
--   • row location is on the caller's site list, OR
--   • the linked staff row is the caller (user_id), OR
--   • the caller can access the staff member's home location
-- Home-location access still reveals that person's extra-site links (directory /
-- mapper enrichment) without recursing into staff_work_locations.

DROP POLICY IF EXISTS "staff_work_locations_select" ON public.staff_work_locations;
CREATE POLICY "staff_work_locations_select" ON public.staff_work_locations
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_location(location_id)
    OR EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = staff_id
        AND (
          s.user_id = auth.uid()
          OR public.user_can_access_location(s.location_id)
        )
    )
  );

COMMENT ON POLICY "staff_work_locations_select" ON public.staff_work_locations IS
  'Location-scoped read without recursive staff_work_locations lookup via user_can_access_staff.';
