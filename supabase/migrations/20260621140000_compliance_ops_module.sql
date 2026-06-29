-- ============================================================
-- FEC-OS Compliance and Operations Module extensions
-- ============================================================

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS mall text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS floor text;

UPDATE public.locations SET mall = region WHERE mall IS NULL;

ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS contract_ref text;
ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS location_floor text;
ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'Medium';
ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS payment_plan text;
ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS contact text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_amc_contracts_ref ON public.amc_contracts(contract_ref) WHERE contract_ref IS NOT NULL;

ALTER TABLE public.amc_service_schedules ADD COLUMN IF NOT EXISTS visit_label text;

CREATE TABLE IF NOT EXISTS public.amc_payment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
  label text NOT NULL,
  percent numeric(6,2),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_payment_lines_contract ON public.amc_payment_lines(contract_id);

CREATE TABLE IF NOT EXISTS public.compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  item_name text NOT NULL,
  venue_scope text NOT NULL DEFAULT 'All',
  vendor_authority text,
  contract_number text,
  start_date date,
  expiry_date date,
  last_service_date date,
  next_due_date date,
  frequency text,
  renewal_cost numeric(14,2) DEFAULT 0,
  owner text,
  status text NOT NULL DEFAULT 'Active',
  risk_level text DEFAULT 'Medium',
  reminder_days int DEFAULT 30,
  doc_link text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_items_domain ON public.compliance_items(domain);
CREATE INDEX IF NOT EXISTS idx_compliance_items_venue ON public.compliance_items(venue_scope);
CREATE INDEX IF NOT EXISTS idx_compliance_items_expiry ON public.compliance_items(expiry_date);

CREATE TABLE IF NOT EXISTS public.compliance_service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date date NOT NULL,
  contract_item text NOT NULL,
  domain text,
  vendor text,
  venue_scope text NOT NULL DEFAULT 'All',
  service_type text NOT NULL DEFAULT 'Scheduled PM',
  technician text,
  cost numeric(14,2) DEFAULT 0,
  result text NOT NULL DEFAULT 'Pass',
  next_due_date date,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  asset text NOT NULL,
  sent_date date NOT NULL,
  expected_return date,
  actual_return date,
  status text NOT NULL DEFAULT 'In Repair',
  cost numeric(14,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name text NOT NULL,
  role text,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  medical_expiry date,
  food_handler_expiry date,
  first_aid_expiry date,
  qid_expiry date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supervisor_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_ref text,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  category text NOT NULL,
  zone text,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'Open',
  assigned_to text,
  due_date date,
  cost numeric(14,2) DEFAULT 0,
  vendor text,
  remarks text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opening_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_date date NOT NULL DEFAULT CURRENT_DATE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  zone text,
  check_item text NOT NULL,
  status text NOT NULL DEFAULT 'Not Ready',
  checked_by text,
  check_time time,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  footfall int DEFAULT 0,
  revenue numeric(14,2) DEFAULT 0,
  staff_on_duty int DEFAULT 0,
  incidents int DEFAULT 0,
  issues_raised int DEFAULT 0,
  issues_closed int DEFAULT 0,
  opening_readiness_pct numeric(5,2) DEFAULT 0,
  highlights text,
  supervisor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, report_date)
);

-- Enriched compliance view (single source of truth for derived fields)
CREATE OR REPLACE VIEW public.compliance_items_enriched AS
SELECT
  c.*,
  COALESCE(c.next_due_date, c.expiry_date) AS governing_date,
  (COALESCE(c.next_due_date, c.expiry_date) - CURRENT_DATE) AS days_remaining,
  CASE
    WHEN COALESCE(c.next_due_date, c.expiry_date) IS NULL THEN 'No Date'
    WHEN COALESCE(c.next_due_date, c.expiry_date) < CURRENT_DATE THEN 'Expired'
    WHEN COALESCE(c.next_due_date, c.expiry_date) <= CURRENT_DATE + 30 THEN 'Due ≤30'
    WHEN COALESCE(c.next_due_date, c.expiry_date) <= CURRENT_DATE + 60 THEN 'Due ≤60'
    WHEN COALESCE(c.next_due_date, c.expiry_date) <= CURRENT_DATE + 90 THEN 'Due ≤90'
    ELSE 'OK'
  END AS alert_tier
