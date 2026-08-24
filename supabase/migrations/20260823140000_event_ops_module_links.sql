-- Smallest reliable event FK for maintenance requests (same pattern as PRs).
-- Existing rows stay NULL. Work orders stay linked through request.work_order_id.

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_event
  ON public.maintenance_requests (event_id)
  WHERE event_id IS NOT NULL AND deleted_at IS NULL;
