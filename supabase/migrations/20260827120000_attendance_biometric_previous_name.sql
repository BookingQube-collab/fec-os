-- Keep device-name history so HR can see a rename without remapping.
-- Mapping identity remains company + site + device + User ID (not the display name).

ALTER TABLE public.attendance_biometric_users
  ADD COLUMN IF NOT EXISTS previous_device_name text;

COMMENT ON COLUMN public.attendance_biometric_users.previous_device_name IS
  'Name on device before the latest user.dat re-import. staff_id is never cleared on rename.';