FROM public.compliance_items c;

GRANT SELECT ON public.compliance_items_enriched TO authenticated, service_role;

-- RLS
ALTER TABLE public.amc_payment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amc_payment_lines via contract" ON public.amc_payment_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.amc_contracts c WHERE c.id = contract_id AND public.user_can_access_location(c.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.amc_contracts c WHERE c.id = contract_id AND public.user_can_access_location(c.location_id)));

CREATE POLICY "compliance_items read" ON public.compliance_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "compliance_items write" ON public.compliance_items FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 50) WITH CHECK (public.current_user_role_level() >= 50);

CREATE POLICY "compliance_service_history all" ON public.compliance_service_history FOR ALL TO authenticated USING (true) WITH CHECK (public.current_user_role_level() >= 40);

CREATE POLICY "vendor_repairs scoped" ON public.vendor_repairs FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));

CREATE POLICY "staff_certs scoped" ON public.staff_certifications FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));

CREATE POLICY "supervisor_issues scoped" ON public.supervisor_issues FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "opening_readiness scoped" ON public.opening_readiness FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "daily_reports scoped" ON public.daily_reports FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.amc_payment_lines, public.compliance_items, public.compliance_service_history,
  public.vendor_repairs, public.staff_certifications, public.supervisor_issues,
  public.opening_readiness, public.daily_reports
TO authenticated;
GRANT ALL ON
  public.amc_payment_lines, public.compliance_items, public.compliance_service_history,
  public.vendor_repairs, public.staff_certifications, public.supervisor_issues,
  public.opening_readiness, public.daily_reports
TO service_role;

CREATE TRIGGER trg_amc_payment_lines_updated BEFORE UPDATE ON public.amc_payment_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_compliance_items_updated BEFORE UPDATE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_supervisor_issues_updated BEFORE UPDATE ON public.supervisor_issues
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- Acceptance seed: 6 active AMC + 3 TBC Urban Arena
-- Totals: QAR 64,200 value / 21,400 paid / 42,800 outstanding
-- ============================================================
DO $$
DECLARE
  loc_inf uuid; loc_kds uuid; loc_ua uuid;
  c_hvac uuid; c_fire1 uuid; c_fire2 uuid; c_cctv_inf uuid; c_hood uuid; c_cctv_kds uuid;
  c_tbc1 uuid; c_tbc2 uuid; c_tbc3 uuid;
