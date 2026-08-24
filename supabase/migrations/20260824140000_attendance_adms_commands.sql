ALTER TABLE public.attendance_devices
  ADD COLUMN IF NOT EXISTS adms_pending_cmd text,
  ADD COLUMN IF NOT EXISTS adms_cmd_id integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS adms_cmd_queued_at timestamptz;

COMMENT ON COLUMN public.attendance_devices.adms_pending_cmd IS
  'ZKTeco getrequest command body without C:id: prefix, e.g. DATA QUERY ATTLOG StartTime=...';
COMMENT ON COLUMN public.attendance_devices.adms_cmd_id IS
  'Incrementing command id returned as C:{id}:{command} on /iclock/getrequest.';
COMMENT ON COLUMN public.attendance_devices.adms_cmd_queued_at IS
  'When HR or hourly cron last queued a fetch. Cleared when the device ACKs /iclock/devicecmd.';
