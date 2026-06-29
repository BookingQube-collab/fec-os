-- ============================================================
-- AMC Scheduler & Compliance Dashboard
-- ============================================================

-- FEC Qatar site codes (7 attractions)
INSERT INTO public.locations (code, name, city, region, country, timezone, status, launched_on) VALUES
  ('KDS-CC', 'Kids Driving School', 'Doha', 'City Center Doha', 'QA', 'Asia/Qatar', 'active', '2022-03-15'),
  ('KDS-DM', 'Kids Mini Driving School', 'Doha', 'Doha Mall', 'QA', 'Asia/Qatar', 'active', '2022-04-01'),
  ('INF-CC', 'InflataPark', 'Doha', 'City Center Doha', 'QA', 'Asia/Qatar', 'active', '2022-06-01'),
  ('UA-DM', 'Urban Arena', 'Doha', 'Doha Mall', 'QA', 'Asia/Qatar', 'active', '2023-01-10'),
  ('CB-VM', 'Crayons & Bricks', 'Doha', 'Vendome Mall', 'QA', 'Asia/Qatar', 'active', '2023-04-20'),
  ('CB-DSM', 'Crayons & Bricks', 'Doha', 'Dar Al Salam Mall', 'QA', 'Asia/Qatar', 'active', '2023-09-01'),
  ('CAR-AP', 'Carousel', 'Doha', 'Aspire Park', 'QA', 'Asia/Qatar', 'active', '2024-02-14')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  region = EXCLUDED.region,
  city = EXCLUDED.city,
  status = EXCLUDED.status,
  updated_at = now();

CREATE TABLE public.amc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  category text NOT NULL,
  vendor_name text NOT NULL,
  vendor_contact_person text,
  vendor_phone text,
  vendor_email text,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  contract_start_date date NOT NULL,
  contract_end_date date NOT NULL,
  service_frequency text NOT NULL DEFAULT 'quarterly',
  contract_value numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(14,2) GENERATED ALWAYS AS (GREATEST(contract_value - paid_amount, 0)) STORED,
  payment_status text NOT NULL DEFAULT 'unpaid',
  status text NOT NULL DEFAULT 'active',
  internal_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scope_of_work text,
  remarks text,
  last_service_date date,
  next_service_date date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (contract_end_date >= contract_start_date),
  CHECK (paid_amount >= 0),
  CHECK (contract_value >= 0)
);

CREATE TABLE public.amc_service_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
  service_number int NOT NULL,
  planned_date date NOT NULL,
  actual_service_date date,
  status text NOT NULL DEFAULT 'pending',
  vendor_remarks text,
  internal_notes text,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verification_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, service_number)
);

CREATE TABLE public.amc_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
  service_schedule_id uuid REFERENCES public.amc_service_schedules(id) ON DELETE CASCADE,
  attachment_type text NOT NULL DEFAULT 'other',
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_mime text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_amc_contracts_location ON public.amc_contracts(location_id);
CREATE INDEX idx_amc_contracts_category ON public.amc_contracts(category);
CREATE INDEX idx_amc_contracts_status ON public.amc_contracts(status);
CREATE INDEX idx_amc_contracts_end ON public.amc_contracts(contract_end_date);
CREATE INDEX idx_amc_schedules_contract ON public.amc_service_schedules(contract_id);
CREATE INDEX idx_amc_schedules_planned ON public.amc_service_schedules(planned_date);
CREATE INDEX idx_amc_schedules_status ON public.amc_service_schedules(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.amc_contracts, public.amc_service_schedules, public.amc_attachments
TO authenticated;
GRANT ALL ON
  public.amc_contracts, public.amc_service_schedules, public.amc_attachments
TO service_role;

ALTER TABLE public.amc_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_service_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amc_contracts scoped" ON public.amc_contracts FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "amc_schedules via contract" ON public.amc_service_schedules FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.amc_contracts c
      WHERE c.id = contract_id AND public.user_can_access_location(c.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.amc_contracts c
      WHERE c.id = contract_id AND public.user_can_access_location(c.location_id)
    )
  );

CREATE POLICY "amc_attachments via contract" ON public.amc_attachments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.amc_contracts c
      WHERE c.id = contract_id AND public.user_can_access_location(c.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.amc_contracts c
      WHERE c.id = contract_id AND public.user_can_access_location(c.location_id)
    )
  );

