-- Tighten expiry alert horizon from 90 days to 30 days across DB views and KPI RPCs.

-- E3 tracker: expiring-soon KPI counts Critical (≤30d) only, drop Upcoming (61–90d) status band.
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
    ELSE 'Compliant'
  END AS computed_status
FROM public.e3_compliance_items c;

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
      COUNT(*) FILTER (WHERE computed_status = 'Critical')::int AS expiring30,
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

-- Compliance register: remove Due ≤90 tier (61–90d → OK).
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
    ELSE 'OK'
  END AS alert_tier
FROM public.compliance_items c;

-- Document register enriched view: remove Due ≤90 tier.
CREATE OR REPLACE VIEW public.compliance_documents_enriched AS
SELECT
  d.*,
  (d.expiry_date - CURRENT_DATE) AS days_to_expiry,
  CASE
    WHEN d.expiry_date IS NULL THEN 'No Date'
    WHEN d.expiry_date < CURRENT_DATE THEN 'Expired'
    WHEN d.expiry_date <= CURRENT_DATE + 7 THEN 'Due ≤7'
    WHEN d.expiry_date <= CURRENT_DATE + 15 THEN 'Due ≤15'
    WHEN d.expiry_date <= CURRENT_DATE + 30 THEN 'Due ≤30'
    WHEN d.expiry_date <= CURRENT_DATE + 60 THEN 'Due ≤60'
    ELSE 'Valid'
  END AS expiry_tier
FROM public.compliance_documents d;

-- Location compliance tracker: remove 90d bucket (61–90d → ok).
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
    ELSE 'ok'
  END AS expiry_bucket
FROM public.location_compliance_items i
JOIN public.locations l ON l.id = i.location_id;

-- Dashboard KPI: AMC expiring soon within 30 days (was 90).
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_location_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'open_work_orders',
      (SELECT count(*)::int FROM work_orders wo
       WHERE wo.location_id = ANY(p_location_ids)
         AND wo.status NOT IN ('completed', 'cancelled')),
    'overdue_work_orders',
      (SELECT count(*)::int FROM work_orders wo
       WHERE wo.location_id = ANY(p_location_ids)
         AND wo.status NOT IN ('completed', 'cancelled')
         AND wo.planned_end IS NOT NULL
         AND wo.planned_end < now()),
    'open_issues',
      (SELECT count(*)::int FROM tickets t
       WHERE t.location_id = ANY(p_location_ids)
         AND t.deleted_at IS NULL
         AND t.status NOT IN ('resolved', 'closed', 'cancelled')),
    'critical_issues',
      (SELECT count(*)::int FROM tickets t
       WHERE t.location_id = ANY(p_location_ids)
         AND t.deleted_at IS NULL
         AND t.status NOT IN ('resolved', 'closed', 'cancelled')
         AND t.priority IN ('urgent', 'high')),
    'pm_due_this_week',
      (SELECT count(*)::int FROM pm_schedules pm
       WHERE pm.location_id = ANY(p_location_ids)
         AND pm.next_due_at >= date_trunc('day', now())
         AND pm.next_due_at <= date_trunc('day', now()) + interval '7 days'),
    'amc_expiring_soon',
      (SELECT count(*)::int FROM amc_contracts ac
       WHERE ac.location_id = ANY(p_location_ids)
         AND ac.contract_end_date >= current_date
         AND ac.contract_end_date <= current_date + interval '30 days'
         AND ac.status NOT IN ('cancelled', 'expired')),
    'pending_inspections',
      (SELECT count(*)::int FROM amc_service_schedules s
       WHERE s.status NOT IN ('done', 'cancelled')
         AND s.planned_date <= (current_date + interval '7 days')),
    'pending_compliance',
      (SELECT count(*)::int FROM compliance_documents cd
       WHERE cd.location_id = ANY(p_location_ids)
         AND cd.status NOT IN ('submitted', 'approved', 'renewed')),
    'high_risk_items',
      (SELECT count(*)::int FROM risk_register rr
       WHERE rr.location_id = ANY(p_location_ids)
         AND rr.risk_score >= 15
         AND rr.status NOT IN ('closed', 'mitigated')),
    'utility_cost_this_month',
      COALESCE((
        SELECT sum(uc.bill_amount)::numeric FROM utility_consumption uc
        WHERE uc.location_id = ANY(p_location_ids)
          AND uc.period_month >= date_trunc('month', current_date)::date
      ), 0)
  );
$$;

-- Renewals chart RPC: no Due ≤90 fallback.
CREATE OR REPLACE FUNCTION public.get_compliance_renewals(
  p_limit int DEFAULT 50,
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
      ELSE 'OK'
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
