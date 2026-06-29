-- Performance indexes and dashboard KPI RPC for FEC Operations Platform

-- work_orders: common list filters
CREATE INDEX IF NOT EXISTS idx_work_orders_location_status
  ON public.work_orders (location_id, status)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_work_orders_planned_end
  ON public.work_orders (planned_end)
  WHERE status NOT IN ('completed', 'cancelled') AND planned_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_status
  ON public.work_orders (assigned_to, status, planned_end);

-- task_instances: assigned queue
CREATE INDEX IF NOT EXISTS idx_task_instances_assigned_due
  ON public.task_instances (assigned_to, due_at)
  WHERE status NOT IN ('verified', 'completed', 'cancelled');

-- tickets: open issues by location and priority
CREATE INDEX IF NOT EXISTS idx_tickets_location_open_priority
  ON public.tickets (location_id, priority)
  WHERE deleted_at IS NULL AND status NOT IN ('resolved', 'closed', 'cancelled');

-- shifts: today's attendance rollup
CREATE INDEX IF NOT EXISTS idx_shifts_location_starts
  ON public.shifts (location_id, starts_at);

-- financial_snapshots: revenue KPI lookups
CREATE INDEX IF NOT EXISTS idx_financial_snapshots_loc_kind_start
  ON public.financial_snapshots (location_id, period_kind, period_start);

-- amc schedules: pending inspections window
CREATE INDEX IF NOT EXISTS idx_amc_schedules_pending_planned
  ON public.amc_service_schedules (planned_date, status)
  WHERE status NOT IN ('done', 'cancelled');

-- facility_tasks: site readiness category
CREATE INDEX IF NOT EXISTS idx_facility_tasks_category_status
  ON public.facility_tasks (location_id, category, status);

-- Aggregated dashboard KPI counts (optional fast path, client counts as fallback)
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
         AND ac.status NOT IN ('cancelled', 'expired'))
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(uuid[]) TO authenticated;
