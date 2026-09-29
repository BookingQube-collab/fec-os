-- Arcade Technical Management
-- Machines are the asset. Sites, staff, vendors, inventory, and notifications stay as they are.

CREATE TABLE public.arcade_number_counters (
  prefix text NOT NULL,
  year int NOT NULL,
  last_value int NOT NULL,
  PRIMARY KEY (prefix, year)
);

CREATE OR REPLACE FUNCTION public.arcade_next_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y int := extract(year FROM now())::int;
  n int;
BEGIN
  INSERT INTO public.arcade_number_counters (prefix, year, last_value)
  VALUES (p_prefix, y, 1)
  ON CONFLICT (prefix, year)
  DO UPDATE SET last_value = public.arcade_number_counters.last_value + 1
  RETURNING last_value INTO n;
  RETURN p_prefix || '-' || y::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_next_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arcade_next_number(text) TO authenticated, service_role;

CREATE TABLE public.arcade_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  name text NOT NULL,
  game_category text NOT NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  area_id uuid REFERENCES public.location_areas(id) ON DELETE SET NULL,
  zone text,
  unit_number text,
  manufacturer text,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  model text,
  serial_number text,
  installed_on date,
  purchased_on date,
  warranty_start date,
  warranty_expires_on date,
  machine_cost numeric(12,2),
  status text NOT NULL DEFAULT 'WORKING',
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  photo_path text,
  power_requirement text,
  network_requirement text,
  ip_address text,
  software_version text,
  controller_pcb text,
  card_rfid_interface text,
  notes text,
  last_pm_on date,
  next_pm_on date,
  last_fault_at timestamptz,
  last_repair_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_machines_status_check CHECK (status IN (
    'WORKING','DOWN','UNDER_REPAIR','UNDER_OBSERVATION','WAITING_PART','WAITING_SUPPLIER','OUT_OF_SERVICE','DECOMMISSIONED'
  ))
);

CREATE TABLE public.arcade_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  previous_status text,
  new_status text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_faults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  machine_id uuid NOT NULL REFERENCES public.arcade_machines(id) ON DELETE RESTRICT,
  unit_number text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  reported_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  category text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'MEDIUM',
  operational_impact text NOT NULL DEFAULT 'PARTIALLY_OPERATIONAL',
  status text NOT NULL DEFAULT 'REPORTED',
  is_repeat boolean NOT NULL DEFAULT false,
  repeat_count int NOT NULL DEFAULT 0,
  prior_fault_id uuid REFERENCES public.arcade_faults(id) ON DELETE SET NULL,
  last_failure_at timestamptz,
  days_since_last_repair int,
  problem text,
  diagnosis text,
  action_taken text,
  parts_used text,
  testing_performed text,
  final_result text,
  recommendations text,
  pm_record_id uuid,
  downtime_started_at timestamptz,
  downtime_ended_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_faults_status_check CHECK (status IN (
    'REPORTED','DIAGNOSING','UNDER_REPAIR','WAITING_PART','WAITING_SUPPLIER','TESTING','UNDER_OBSERVATION','RESOLVED','CLOSED'
  )),
  CONSTRAINT arcade_faults_severity_check CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT arcade_faults_impact_check CHECK (operational_impact IN ('FULLY_OPERATIONAL','PARTIALLY_OPERATIONAL','OUT_OF_SERVICE'))
);