CREATE TRIGGER trg_amc_contracts_updated BEFORE UPDATE ON public.amc_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_amc_schedules_updated BEFORE UPDATE ON public.amc_service_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Storage bucket for AMC documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'amc-documents',
  'amc-documents',
  false,
  15728640,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "amc_docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'amc-documents');

CREATE POLICY "amc_docs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'amc-documents');

CREATE POLICY "amc_docs update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'amc-documents');

CREATE POLICY "amc_docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'amc-documents');

-- Sync payment_status from amounts
CREATE OR REPLACE FUNCTION public.amc_sync_payment_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paid_amount <= 0 THEN
    NEW.payment_status := 'unpaid';
  ELSIF NEW.paid_amount >= NEW.contract_value THEN
    NEW.payment_status := 'paid';
  ELSE
    NEW.payment_status := 'partially_paid';
  END IF;

  IF NEW.contract_end_date < CURRENT_DATE AND NEW.status NOT IN ('cancelled', 'draft') THEN
    NEW.status := 'expired';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_amc_payment_status
  BEFORE INSERT OR UPDATE OF paid_amount, contract_value, contract_end_date, status ON public.amc_contracts
  FOR EACH ROW EXECUTE FUNCTION public.amc_sync_payment_status();

-- Mark overdue service schedules (callable from cron or on read)
CREATE OR REPLACE FUNCTION public.amc_refresh_overdue_schedules()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n int;
BEGIN
  UPDATE public.amc_service_schedules
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending'
    AND planned_date < CURRENT_DATE;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.amc_refresh_overdue_schedules() TO authenticated, service_role;

-- ============================================================
-- Seed sample AMC contracts (City Center + Doha Mall)
-- Superseded by E3-AMC-* acceptance seed in compliance_ops_module;
-- legacy rows (no contract_ref) are removed there and in dedupe migration.
-- ON CONFLICT DO NOTHING is ineffective here (no unique key on location+category).
-- ============================================================

DO $$
DECLARE
  loc_inf uuid;
  loc_kds_cc uuid;
  loc_ua uuid;
  loc_kds_dm uuid;
  c_fire uuid;
  c_cctv uuid;
  c_hvac uuid;
  c_pest uuid;
  c_license uuid;
  c_clean uuid;
