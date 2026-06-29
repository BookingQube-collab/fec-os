-- Dashboard charts + compliance renewals performance (target <400ms)

-- utility_consumption: monthly trend by location
CREATE INDEX IF NOT EXISTS idx_utility_consumption_loc_period
  ON public.utility_consumption (location_id, period_month);

-- compliance_calendar_events: year-range trend aggregation
CREATE INDEX IF NOT EXISTS idx_compliance_events_due_type_status
  ON public.compliance_calendar_events (due_date, event_type, status);

-- compliance_items: renewal list sorted by governing date
CREATE INDEX IF NOT EXISTS idx_compliance_items_governing_date
  ON public.compliance_items (COALESCE(next_due_date, expiry_date))
  WHERE COALESCE(next_due_date, expiry_date) IS NOT NULL;

-- Aggregated dashboard chart series (site issues, WO trend, utility trend)
CREATE OR REPLACE FUNCTION public.get_dashboard_charts(
  p_location_ids uuid[],
  p_year int
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'site_issues',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'site', l.code,
            'issues', COALESCE(t.cnt, 0),
            'critical', COALESCE(t.crit, 0)
          )
          ORDER BY l.code
        )
        FROM locations l
        LEFT JOIN (
          SELECT
            tk.location_id,
            count(*)::int AS cnt,
            count(*) FILTER (WHERE tk.priority IN ('urgent', 'high'))::int AS crit
          FROM tickets tk
          WHERE tk.location_id = ANY(p_location_ids)
            AND tk.deleted_at IS NULL
            AND tk.status NOT IN ('resolved', 'closed', 'cancelled')
          GROUP BY tk.location_id
        ) t ON t.location_id = l.id
        WHERE l.id = ANY(p_location_ids)
      ), '[]'::jsonb),
    'wo_trend',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'month', to_char(make_date(p_year, gs.m, 1), 'Mon'),
            'renewals', COALESCE(ev.renewals, 0),
            'completed', COALESCE(ev.completed, 0)
          )
          ORDER BY gs.m
        )
        FROM generate_series(1, 12) AS gs(m)
        LEFT JOIN (
          SELECT
            extract(month FROM e.due_date)::int AS m,
            count(*)::int AS renewals,
            count(*) FILTER (WHERE e.status = 'completed')::int AS completed
          FROM compliance_calendar_events e
          WHERE e.due_date >= make_date(p_year, 1, 1)
            AND e.due_date <= make_date(p_year, 12, 31)
            AND (e.location_id IS NULL OR e.location_id = ANY(p_location_ids))
          GROUP BY 1
        ) ev ON ev.m = gs.m
      ), '[]'::jsonb),
    'utility_trend',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'month', to_char(make_date(p_year, gs.m, 1), 'Mon'),
            'cost', COALESCE(uc.cost, 0)
          )
          ORDER BY gs.m
        )
        FROM generate_series(1, 6) AS gs(m)
        LEFT JOIN (
          SELECT
            extract(month FROM u.period_month)::int AS m,
            round(sum(u.bill_amount))::int AS cost
          FROM utility_consumption u
          WHERE u.location_id = ANY(p_location_ids)
            AND u.period_month >= make_date(p_year, 1, 1)
            AND u.period_month < make_date(p_year, 7, 1)
          GROUP BY 1
        ) uc ON uc.m = gs.m
      ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_charts(uuid[], int) TO authenticated;

-- Compliance renewals list (avoids full-table scan on enriched view)
CREATE OR REPLACE FUNCTION public.get_compliance_renewals(
  p_limit int DEFAULT 20,
  p_location_code text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  item_name text,
  domain text,
  venue_scope text,
  status text,
  expiry_date date,
  alert_tier text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.item_name,
    c.domain,
    c.venue_scope,
    c.status::text,
    COALESCE(c.next_due_date, c.expiry_date) AS expiry_date,
    CASE
      WHEN COALESCE(c.next_due_date, c.expiry_date) < CURRENT_DATE THEN 'Expired'
      WHEN COALESCE(c.next_due_date, c.expiry_date) <= CURRENT_DATE + 30 THEN 'Due ≤30'
      WHEN COALESCE(c.next_due_date, c.expiry_date) <= CURRENT_DATE + 60 THEN 'Due ≤60'
      ELSE 'Due ≤90'
    END AS alert_tier
  FROM compliance_items c
  WHERE COALESCE(c.next_due_date, c.expiry_date) IS NOT NULL
    AND COALESCE(c.next_due_date, c.expiry_date) <= CURRENT_DATE + 60
    AND (
      p_location_code IS NULL
      OR c.venue_scope ILIKE '%' || p_location_code || '%'
    )
  ORDER BY COALESCE(c.next_due_date, c.expiry_date)
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.get_compliance_renewals(int, text) TO authenticated;
