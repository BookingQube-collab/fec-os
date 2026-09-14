-- Corporate Deals Weekly Report (BookingQube promo-code pack)
-- Audit (requirement -> existing -> decision):
-- partner list -> weekly-review CORPORATE_PARTNERS / AGGREGATOR_PLATFORMS (partial) -> create partner master table + seed 21
-- code mapping (~1750) -> none -> create
-- weekly append log / month replace / trend replace -> none -> create
-- KPI calc (partner totals, share, MoM) -> none (meeting pack has manual deals) -> create app calc
-- dashboard / summary / readme -> none -> create UI sibling under /operations/corporate-deals
-- MoM action register -> weekly_review_actions -> reuse (+ additive source_module)
-- venues -> locations / LOCATION_SHORT_NAME -> reuse labels in mapping
-- roles / print PDF -> weekly_review caps + window.print landscape -> reuse pattern (own caps alias same roles)
-- xlsx FEC_Corporate_Deals_Weekly_Report.xlsx -> not in repo -> gap (import CSV instead)

-- Additive: tag actions that belong to corporate-deals MoM / unmapped follow-ups
ALTER TABLE public.weekly_review_actions
  ADD COLUMN IF NOT EXISTS source_module text;

CREATE INDEX IF NOT EXISTS idx_wract_source_module
  ON public.weekly_review_actions (source_module)
  WHERE source_module IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.corporate_deal_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL
    CHECK (category IN ('Corporate discount', 'Aggregator BOGO')),
  redemption_mechanism text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corporate_deal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promocode text NOT NULL UNIQUE,
  partner_id uuid REFERENCES public.corporate_deal_partners(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'Unmapped'
    CHECK (category IN (
      'Corporate discount', 'Aggregator BOGO', 'Not on master',
      'Internal / promotion', 'Unmapped'
    )),
  venue text NOT NULL DEFAULT 'Not specified',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corporate_deal_weekly_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_week text NOT NULL,
  promocode_id text,
  promocode text NOT NULL,
  description text NOT NULL DEFAULT '',
  company_name text,
  times_used int NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  booking_lines int NOT NULL DEFAULT 0 CHECK (booking_lines >= 0),
  tickets int NOT NULL DEFAULT 0 CHECK (tickets >= 0),
  total_discount numeric(14, 2) NOT NULL DEFAULT 0,
  partner_id uuid REFERENCES public.corporate_deal_partners(id) ON DELETE SET NULL,
  partner_name text,
  category text NOT NULL DEFAULT 'Unmapped',
  venue text NOT NULL DEFAULT 'Not specified',
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (iso_week, promocode)
);

CREATE TABLE IF NOT EXISTS public.corporate_deal_month_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month text NOT NULL,
  promocode_id text,
  promocode text NOT NULL,
  description text NOT NULL DEFAULT '',
  company_name text,
  times_used int NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  booking_lines int NOT NULL DEFAULT 0 CHECK (booking_lines >= 0),
  tickets int NOT NULL DEFAULT 0 CHECK (tickets >= 0),
  total_discount numeric(14, 2) NOT NULL DEFAULT 0,
  partner_id uuid REFERENCES public.corporate_deal_partners(id) ON DELETE SET NULL,
  partner_name text,
  category text NOT NULL DEFAULT 'Unmapped',
  venue text NOT NULL DEFAULT 'Not specified',
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_month, promocode)
);

CREATE TABLE IF NOT EXISTS public.corporate_deal_trend_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month text NOT NULL,
  promocode_id text,
  promocode text NOT NULL,
  description text NOT NULL DEFAULT '',
  company_name text,
  times_used int NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  booking_lines int NOT NULL DEFAULT 0 CHECK (booking_lines >= 0),
  tickets int NOT NULL DEFAULT 0 CHECK (tickets >= 0),
  total_discount numeric(14, 2) NOT NULL DEFAULT 0,
  partner_id uuid REFERENCES public.corporate_deal_partners(id) ON DELETE SET NULL,
  partner_name text,
  category text NOT NULL DEFAULT 'Unmapped',
  venue text NOT NULL DEFAULT 'Not specified',
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_month, promocode)
);

CREATE INDEX IF NOT EXISTS idx_cd_weekly_week ON public.corporate_deal_weekly_log (iso_week);
CREATE INDEX IF NOT EXISTS idx_cd_week_cat ON public.corporate_deal_weekly_log (category);
CREATE INDEX IF NOT EXISTS idx_cd_codes_cat ON public.corporate_deal_codes (category);
CREATE INDEX IF NOT EXISTS idx_cd_month ON public.corporate_deal_month_data (period_month);
CREATE INDEX IF NOT EXISTS idx_cd_trend ON public.corporate_deal_trend_data (period_month);