CREATE TABLE public.arcade_fault_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_id uuid NOT NULL REFERENCES public.arcade_faults(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'note',
  body text NOT NULL,
  previous_status text,
  new_status text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_id uuid NOT NULL REFERENCES public.arcade_faults(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES public.arcade_machines(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'IN_PROGRESS',
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_repairs_status_check CHECK (status IN ('IN_PROGRESS','PAUSED','COMPLETED'))
);

CREATE TABLE public.arcade_pm_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  game_category text,
  cadence text NOT NULL,
  custom_interval_days int,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_due_on date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_pm_cadence_check CHECK (cadence IN ('DAILY','WEEKLY','BIWEEKLY','MONTHLY','QUARTERLY','CUSTOM'))
);

CREATE TABLE public.arcade_pm_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.arcade_pm_schedules(id) ON DELETE SET NULL,
  machine_id uuid NOT NULL REFERENCES public.arcade_machines(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  performed_on date NOT NULL DEFAULT CURRENT_DATE,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  issues_found text,
  confirmed boolean NOT NULL DEFAULT false,
  next_pm_on date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_pm_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.arcade_pm_records(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  item_label text NOT NULL,
  result text NOT NULL,
  notes text,
  CONSTRAINT arcade_pm_result_check CHECK (result IN ('PASS','ATTENTION','FAIL','NA'))
);

ALTER TABLE public.arcade_faults
  ADD CONSTRAINT arcade_faults_pm_record_fkey
  FOREIGN KEY (pm_record_id) REFERENCES public.arcade_pm_records(id) ON DELETE SET NULL;

CREATE TABLE public.arcade_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES public.arcade_machines(id) ON DELETE RESTRICT,
  fault_id uuid REFERENCES public.arcade_faults(id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'OPEN',
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_observations_status_check CHECK (status IN ('OPEN','PASSED','ISSUE_FOUND','RETURNED','REOPENED'))
);

CREATE TABLE public.arcade_observation_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.arcade_observations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  checked_on date NOT NULL DEFAULT CURRENT_DATE,
  result text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_observation_result_check CHECK (result IN ('PASS','ISSUE_FOUND'))
);

CREATE TABLE public.arcade_vendor_profiles (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  country text,
  whatsapp text,
  website text,
  technical_contact text,
  technical_phone text,
  sales_contact text,
  sales_phone text,
  address text,
  warranty_terms text,
  typical_lead_days int,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_supplier_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  fault_id uuid REFERENCES public.arcade_faults(id) ON DELETE SET NULL,
  problem text NOT NULL,
  troubleshooting_done text,
  parts_tested text,
  technician_findings text,
  supplier_response text,
  last_contact_at timestamptz,
  next_follow_up_on date,
  first_response_at timestamptz,
  warranty_status text,
  status text NOT NULL DEFAULT 'DRAFT',
  resolved_at timestamptz,
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_supplier_status_check CHECK (status IN (
    'DRAFT','CONTACTED','AWAITING_RESPONSE','SUPPLIER_DIAGNOSING','AWAITING_PART','SOLUTION_RECEIVED','TESTING','RESOLVED','CLOSED'
  ))
);

CREATE TABLE public.arcade_supplier_case_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.arcade_supplier_cases(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_spare_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid UNIQUE REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  part_code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'spare',
  manufacturer text,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  part_number text,
  min_stock numeric(12,2) NOT NULL DEFAULT 0,
  reorder_level numeric(12,2) NOT NULL DEFAULT 0,
  warehouse_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  unit_cost numeric(12,2),
  last_purchase_price numeric(12,2),
  requested_qty numeric(12,2) NOT NULL DEFAULT 0,
  ordered_qty numeric(12,2) NOT NULL DEFAULT 0,
  eta date,
  received_qty numeric(12,2) NOT NULL DEFAULT 0,
  photo_path text,
  spec text,
  notes text,
  supply_status text NOT NULL DEFAULT 'IN_STOCK',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_part_status_check CHECK (supply_status IN (
    'IN_STOCK','LOW_STOCK','REQUESTED','APPROVAL_PENDING','ORDERED','IN_TRANSIT','RECEIVED','OUT_OF_STOCK'
  ))
);

CREATE TABLE public.arcade_part_machines (
  part_id uuid NOT NULL REFERENCES public.arcade_spare_parts(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES public.arcade_machines(id) ON DELETE CASCADE,
  PRIMARY KEY (part_id, machine_id)
);

CREATE TABLE public.arcade_part_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid REFERENCES public.arcade_spare_parts(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE SET NULL,
  fault_id uuid REFERENCES public.arcade_faults(id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  description text NOT NULL,
  qty numeric(12,2) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'REQUESTED',
  eta date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_part_request_status_check CHECK (status IN (
    'REQUESTED','APPROVAL_PENDING','ORDERED','IN_TRANSIT','RECEIVED','REJECTED'
  ))
);

CREATE TABLE public.arcade_part_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.arcade_spare_parts(id) ON DELETE RESTRICT,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  machine_id uuid NOT NULL REFERENCES public.arcade_machines(id) ON DELETE RESTRICT,
  fault_id uuid REFERENCES public.arcade_faults(id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  qty numeric(12,2) NOT NULL,
  unit_cost numeric(12,2),
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  movement_id uuid,
  used_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  manufacturer text,
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE SET NULL,
  model text,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  doc_type text NOT NULL,
  title text NOT NULL,
  notes text,
  error_code text,
  fault_category text,
  part_hint text,
  storage_path text,
  external_url text,
  mime_type text,
  file_name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  reported_on date NOT NULL DEFAULT CURRENT_DATE,
  reported_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  damage_type text NOT NULL,
  description text NOT NULL,
  cause text,
  customer_caused boolean NOT NULL DEFAULT false,
  staff_caused boolean NOT NULL DEFAULT false,
  accidental boolean NOT NULL DEFAULT false,
  estimated_cost numeric(12,2),
  parts_required text,
  supplier_assistance boolean NOT NULL DEFAULT false,
  operational boolean NOT NULL DEFAULT true,
  corrective_action text,
  preventive_action text,
  needs_mapping boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  delivery_on date,
  installed_on date,
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  supplier_technician text,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues text,
  final_acceptance text,
  status text NOT NULL DEFAULT 'DELIVERED',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_install_status_check CHECK (status IN (
    'DELIVERED','ASSEMBLY','INSTALLATION','TESTING','ISSUE_FOUND','SUPPLIER_SUPPORT','COMMISSIONED'
  ))
);

CREATE TABLE public.arcade_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'file',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arcade_week_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE SET NULL,
  task_date date NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'TODO',
  priority text NOT NULL DEFAULT 'normal',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_week_status_check CHECK (status IN ('TODO','STARTED','PAUSED','DONE'))
);

CREATE TABLE public.arcade_import_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_key text,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_mapping boolean NOT NULL DEFAULT true,
  mapping_reason text,
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE SET NULL,
  imported_entity text,
  imported_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX arcade_import_queue_source_key
  ON public.arcade_import_queue (source, external_key)
  WHERE external_key IS NOT NULL;

CREATE TABLE public.arcade_alert_fires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  entity_id uuid NOT NULL,
  fired_on date NOT NULL DEFAULT CURRENT_DATE,
  notification_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, rule_key, entity_id, fired_on)
);

