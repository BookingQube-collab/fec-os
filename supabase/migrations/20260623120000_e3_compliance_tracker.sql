-- E3 FEC AMC & Compliance Tracker (spec schema)
-- Table name e3_compliance_items avoids conflict with legacy public.compliance_items register.

CREATE TABLE IF NOT EXISTS public.e3_compliance_items (
  id              text PRIMARY KEY,
  location        text NOT NULL,
  area            text NOT NULL,
  category        text NOT NULL,
  item            text NOT NULL,
  vendor          text NOT NULL,
  contract_start  date,
  contract_end    date,
  last_service    date,
  next_service    date,
  issue_date      date,
  expiry_date     date,
  frequency       text NOT NULL,
  owner           text NOT NULL,
  remarks         text,
  drive_link      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_e3_compliance_items_location ON public.e3_compliance_items (location);
CREATE INDEX IF NOT EXISTS idx_e3_compliance_items_area ON public.e3_compliance_items (area);
CREATE INDEX IF NOT EXISTS idx_e3_compliance_items_category ON public.e3_compliance_items (category);
CREATE INDEX IF NOT EXISTS idx_e3_compliance_items_vendor ON public.e3_compliance_items (vendor);
CREATE INDEX IF NOT EXISTS idx_e3_compliance_items_expiry ON public.e3_compliance_items (expiry_date);

CREATE OR REPLACE VIEW public.e3_compliance_items_enriched AS
SELECT
  c.*,
  CASE
    WHEN c.expiry_date IS NULL THEN NULL
    ELSE (c.expiry_date - CURRENT_DATE)
  END AS days_to_expiry,
  CASE
    WHEN c.expiry_date IS NULL THEN 'Missing'
    WHEN c.expiry_date < CURRENT_DATE THEN 'Overdue'
    WHEN c.expiry_date <= CURRENT_DATE + 30 THEN 'Critical'
    WHEN c.expiry_date <= CURRENT_DATE + 60 THEN 'Warning'
    WHEN c.expiry_date <= CURRENT_DATE + 90 THEN 'Upcoming'
    ELSE 'Compliant'
  END AS computed_status
FROM public.e3_compliance_items c;

GRANT SELECT ON public.e3_compliance_items TO authenticated, service_role;
GRANT SELECT ON public.e3_compliance_items_enriched TO authenticated, service_role;

ALTER TABLE public.e3_compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "e3_compliance_items read" ON public.e3_compliance_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "e3_compliance_items write" ON public.e3_compliance_items
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_e3_compliance_items_updated
  BEFORE UPDATE ON public.e3_compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