BEGIN
  SELECT id INTO loc_inf FROM public.locations WHERE code = 'INF-CC';
  SELECT id INTO loc_kds_cc FROM public.locations WHERE code = 'KDS-CC';
  SELECT id INTO loc_ua FROM public.locations WHERE code = 'UA-DM';
  SELECT id INTO loc_kds_dm FROM public.locations WHERE code = 'KDS-DM';

  IF loc_inf IS NULL THEN RETURN; END IF;

  INSERT INTO public.amc_contracts (
    location_id, category, vendor_name, vendor_contact_person, vendor_phone, vendor_email,
    contract_start_date, contract_end_date, service_frequency,
    contract_value, paid_amount, payment_status, status, scope_of_work, remarks
  ) VALUES
    (loc_inf, 'fire_fighting_amc', 'Al Safe Fire & Safety', 'Ahmed Hassan', '+974 3311 2200', 'ahmed@alsafe.qa',
     CURRENT_DATE - 90, CURRENT_DATE + 275, 'quarterly', 12000, 6000, 'partially_paid', 'active',
     'Fire fighting system inspection and extinguisher servicing', 'Mall compliance requirement'),
    (loc_kds_cc, 'cctv_amc', 'SecureVision Qatar', 'Raj Kumar', '+974 5544 8899', 'raj@securevision.qa',
     CURRENT_DATE - 60, CURRENT_DATE + 305, 'monthly', 8400, 8400, 'paid', 'active',
     'CCTV maintenance and DVR health checks', NULL),
    (loc_ua, 'hvac_amc', 'CoolTech Services', 'Mohammed Ali', '+974 6677 1122', 'mohammed@cooltech.qa',
     CURRENT_DATE - 120, CURRENT_DATE + 245, 'quarterly', 18000, 9000, 'partially_paid', 'active',
     'HVAC preventive maintenance for play arena', 'Includes filter replacement'),
    (loc_kds_dm, 'pest_control', 'PestGuard LLC', 'Sara Nasser', '+974 3399 4455', 'sara@pestguard.qa',
     CURRENT_DATE - 30, CURRENT_DATE + 335, 'monthly', 4800, 1200, 'partially_paid', 'active',
     'Monthly pest control treatment', NULL),
    (loc_inf, 'trade_license', 'FEC Legal Dept', 'Operations', '+974 4000 0000', 'ops@fec.qa',
     CURRENT_DATE - 200, CURRENT_DATE + 165, 'one_off', 2500, 2500, 'paid', 'active',
     'Municipality trade license renewal', 'Renewal due Q3'),
    (loc_ua, 'cleaning_contract', 'Sparkle Clean Co.', 'Fatima Al-Kuwari', '+974 7788 9900', 'fatima@sparkle.qa',
     CURRENT_DATE - 45, CURRENT_DATE + 320, 'monthly', 9600, 0, 'unpaid', 'active',
     'Daily cleaning contract for Urban Arena', 'Pending first invoice')
  ON CONFLICT DO NOTHING;

  SELECT id INTO c_fire FROM public.amc_contracts WHERE location_id = loc_inf AND category = 'fire_fighting_amc' LIMIT 1;
  SELECT id INTO c_cctv FROM public.amc_contracts WHERE location_id = loc_kds_cc AND category = 'cctv_amc' LIMIT 1;
  SELECT id INTO c_hvac FROM public.amc_contracts WHERE location_id = loc_ua AND category = 'hvac_amc' LIMIT 1;
  SELECT id INTO c_pest FROM public.amc_contracts WHERE location_id = loc_kds_dm AND category = 'pest_control' LIMIT 1;

  IF c_fire IS NOT NULL THEN
    INSERT INTO public.amc_service_schedules (contract_id, service_number, planned_date, actual_service_date, status)
    VALUES
      (c_fire, 1, CURRENT_DATE - 75, CURRENT_DATE - 74, 'done'),
      (c_fire, 2, CURRENT_DATE - 5, NULL, 'overdue'),
      (c_fire, 3, CURRENT_DATE + 85, NULL, 'pending'),
      (c_fire, 4, CURRENT_DATE + 175, NULL, 'pending')
    ON CONFLICT (contract_id, service_number) DO NOTHING;
  END IF;

  IF c_cctv IS NOT NULL THEN
    INSERT INTO public.amc_service_schedules (contract_id, service_number, planned_date, actual_service_date, status, verification_status)
    SELECT c_cctv, gs, (CURRENT_DATE - 60 + (gs - 1) * 30)::date,
      CASE WHEN gs <= 2 THEN (CURRENT_DATE - 60 + (gs - 1) * 30)::date ELSE NULL END,
      CASE WHEN gs <= 2 THEN 'done' WHEN (CURRENT_DATE - 60 + (gs - 1) * 30)::date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END,
      CASE WHEN gs <= 2 THEN 'verified' ELSE 'pending' END
    FROM generate_series(1, 4) gs
    ON CONFLICT (contract_id, service_number) DO NOTHING;
  END IF;

  IF c_hvac IS NOT NULL THEN
    INSERT INTO public.amc_service_schedules (contract_id, service_number, planned_date, status)
    VALUES
      (c_hvac, 1, CURRENT_DATE - 100, 'done'),
      (c_hvac, 2, CURRENT_DATE + 10, 'pending'),
      (c_hvac, 3, CURRENT_DATE + 100, 'pending')
    ON CONFLICT (contract_id, service_number) DO NOTHING;
  END IF;

  IF c_pest IS NOT NULL THEN
    INSERT INTO public.amc_service_schedules (contract_id, service_number, planned_date, status)
    VALUES
      (c_pest, 1, CURRENT_DATE - 20, 'done'),
      (c_pest, 2, CURRENT_DATE + 10, 'pending'),
      (c_pest, 3, CURRENT_DATE + 40, 'pending')
    ON CONFLICT (contract_id, service_number) DO NOTHING;
  END IF;

  UPDATE public.amc_contracts c SET
    last_service_date = s.last_done,
    next_service_date = s.next_pending
  FROM (
    SELECT contract_id,
      MAX(actual_service_date) FILTER (WHERE status = 'done') AS last_done,
      MIN(planned_date) FILTER (WHERE status IN ('pending', 'overdue')) AS next_pending
    FROM public.amc_service_schedules
    GROUP BY contract_id
  ) s
  WHERE c.id = s.contract_id;
END $$;
