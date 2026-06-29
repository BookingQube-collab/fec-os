-- ============================================================
-- Maintenance module: SLA, requests, logistics, weekly reporting
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.maintenance_priority AS ENUM ('normal', 'medium', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.maintenance_request_status AS ENUM (
    'submitted', 'accepted', 'in_progress', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.delivery_request_status AS ENUM (
    'submitted', 'approved', 'rejected', 'preparing', 'dispatched',
    'verification_pending', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.delivery_item_category AS ENUM (
    'spare_parts', 'tools', 'consumables', 'cleaning_materials',
    'safety_equipment', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS job_order_number text,
  ADD COLUMN IF NOT EXISTS priority public.maintenance_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_breached boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_escalation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_completed_within_sla boolean,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS issue_category text,
  ADD COLUMN IF NOT EXISTS issue_type text,
  ADD COLUMN IF NOT EXISTS reporter_name text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_job_order_number
  ON public.work_orders(job_order_number)
  WHERE job_order_number IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_sla_due
  ON public.work_orders(sla_due_at)
  WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_work_orders_priority_open
  ON public.work_orders(priority, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  area text,
  category text NOT NULL DEFAULT 'General',
  issue_type text,
  priority public.maintenance_priority NOT NULL DEFAULT 'normal',
  description text NOT NULL,
  assigned_technician_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  status public.maintenance_request_status NOT NULL DEFAULT 'submitted',
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  remarks text,
  progress_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_requests_number
  ON public.maintenance_requests(request_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_location_status
  ON public.maintenance_requests(location_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_request_id_fkey;

ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES public.maintenance_requests(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.maintenance_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  kind text NOT NULL DEFAULT 'submission',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_req_attachments_request
  ON public.maintenance_request_attachments(request_id);

CREATE TABLE IF NOT EXISTS public.delivery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  department text,
  requested_by text NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  priority public.maintenance_priority NOT NULL DEFAULT 'normal',
  remarks text,
  status public.delivery_request_status NOT NULL DEFAULT 'submitted',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  dispatch_personnel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dispatched_at timestamptz,
  dispatch_notes text,
  verification_remarks text,
  shortage_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_requests_number
  ON public.delivery_requests(request_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_requests_location_status
  ON public.delivery_requests(location_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.delivery_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  category public.delivery_item_category NOT NULL DEFAULT 'other',
  item_name text NOT NULL,
  quantity_requested numeric(12,2) NOT NULL DEFAULT 1,
  quantity_dispatched numeric(12,2),
  quantity_received numeric(12,2),
  unit text DEFAULT 'ea',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_items_request
  ON public.delivery_request_items(delivery_request_id);

CREATE TABLE IF NOT EXISTS public.delivery_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  signer_role text NOT NULL,
  signer_name text NOT NULL,
  signature_data text NOT NULL,
  signed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_request_id, signer_role)
);

CREATE TABLE IF NOT EXISTS public.delivery_request_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid,
  recipient_email text,
  template_key text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_email_log_source
  ON public.maintenance_email_log(source_type, source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.maintenance_requests,
  public.maintenance_request_attachments,
  public.delivery_requests,
  public.delivery_request_items,
  public.delivery_signatures,
  public.delivery_request_photos,
  public.maintenance_email_log
TO authenticated;
GRANT ALL ON
  public.maintenance_requests,
  public.maintenance_request_attachments,
  public.delivery_requests,
  public.delivery_request_items,
  public.delivery_signatures,
  public.delivery_request_photos,
  public.maintenance_email_log
TO service_role;

ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_request_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maint_requests scoped" ON public.maintenance_requests
  FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "maint_req_attach scoped" ON public.maintenance_request_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenance_requests mr
      WHERE mr.id = request_id AND public.user_can_access_location(mr.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maintenance_requests mr
      WHERE mr.id = request_id AND public.user_can_access_location(mr.location_id)
    )
  );

CREATE POLICY "delivery_requests scoped" ON public.delivery_requests
  FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "delivery_items scoped" ON public.delivery_request_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = delivery_request_id AND public.user_can_access_location(dr.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = delivery_request_id AND public.user_can_access_location(dr.location_id)
    )
  );

CREATE POLICY "delivery_sigs scoped" ON public.delivery_signatures
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = delivery_request_id AND public.user_can_access_location(dr.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = delivery_request_id AND public.user_can_access_location(dr.location_id)
    )
  );

CREATE POLICY "delivery_photos scoped" ON public.delivery_request_photos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = delivery_request_id AND public.user_can_access_location(dr.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = delivery_request_id AND public.user_can_access_location(dr.location_id)
    )
  );

CREATE POLICY "maint_email_log read managers" ON public.maintenance_email_log
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 50);

CREATE POLICY "maint_email_log insert service" ON public.maintenance_email_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE TRIGGER trg_maint_requests_updated
  BEFORE UPDATE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_delivery_requests_updated
  BEFORE UPDATE ON public.delivery_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maintenance-attachments',
  'maintenance-attachments',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "maint_attach_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'maintenance-attachments');

CREATE POLICY "maint_attach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'maintenance-attachments');

CREATE POLICY "maint_attach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'maintenance-attachments' AND public.current_user_role_level() >= 50);

CREATE OR REPLACE FUNCTION public.compute_maintenance_sla(
  _priority public.maintenance_priority,
  _created_at timestamptz DEFAULT now()
)
RETURNS TABLE(sla_response_due_at timestamptz, sla_due_at timestamptz)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  sla_response_due_at := CASE _priority
    WHEN 'urgent' THEN _created_at + interval '1 hour'
    WHEN 'medium' THEN _created_at + interval '24 hours'
    ELSE _created_at + interval '48 hours'
  END;
  sla_due_at := CASE _priority
    WHEN 'urgent' THEN _created_at + interval '4 hours'
    WHEN 'medium' THEN _created_at + interval '24 hours'
    ELSE _created_at + interval '48 hours'
  END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_maintenance_request_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq int;
  today text;
BEGIN
  today := to_char(now() AT TIME ZONE 'Asia/Qatar', 'YYYYMMDD');
  SELECT count(*) + 1 INTO seq
  FROM public.maintenance_requests
  WHERE request_number LIKE 'JO-' || today || '-%'
    AND deleted_at IS NULL;
  RETURN 'JO-' || today || '-' || lpad(seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_delivery_request_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq int;
  today text;
BEGIN
  today := to_char(now() AT TIME ZONE 'Asia/Qatar', 'YYYYMMDD');
  SELECT count(*) + 1 INTO seq
  FROM public.delivery_requests
  WHERE request_number LIKE 'DLV-' || today || '-%'
    AND deleted_at IS NULL;
  RETURN 'DLV-' || today || '-' || lpad(seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_work_order_set_sla()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sla record;
BEGIN
  IF NEW.sla_due_at IS NULL OR TG_OP = 'INSERT' THEN
    SELECT * INTO sla FROM public.compute_maintenance_sla(
      COALESCE(NEW.priority, 'normal'::public.maintenance_priority),
      COALESCE(NEW.created_at, now())
    );
    NEW.sla_response_due_at := sla.sla_response_due_at;
    NEW.sla_due_at := sla.sla_due_at;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.priority IS DISTINCT FROM NEW.priority
     AND NEW.status NOT IN ('completed', 'cancelled') THEN
    SELECT * INTO sla FROM public.compute_maintenance_sla(NEW.priority, now());
    NEW.sla_response_due_at := sla.sla_response_due_at;
    NEW.sla_due_at := sla.sla_due_at;
    NEW.sla_escalation_sent_at := NULL;
    NEW.sla_breached := false;
  END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NEW.sla_completed_within_sla := (now() <= NEW.sla_due_at);
    NEW.sla_breached := NOT NEW.sla_completed_within_sla;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_order_sla ON public.work_orders;
CREATE TRIGGER trg_work_order_sla
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_order_set_sla();

CREATE OR REPLACE FUNCTION public.run_maintenance_sla_sweep()
RETURNS TABLE(
  work_order_id uuid,
  action text,
  job_order_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  near_breach interval := interval '2 hours';
BEGIN
  FOR r IN
    SELECT wo.id, wo.job_order_number, wo.title, wo.location_id, wo.priority,
           wo.sla_due_at, wo.sla_response_due_at, wo.assigned_to, wo.sla_escalation_sent_at
    FROM public.work_orders wo
    WHERE wo.deleted_at IS NULL
      AND wo.status NOT IN ('completed', 'cancelled')
      AND wo.sla_due_at IS NOT NULL
  LOOP
    IF now() > r.sla_due_at AND NOT EXISTS (
      SELECT 1 FROM public.work_orders w2
      WHERE w2.id = r.id AND w2.sla_breached = true
    ) THEN
      UPDATE public.work_orders
      SET sla_breached = true, updated_at = now()
      WHERE id = r.id;

      work_order_id := r.id;
      action := 'breached';
      job_order_number := r.job_order_number;
      RETURN NEXT;
    ELSIF r.sla_escalation_sent_at IS NULL
      AND r.sla_due_at - near_breach <= now()
      AND now() < r.sla_due_at THEN
      UPDATE public.work_orders
      SET sla_escalation_sent_at = now(), updated_at = now()
      WHERE id = r.id;

      work_order_id := r.id;
      action := 'escalation_reminder';
      job_order_number := r.job_order_number;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_maintenance_sla(public.maintenance_priority, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_maintenance_request_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_delivery_request_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_maintenance_sla_sweep() TO authenticated, service_role;