CREATE INDEX idx_arcade_machines_loc_status ON public.arcade_machines (location_id, status);
CREATE INDEX idx_arcade_machines_serial ON public.arcade_machines (serial_number);
CREATE INDEX idx_arcade_machines_next_pm ON public.arcade_machines (next_pm_on) WHERE active;
CREATE INDEX idx_arcade_faults_loc_status ON public.arcade_faults (location_id, status, reported_at DESC);
CREATE INDEX idx_arcade_faults_machine_cat ON public.arcade_faults (machine_id, category, reported_at DESC);
CREATE INDEX idx_arcade_faults_ticket ON public.arcade_faults (ticket_number);
CREATE INDEX idx_arcade_pm_due ON public.arcade_pm_schedules (next_due_on) WHERE active;
CREATE INDEX idx_arcade_pm_records_machine ON public.arcade_pm_records (machine_id, performed_on DESC);
CREATE INDEX idx_arcade_cases_vendor ON public.arcade_supplier_cases (vendor_id, status);
CREATE INDEX idx_arcade_cases_fault ON public.arcade_supplier_cases (fault_id);
CREATE INDEX idx_arcade_parts_status ON public.arcade_spare_parts (supply_status);
CREATE INDEX idx_arcade_docs_search ON public.arcade_documents (machine_id, title);
CREATE INDEX idx_arcade_week_tech ON public.arcade_week_tasks (technician_staff_id, task_date);
CREATE INDEX idx_arcade_attachments_entity ON public.arcade_attachments (entity_type, entity_id);
CREATE INDEX idx_arcade_obs_open ON public.arcade_observations (location_id, status);

