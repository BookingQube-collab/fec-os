-- Daily ops KPIs: count open maintenance from maintenance_requests (unified with maintenance module)

CREATE OR REPLACE FUNCTION public.get_daily_ops_kpis(p_location_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active_employees',
      (SELECT count(*)::int FROM public.staff s
       WHERE s.location_id = ANY(p_location_ids)
         AND s.status = 'active'
         AND s.deleted_at IS NULL),
    'open_incidents',
      (SELECT count(*)::int FROM public.incidents i
       WHERE i.location_id = ANY(p_location_ids)
         AND i.status NOT IN ('closed')),
    'critical_open_incidents',
      (SELECT count(*)::int FROM public.incidents i
       WHERE i.location_id = ANY(p_location_ids)
         AND i.status NOT IN ('closed')
         AND i.severity IN ('critical', 'high')),
    'items_needing_reorder',
      (SELECT count(*)::int
       FROM public.inventory_stock ist
       JOIN public.inventory_items ii ON ii.id = ist.item_id
       WHERE ist.location_id = ANY(p_location_ids)
         AND ii.active = true
         AND ist.quantity_on_hand <= ii.reorder_level),
    'open_maintenance_issues',
      (SELECT count(*)::int FROM public.maintenance_requests mr
       WHERE mr.location_id = ANY(p_location_ids)
         AND mr.deleted_at IS NULL
         AND mr.status NOT IN ('completed', 'cancelled')),
    'urgent_maintenance_open',
      (SELECT count(*)::int FROM public.maintenance_requests mr
       WHERE mr.location_id = ANY(p_location_ids)
         AND mr.deleted_at IS NULL
         AND mr.status NOT IN ('completed', 'cancelled')
         AND mr.priority = 'urgent'),
    'open_complaints',
      (SELECT count(*)::int FROM public.complaints c
       WHERE c.location_id = ANY(p_location_ids)
         AND c.status NOT IN ('resolved', 'dismissed')),
    'briefings_filed_today',
      (SELECT count(*)::int FROM public.shift_briefings sb
       WHERE sb.location_id = ANY(p_location_ids)
         AND sb.briefing_date = CURRENT_DATE),
    'by_location',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'code', l.code,
            'name', l.name,
            'location_id', l.id,
            'active_employees',
              (SELECT count(*)::int FROM public.staff s
               WHERE s.location_id = l.id AND s.status = 'active' AND s.deleted_at IS NULL),
            'open_incidents',
              (SELECT count(*)::int FROM public.incidents i
               WHERE i.location_id = l.id AND i.status NOT IN ('closed')),
            'critical_open_incidents',
              (SELECT count(*)::int FROM public.incidents i
               WHERE i.location_id = l.id AND i.status NOT IN ('closed')
                 AND i.severity IN ('critical', 'high')),
            'items_needing_reorder',
              (SELECT count(*)::int
               FROM public.inventory_stock ist
               JOIN public.inventory_items ii ON ii.id = ist.item_id
               WHERE ist.location_id = l.id AND ii.active = true
                 AND ist.quantity_on_hand <= ii.reorder_level),
            'open_maintenance_issues',
              (SELECT count(*)::int FROM public.maintenance_requests mr
               WHERE mr.location_id = l.id
                 AND mr.deleted_at IS NULL
                 AND mr.status NOT IN ('completed', 'cancelled')),
            'urgent_maintenance_open',
              (SELECT count(*)::int FROM public.maintenance_requests mr
               WHERE mr.location_id = l.id
                 AND mr.deleted_at IS NULL
                 AND mr.status NOT IN ('completed', 'cancelled')
                 AND mr.priority = 'urgent'),
            'open_complaints',
              (SELECT count(*)::int FROM public.complaints c
               WHERE c.location_id = l.id AND c.status NOT IN ('resolved', 'dismissed')),
            'briefings_filed_today',
              (SELECT count(*)::int FROM public.shift_briefings sb
               WHERE sb.location_id = l.id AND sb.briefing_date = CURRENT_DATE)
          ) ORDER BY l.code
        )
        FROM public.locations l
        WHERE l.status = 'active'
          AND l.id = ANY(p_location_ids)
      ), '[]'::jsonb)
  );
$$;
