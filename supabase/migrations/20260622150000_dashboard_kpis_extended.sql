-- Extend dashboard KPI RPC and add locations index for /api/sites

CREATE INDEX IF NOT EXISTS idx_locations_status_code
  ON public.locations (status, code)
  WHERE status = 'active';

-- Replace KPI RPC with extended aggregates (single DB round-trip for counts)
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
         AND ac.contract_end_date <= current_date + interval '90 days'
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

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(uuid[]) TO authenticated;