CREATE OR REPLACE VIEW public.arcade_site_health
WITH (security_invoker = true) AS
SELECT
  location_id,
  count(*) FILTER (WHERE active AND status <> 'DECOMMISSIONED')::int AS active_machines,
  count(*) FILTER (WHERE active AND status = 'WORKING')::int AS working,
  count(*) FILTER (WHERE active AND status = 'DOWN')::int AS down,
  count(*) FILTER (WHERE active AND status = 'UNDER_REPAIR')::int AS under_repair,
  count(*) FILTER (WHERE active AND status = 'UNDER_OBSERVATION')::int AS under_observation,
  count(*) FILTER (WHERE active AND status = 'WAITING_PART')::int AS waiting_part,
  count(*) FILTER (WHERE active AND status = 'WAITING_SUPPLIER')::int AS waiting_supplier,
  count(*) FILTER (WHERE active AND status = 'OUT_OF_SERVICE')::int AS out_of_service,
  count(*) FILTER (WHERE active AND status <> 'DECOMMISSIONED' AND next_pm_on IS NOT NULL AND next_pm_on < CURRENT_DATE)::int AS pm_overdue,
  count(*) FILTER (WHERE active AND status <> 'DECOMMISSIONED' AND next_pm_on IS NOT NULL AND next_pm_on >= CURRENT_DATE AND next_pm_on <= CURRENT_DATE + 7)::int AS pm_due
FROM public.arcade_machines
GROUP BY location_id;

CREATE OR REPLACE VIEW public.arcade_fault_kpis
WITH (security_invoker = true) AS
SELECT
  count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED'))::int AS open_faults,
  count(*) FILTER (WHERE is_repeat AND status NOT IN ('RESOLVED','CLOSED'))::int AS repeat_faults
FROM public.arcade_faults;

GRANT SELECT ON public.arcade_site_health, public.arcade_fault_kpis TO authenticated, service_role;

-- Number assignment and history guards

