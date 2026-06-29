-- ============================================================
-- Location Compliance & AMC Master Tracker
-- Extends compliance_documents + amc_contracts — no duplicate systems
-- ============================================================

CREATE TABLE IF NOT EXISTS public.compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_type text NOT NULL,
  area_sub_area text,
  category text NOT NULL,
  requirement_name text NOT NULL,
  document_contract_type text,
  is_required boolean NOT NULL DEFAULT true,
  default_frequency text,
  default_owner text,
  default_department text,
  default_risk_level text NOT NULL DEFAULT 'Medium',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_requirements_type ON public.compliance_requirements(location_type, sort_order);

CREATE TABLE IF NOT EXISTS public.location_compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.compliance_requirements(id) ON DELETE SET NULL,
  area_sub_area text,
  category text NOT NULL,
  requirement_name text NOT NULL,
  document_contract_type text,
  is_required boolean NOT NULL DEFAULT true,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  vendor_name text,
  issuing_authority text,
  cert_contract_number text,
  start_date date,
  issue_date date,
  expiry_date date,
  renewal_due_date date,
  service_frequency text,
  last_service_date date,
  next_service_date date,
  manual_status text,
  risk_level text NOT NULL DEFAULT 'Medium',
  owner text,
  department text,
  quotation_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(14,2) GENERATED ALWAYS AS (GREATEST(quotation_amount - paid_amount, 0)) STORED,
  payment_status text NOT NULL DEFAULT 'unpaid',
  attachment_status text NOT NULL DEFAULT 'none',
  remarks text,
  compliance_document_id uuid REFERENCES public.compliance_documents(id) ON DELETE SET NULL,
  amc_contract_id uuid REFERENCES public.amc_contracts(id) ON DELETE SET NULL,
  vendor_contract_id uuid REFERENCES public.vendor_contracts(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_compliance_items_location ON public.location_compliance_items(location_id);
CREATE INDEX IF NOT EXISTS idx_location_compliance_items_category ON public.location_compliance_items(category);
CREATE INDEX IF NOT EXISTS idx_location_compliance_items_expiry ON public.location_compliance_items(expiry_date);
CREATE INDEX IF NOT EXISTS idx_location_compliance_items_renewal ON public.location_compliance_items(renewal_due_date);

CREATE TABLE IF NOT EXISTS public.location_compliance_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.location_compliance_items(id) ON DELETE CASCADE,
  attachment_type text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_mime text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_compliance_attachments_item ON public.location_compliance_attachments(item_id);

CREATE TABLE IF NOT EXISTS public.compliance_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.location_compliance_items(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  fired_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, rule_type, user_id, fired_on)
);

CREATE OR REPLACE VIEW public.location_compliance_items_enriched AS
SELECT
  i.*,
  l.code AS location_code,
  l.name AS location_name,
  l.region AS location_region,
  COALESCE(i.renewal_due_date, i.expiry_date) AS governing_date,
  (COALESCE(i.renewal_due_date, i.expiry_date) - CURRENT_DATE) AS days_remaining,
  EXISTS (
    SELECT 1 FROM public.location_compliance_attachments a
    WHERE a.item_id = i.id AND a.attachment_type = 'certificate'
  ) AS has_certificate,
  EXISTS (
    SELECT 1 FROM public.location_compliance_attachments a
    WHERE a.item_id = i.id AND a.attachment_type = 'quotation'
  ) AS has_quotation,
  EXISTS (
    SELECT 1 FROM public.location_compliance_attachments a
    WHERE a.item_id = i.id AND a.attachment_type = 'invoice'
  ) AS has_invoice,
  EXISTS (
    SELECT 1 FROM public.location_compliance_attachments a
    WHERE a.item_id = i.id AND a.attachment_type = 'payment_proof'
  ) AS has_payment_proof,
  EXISTS (
    SELECT 1 FROM public.location_compliance_attachments a
    WHERE a.item_id = i.id AND a.attachment_type = 'service_report'
  ) AS has_service_report,
  (
    SELECT count(*)::int FROM public.location_compliance_attachments a WHERE a.item_id = i.id
  ) AS attachment_count,
  CASE
    WHEN i.manual_status = 'Pending Renewal' THEN 'Pending Renewal'
    WHEN i.outstanding_amount > 0 THEN 'Pending Payment'
    WHEN i.next_service_date IS NOT NULL AND i.next_service_date < CURRENT_DATE THEN 'Service Overdue'
    WHEN i.is_required
      AND i.compliance_document_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.location_compliance_attachments a
        WHERE a.item_id = i.id AND a.attachment_type = 'certificate'
      )
      AND COALESCE(i.renewal_due_date, i.expiry_date) IS NULL
      THEN 'Missing'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) IS NOT NULL
      AND COALESCE(i.renewal_due_date, i.expiry_date) < CURRENT_DATE THEN 'Expired'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) IS NOT NULL
      AND COALESCE(i.renewal_due_date, i.expiry_date) <= CURRENT_DATE + 30 THEN 'Due Soon'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) IS NOT NULL THEN 'Valid'
    ELSE 'No Date'
  END AS computed_status,
  CASE
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) IS NULL THEN 'none'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) < CURRENT_DATE THEN 'expired'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) <= CURRENT_DATE + 7 THEN '7d'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) <= CURRENT_DATE + 15 THEN '15d'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) <= CURRENT_DATE + 30 THEN '30d'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) <= CURRENT_DATE + 60 THEN '60d'
    WHEN COALESCE(i.renewal_due_date, i.expiry_date) <= CURRENT_DATE + 90 THEN '90d'
    ELSE 'ok'
  END AS expiry_bucket
