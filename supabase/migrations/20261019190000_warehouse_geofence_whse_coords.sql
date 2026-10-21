-- Correct warehouse seed: code WHSE (avoid WH vs Winter Village WH-WH), real coords.
-- Idempotent. Covers DBs that already ran 20261019180000 with code WH / placeholder lat-lng.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'branch';

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_kind_chk;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_kind_chk CHECK (kind IN ('branch', 'warehouse'));

-- If an earlier seed created Warehouse as code WH, rename to WHSE (do not touch WH-WH Winter Village).
UPDATE public.locations
SET
  code = 'WHSE',
  name = 'Warehouse',
  kind = 'warehouse',
  status = 'active',
  city = COALESCE(NULLIF(city, ''), 'Doha'),
  region = COALESCE(region, 'Qatar'),
  country = COALESCE(NULLIF(country, ''), 'QA'),
  timezone = COALESCE(NULLIF(timezone, ''), 'Asia/Qatar'),
  updated_at = now()
WHERE code = 'WH'
  AND kind = 'warehouse'
  AND NOT EXISTS (SELECT 1 FROM public.locations WHERE code = 'WHSE');

-- Ensure WHSE warehouse row exists (fresh DBs / failed prior seed).
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
  name = 'Warehouse',
  kind = 'warehouse',
  status = 'active',
  city = COALESCE(NULLIF(public.locations.city, ''), EXCLUDED.city),
  region = COALESCE(public.locations.region, EXCLUDED.region),
  country = COALESCE(NULLIF(public.locations.country, ''), EXCLUDED.country),
  timezone = COALESCE(NULLIF(public.locations.timezone, ''), EXCLUDED.timezone),
  updated_at = now();

-- If WHSE already existed as a branch, force warehouse kind for the geo-only site.
UPDATE public.locations
SET kind = 'warehouse', name = COALESCE(NULLIF(name, ''), 'Warehouse'), updated_at = now()
WHERE code = 'WHSE';

INSERT INTO public.attendance_site_settings (location_id, company_id, attendance_enabled)
SELECT l.id, c.id, true
FROM public.locations l
CROSS JOIN public.hr_companies c
WHERE l.code = 'WHSE'
  AND c.code = 'E3'
ON CONFLICT (location_id) DO NOTHING;

-- Upsert geofence with confirmed warehouse pin (inactive until ops toggle Active + Save).
INSERT INTO public.attendance_geofences (location_id, name, latitude, longitude, radius_meters, mode, active)
SELECT l.id, l.name, 25.0724163, 51.519989, 200, 'operate', false
FROM public.locations l
WHERE l.code = 'WHSE'
ON CONFLICT (location_id) DO UPDATE SET
  name = EXCLUDED.name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  radius_meters = EXCLUDED.radius_meters,
  mode = EXCLUDED.mode,
  -- Keep operator active flag if they already enabled it; only seed inactive on first insert.
  active = public.attendance_geofences.active,
  updated_at = now();

-- If WHSE already existed, an obsolete WH warehouse seed may remain — hide it (never touch WH-WH).
DELETE FROM public.attendance_geofences g
USING public.locations l
WHERE g.location_id = l.id
  AND l.code = 'WH'
  AND l.kind = 'warehouse'
  AND l.name ILIKE 'warehouse';

UPDATE public.locations
SET status = 'closed', updated_at = now()
WHERE code = 'WH'
  AND kind = 'warehouse'
  AND name ILIKE 'warehouse';
