-- Compliance executive KPIs: single RPC instead of 4 enriched-view count scans

CREATE INDEX IF NOT EXISTS idx_compliance_items_alert_dates
  ON public.compliance_items (COALESCE(next_due_date, expiry_date))
  WHERE COALESCE(next_due_date, expiry_date) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_compliance_kpis(
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      COALESCE(c.next_due_date, c.expiry_date) AS governing_date
    FROM compliance_items c
    WHERE COALESCE(c.next_due_date, c.expiry_date) IS NOT NULL
      AND (
        p_location_id IS NULL
        OR c.venue_scope ILIKE '%' || (SELECT code FROM locations WHERE id = p_location_id LIMIT 1) || '%'
      )
  ),
  doc_counts AS (
    SELECT
      count(*) FILTER (WHERE d.expiry_date < CURRENT_DATE)::int AS doc_expired,
      count(*) FILTER (
        WHERE d.expiry_date >= CURRENT_DATE
          AND d.expiry_date <= CURRENT_DATE + 7
      )::int AS doc_due_7,
      count(*) FILTER (
        WHERE d.expiry_date >= CURRENT_DATE
          AND d.expiry_date <= CURRENT_DATE + 30
      )::int AS doc_due_30,
      count(*) FILTER (
        WHERE d.expiry_date >= CURRENT_DATE
          AND d.expiry_date <= CURRENT_DATE + 60
      )::int AS doc_due_60
    FROM compliance_documents d
    WHERE d.expiry_date IS NOT NULL
      AND d.renewal_status NOT IN ('renewed', 'not_applicable')
      AND (p_location_id IS NULL OR d.location_id = p_location_id)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM scoped),
    'expired', (
      SELECT count(*)::int FROM scoped WHERE governing_date < CURRENT_DATE
    ),
    'due_30', (
      SELECT count(*)::int FROM scoped
      WHERE governing_date >= CURRENT_DATE
        AND governing_date <= CURRENT_DATE + 30
    ),
    'due_60', (
      SELECT count(*)::int FROM scoped
      WHERE governing_date >= CURRENT_DATE
        AND governing_date <= CURRENT_DATE + 60
    ),
    'doc_expired', (SELECT doc_expired FROM doc_counts),
    'doc_due_7', (SELECT doc_due_7 FROM doc_counts),
    'doc_due_30', (SELECT doc_due_30 FROM doc_counts),
    'doc_due_60', (SELECT doc_due_60 FROM doc_counts)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_compliance_kpis(uuid) TO authenticated;