FROM public.location_compliance_items i
JOIN public.locations l ON l.id = i.location_id;

GRANT SELECT ON public.location_compliance_items_enriched TO authenticated, service_role;

ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_compliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_compliance_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_requirements read" ON public.compliance_requirements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "compliance_requirements write" ON public.compliance_requirements
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

CREATE POLICY "location_compliance_items scoped" ON public.location_compliance_items
  FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (
    public.user_can_access_location(location_id)
    AND (
      public.current_user_role_level() >= 80
      OR public.current_user_role_level() >= 60
      OR public.current_user_role_level() >= 50
    )
  );

CREATE POLICY "location_compliance_attachments scoped" ON public.location_compliance_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.location_compliance_items i
      WHERE i.id = item_id AND public.user_can_access_location(i.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.location_compliance_items i
      WHERE i.id = item_id AND public.user_can_access_location(i.location_id)
    )
    AND public.current_user_role_level() >= 50
  );

CREATE POLICY "compliance_notification_log read" ON public.compliance_notification_log
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.current_user_role_level() >= 80);
CREATE POLICY "compliance_notification_log insert" ON public.compliance_notification_log
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role_level() >= 50);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.compliance_requirements, public.location_compliance_items,
  public.location_compliance_attachments, public.compliance_notification_log
TO authenticated;
GRANT ALL ON
  public.compliance_requirements, public.location_compliance_items,
  public.location_compliance_attachments, public.compliance_notification_log
TO service_role;

CREATE TRIGGER trg_compliance_requirements_updated BEFORE UPDATE ON public.compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_location_compliance_items_updated BEFORE UPDATE ON public.location_compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- Requirement templates by location type
-- ============================================================
DELETE FROM public.compliance_requirements WHERE location_type IN ('inflatapark', 'kids_driving_school', 'urban_arena', 'crayons_bricks', 'carousel');

