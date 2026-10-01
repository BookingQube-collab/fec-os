-- Dated temporary site moves. Home (staff.location_id) stays put.
-- Does not write staff_work_locations and does not change staff.location_id.
-- App writes require people.edit_roster. RLS matches staff access:
-- readers of the person or either site can select. Writes require access
-- to the staff row (same gate as editing staff) and the destination site.

CREATE TABLE IF NOT EXISTS public.staff_temporary_site_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  from_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  to_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_temporary_site_moves_dates_chk CHECK (starts_on <= ends_on),
  CONSTRAINT staff_temporary_site_moves_sites_chk CHECK (
    from_location_id IS NULL OR from_location_id <> to_location_id
  )
);

CREATE INDEX IF NOT EXISTS staff_temporary_site_moves_to_idx
  ON public.staff_temporary_site_moves (to_location_id, starts_on, ends_on);

CREATE INDEX IF NOT EXISTS staff_temporary_site_moves_staff_idx
  ON public.staff_temporary_site_moves (staff_id, starts_on);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_temporary_site_moves TO authenticated;
GRANT ALL ON public.staff_temporary_site_moves TO service_role;

ALTER TABLE public.staff_temporary_site_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_temporary_site_moves_select" ON public.staff_temporary_site_moves;
CREATE POLICY "staff_temporary_site_moves_select" ON public.staff_temporary_site_moves
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_staff(staff_id)
    OR public.user_can_access_location(to_location_id)
    OR (from_location_id IS NOT NULL AND public.user_can_access_location(from_location_id))
  );

DROP POLICY IF EXISTS "staff_temporary_site_moves_insert" ON public.staff_temporary_site_moves;
CREATE POLICY "staff_temporary_site_moves_insert" ON public.staff_temporary_site_moves
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_staff(staff_id)
    AND public.user_can_access_location(to_location_id)
    AND (from_location_id IS NULL OR public.user_can_access_location(from_location_id))
  );

DROP POLICY IF EXISTS "staff_temporary_site_moves_update" ON public.staff_temporary_site_moves;
CREATE POLICY "staff_temporary_site_moves_update" ON public.staff_temporary_site_moves
  FOR UPDATE TO authenticated
  USING (public.user_can_access_staff(staff_id))
  WITH CHECK (
    public.user_can_access_staff(staff_id)
    AND public.user_can_access_location(to_location_id)
    AND (from_location_id IS NULL OR public.user_can_access_location(from_location_id))
  );

DROP POLICY IF EXISTS "staff_temporary_site_moves_delete" ON public.staff_temporary_site_moves;
CREATE POLICY "staff_temporary_site_moves_delete" ON public.staff_temporary_site_moves
  FOR DELETE TO authenticated
  USING (public.user_can_access_staff(staff_id));

COMMENT ON TABLE public.staff_temporary_site_moves IS
  'Dated temporary transfer. Home location is unchanged. Not a dedicated work site and not written to staff_work_locations.';
