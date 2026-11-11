-- Warehouse app check-ins must attribute to WHSE, not staff home (KDS).
-- Seed left the fence inactive; activate the confirmed warehouse pin.
UPDATE public.attendance_geofences g
SET
  active = true,
  latitude = 25.0724163,
  longitude = 51.519989,
  radius_meters = 200,
  mode = 'operate',
  name = COALESCE(NULLIF(btrim(g.name), ''), 'Warehouse'),
  updated_at = now()
FROM public.locations l
WHERE g.location_id = l.id
  AND l.code = 'WHSE';
