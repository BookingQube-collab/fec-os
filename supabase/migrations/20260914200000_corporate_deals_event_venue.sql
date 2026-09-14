-- Corporate Deals: event-wise BookingQube export (event_id / event_title → venue)
-- Audit: venue previously from code mapping only → export event_title wins (workbook rule)
-- UNIQUE (period, promocode) blocked one code at multiple venues → replace with event grain

ALTER TABLE public.corporate_deal_weekly_log
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS event_title text;

ALTER TABLE public.corporate_deal_month_data
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS event_title text;

ALTER TABLE public.corporate_deal_trend_data
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS event_title text;

ALTER TABLE public.corporate_deal_weekly_log
  DROP CONSTRAINT IF EXISTS corporate_deal_weekly_log_iso_week_promocode_key;
ALTER TABLE public.corporate_deal_month_data
  DROP CONSTRAINT IF EXISTS corporate_deal_month_data_period_month_promocode_key;
ALTER TABLE public.corporate_deal_trend_data
  DROP CONSTRAINT IF EXISTS corporate_deal_trend_data_period_month_promocode_key;

-- Same promocode may appear once per event/venue in an event-wise export
CREATE UNIQUE INDEX IF NOT EXISTS uq_cd_weekly_week_code_event
  ON public.corporate_deal_weekly_log (iso_week, promocode, (COALESCE(event_id, '')), (COALESCE(event_title, '')));

CREATE UNIQUE INDEX IF NOT EXISTS uq_cd_month_period_code_event
  ON public.corporate_deal_month_data (period_month, promocode, (COALESCE(event_id, '')), (COALESCE(event_title, '')));

CREATE UNIQUE INDEX IF NOT EXISTS uq_cd_trend_period_code_event
  ON public.corporate_deal_trend_data (period_month, promocode, (COALESCE(event_id, '')), (COALESCE(event_title, '')));

CREATE INDEX IF NOT EXISTS idx_cd_weekly_venue ON public.corporate_deal_weekly_log (venue);
CREATE INDEX IF NOT EXISTS idx_cd_month_venue ON public.corporate_deal_month_data (venue);