CREATE OR REPLACE FUNCTION public.trg_arcade_fault_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  compact text;
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.ticket_number IS NULL OR btrim(NEW.ticket_number) = '') THEN
    NEW.ticket_number := public.arcade_next_number('ARC');
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.ticket_number IS DISTINCT FROM OLD.ticket_number THEN
    RAISE EXCEPTION 'Ticket number cannot be changed';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IN ('RESOLVED','CLOSED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'CLOSED' AND public.current_user_role_level() < 50 THEN
      RAISE EXCEPTION 'Closing a ticket requires Head of Operations approval';
    END IF;
    IF length(btrim(coalesce(NEW.problem, ''))) < 8
      OR length(btrim(coalesce(NEW.diagnosis, ''))) < 8
      OR length(btrim(coalesce(NEW.action_taken, ''))) < 8
      OR length(btrim(coalesce(NEW.parts_used, ''))) < 2
      OR length(btrim(coalesce(NEW.testing_performed, ''))) < 8
      OR length(btrim(coalesce(NEW.final_result, ''))) < 8
      OR length(btrim(coalesce(NEW.recommendations, ''))) < 8 THEN
      RAISE EXCEPTION 'A repair cannot close without problem, diagnosis, action, parts, testing, result, and recommendations';
    END IF;
    compact := lower(regexp_replace(btrim(NEW.final_result), '[^a-z/]', '', 'g'));
    IF compact IN ('resolved', 'done', 'ok', 'fixed', 'closed', 'na') THEN
      RAISE EXCEPTION 'Final result must describe the outcome, not only the word Resolved';
    END IF;
    IF NEW.status = 'RESOLVED' AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.status = 'CLOSED' AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
    IF NEW.downtime_started_at IS NOT NULL AND NEW.downtime_ended_at IS NULL THEN
      NEW.downtime_ended_at := now();
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.arcade_fault_updates (fault_id, location_id, kind, body, previous_status, new_status, created_by)
    VALUES (NEW.id, NEW.location_id, 'status', coalesce(NEW.status, ''), OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_arcade_fault_before
  BEFORE INSERT OR UPDATE ON public.arcade_faults
  FOR EACH ROW EXECUTE FUNCTION public.trg_arcade_fault_before();

CREATE OR REPLACE FUNCTION public.trg_arcade_machine_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'DECOMMISSIONED' THEN
    NEW.active := false;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.arcade_status_history (machine_id, location_id, entity_type, entity_id, previous_status, new_status, created_by)
    VALUES (NEW.id, NEW.location_id, 'machine', NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_arcade_machine_status
  BEFORE UPDATE ON public.arcade_machines
  FOR EACH ROW EXECUTE FUNCTION public.trg_arcade_machine_status();

CREATE OR REPLACE FUNCTION public.trg_arcade_case_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.case_number IS NULL OR btrim(NEW.case_number) = '') THEN
    NEW.case_number := public.arcade_next_number('SUP');
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.case_number IS DISTINCT FROM OLD.case_number THEN
    RAISE EXCEPTION 'Case number cannot be changed';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.troubleshooting_done IS DISTINCT FROM OLD.troubleshooting_done
     AND OLD.troubleshooting_done IS NOT NULL AND btrim(OLD.troubleshooting_done) <> ''
     AND (NEW.troubleshooting_done IS NULL OR btrim(NEW.troubleshooting_done) = '' OR position(OLD.troubleshooting_done in NEW.troubleshooting_done) = 0) THEN
    RAISE EXCEPTION 'Supplier troubleshooting already recorded cannot be erased';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_arcade_case_before
  BEFORE INSERT OR UPDATE ON public.arcade_supplier_cases
  FOR EACH ROW EXECUTE FUNCTION public.trg_arcade_case_before();

CREATE OR REPLACE FUNCTION public.trg_arcade_pm_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.confirmed AND public.current_user_role_level() < 80 THEN
    RAISE EXCEPTION 'Completed PM records cannot be overwritten';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_arcade_pm_lock
  BEFORE UPDATE ON public.arcade_pm_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_arcade_pm_lock();

CREATE OR REPLACE FUNCTION public.trg_arcade_part_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role_level() < 60 THEN
    IF NEW.ordered_qty IS DISTINCT FROM OLD.ordered_qty
       OR NEW.last_purchase_price IS DISTINCT FROM OLD.last_purchase_price
       OR (NEW.supply_status IN ('APPROVAL_PENDING','ORDERED','IN_TRANSIT') AND NEW.supply_status IS DISTINCT FROM OLD.supply_status) THEN
      RAISE EXCEPTION 'Purchasing changes require operations approval';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_arcade_part_purchase
  BEFORE UPDATE ON public.arcade_spare_parts
  FOR EACH ROW EXECUTE FUNCTION public.trg_arcade_part_purchase();

CREATE OR REPLACE FUNCTION public.trg_arcade_repair_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.notes IS NOT NULL AND btrim(OLD.notes) <> '' AND NEW.notes IS DISTINCT FROM OLD.notes THEN
    INSERT INTO public.arcade_fault_updates (fault_id, location_id, kind, body, created_by)
    VALUES (NEW.fault_id, NEW.location_id, 'repair_note', OLD.notes, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_arcade_repair_notes
  BEFORE UPDATE ON public.arcade_repairs
  FOR EACH ROW EXECUTE FUNCTION public.trg_arcade_repair_notes();

CREATE OR REPLACE FUNCTION public.arcade_consume_part(
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_machine_id uuid,
  p_fault_id uuid,
  p_part_id uuid,
  p_staff_id uuid,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_id uuid;
  v_before numeric;
  v_after numeric;
  v_min numeric;
  v_cost numeric;
  v_movement uuid;
  v_usage uuid;
  v_status text;
BEGIN
  IF public.current_user_role_level() < 30 OR NOT public.user_can_access_location(p_location_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT id, quantity_on_hand
    INTO v_stock_id, v_before
  FROM public.inventory_stock
  WHERE item_id = p_item_id AND location_id = p_location_id
  FOR UPDATE;

  IF v_stock_id IS NULL THEN
    RAISE EXCEPTION 'Insufficient stock for this movement.';
  END IF;
  IF p_qty > v_before THEN
    RAISE EXCEPTION 'Insufficient stock for this movement.';
  END IF;

  v_after := v_before - p_qty;
  UPDATE public.inventory_stock
    SET quantity_on_hand = v_after, updated_at = now()
    WHERE id = v_stock_id;

  INSERT INTO public.inventory_movements (
    item_id, location_id, movement_type, quantity, quantity_before, quantity_after,
    reference_type, reference_id, notes, created_by
  ) VALUES (
    p_item_id, p_location_id, 'issue', p_qty, v_before, v_after,
    'arcade_fault', p_fault_id, p_notes, auth.uid()
  ) RETURNING id INTO v_movement;

  SELECT min_stock, unit_cost INTO v_min, v_cost
  FROM public.arcade_spare_parts WHERE id = p_part_id;

  INSERT INTO public.arcade_part_usages (
    part_id, inventory_item_id, machine_id, fault_id, location_id, qty, unit_cost,
    technician_staff_id, movement_id, notes, created_by
  ) VALUES (
    p_part_id, p_item_id, p_machine_id, p_fault_id, p_location_id, p_qty, v_cost,
    p_staff_id, v_movement, p_notes, auth.uid()
  ) RETURNING id INTO v_usage;

  v_status := CASE
    WHEN v_after <= 0 THEN 'OUT_OF_STOCK'
    WHEN v_after <= coalesce(v_min, 0) THEN 'LOW_STOCK'
    ELSE 'IN_STOCK'
  END;

  UPDATE public.arcade_spare_parts
    SET supply_status = CASE
          WHEN supply_status IN ('REQUESTED','APPROVAL_PENDING','ORDERED','IN_TRANSIT') THEN supply_status
          ELSE v_status
        END,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = p_part_id;

  RETURN v_usage;
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_consume_part(uuid, uuid, numeric, uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arcade_consume_part(uuid, uuid, numeric, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;

-- Grants: historical rows are not deletable by technicians

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arcade_machines TO authenticated;
GRANT ALL ON public.arcade_machines TO service_role;

GRANT SELECT, INSERT ON public.arcade_status_history, public.arcade_fault_updates, public.arcade_supplier_case_updates, public.arcade_part_usages, public.arcade_observation_checks, public.arcade_pm_results TO authenticated;
GRANT ALL ON public.arcade_status_history, public.arcade_fault_updates, public.arcade_supplier_case_updates, public.arcade_part_usages, public.arcade_observation_checks, public.arcade_pm_results TO service_role;

GRANT SELECT, INSERT, UPDATE ON
  public.arcade_faults, public.arcade_repairs, public.arcade_pm_schedules, public.arcade_pm_records,
  public.arcade_observations, public.arcade_supplier_cases, public.arcade_spare_parts, public.arcade_part_requests,
  public.arcade_documents, public.arcade_damage_reports, public.arcade_installations, public.arcade_attachments,
  public.arcade_week_tasks, public.arcade_import_queue, public.arcade_vendor_profiles, public.arcade_alert_fires
TO authenticated;
GRANT ALL ON
  public.arcade_faults, public.arcade_repairs, public.arcade_pm_schedules, public.arcade_pm_records,
  public.arcade_observations, public.arcade_supplier_cases, public.arcade_spare_parts, public.arcade_part_requests,
  public.arcade_documents, public.arcade_damage_reports, public.arcade_installations, public.arcade_attachments,
  public.arcade_week_tasks, public.arcade_import_queue, public.arcade_vendor_profiles, public.arcade_alert_fires,
  public.arcade_part_machines, public.arcade_number_counters
TO service_role;

GRANT SELECT, INSERT, DELETE ON public.arcade_part_machines TO authenticated;

GRANT SELECT ON public.arcade_number_counters TO authenticated;

ALTER TABLE public.arcade_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_faults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_fault_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_pm_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_pm_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_pm_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_observation_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_supplier_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_supplier_case_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_spare_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_part_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_part_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_part_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_week_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_import_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_alert_fires ENABLE ROW LEVEL SECURITY;

CREATE POLICY arcade_machines_read ON public.arcade_machines FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_machines_insert ON public.arcade_machines FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 70);
CREATE POLICY arcade_machines_update ON public.arcade_machines FOR UPDATE TO authenticated
  USING (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30)
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);
CREATE POLICY arcade_machines_delete ON public.arcade_machines FOR DELETE TO authenticated
  USING (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 80);

CREATE POLICY arcade_faults_read ON public.arcade_faults FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_faults_write ON public.arcade_faults FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);
CREATE POLICY arcade_faults_update ON public.arcade_faults FOR UPDATE TO authenticated
  USING (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30)
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_repairs_all ON public.arcade_repairs FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_repairs_insert ON public.arcade_repairs FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);
CREATE POLICY arcade_repairs_update ON public.arcade_repairs FOR UPDATE TO authenticated
  USING (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30)
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_history_read ON public.arcade_status_history FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_history_insert ON public.arcade_status_history FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE POLICY arcade_updates_read ON public.arcade_fault_updates FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_updates_insert ON public.arcade_fault_updates FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE POLICY arcade_pm_sched_read ON public.arcade_pm_schedules FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_pm_sched_write ON public.arcade_pm_schedules FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 50 AND (location_id IS NULL OR public.user_can_access_location(location_id)))
  WITH CHECK (public.current_user_role_level() >= 50 AND (location_id IS NULL OR public.user_can_access_location(location_id)));

CREATE POLICY arcade_pm_rec_read ON public.arcade_pm_records FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_pm_rec_insert ON public.arcade_pm_records FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);
CREATE POLICY arcade_pm_rec_update ON public.arcade_pm_records FOR UPDATE TO authenticated
  USING (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30)
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_pm_res_read ON public.arcade_pm_results FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_pm_res_insert ON public.arcade_pm_results FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_obs_read ON public.arcade_observations FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_obs_write ON public.arcade_observations FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);
CREATE POLICY arcade_obs_update ON public.arcade_observations FOR UPDATE TO authenticated
  USING (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30)
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_obs_chk_read ON public.arcade_observation_checks FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_obs_chk_insert ON public.arcade_observation_checks FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_vendor_profiles_read ON public.arcade_vendor_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY arcade_vendor_profiles_write ON public.arcade_vendor_profiles FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 50);
CREATE POLICY arcade_vendor_profiles_update ON public.arcade_vendor_profiles FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 50)
  WITH CHECK (public.current_user_role_level() >= 50);

