-- Completion proof for maintenance requests: who closed, when, signature.
-- Completion photos use maintenance_request_attachments.kind = 'completion'.

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by_name text,
  ADD COLUMN IF NOT EXISTS completion_signature_path text;
