-- ============================================================
-- Milestone 3 — Core schema port
-- ============================================================

-- Status enums
CREATE TYPE public.location_status AS ENUM ('active','maintenance','closed','pre_launch');
CREATE TYPE public.attraction_status AS ENUM ('operational','degraded','down','closed');
CREATE TYPE public.asset_criticality AS ENUM ('low','medium','high','critical');
CREATE TYPE public.ticket_status AS ENUM ('open','assigned','in_progress','blocked','resolved','closed','cancelled');
CREATE TYPE public.ticket_priority AS ENUM ('low','normal','high','urgent');
CREATE TYPE public.work_order_status AS ENUM ('planned','in_progress','on_hold','completed','cancelled');
CREATE TYPE public.booking_kind AS ENUM ('party','group','corporate','school');
CREATE TYPE public.booking_status AS ENUM ('quote','deposit','confirmed','delivered','cancelled','no_show');
CREATE TYPE public.complaint_status AS ENUM ('new','investigating','resolved','escalated','dismissed');
CREATE TYPE public.incident_status AS ENUM ('reported','investigating','rca_complete','closed');
CREATE TYPE public.audit_type AS ENUM ('safety','financial','operational','compliance','quality');
CREATE TYPE public.finding_severity AS ENUM ('low','medium','high','critical');
CREATE TYPE public.finding_status AS ENUM ('open','in_remediation','closed','accepted_risk');
CREATE TYPE public.po_status AS ENUM ('draft','pending_approval','approved','rejected','received','closed');
CREATE TYPE public.leakage_status AS ENUM ('detected','investigating','confirmed','recovered','dismissed');
CREATE TYPE public.ai_artifact_kind AS ENUM ('daily_brief','leakage_rca','forecast','pnl_commentary','rag_answer','board_pack');

-- Generic updated_at touch
-- (tg_set_updated_at already exists from earlier migrations)

-- ============================================================
-- LOCATIONS
-- ============================================================
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  city text NOT NULL,
  region text,
  country text NOT NULL DEFAULT 'AE',
  timezone text NOT NULL DEFAULT 'Asia/Dubai',
  gla_sqm numeric,
  status public.location_status NOT NULL DEFAULT 'active',
  launched_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations view scoped" ON public.locations FOR SELECT TO authenticated
  USING (public.user_can_access_location(id));
CREATE POLICY "locations write exec" ON public.locations FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);
CREATE TRIGGER trg_locations_updated BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Helper macro pattern via repeated policies. We'll create policies per table.

-- ============================================================
-- ATTRACTIONS
-- ============================================================
CREATE TABLE public.attractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  category text,
  capacity int,
  throughput_per_hour int,
  status public.attraction_status NOT NULL DEFAULT 'operational',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attractions TO authenticated;
GRANT ALL ON public.attractions TO service_role;
ALTER TABLE public.attractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attractions scoped" ON public.attractions FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_attractions_updated BEFORE UPDATE ON public.attractions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- ASSETS
-- ============================================================
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  attraction_id uuid REFERENCES public.attractions(id) ON DELETE SET NULL,
  tag text NOT NULL,
  name text NOT NULL,
  category text,
  manufacturer text,
  model text,
  criticality public.asset_criticality NOT NULL DEFAULT 'medium',
  installed_on date,
  warranty_expires_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets scoped" ON public.assets FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- TICKETS (issues)
