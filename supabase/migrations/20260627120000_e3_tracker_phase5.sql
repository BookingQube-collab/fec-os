-- Phase 5: E3 tracker summary RPC and composite filter index

CREATE INDEX IF NOT EXISTS idx_e3_compliance_items_location_area
  ON public.e3_compliance_items (location, area);

CREATE OR REPLACE FUNCTION public.get_e3_tracker_summary(
  p_location text DEFAULT 'All',
  p_area text DEFAULT 'All'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT *
    FROM public.e3_compliance_items_enriched e
    WHERE (p_location = 'All' OR e.location = p_location)
      AND (p_area = 'All' OR e.area = p_area)
  ),
  kpis AS (
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE computed_status = 'Compliant')::int AS compliant,
      COUNT(*) FILTER (WHERE computed_status IN ('Upcoming', 'Warning', 'Critical'))::int AS expiring90,
      COUNT(*) FILTER (WHERE computed_status = 'Overdue')::int AS overdue,
      COUNT(*) FILTER (WHERE computed_status = 'Missing')::int AS missing
    FROM filtered
  ),
  status_by_location AS (
    SELECT location, computed_status AS status, COUNT(*)::int AS count
    FROM filtered
    GROUP BY location, computed_status
    ORDER BY location, computed_status
  ),
  status_counts AS (
    SELECT computed_status AS status, COUNT(*)::int AS count
    FROM filtered
    GROUP BY computed_status
    ORDER BY computed_status
  ),
  category_counts AS (
    SELECT category, COUNT(*)::int AS count
    FROM filtered
    GROUP BY category
    ORDER BY count DESC, category
  ),
  top_expiring AS (
    SELECT to_jsonb(t) AS row
    FROM (
      SELECT *
      FROM filtered
      WHERE expiry_date IS NOT NULL
      ORDER BY days_to_expiry ASC NULLS LAST
      LIMIT 10
    ) t
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT to_jsonb(k) FROM kpis k),
    'statusByLocation', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM status_by_location s), '[]'::jsonb),
    'statusCounts', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM status_counts s), '[]'::jsonb),
    'categoryCounts', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM category_counts c), '[]'::jsonb),
    'topExpiring', COALESCE((SELECT jsonb_agg(row) FROM top_expiring), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_e3_tracker_summary(text, text) TO authenticated, service_role;
