-- Location kind: warehouses are geo/punch sites only — not branch switcher venues.
-- Safe to re-run.
-- Code WHSE (not WH) — Winter Village already uses WH-WH.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'branch';

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_kind_chk;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_kind_chk CHECK (kind IN ('branch', 'warehouse'));

COMMENT ON COLUMN public.locations.kind IS
  'branch = operational venue (site switcher). warehouse = geo punch site only (Field geofences / self-check).';

-- Ensure every existing row is a branch unless already warehouse.
UPDATE public.locations
SET kind = 'branch'
WHERE kind IS DISTINCT FROM 'warehouse';

INSERT INTO public.locations (code, name, city, region, country, timezone, status, launched_on, kind)
VALUES (
  'WHSE',
  'Warehouse',
  'Doha',
  'Qatar',
  'QA',
  'Asia/Qatar',
  'active',
  NULL,
  'warehouse'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  region = EXCLUDED.region,
  country = EXCLUDED.country,
  timezone = EXCLUDED.timezone,
  status = EXCLUDED.status,
  kind = 'warehouse',
  updated_at = now();

-- Attendance site row so punch recalculation can resolve the warehouse location.
INSERT INTO public.attendance_site_settings (location_id, company_id, attendance_enabled)
SELECT l.id, c.id, true
FROM public.locations l
CROSS JOIN public.hr_companies c
WHERE l.code = 'WHSE'
  AND c.code = 'E3'
ON CONFLICT (location_id) DO NOTHING;

-- Geofence slot for Field settings / self-check GPS (Google Maps pin; inactive until ops activate).
INSERT INTO public.attendance_geofences (location_id, name, latitude, longitude, radius_meters, mode, active)
SELECT l.id, l.name, 25.0724163, 51.519989, 200, 'operate', false
FROM public.locations l
WHERE l.code = 'WHSE'
ON CONFLICT (location_id) DO NOTHING;