CREATE POLICY arcade_cases_read ON public.arcade_supplier_cases FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_cases_insert ON public.arcade_supplier_cases FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30 AND (location_id IS NULL OR public.user_can_access_location(location_id)));
CREATE POLICY arcade_cases_update ON public.arcade_supplier_cases FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 30 AND (location_id IS NULL OR public.user_can_access_location(location_id)))
  WITH CHECK (public.current_user_role_level() >= 30 AND (location_id IS NULL OR public.user_can_access_location(location_id)));

CREATE POLICY arcade_case_upd_read ON public.arcade_supplier_case_updates FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_case_upd_insert ON public.arcade_supplier_case_updates FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE POLICY arcade_parts_read ON public.arcade_spare_parts FOR SELECT TO authenticated USING (true);
CREATE POLICY arcade_parts_insert ON public.arcade_spare_parts FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 60);
CREATE POLICY arcade_parts_update ON public.arcade_spare_parts FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 30)
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE POLICY arcade_part_machines_read ON public.arcade_part_machines FOR SELECT TO authenticated USING (true);
CREATE POLICY arcade_part_machines_write ON public.arcade_part_machines FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30);
CREATE POLICY arcade_part_machines_delete ON public.arcade_part_machines FOR DELETE TO authenticated
  USING (public.current_user_role_level() >= 60);