BEGIN
  SELECT id INTO loc_inf FROM locations WHERE code = 'INF-CC';
  SELECT id INTO loc_kds FROM locations WHERE code = 'KDS-CC';
  SELECT id INTO loc_ua FROM locations WHERE code = 'UA-DM';
  IF loc_inf IS NULL THEN RETURN; END IF;

  -- Remove superseded amc_scheduler demo seed (no contract_ref) before E3 acceptance data
  DELETE FROM amc_payment_lines WHERE contract_id IN (
    SELECT id FROM amc_contracts
    WHERE contract_ref IS NULL
      AND vendor_name IN (
        'Al Safe Fire & Safety', 'SecureVision Qatar', 'CoolTech Services',
        'PestGuard LLC', 'FEC Legal Dept', 'Sparkle Clean Co.'
      )
  );
  DELETE FROM amc_service_schedules WHERE contract_id IN (
    SELECT id FROM amc_contracts
    WHERE contract_ref IS NULL
      AND vendor_name IN (
        'Al Safe Fire & Safety', 'SecureVision Qatar', 'CoolTech Services',
        'PestGuard LLC', 'FEC Legal Dept', 'Sparkle Clean Co.'
      )
  );
  DELETE FROM amc_attachments WHERE contract_id IN (
    SELECT id FROM amc_contracts
    WHERE contract_ref IS NULL
      AND vendor_name IN (
        'Al Safe Fire & Safety', 'SecureVision Qatar', 'CoolTech Services',
        'PestGuard LLC', 'FEC Legal Dept', 'Sparkle Clean Co.'
      )
  );
  DELETE FROM amc_contracts
  WHERE contract_ref IS NULL
    AND vendor_name IN (
      'Al Safe Fire & Safety', 'SecureVision Qatar', 'CoolTech Services',
      'PestGuard LLC', 'FEC Legal Dept', 'Sparkle Clean Co.'
    );

  -- Clear prior demo contracts at these refs (idempotent re-run)
  DELETE FROM amc_payment_lines WHERE contract_id IN (SELECT id FROM amc_contracts WHERE contract_ref LIKE 'E3-AMC-%');
  DELETE FROM amc_service_schedules WHERE contract_id IN (SELECT id FROM amc_contracts WHERE contract_ref LIKE 'E3-AMC-%');
  DELETE FROM amc_contracts WHERE contract_ref LIKE 'E3-AMC-%';

  INSERT INTO amc_contracts (contract_ref, location_id, location_floor, category, vendor_name, contract_start_date, contract_end_date,
    service_frequency, contract_value, paid_amount, payment_status, status, risk_level, payment_plan, scope_of_work, internal_notes, contact)
  VALUES
    ('E3-AMC-HVAC-INF', loc_inf, 'L2', 'hvac_amc', 'Al Adraq HVAC/AC', CURRENT_DATE - 90, CURRENT_DATE + 275, 'quarterly', 24000, 0, 'unpaid', 'active', 'High', '4×25% quarterly', 'HVAC maintenance & filter changes', NULL, 'Al Adraq — 4455 1200'),
    ('E3-AMC-FIRE-INF', loc_inf, 'L2', 'fire_alarm_amc', 'Eurofire', CURRENT_DATE - 60, CURRENT_DATE + 305, 'quarterly', 5500, 2750, 'partially_paid', 'active', 'Critical', '50/50', 'Fire alarm panel & detectors', NULL, 'Eurofire'),
    ('E3-AMC-FIRE-KDS', loc_kds, 'L1', 'fire_alarm_amc', 'Eurofire', CURRENT_DATE - 60, CURRENT_DATE + 305, 'quarterly', 5500, 2750, 'partially_paid', 'active', 'Critical', '50/50', 'Fire alarm panel', NULL, 'Eurofire'),
    ('E3-AMC-CCTV-INF', loc_inf, 'L2', 'cctv_amc', 'Ibra Alofog', CURRENT_DATE - 120, CURRENT_DATE + 245, 'monthly', 12000, 12000, 'paid', 'active', 'Medium', 'Annual prepaid', 'CCTV 16-camera system', NULL, 'Ibra Alofog'),
    ('E3-AMC-HOOD-INF', loc_inf, 'L2', 'kitchen_duct_cleaning', 'Greenshine', CURRENT_DATE - 30, CURRENT_DATE + 335, 'quarterly', 3200, 400, 'partially_paid', 'active', 'High', 'Quarterly', 'Hood & duct cleaning', NULL, 'Greenshine'),
    ('E3-AMC-CCTV-KDS', loc_kds, 'L1', 'cctv_amc', 'Ibra Alofog', CURRENT_DATE - 90, CURRENT_DATE + 275, 'monthly', 14000, 3500, 'partially_paid', 'active', 'Medium', 'Monthly', 'CCTV 12-camera', NULL, 'Ibra Alofog'),
    ('E3-AMC-TBC-UA-1', loc_ua, 'L3', 'hvac_amc', 'TBC', CURRENT_DATE, CURRENT_DATE + 365, 'yearly', 0, 0, 'unpaid', 'tbc', 'Low', NULL, 'Documents not yet received', 'Pending vendor quote', NULL),
    ('E3-AMC-TBC-UA-2', loc_ua, 'L3', 'fire_fighting_amc', 'TBC', CURRENT_DATE, CURRENT_DATE + 365, 'yearly', 0, 0, 'unpaid', 'tbc', 'Low', NULL, 'Documents not yet received', NULL, NULL),
    ('E3-AMC-TBC-UA-3', loc_ua, 'L3', 'pest_control', 'TBC', CURRENT_DATE, CURRENT_DATE + 365, 'monthly', 0, 0, 'unpaid', 'tbc', 'Low', NULL, 'Documents not yet received', NULL, NULL);

  SELECT id INTO c_hvac FROM amc_contracts WHERE contract_ref = 'E3-AMC-HVAC-INF';
  SELECT id INTO c_fire1 FROM amc_contracts WHERE contract_ref = 'E3-AMC-FIRE-INF';
  SELECT id INTO c_fire2 FROM amc_contracts WHERE contract_ref = 'E3-AMC-FIRE-KDS';
  SELECT id INTO c_cctv_inf FROM amc_contracts WHERE contract_ref = 'E3-AMC-CCTV-INF';
  SELECT id INTO c_hood FROM amc_contracts WHERE contract_ref = 'E3-AMC-HOOD-INF';
  SELECT id INTO c_cctv_kds FROM amc_contracts WHERE contract_ref = 'E3-AMC-CCTV-KDS';

  -- Payment lines
  INSERT INTO amc_payment_lines (contract_id, label, percent, amount, due_date, paid, paid_date) VALUES
    (c_hvac, 'Q1 Advance (25%)', 25, 6000, CURRENT_DATE - 60, false, NULL),
    (c_hvac, 'Q2 (25%)', 25, 6000, CURRENT_DATE + 30, false, NULL),
    (c_hvac, 'Q3 (25%)', 25, 6000, CURRENT_DATE + 120, false, NULL),
    (c_hvac, 'Q4 (25%)', 25, 6000, CURRENT_DATE + 210, false, NULL),
    (c_fire1, 'Advance (50%)', 50, 2750, CURRENT_DATE - 30, true, CURRENT_DATE - 28),
    (c_fire1, 'Balance (50%)', 50, 2750, CURRENT_DATE + 150, false, NULL),
    (c_fire2, 'Advance (50%)', 50, 2750, CURRENT_DATE - 30, true, CURRENT_DATE - 28),
    (c_fire2, 'Balance (50%)', 50, 2750, CURRENT_DATE + 150, false, NULL),
    (c_cctv_inf, 'Annual (100%)', 100, 12000, CURRENT_DATE - 90, true, CURRENT_DATE - 88),
    (c_hood, 'Q1 (25%)', 25, 800, CURRENT_DATE - 15, true, CURRENT_DATE - 14),
    (c_hood, 'Q2 (25%)', 25, 800, CURRENT_DATE + 75, false, NULL),
    (c_cctv_kds, 'Month 1-3', 25, 3500, CURRENT_DATE - 60, true, CURRENT_DATE - 58),
    (c_cctv_kds, 'Month 4-6', 25, 3500, CURRENT_DATE + 30, false, NULL);

  -- Service visits (0/4 for quarterly, 2/12 for monthly CCTV)
  INSERT INTO amc_service_schedules (contract_id, service_number, visit_label, planned_date, status) VALUES
    (c_hvac, 1, 'Q1 PPM', CURRENT_DATE - 60, 'pending'),
    (c_hvac, 2, 'Q2 PPM', CURRENT_DATE + 30, 'pending'),
    (c_hvac, 3, 'Q3 PPM', CURRENT_DATE + 120, 'pending'),
    (c_hvac, 4, 'Q4 PPM', CURRENT_DATE + 210, 'pending'),
    (c_fire1, 1, 'Q1 Inspection', CURRENT_DATE + 20, 'pending'),
    (c_fire1, 2, 'Q2 Inspection', CURRENT_DATE + 110, 'pending'),
    (c_fire1, 3, 'Q3 Inspection', CURRENT_DATE + 200, 'pending'),
    (c_fire1, 4, 'Q4 Inspection', CURRENT_DATE + 290, 'pending'),
    (c_cctv_inf, 1, 'Month 1', CURRENT_DATE - 90, 'done'),
    (c_cctv_inf, 2, 'Month 2', CURRENT_DATE - 60, 'done'),
    (c_cctv_inf, 3, 'Month 3', CURRENT_DATE - 30, 'pending'),
    (c_hood, 1, 'Q1 Clean', CURRENT_DATE - 10, 'done'),
    (c_hood, 2, 'Q2 Clean', CURRENT_DATE + 80, 'pending'),
    (c_cctv_kds, 1, 'Month 1', CURRENT_DATE - 60, 'done'),
    (c_cctv_kds, 2, 'Month 2', CURRENT_DATE - 30, 'done'),
    (c_cctv_kds, 3, 'Month 3', CURRENT_DATE, 'pending');

  -- 28 compliance register items across domains
  DELETE FROM compliance_items WHERE item_name LIKE 'E3-REG-%';
  INSERT INTO compliance_items (domain, item_name, venue_scope, vendor_authority, contract_number, start_date, expiry_date, next_due_date, frequency, renewal_cost, owner, status, risk_level) VALUES
    ('Corporate Documents', 'E3-REG-CR', 'All', 'MOCI', 'CR-2020-8841', '2020-01-01', CURRENT_DATE + 180, NULL, 'Yearly', 5000, 'Legal', 'Active', 'Critical'),
    ('Corporate Documents', 'E3-REG-TRADE-INF', 'INF-CC', 'MOCI', 'TL-INF-001', '2024-01-01', CURRENT_DATE + 45, NULL, 'Yearly', 3500, 'Branch GM', 'Active', 'High'),
    ('QCDD', 'E3-REG-QCDD-INF', 'INF-CC', 'QCDD', 'QCDD-8842', '2023-06-01', CURRENT_DATE + 120, CURRENT_DATE + 90, 'Yearly', 8000, 'HSE', 'Active', 'Critical'),
    ('QCDD', 'E3-REG-QCDD-UA', 'UA-DM', 'QCDD', 'QCDD-9011', '2023-08-01', CURRENT_DATE + 200, NULL, 'Yearly', 8000, 'HSE', 'Active', 'Critical'),
    ('Security', 'E3-REG-CCTV-LIC', 'All', 'MOI', 'SEC-2024', '2024-01-01', CURRENT_DATE + 300, NULL, 'Yearly', 2000, 'Security', 'Active', 'Medium'),
    ('HVAC', 'E3-REG-HVAC-INF', 'INF-CC', 'Al Adraq', 'HVAC-24000', CURRENT_DATE - 90, CURRENT_DATE + 275, CURRENT_DATE + 30, 'Quarterly', 24000, 'Maintenance', 'Active', 'High'),
    ('Kitchen', 'E3-REG-HOOD-INF', 'INF-CC', 'Greenshine', NULL, CURRENT_DATE - 30, CURRENT_DATE + 335, CURRENT_DATE + 80, 'Quarterly', 3200, 'Kitchen', 'Active', 'High'),
    ('Pest & Hygiene', 'E3-REG-PEST-UA', 'UA-DM', 'PestGuard', 'PG-2025', CURRENT_DATE - 60, CURRENT_DATE + 305, CURRENT_DATE + 10, 'Monthly', 4800, 'Facilities', 'Active', 'Medium'),
    ('Pest & Hygiene', 'E3-REG-PEST-KDS', 'KDS-CC', 'PestGuard', 'PG-2025B', CURRENT_DATE - 30, CURRENT_DATE + 335, CURRENT_DATE + 25, 'Monthly', 3600, 'Facilities', 'Active', 'Medium'),
    ('Theme Park', 'E3-REG-TP-LIC', 'INF-CC', 'Municipality', 'TP-001', '2023-01-01', CURRENT_DATE - 15, NULL, 'Yearly', 12000, 'Operations', 'Pending Renewal', 'Critical'),
    ('Staff Compliance', 'E3-REG-STAFF-MED', 'All', 'Internal', NULL, NULL, NULL, CURRENT_DATE + 20, 'Yearly', 0, 'HR', 'Active', 'Medium'),
    ('Insurance', 'E3-REG-INS-GROUP', 'All', 'Qatar Insurance', 'POL-99821', '2024-07-01', CURRENT_DATE + 60, NULL, 'Yearly', 85000, 'CFO', 'Active', 'Critical'),
    ('Insurance', 'E3-REG-INS-PL', 'All', 'Qatar Insurance', 'POL-99822', '2024-07-01', CURRENT_DATE + 60, NULL, 'Yearly', 45000, 'CFO', 'Active', 'High'),
    ('AMC Contract', 'E3-REG-AMC-FIRE', 'INF-CC', 'Eurofire', 'EF-5500', CURRENT_DATE - 60, CURRENT_DATE + 305, CURRENT_DATE + 20, 'Quarterly', 5500, 'HSE', 'Active', 'Critical'),
    ('IT', 'E3-REG-IT-SLA', 'All', 'Ooredoo Business', 'IT-500', '2024-01-01', CURRENT_DATE + 250, NULL, 'Yearly', 14400, 'IT', 'Active', 'Low'),
    ('Corporate Documents', 'E3-REG-TRADE-KDS', 'KDS-CC', 'MOCI', 'TL-KDS-001', '2024-03-01', CURRENT_DATE + 90, NULL, 'Yearly', 3500, 'Branch GM', 'Active', 'High'),
    ('Corporate Documents', 'E3-REG-TRADE-UA', 'UA-DM', 'MOCI', 'TL-UA-001', '2024-02-01', CURRENT_DATE + 75, NULL, 'Yearly', 3500, 'Branch GM', 'Active', 'High'),
    ('Security', 'E3-REG-ACCESS-KDS', 'KDS-CC', 'SecureVision', NULL, '2024-01-01', CURRENT_DATE + 180, NULL, 'Yearly', 14000, 'Security', 'Active', 'Medium'),
    ('HVAC', 'E3-REG-HVAC-UA', 'UA-DM', 'CoolTech', NULL, CURRENT_DATE - 45, CURRENT_DATE + 320, CURRENT_DATE + 10, 'Quarterly', 18000, 'Maintenance', 'Active', 'High'),
    ('Kitchen', 'E3-REG-KITCHEN-UA', 'UA-DM', 'Municipality', NULL, '2023-01-01', CURRENT_DATE + 400, NULL, 'Yearly', 0, 'Kitchen', 'Active', 'Medium'),
    ('Pest & Hygiene', 'E3-REG-HYGIENE-INF', 'INF-CC', 'Municipality', NULL, '2024-01-01', CURRENT_DATE + 150, NULL, 'Yearly', 0, 'Kitchen', 'Active', 'Medium'),
    ('Theme Park', 'E3-REG-SAFETY-INF', 'INF-CC', 'Internal', NULL, '2024-01-01', CURRENT_DATE + 30, CURRENT_DATE + 30, 'Monthly', 0, 'HSE', 'Active', 'Critical'),
    ('Staff Compliance', 'E3-REG-FOOD-HANDLER', 'All', 'Internal', NULL, NULL, NULL, CURRENT_DATE + 45, 'Yearly', 0, 'HR', 'Active', 'Medium'),
    ('AMC Contract', 'E3-REG-AMC-CCTV-KDS', 'KDS-CC', 'Ibra Alofog', NULL, CURRENT_DATE - 90, CURRENT_DATE + 275, CURRENT_DATE, 'Monthly', 14000, 'Security', 'Active', 'Medium'),
    ('IT', 'E3-REG-WIFI-ALL', 'All', 'Ooredoo', NULL, '2024-01-01', CURRENT_DATE + 200, NULL, 'Yearly', 9600, 'IT', 'Active', 'Low'),
    ('QCDD', 'E3-REG-FIRE-FIGHT', 'KDS-CC', 'QCDD', NULL, '2023-01-01', CURRENT_DATE + 250, NULL, 'Yearly', 6000, 'HSE', 'Active', 'Critical'),
    ('Security', 'E3-REG-CCTV-INF', 'INF-CC', 'Ibra Alofog', NULL, CURRENT_DATE - 120, CURRENT_DATE + 245, CURRENT_DATE - 30, 'Monthly', 12000, 'Security', 'Active', 'Medium'),
    ('Corporate Documents', 'E3-REG-VAT', 'All', 'GTA', 'VAT-8841', '2020-01-01', NULL, NULL, 'Yearly', 0, 'CFO', 'Active', 'Low');

  -- Staff certifications (~10)
  DELETE FROM staff_certifications WHERE staff_name LIKE 'E3 Staff%';
  INSERT INTO staff_certifications (staff_name, role, location_id, medical_expiry, food_handler_expiry, first_aid_expiry, qid_expiry) VALUES
    ('E3 Staff Ahmed', 'Duty Manager', loc_inf, CURRENT_DATE + 200, CURRENT_DATE + 150, CURRENT_DATE + 90, CURRENT_DATE + 400),
    ('E3 Staff Sara', 'Technician', loc_inf, CURRENT_DATE + 20, NULL, CURRENT_DATE + 180, CURRENT_DATE + 300),
    ('E3 Staff Khalid', 'Host', loc_kds, CURRENT_DATE - 5, CURRENT_DATE + 60, NULL, CURRENT_DATE + 200),
    ('E3 Staff Fatima', 'Supervisor', loc_kds, CURRENT_DATE + 100, CURRENT_DATE + 25, CURRENT_DATE + 100, CURRENT_DATE + 350),
    ('E3 Staff Omar', 'Technician', loc_ua, CURRENT_DATE + 300, NULL, CURRENT_DATE + 15, CURRENT_DATE + 500),
    ('E3 Staff Layla', 'Cashier', loc_ua, CURRENT_DATE + 180, CURRENT_DATE + 10, NULL, CURRENT_DATE + 250),
    ('E3 Staff Hassan', 'GM', loc_inf, CURRENT_DATE + 365, CURRENT_DATE + 200, CURRENT_DATE + 200, CURRENT_DATE + 600),
    ('E3 Staff Noor', 'Host', loc_kds, CURRENT_DATE + 45, CURRENT_DATE + 45, CURRENT_DATE + 45, CURRENT_DATE + 180),
    ('E3 Staff Youssef', 'Technician', loc_ua, CURRENT_DATE + 90, NULL, CURRENT_DATE + 90, CURRENT_DATE + 220),
    ('E3 Staff Mariam', 'HR', loc_inf, CURRENT_DATE + 120, NULL, CURRENT_DATE + 300, CURRENT_DATE + 400);

  -- Sample service history
  DELETE FROM compliance_service_history WHERE contract_item LIKE 'E3-SVC-%';
  INSERT INTO compliance_service_history (service_date, contract_item, domain, vendor, venue_scope, service_type, technician, cost, result, next_due_date) VALUES
    (CURRENT_DATE - 14, 'E3-SVC-HVAC-Q1', 'HVAC', 'Al Adraq', 'INF-CC', 'Scheduled PM', 'Tech A', 0, 'Pass with Obs.', CURRENT_DATE + 30),
    (CURRENT_DATE - 30, 'E3-SVC-CCTV-M2', 'Security', 'Ibra Alofog', 'INF-CC', 'Scheduled PM', 'Tech B', 0, 'Pass', CURRENT_DATE - 30),
    (CURRENT_DATE - 7, 'E3-SVC-HOOD-Q1', 'Kitchen', 'Greenshine', 'INF-CC', 'Inspection', 'Greenshine', 800, 'Pass', CURRENT_DATE + 80),
    (CURRENT_DATE - 45, 'E3-SVC-FIRE-Q1', 'QCDD', 'Eurofire', 'INF-CC', 'Certification', 'Eurofire', 1375, 'Pass', CURRENT_DATE + 20);

END $$;
