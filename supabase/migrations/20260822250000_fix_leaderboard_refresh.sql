-- refresh_leaderboard_scores referenced columns that never existed:
--   incidents.closed_by   (table has closed_at, reported_by)
--   complaints.resolved_by (table has handled_by text, resolved_at)
--   profiles.role / profiles.location_id (moved to staff + user_roles)
-- Attribute incident/complaint credit from audit_log, which records the actor.

CREATE OR REPLACE FUNCTION public.refresh_leaderboard_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    since date := (now() - interval '30 days')::date;
    today date := now()::date;
    total integer := 0;
BEGIN
    DELETE FROM public.staff_leaderboard
    WHERE period_start = since AND period_end = today;

    INSERT INTO public.staff_leaderboard (
        profile_id, location_id, period_start, period_end,
        tasks_completed, incidents_resolved, complaints_handled, bookings_created, overall_score
    )
    SELECT
        p.id,
        s.location_id,
        since,
        today,
        COALESCE(t.tasks, 0),
        COALESCE(i.incidents, 0),
        COALESCE(c.complaints, 0),
        COALESCE(b.bookings, 0),
        COALESCE(t.tasks, 0) * 2
            + COALESCE(i.incidents, 0) * 5
            + COALESCE(c.complaints, 0) * 3
            + COALESCE(b.bookings, 0) * 1
    FROM public.profiles p
    LEFT JOIN LATERAL (
        SELECT st.location_id
        FROM public.staff st
        WHERE st.user_id = p.id
          AND st.deleted_at IS NULL
        ORDER BY st.updated_at DESC NULLS LAST
        LIMIT 1
    ) s ON true
    LEFT JOIN (
        SELECT completed_by, COUNT(*)::integer AS tasks
        FROM public.task_item_results
        WHERE completed_at >= since
          AND completed_by IS NOT NULL
        GROUP BY completed_by
    ) t ON t.completed_by = p.id
    LEFT JOIN (
        SELECT actor_id, COUNT(*)::integer AS incidents
        FROM public.audit_log
        WHERE action = 'incident.closed'
          AND created_at >= since
          AND actor_id IS NOT NULL
        GROUP BY actor_id
    ) i ON i.actor_id = p.id
    LEFT JOIN (
        SELECT actor_id, COUNT(*)::integer AS complaints
        FROM public.audit_log
        WHERE action = 'complaint.resolved'
          AND created_at >= since
          AND actor_id IS NOT NULL
        GROUP BY actor_id
    ) c ON c.actor_id = p.id
    LEFT JOIN (
        SELECT created_by, COUNT(*)::integer AS bookings
        FROM public.bookings
        WHERE created_at >= since
          AND created_by IS NOT NULL
          AND deleted_at IS NULL
        GROUP BY created_by
    ) b ON b.created_by = p.id
    WHERE EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = p.id
              AND ur.role IN (
                'duty_manager',
                'tech_supervisor',
                'technician',
                'cashier_host',
                'branch_gm'
              )
        )
        OR COALESCE(t.tasks, 0)
            + COALESCE(i.incidents, 0)
            + COALESCE(c.complaints, 0)
            + COALESCE(b.bookings, 0) > 0;

    GET DIAGNOSTICS total = ROW_COUNT;

    UPDATE public.staff_leaderboard lb
    SET rank = r.rank,
        badge = CASE
            WHEN r.rank = 1 THEN 'gold'
            WHEN r.rank = 2 THEN 'silver'
            WHEN r.rank = 3 THEN 'bronze'
            WHEN r.rank <= 10 THEN 'top10'
            ELSE NULL
        END
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY overall_score DESC) AS rank
        FROM public.staff_leaderboard
        WHERE period_start = since AND period_end = today
    ) r
    WHERE lb.id = r.id;

    RETURN total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_leaderboard_scores() TO authenticated, service_role;
