-- Display membership for the Arcade Technical locations-and-games list.
-- Hiding a row removes it from that list only. Machines, faults, repairs,
-- and daily checks are not deleted.

CREATE TABLE public.arcade_list_hides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE CASCADE,
  hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_list_hides_one_target CHECK (
    (location_id IS NOT NULL AND machine_id IS NULL)
    OR (location_id IS NULL AND machine_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX arcade_list_hides_location_uidx
  ON public.arcade_list_hides (location_id)
  WHERE location_id IS NOT NULL;

CREATE UNIQUE INDEX arcade_list_hides_machine_uidx
  ON public.arcade_list_hides (machine_id)
  WHERE machine_id IS NOT NULL;

GRANT SELECT, INSERT, DELETE ON public.arcade_list_hides TO authenticated;
GRANT ALL ON public.arcade_list_hides TO service_role;

ALTER TABLE public.arcade_list_hides ENABLE ROW LEVEL SECURITY;

CREATE POLICY arcade_list_hides_read ON public.arcade_list_hides
  FOR SELECT TO authenticated
  USING (
    (
      location_id IS NOT NULL
      AND public.user_can_access_location(location_id)
    )
    OR (
      machine_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.arcade_machines m
        WHERE m.id = machine_id
          AND public.user_can_access_location(m.location_id)
      )
    )
  );

CREATE POLICY arcade_list_hides_insert ON public.arcade_list_hides
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role_level() >= 70
    AND (
      (
        location_id IS NOT NULL
        AND machine_id IS NULL
        AND public.user_can_access_location(location_id)
      )
      OR (
        location_id IS NULL
        AND machine_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.arcade_machines m
          WHERE m.id = machine_id
            AND public.user_can_access_location(m.location_id)
        )
      )
    )
  );

CREATE POLICY arcade_list_hides_delete ON public.arcade_list_hides
  FOR DELETE TO authenticated
  USING (
    public.current_user_role_level() >= 70
    AND (
      (
        location_id IS NOT NULL
        AND public.user_can_access_location(location_id)
      )
      OR (
        machine_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.arcade_machines m
          WHERE m.id = machine_id
            AND public.user_can_access_location(m.location_id)
        )
      )
    )
  );