CREATE POLICY arcade_part_req_read ON public.arcade_part_requests FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_part_req_insert ON public.arcade_part_requests FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);
CREATE POLICY arcade_part_req_update ON public.arcade_part_requests FOR UPDATE TO authenticated
  USING (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30)
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_usage_read ON public.arcade_part_usages FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_usage_insert ON public.arcade_part_usages FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_docs_read ON public.arcade_documents FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_docs_insert ON public.arcade_documents FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30 AND (location_id IS NULL OR public.user_can_access_location(location_id)));
CREATE POLICY arcade_docs_update ON public.arcade_documents FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 30)
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE POLICY arcade_damage_read ON public.arcade_damage_reports FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id) OR needs_mapping);
CREATE POLICY arcade_damage_insert ON public.arcade_damage_reports FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30);
CREATE POLICY arcade_damage_update ON public.arcade_damage_reports FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 30)
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE POLICY arcade_install_read ON public.arcade_installations FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY arcade_install_insert ON public.arcade_installations FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);
CREATE POLICY arcade_install_update ON public.arcade_installations FOR UPDATE TO authenticated
  USING (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30)
  WITH CHECK (public.user_can_access_location(location_id) AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_attach_read ON public.arcade_attachments FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_attach_insert ON public.arcade_attachments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE POLICY arcade_week_read ON public.arcade_week_tasks FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_week_insert ON public.arcade_week_tasks FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30);
