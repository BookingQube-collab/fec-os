-- Per-location venue areas for maintenance requests and related ops forms

CREATE TABLE IF NOT EXISTS public.location_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_areas_location_name_unique UNIQUE (location_id, name)
);

CREATE INDEX IF NOT EXISTS idx_location_areas_location_active_sort
  ON public.location_areas(location_id, is_active, sort_order, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_areas TO authenticated;
GRANT ALL ON public.location_areas TO service_role;

ALTER TABLE public.location_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "location_areas read" ON public.location_areas;
CREATE POLICY "location_areas read" ON public.location_areas
  FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));

DROP POLICY IF EXISTS "location_areas write" ON public.location_areas;
CREATE POLICY "location_areas write" ON public.location_areas
  FOR ALL TO authenticated
  USING (
    public.user_can_access_location(location_id)
    AND public.current_user_role_level() >= 55
  )
  WITH CHECK (
    public.user_can_access_location(location_id)
    AND public.current_user_role_level() >= 55
  );

DROP TRIGGER IF EXISTS trg_location_areas_updated ON public.location_areas;
CREATE TRIGGER trg_location_areas_updated
  BEFORE UPDATE ON public.location_areas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Sample Inflatapark (INF-CC) areas for demos / dropdown
INSERT INTO public.location_areas (location_id, name, code, sort_order)
SELECT l.id, v.name, v.code, v.sort_order
FROM public.locations l
CROSS JOIN (
  VALUES
    ('Space Tribe', 'SPACE', 10),
    ('Battle Arena', 'BATTLE', 20),
    ('Inflatable', 'INFLAT', 30),
    ('Arcade Area', 'ARCADE', 40),
    ('Party Area', 'PARTY', 50)
) AS v(name, code, sort_order)
WHERE l.code = 'INF-CC'
ON CONFLICT (location_id, name) DO NOTHING;
