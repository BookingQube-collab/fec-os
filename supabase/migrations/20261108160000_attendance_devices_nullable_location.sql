-- Allow ZKTeco / attendance devices with no site link (event pool / unassigned).
-- Event device picker only offers location_id IS NULL (+ already linked to that event).

ALTER TABLE public.attendance_devices
  ALTER COLUMN location_id DROP NOT NULL;

COMMENT ON COLUMN public.attendance_devices.location_id IS
  'Site this device belongs to. NULL = unassigned (eligible for dedicated event linking).';
