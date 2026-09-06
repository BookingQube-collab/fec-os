-- Per-location expected daily hours by employment role (permanent / secondment / joker).
-- NULL = use code defaults (9 / 10 / 10). break_minutes already exists (UA 30 / else 60).
ALTER TABLE public.attendance_site_settings
  ADD COLUMN IF NOT EXISTS permanent_hours numeric(4, 2),
  ADD COLUMN IF NOT EXISTS secondment_hours numeric(4, 2),
  ADD COLUMN IF NOT EXISTS joker_hours numeric(4, 2);

ALTER TABLE public.attendance_site_settings
  DROP CONSTRAINT IF EXISTS attendance_site_settings_permanent_hours_chk;
ALTER TABLE public.attendance_site_settings
  DROP CONSTRAINT IF EXISTS attendance_site_settings_secondment_hours_chk;
ALTER TABLE public.attendance_site_settings
  DROP CONSTRAINT IF EXISTS attendance_site_settings_joker_hours_chk;

ALTER TABLE public.attendance_site_settings
  ADD CONSTRAINT attendance_site_settings_permanent_hours_chk
  CHECK (permanent_hours IS NULL OR (permanent_hours >= 1 AND permanent_hours <= 16));

ALTER TABLE public.attendance_site_settings
  ADD CONSTRAINT attendance_site_settings_secondment_hours_chk
  CHECK (secondment_hours IS NULL OR (secondment_hours >= 1 AND secondment_hours <= 16));

ALTER TABLE public.attendance_site_settings
  ADD CONSTRAINT attendance_site_settings_joker_hours_chk
  CHECK (joker_hours IS NULL OR (joker_hours >= 1 AND joker_hours <= 16));

COMMENT ON COLUMN public.attendance_site_settings.permanent_hours IS
  'Expected daily shift hours for permanent staff. NULL → 9.';
COMMENT ON COLUMN public.attendance_site_settings.secondment_hours IS
  'Expected daily shift hours for secondment staff. NULL → 10.';
COMMENT ON COLUMN public.attendance_site_settings.joker_hours IS
  'Expected daily shift hours for joker (and legacy temporary) staff. NULL → 10.';
