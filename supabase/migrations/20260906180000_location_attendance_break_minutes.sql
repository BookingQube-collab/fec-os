-- Per-site attendance break override (minutes).
-- NULL = use code defaults (Urban Arena UA-* → 30, else 60).
ALTER TABLE public.attendance_site_settings
  ADD COLUMN IF NOT EXISTS break_minutes int;

ALTER TABLE public.attendance_site_settings
  DROP CONSTRAINT IF EXISTS attendance_site_settings_break_minutes_chk;

ALTER TABLE public.attendance_site_settings
  ADD CONSTRAINT attendance_site_settings_break_minutes_chk
  CHECK (break_minutes IS NULL OR (break_minutes >= 0 AND break_minutes <= 240));

COMMENT ON COLUMN public.attendance_site_settings.break_minutes IS
  'Paid/unpaid break minutes deducted for attendance calc. NULL uses UA-* → 30 else 60.';

-- Seed Urban Arena sites to 30 when still using the default (NULL).
UPDATE public.attendance_site_settings s
SET break_minutes = 30
FROM public.locations l
WHERE l.id = s.location_id
  AND s.break_minutes IS NULL
  AND (
    upper(l.code) = 'UA'
    OR upper(l.code) LIKE 'UA-%'
    OR upper(l.code) LIKE 'UA\_%' ESCAPE '\'
  );