INSERT INTO public.compliance_requirements (location_type, area_sub_area, category, requirement_name, document_contract_type, is_required, default_frequency, default_owner, default_department, default_risk_level, sort_order) VALUES
-- InflataPark
('inflatapark', 'Center', 'QCDD', 'QCDD — Center Area', 'Certificate', true, 'Yearly', 'HSE', 'Operations', 'Critical', 10),
('inflatapark', 'Whole Area', 'QCDD', 'QCDD — Whole Area', 'Certificate', true, 'Yearly', 'HSE', 'Operations', 'Critical', 20),
('inflatapark', 'All', 'CCTV', 'CCTV System License & AMC', 'License + AMC', true, 'Monthly', 'Security', 'Facilities', 'High', 30),
('inflatapark', 'All', 'Trade License', 'Trade License', 'License', true, 'Yearly', 'Branch GM', 'Legal', 'High', 40),
('inflatapark', 'All', 'CR', 'Commercial Registration', 'Certificate', true, 'Yearly', 'Legal', 'Legal', 'Critical', 50),
('inflatapark', 'Kitchen', 'Kitchen Duct', 'Kitchen Hood & Duct Cleaning', 'AMC', true, 'Quarterly', 'Kitchen', 'F&B', 'High', 60),
('inflatapark', 'All', 'Pest Control', 'Pest Control Contract', 'AMC', true, 'Monthly', 'Facilities', 'Facilities', 'Medium', 70),
('inflatapark', 'All', 'HVAC', 'HVAC AMC', 'AMC', true, 'Quarterly', 'Maintenance', 'Facilities', 'High', 80),
('inflatapark', 'All', 'Fire Fighting', 'Fire Fighting AMC', 'AMC', true, 'Quarterly', 'HSE', 'Facilities', 'Critical', 90),
('inflatapark', 'All', 'Fire Alarm', 'Fire Alarm AMC', 'AMC', true, 'Quarterly', 'HSE', 'Facilities', 'Critical', 100),
('inflatapark', 'Cafe', 'F&B CR', 'F&B Commercial Registration', 'Certificate', true, 'Yearly', 'Kitchen', 'F&B', 'High', 110),
('inflatapark', 'Cafe', 'F&B License', 'F&B Operating License', 'License', true, 'Yearly', 'Kitchen', 'F&B', 'High', 120),
('inflatapark', 'Cafe', 'Staff Medical', 'Cafe Staff Medical Certificates', 'Staff Records', true, 'Yearly', 'HR', 'People', 'Medium', 130),
('inflatapark', 'All', 'Qatar Tourism', 'Qatar Tourism License', 'License', true, 'Yearly', 'Operations', 'Commercial', 'High', 140),
('inflatapark', 'All', 'Insurance', 'Public Liability Insurance', 'Policy', true, 'Yearly', 'CFO', 'Finance', 'Critical', 150),
('inflatapark', 'All', 'Mall NOC', 'Mall NOC / Landlord Approval', 'NOC', true, 'Yearly', 'Branch GM', 'Legal', 'High', 160),
('inflatapark', 'All', 'Building Completion', 'Building Completion Certificate', 'Certificate', true, 'One-time', 'Facilities', 'Legal', 'Critical', 170),
('inflatapark', 'All', 'Civil Defence', 'Civil Defence Approval', 'Certificate', true, 'Yearly', 'HSE', 'Operations', 'Critical', 180),
('inflatapark', 'All', 'Cleaning/Security/IT contracts', 'Third-Party Service Contracts', 'Contract', false, 'Yearly', 'Facilities', 'Procurement', 'Medium', 190),
('inflatapark', 'Equipment', 'Equipment AMC', 'Ride & Equipment AMC', 'AMC', true, 'Quarterly', 'Maintenance', 'Technical', 'High', 200),
-- Kids Driving School
('kids_driving_school', 'All', 'Trade License', 'Trade License', 'License', true, 'Yearly', 'Branch GM', 'Legal', 'High', 10),
('kids_driving_school', 'All', 'CR', 'Commercial Registration', 'Certificate', true, 'Yearly', 'Legal', 'Legal', 'Critical', 20),
('kids_driving_school', 'All', 'QCDD', 'QCDD / Civil Defence', 'Certificate', true, 'Yearly', 'HSE', 'Operations', 'Critical', 30),
('kids_driving_school', 'All', 'CCTV', 'CCTV License & AMC', 'License + AMC', true, 'Monthly', 'Security', 'Facilities', 'High', 40),
('kids_driving_school', 'All', 'Fire Alarm', 'Fire Alarm AMC', 'AMC', true, 'Quarterly', 'HSE', 'Facilities', 'Critical', 50),
('kids_driving_school', 'All', 'Fire Fighting', 'Fire Fighting AMC', 'AMC', true, 'Quarterly', 'HSE', 'Facilities', 'Critical', 60),
('kids_driving_school', 'All', 'Pest Control', 'Pest Control Contract', 'AMC', true, 'Monthly', 'Facilities', 'Facilities', 'Medium', 70),
('kids_driving_school', 'All', 'HVAC', 'HVAC AMC', 'AMC', true, 'Quarterly', 'Maintenance', 'Facilities', 'High', 80),
('kids_driving_school', 'All', 'Staff Medical', 'Staff Medical Certificates', 'Staff Records', false, 'Yearly', 'HR', 'People', 'Medium', 90),
('kids_driving_school', 'All', 'Mall NOC', 'Mall NOC', 'NOC', true, 'Yearly', 'Branch GM', 'Legal', 'High', 100),
('kids_driving_school', 'All', 'Insurance', 'Public Liability Insurance', 'Policy', true, 'Yearly', 'CFO', 'Finance', 'Critical', 110),
-- Urban Arena
('urban_arena', 'All', 'Trade License', 'Trade License', 'License', true, 'Yearly', 'Branch GM', 'Legal', 'High', 10),
('urban_arena', 'All', 'CR', 'Commercial Registration', 'Certificate', true, 'Yearly', 'Legal', 'Legal', 'Critical', 20),
('urban_arena', 'All', 'QCDD', 'QCDD / Civil Defence', 'Certificate', true, 'Yearly', 'HSE', 'Operations', 'Critical', 30),
('urban_arena', 'All', 'CCTV', 'CCTV License & AMC', 'License + AMC', true, 'Monthly', 'Security', 'Facilities', 'High', 40),
('urban_arena', 'Kitchen', 'Kitchen Duct', 'Kitchen Hood & Duct Cleaning', 'AMC', false, 'Quarterly', 'Kitchen', 'F&B', 'High', 50),
('urban_arena', 'F&B', 'F&B CR', 'F&B Commercial Registration', 'Certificate', false, 'Yearly', 'Kitchen', 'F&B', 'High', 60),
('urban_arena', 'F&B', 'F&B License', 'F&B Operating License', 'License', false, 'Yearly', 'Kitchen', 'F&B', 'High', 70),
('urban_arena', 'F&B', 'Staff Medical', 'F&B Staff Medical', 'Staff Records', false, 'Yearly', 'HR', 'People', 'Medium', 80),
('urban_arena', 'All', 'HVAC', 'HVAC AMC', 'AMC', true, 'Quarterly', 'Maintenance', 'Facilities', 'High', 90),
('urban_arena', 'All', 'Fire Alarm', 'Fire Alarm AMC', 'AMC', true, 'Quarterly', 'HSE', 'Facilities', 'Critical', 100),
('urban_arena', 'All', 'Pest Control', 'Pest Control', 'AMC', true, 'Monthly', 'Facilities', 'Facilities', 'Medium', 110),
('urban_arena', 'All', 'Insurance', 'Insurance Policy', 'Policy', true, 'Yearly', 'CFO', 'Finance', 'Critical', 120),
('urban_arena', 'All', 'Mall NOC', 'Mall NOC', 'NOC', true, 'Yearly', 'Branch GM', 'Legal', 'High', 130),
-- Crayons & Bricks + Carousel (core set)
('crayons_bricks', 'All', 'Trade License', 'Trade License', 'License', true, 'Yearly', 'Branch GM', 'Legal', 'High', 10),
('crayons_bricks', 'All', 'CR', 'Commercial Registration', 'Certificate', true, 'Yearly', 'Legal', 'Legal', 'Critical', 20),
('crayons_bricks', 'All', 'QCDD', 'QCDD / Civil Defence', 'Certificate', true, 'Yearly', 'HSE', 'Operations', 'Critical', 30),
('crayons_bricks', 'All', 'CCTV', 'CCTV AMC', 'AMC', true, 'Monthly', 'Security', 'Facilities', 'Medium', 40),
('crayons_bricks', 'All', 'Insurance', 'Insurance', 'Policy', true, 'Yearly', 'CFO', 'Finance', 'Critical', 50),
('crayons_bricks', 'All', 'Mall NOC', 'Mall NOC', 'NOC', true, 'Yearly', 'Branch GM', 'Legal', 'High', 60),
('carousel', 'All', 'Trade License', 'Trade License', 'License', true, 'Yearly', 'Branch GM', 'Legal', 'High', 10),
('carousel', 'All', 'CR', 'Commercial Registration', 'Certificate', true, 'Yearly', 'Legal', 'Legal', 'Critical', 20),
('carousel', 'All', 'Insurance', 'Insurance', 'Policy', true, 'Yearly', 'CFO', 'Finance', 'Critical', 30),
('carousel', 'All', 'Mall NOC', 'Municipality / Landlord NOC', 'NOC', true, 'Yearly', 'Branch GM', 'Legal', 'High', 40);