CREATE POLICY arcade_week_update ON public.arcade_week_tasks FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 30)
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE POLICY arcade_import_read ON public.arcade_import_queue FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 50);
CREATE POLICY arcade_import_insert ON public.arcade_import_queue FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 50);

CREATE POLICY arcade_alerts_read ON public.arcade_alert_fires FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY arcade_alerts_insert ON public.arcade_alert_fires FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY arcade_alerts_update ON public.arcade_alert_fires FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_arcade_machines_updated BEFORE UPDATE ON public.arcade_machines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_faults_updated BEFORE UPDATE ON public.arcade_faults
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_pm_sched_updated BEFORE UPDATE ON public.arcade_pm_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_pm_rec_updated BEFORE UPDATE ON public.arcade_pm_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_obs_updated BEFORE UPDATE ON public.arcade_observations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_cases_updated BEFORE UPDATE ON public.arcade_supplier_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_parts_updated BEFORE UPDATE ON public.arcade_spare_parts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_part_req_updated BEFORE UPDATE ON public.arcade_part_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_docs_updated BEFORE UPDATE ON public.arcade_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_damage_updated BEFORE UPDATE ON public.arcade_damage_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_install_updated BEFORE UPDATE ON public.arcade_installations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_week_updated BEFORE UPDATE ON public.arcade_week_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_arcade_vendor_profile_updated BEFORE UPDATE ON public.arcade_vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'arcade-technical',
  'arcade-technical',
  false,
  26214400,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "arcade technical read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'arcade-technical');
CREATE POLICY "arcade technical insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'arcade-technical' AND public.current_user_role_level() >= 30);
CREATE POLICY "arcade technical delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'arcade-technical' AND public.current_user_role_level() >= 80);