DROP TRIGGER IF EXISTS trg_cd_partners_updated ON public.corporate_deal_partners;
CREATE TRIGGER trg_cd_partners_updated BEFORE UPDATE ON public.corporate_deal_partners
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cd_codes_updated ON public.corporate_deal_codes;
CREATE TRIGGER trg_cd_codes_updated BEFORE UPDATE ON public.corporate_deal_codes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed 21 partners (idempotent)
INSERT INTO public.corporate_deal_partners (name, category, redemption_mechanism, sort_order)
VALUES
  ('Al Jazeera Imtiyazat', 'Corporate discount', 'Staff ID', 1),
  ('My Book', 'Aggregator BOGO', 'App PIN 9247', 2),
  ('QIB', 'Corporate discount', 'QIB cardholders', 3),
  ('Dar App', 'Corporate discount', 'Dar community app', 4),
  ('Qatar Airways', 'Corporate discount', 'Staff ID', 5),
  ('Entertainer', 'Aggregator BOGO', 'App 9581', 6),
  ('Public Health Sector (Sogha)', 'Corporate discount', 'Sogha card ID', 7),
  ('Urban Point', 'Aggregator BOGO', 'App 7654', 8),
  ('Qatar Living Deals', 'Aggregator BOGO', 'Qatar Living Deals app', 9),
  ('Imtyazat', 'Corporate discount', 'Imtyazat ID card', 10),
  ('Classmate', 'Aggregator BOGO', 'App 9171', 11),
  ('MyBenefit', 'Corporate discount', 'mbfua15 / mbfip15 / mbfcb15 / mbfkd15', 12),
  ('DHL', 'Corporate discount', 'Staff ID', 13),
  ('Qatar Foundation', 'Corporate discount', 'Staff ID', 14),
  ('Qatar Investment Authority', 'Corporate discount', 'Staff ID', 15),
  ('Bein', 'Corporate discount', 'Staff ID', 16),
  ('Huawei', 'Corporate discount', 'Staff ID', 17),
  ('Aspire', 'Corporate discount', 'Staff ID', 18),
  ('Qatar Media Corporation', 'Corporate discount', 'Staff ID', 19),
  ('QNB Rewards', 'Corporate discount', 'Staff ID', 20),
  ('Snoonu Employees', 'Corporate discount', 'Scity app', 21)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  redemption_mechanism = EXCLUDED.redemption_mechanism,
  sort_order = EXCLUDED.sort_order,
  active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corporate_deal_partners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corporate_deal_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corporate_deal_weekly_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corporate_deal_month_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corporate_deal_trend_data TO authenticated;

GRANT ALL ON public.corporate_deal_partners TO service_role;
GRANT ALL ON public.corporate_deal_codes TO service_role;
GRANT ALL ON public.corporate_deal_weekly_log TO service_role;
GRANT ALL ON public.corporate_deal_month_data TO service_role;
GRANT ALL ON public.corporate_deal_trend_data TO service_role;

ALTER TABLE public.corporate_deal_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_deal_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_deal_weekly_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_deal_month_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_deal_trend_data ENABLE ROW LEVEL SECURITY;

-- Same gate as weekly management review (Head of Ops + Admin edit; management view)
DROP POLICY IF EXISTS "corporate_deal_partners read" ON public.corporate_deal_partners;
CREATE POLICY "corporate_deal_partners read" ON public.corporate_deal_partners FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "corporate_deal_partners write" ON public.corporate_deal_partners;
CREATE POLICY "corporate_deal_partners write" ON public.corporate_deal_partners FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "corporate_deal_codes read" ON public.corporate_deal_codes;
CREATE POLICY "corporate_deal_codes read" ON public.corporate_deal_codes FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "corporate_deal_codes write" ON public.corporate_deal_codes;
CREATE POLICY "corporate_deal_codes write" ON public.corporate_deal_codes FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "corporate_deal_weekly_log read" ON public.corporate_deal_weekly_log;
CREATE POLICY "corporate_deal_weekly_log read" ON public.corporate_deal_weekly_log FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "corporate_deal_weekly_log write" ON public.corporate_deal_weekly_log;
CREATE POLICY "corporate_deal_weekly_log write" ON public.corporate_deal_weekly_log FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "corporate_deal_month_data read" ON public.corporate_deal_month_data;
CREATE POLICY "corporate_deal_month_data read" ON public.corporate_deal_month_data FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "corporate_deal_month_data write" ON public.corporate_deal_month_data;
CREATE POLICY "corporate_deal_month_data write" ON public.corporate_deal_month_data FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "corporate_deal_trend_data read" ON public.corporate_deal_trend_data;
CREATE POLICY "corporate_deal_trend_data read" ON public.corporate_deal_trend_data FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "corporate_deal_trend_data write" ON public.corporate_deal_trend_data;
CREATE POLICY "corporate_deal_trend_data write" ON public.corporate_deal_trend_data FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());