-- ============================================================
-- INF-CC InflataPark seed (sample tracker rows)
-- ============================================================
DO $$
DECLARE
  loc_inf uuid;
  req record;
  amc_hvac uuid; amc_fire uuid; amc_cctv uuid; amc_hood uuid;
BEGIN
  SELECT id INTO loc_inf FROM public.locations WHERE code = 'INF-CC';
  IF loc_inf IS NULL THEN RETURN; END IF;

  SELECT id INTO amc_hvac FROM public.amc_contracts WHERE contract_ref = 'E3-AMC-HVAC-INF';
  SELECT id INTO amc_fire FROM public.amc_contracts WHERE contract_ref = 'E3-AMC-FIRE-INF';
  SELECT id INTO amc_cctv FROM public.amc_contracts WHERE contract_ref = 'E3-AMC-CCTV-INF';
  SELECT id INTO amc_hood FROM public.amc_contracts WHERE contract_ref = 'E3-AMC-HOOD-INF';

  DELETE FROM public.location_compliance_items WHERE requirement_name LIKE 'LCT-%';

  FOR req IN
    SELECT * FROM public.compliance_requirements WHERE location_type = 'inflatapark' ORDER BY sort_order
  LOOP
    INSERT INTO public.location_compliance_items (
      location_id, requirement_id, area_sub_area, category, requirement_name, document_contract_type,
      is_required, service_frequency, risk_level, owner, department, manual_status
    ) VALUES (
      loc_inf, req.id, req.area_sub_area, req.category, 'LCT-' || req.requirement_name, req.document_contract_type,
      req.is_required, req.default_frequency, req.default_risk_level, req.default_owner, req.default_department, NULL
    );
  END LOOP;

  UPDATE public.location_compliance_items SET
    vendor_name = 'QCDD', issuing_authority = 'QCDD', cert_contract_number = 'QCDD-8842',
    issue_date = '2023-06-01', expiry_date = CURRENT_DATE + 120, renewal_due_date = CURRENT_DATE + 90,
    attachment_status = 'partial', payment_status = 'paid', quotation_amount = 8000, paid_amount = 8000
  WHERE location_id = loc_inf AND requirement_name = 'LCT-QCDD — Center Area';

  UPDATE public.location_compliance_items SET
    vendor_name = 'QCDD', issuing_authority = 'QCDD', cert_contract_number = 'QCDD-8842-WA',
    issue_date = '2023-06-01', expiry_date = CURRENT_DATE + 120, renewal_due_date = CURRENT_DATE + 90,
    attachment_status = 'partial'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-QCDD — Whole Area';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Ibra Alofog', issuing_authority = 'MOI', amc_contract_id = amc_cctv,
    start_date = CURRENT_DATE - 120, expiry_date = CURRENT_DATE + 245, renewal_due_date = CURRENT_DATE + 245,
    last_service_date = CURRENT_DATE - 30, next_service_date = CURRENT_DATE,
    quotation_amount = 12000, paid_amount = 12000, payment_status = 'paid', attachment_status = 'complete'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-CCTV System License & AMC';

  UPDATE public.location_compliance_items SET
    vendor_name = 'MOCI', issuing_authority = 'MOCI', cert_contract_number = 'TL-INF-001',
    issue_date = '2024-01-01', expiry_date = CURRENT_DATE + 45, renewal_due_date = CURRENT_DATE + 45,
    quotation_amount = 3500, paid_amount = 3500, payment_status = 'paid'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Trade License';

  UPDATE public.location_compliance_items SET
    vendor_name = 'MOCI', issuing_authority = 'MOCI', cert_contract_number = 'CR-2020-8841',
    issue_date = '2020-01-01', expiry_date = CURRENT_DATE + 180, quotation_amount = 5000, paid_amount = 5000, payment_status = 'paid'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Commercial Registration';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Greenshine', amc_contract_id = amc_hood,
    start_date = CURRENT_DATE - 30, expiry_date = CURRENT_DATE + 335, last_service_date = CURRENT_DATE - 7, next_service_date = CURRENT_DATE + 80,
    quotation_amount = 3200, paid_amount = 800, payment_status = 'partially_paid', attachment_status = 'partial'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Kitchen Hood & Duct Cleaning';

  UPDATE public.location_compliance_items SET
    vendor_name = 'PestGuard LLC', start_date = CURRENT_DATE - 60, expiry_date = CURRENT_DATE + 305,
    next_service_date = CURRENT_DATE + 10, quotation_amount = 4800, paid_amount = 2400, payment_status = 'partially_paid'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Pest Control Contract';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Al Adraq HVAC/AC', amc_contract_id = amc_hvac,
    start_date = CURRENT_DATE - 90, expiry_date = CURRENT_DATE + 275, last_service_date = CURRENT_DATE - 14, next_service_date = CURRENT_DATE + 30,
    quotation_amount = 24000, paid_amount = 0, payment_status = 'unpaid', risk_level = 'High'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-HVAC AMC';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Eurofire', amc_contract_id = amc_fire,
    start_date = CURRENT_DATE - 60, expiry_date = CURRENT_DATE + 305, next_service_date = CURRENT_DATE + 20,
    quotation_amount = 5500, paid_amount = 2750, payment_status = 'partially_paid', risk_level = 'Critical'
  WHERE location_id = loc_inf AND requirement_name LIKE 'LCT-Fire%';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Municipality', cert_contract_number = 'FB-CR-INF',
    expiry_date = CURRENT_DATE + 200, quotation_amount = 0, paid_amount = 0, payment_status = 'paid'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-F&B Commercial Registration';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Municipality', cert_contract_number = 'FB-LIC-INF',
    expiry_date = CURRENT_DATE + 180, attachment_status = 'none'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-F&B Operating License';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Internal HR', next_service_date = CURRENT_DATE + 20, manual_status = NULL,
    attachment_status = 'partial', remarks = '3 of 5 cafe staff medicals on file'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Cafe Staff Medical Certificates';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Qatar Tourism Authority', cert_contract_number = 'QT-INF-2024',
    expiry_date = CURRENT_DATE + 90, quotation_amount = 6000, paid_amount = 6000, payment_status = 'paid'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Qatar Tourism License';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Qatar Insurance', cert_contract_number = 'POL-99821',
    issue_date = '2024-07-01', expiry_date = CURRENT_DATE + 60, renewal_due_date = CURRENT_DATE + 60,
    quotation_amount = 85000, paid_amount = 85000, payment_status = 'paid', risk_level = 'Critical'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Public Liability Insurance';

  UPDATE public.location_compliance_items SET
    vendor_name = 'City Center Management', cert_contract_number = 'NOC-CC-2024',
    expiry_date = CURRENT_DATE + 300, attachment_status = 'complete'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Mall NOC / Landlord Approval';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Ashghal', cert_contract_number = 'BCC-INF-2022',
    issue_date = '2022-06-01', attachment_status = 'complete'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Building Completion Certificate';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Civil Defence', cert_contract_number = 'CD-INF-2023',
    expiry_date = CURRENT_DATE + 150, attachment_status = 'partial'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Civil Defence Approval';

  UPDATE public.location_compliance_items SET
    vendor_name = 'Sparkle Clean Co.', document_contract_type = 'Contract',
    expiry_date = CURRENT_DATE + 200, quotation_amount = 36000, paid_amount = 18000, payment_status = 'partially_paid',
    remarks = 'Cleaning contract — invoice pending Q2'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Third-Party Service Contracts';

  UPDATE public.location_compliance_items SET
    vendor_name = 'RideTech AMC', expiry_date = CURRENT_DATE + 120, next_service_date = CURRENT_DATE + 45,
    quotation_amount = 15000, paid_amount = 7500, payment_status = 'partially_paid'
  WHERE location_id = loc_inf AND requirement_name = 'LCT-Ride & Equipment AMC';

END $$;
