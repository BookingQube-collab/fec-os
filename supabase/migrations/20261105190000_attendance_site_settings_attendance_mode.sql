-- Phase 1 location attendance modes (HO vs site).
-- Defaults (locked until product changes them):
--   HO (code = HO / Head Office) → shift_punch (punch in/out; no monthly roster required)
--   Other FEC site locations → roster (current monthly roster + punch behavior)
-- Payroll cut-off stays the existing 28–27 window for all locations in Phase 1
-- (HO timing change deferred). Event workforce / event payroll are Phases 2–4.

ALTER TABLE public.attendance_site_settings
  ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'roster';

ALTER TABLE public.attendance_site_settings
  DROP CONSTRAINT IF EXISTS attendance_site_settings_attendance_mode_chk;

ALTER TABLE public.attendance_site_settings
  ADD CONSTRAINT attendance_site_settings_attendance_mode_chk
  CHECK (attendance_mode IN ('roster', 'shift_punch'));

COMMENT ON COLUMN public.attendance_site_settings.attendance_mode IS
  'roster = monthly roster drives expected days / Absent shells; shift_punch = punch-driven (HO-style), no roster Absent for no-punch days. Phase 1 defaults: HO = shift_punch, sites = roster.';

-- Seed HO as shift_punch; leave every other site on roster (column default).
UPDATE public.attendance_site_settings s
SET attendance_mode = 'shift_punch'
FROM public.locations l
WHERE s.location_id = l.id
  AND (
    upper(trim(l.code)) = 'HO'
    OR lower(trim(l.name)) = 'head office'
    OR lower(trim(l.name)) LIKE 'head office %'
  );

NOTIFY pgrst, 'reload schema';