-- ============================================================
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  attraction_id uuid REFERENCES public.attractions(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category text,
  priority public.ticket_priority NOT NULL DEFAULT 'normal',
  status public.ticket_status NOT NULL DEFAULT 'open',
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets scoped" ON public.tickets FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_tickets_loc_status ON public.tickets(location_id, status);

-- ============================================================
-- WORK ORDERS
-- ============================================================
CREATE TABLE public.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'corrective', -- corrective | preventive | inspection
  status public.work_order_status NOT NULL DEFAULT 'planned',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  planned_hours numeric,
  actual_hours numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
GRANT ALL ON public.work_orders TO service_role;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_orders scoped" ON public.work_orders FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_wo_updated BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- SHIFTS
-- ============================================================
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role_label text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled | active | completed | no_show
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts scoped" ON public.shifts FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  reference text UNIQUE NOT NULL DEFAULT ('BK-' || substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  kind public.booking_kind NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'quote',
  contact_name text NOT NULL,
  contact_phone text,
  contact_email text,
  party_size int NOT NULL DEFAULT 1,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  quote_amount numeric,
  deposit_amount numeric,
  total_amount numeric,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings scoped" ON public.bookings FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'pos', -- pos | online | kiosk | corporate
  category text, -- ticket | fnb | retail | party | other
  payment_method text, -- cash | card | wallet | voucher
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'AED',
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions scoped" ON public.transactions FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE INDEX idx_transactions_loc_time ON public.transactions(location_id, occurred_at DESC);

-- ============================================================
-- COMPLAINTS
-- ============================================================
CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'in_person',
  severity text NOT NULL DEFAULT 'medium',
  category text,
  summary text NOT NULL,
  guest_name text,
  guest_contact text,
  status public.complaint_status NOT NULL DEFAULT 'new',
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "complaints scoped" ON public.complaints FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_complaints_updated BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- INCIDENTS
-- ============================================================
CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL, -- safety | security | medical | property | other
  severity text NOT NULL DEFAULT 'medium',
  summary text NOT NULL,
  detail text,
  status public.incident_status NOT NULL DEFAULT 'reported',
  rca_root_cause text,
  rca_actions text,
  closed_at timestamptz,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidents scoped" ON public.incidents FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_incidents_updated BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- STAFF (HR directory)
-- ============================================================
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_code text UNIQUE NOT NULL,
  full_name text NOT NULL,
  job_title text,
  department text,
  hire_date date,
  status text NOT NULL DEFAULT 'active', -- active | on_leave | terminated
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff scoped" ON public.staff FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_staff_updated BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- TRAINING ENROLLMENTS
-- ============================================================
CREATE TABLE public.training_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  course_name text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  enrolled_on date NOT NULL DEFAULT current_date,
  due_on date,
  completed_on date,
  score numeric,
  status text NOT NULL DEFAULT 'enrolled', -- enrolled | in_progress | completed | overdue
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_enrollments TO authenticated;
GRANT ALL ON public.training_enrollments TO service_role;
ALTER TABLE public.training_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training scoped" ON public.training_enrollments FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_training_updated BEFORE UPDATE ON public.training_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- MALL REQUESTS
-- ============================================================
CREATE TABLE public.mall_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  subject text NOT NULL,
  detail text,
  raised_by text, -- mall contact
  category text,
  status text NOT NULL DEFAULT 'open', -- open | in_progress | responded | closed
  response_due_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mall_requests TO authenticated;
GRANT ALL ON public.mall_requests TO service_role;
ALTER TABLE public.mall_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mall_requests scoped" ON public.mall_requests FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_mall_updated BEFORE UPDATE ON public.mall_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  po_number text UNIQUE NOT NULL DEFAULT ('PO-' || substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  vendor_name text NOT NULL,
  category text,
  description text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'AED',
  status public.po_status NOT NULL DEFAULT 'draft',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po scoped" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- AUDITS + FINDINGS
-- ============================================================
CREATE TABLE public.audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  audit_type public.audit_type NOT NULL,
  conducted_on date NOT NULL DEFAULT current_date,
  auditor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  score numeric,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audits TO authenticated;
GRANT ALL ON public.audits TO service_role;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audits scoped" ON public.audits FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_audits_updated BEFORE UPDATE ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text,
  severity public.finding_severity NOT NULL DEFAULT 'medium',
  status public.finding_status NOT NULL DEFAULT 'open',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_on date,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.findings TO authenticated;
GRANT ALL ON public.findings TO service_role;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "findings scoped" ON public.findings FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_findings_updated BEFORE UPDATE ON public.findings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- OBLIGATIONS
-- ============================================================
CREATE TABLE public.obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text, -- regulatory | contractual | safety | tax
  authority text,
  detail text,
  due_on date,
  recurrence text, -- monthly | quarterly | annual | one_off
  status text NOT NULL DEFAULT 'open', -- open | in_progress | met | overdue
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.obligations TO authenticated;
GRANT ALL ON public.obligations TO service_role;
ALTER TABLE public.obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obligations scoped" ON public.obligations FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_oblig_updated BEFORE UPDATE ON public.obligations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- ESCALATIONS
-- ============================================================
CREATE TABLE public.escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  source text NOT NULL, -- ticket | incident | complaint | audit | other
  source_id uuid,
  title text NOT NULL,
  detail text,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open', -- open | acknowledged | resolved
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalations TO authenticated;
GRANT ALL ON public.escalations TO service_role;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escalations scoped" ON public.escalations FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_escal_updated BEFORE UPDATE ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- LEAKAGE CASES
-- ============================================================
CREATE TABLE public.leakage_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  detected_on date NOT NULL DEFAULT current_date,
  category text NOT NULL, -- discount_abuse | voided_tx | comp_overuse | underring | other
  hypothesis text,
  estimated_loss numeric,
  recovered_amount numeric,
  status public.leakage_status NOT NULL DEFAULT 'detected',
  root_cause text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leakage_cases TO authenticated;
GRANT ALL ON public.leakage_cases TO service_role;
ALTER TABLE public.leakage_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leakage scoped" ON public.leakage_cases FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_leak_updated BEFORE UPDATE ON public.leakage_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- FINANCIAL SNAPSHOTS (daily/monthly P&L)
-- ============================================================
CREATE TABLE public.financial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  period_kind text NOT NULL DEFAULT 'day', -- day | week | month
  period_start date NOT NULL,
  revenue numeric NOT NULL DEFAULT 0,
  cogs numeric NOT NULL DEFAULT 0,
  labor numeric NOT NULL DEFAULT 0,
  rent numeric NOT NULL DEFAULT 0,
  utilities numeric NOT NULL DEFAULT 0,
  marketing numeric NOT NULL DEFAULT 0,
  other_opex numeric NOT NULL DEFAULT 0,
  ebitda numeric GENERATED ALWAYS AS
    (revenue - cogs - labor - rent - utilities - marketing - other_opex) STORED,
  footfall int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, period_kind, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_snapshots TO authenticated;
GRANT ALL ON public.financial_snapshots TO service_role;
ALTER TABLE public.financial_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_snap scoped" ON public.financial_snapshots FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_fin_updated BEFORE UPDATE ON public.financial_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- AI ARTIFACTS
-- ============================================================
CREATE TABLE public.ai_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  kind public.ai_artifact_kind NOT NULL,
  title text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ref text,
  model text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_artifacts TO authenticated;
GRANT ALL ON public.ai_artifacts TO service_role;
ALTER TABLE public.ai_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai scoped" ON public.ai_artifacts FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));

-- ============================================================
-- SEED: 5 demo locations
-- ============================================================
INSERT INTO public.locations (code, name, city, region, country, timezone, gla_sqm, status, launched_on) VALUES
  ('DXB-MOE', 'FunVerse Mall of the Emirates', 'Dubai', 'Dubai', 'AE', 'Asia/Dubai', 4200, 'active', '2022-03-15'),
  ('DXB-DXM', 'FunVerse Dubai Mall', 'Dubai', 'Dubai', 'AE', 'Asia/Dubai', 5800, 'active', '2021-11-01'),
  ('AUH-YMA', 'FunVerse Yas Mall', 'Abu Dhabi', 'Abu Dhabi', 'AE', 'Asia/Dubai', 3600, 'active', '2023-02-20'),
  ('SHJ-CTY', 'FunVerse City Centre Sharjah', 'Sharjah', 'Sharjah', 'AE', 'Asia/Dubai', 2900, 'active', '2023-09-10'),
  ('RAK-ALH', 'FunVerse Al Hamra Mall', 'Ras Al Khaimah', 'RAK', 'AE', 'Asia/Dubai', 2400, 'pre_launch', '2026-08-01');
