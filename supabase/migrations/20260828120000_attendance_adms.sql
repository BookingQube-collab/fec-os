-- ZKTeco BioPro SA40 (and other ADMS/iClock devices): map serial number to a
-- company/site/device, store push stamps, and record last successful handshake.

ALTER TABLE public.attendance_devices
  ADD COLUMN IF NOT EXISTS adms_attlog_stamp text,
  ADD COLUMN IF NOT EXISTS adms_operlog_stamp text,
  ADD COLUMN IF NOT EXISTS last_adms_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_adms_error text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_devices_serial_number
  ON public.attendance_devices (lower(btrim(serial_number)))
  WHERE serial_number IS NOT NULL AND btrim(serial_number) <> '';

COMMENT ON COLUMN public.attendance_devices.serial_number IS
  'ZKTeco device SN. Required for ADMS/iClock push. Unknown SNs are rejected.';
COMMENT ON COLUMN public.attendance_devices.adms_attlog_stamp IS
  'Last ATTLOG Stamp from the device. Returned on handshake so only new punches are sent.';
COMMENT ON COLUMN public.attendance_devices.adms_operlog_stamp IS
  'Last OPERLOG/USERINFO Stamp from the device.';
COMMENT ON COLUMN public.attendance_devices.connection_mode IS
  'file = USB/user.dat import, adms = device HTTP push to /iclock, pull = LAN agent (not in-app).';
