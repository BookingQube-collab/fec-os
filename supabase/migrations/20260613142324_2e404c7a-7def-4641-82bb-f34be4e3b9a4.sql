CREATE TABLE public.staff_leaderboard (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    tasks_completed integer NOT NULL DEFAULT 0,
    incidents_resolved integer NOT NULL DEFAULT 0,
    complaints_handled integer NOT NULL DEFAULT 0,
    bookings_created integer NOT NULL DEFAULT 0,
    overall_score integer NOT NULL DEFAULT 0,
    rank integer,
    badge text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (profile_id, period_start, period_end)
);

GRANT SELECT ON public.staff_leaderboard TO authenticated;
GRANT ALL ON public.staff_leaderboard TO service_role;

ALTER TABLE public.staff_leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view leaderboard" ON public.staff_leaderboard FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.refresh_leaderboard_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    since date := (now() - interval '30 days')::date;
    today date := now()::date;
    rec record;
    total integer := 0;
BEGIN
    DELETE FROM public.staff_leaderboard WHERE period_start = since AND period_end = today;

    FOR rec IN
        SELECT
            p.id AS profile_id,
            p.location_id,
            COALESCE(t.tasks, 0) AS tasks_completed,
            COALESCE(i.incidents, 0) AS incidents_resolved,
            COALESCE(c.complaints, 0) AS complaints_handled,
            COALESCE(b.bookings, 0) AS bookings_created
        FROM public.profiles p
        LEFT JOIN (
            SELECT completed_by, COUNT(*) AS tasks
            FROM public.task_item_results
            WHERE completed_at >= since
            GROUP BY completed_by
        ) t ON t.completed_by = p.id
        LEFT JOIN (
            SELECT closed_by, COUNT(*) AS incidents
            FROM public.incidents
            WHERE status = 'closed' AND closed_at >= since
            GROUP BY closed_by
        ) i ON i.closed_by = p.id
        LEFT JOIN (
            SELECT resolved_by, COUNT(*) AS complaints
            FROM public.complaints
            WHERE status = 'resolved' AND resolved_at >= since
            GROUP BY resolved_by
        ) c ON c.resolved_by = p.id
        LEFT JOIN (
            SELECT created_by, COUNT(*) AS bookings
            FROM public.bookings
            WHERE created_at >= since
            GROUP BY created_by
        ) b ON b.created_by = p.id
        WHERE p.role IN ('duty_manager', 'tech_supervisor', 'technician', 'cashier_host', 'branch_gm')
    LOOP
        INSERT INTO public.staff_leaderboard (
            profile_id, location_id, period_start, period_end,
            tasks_completed, incidents_resolved, complaints_handled, bookings_created, overall_score
        ) VALUES (
            rec.profile_id, rec.location_id, since, today,
            rec.tasks_completed, rec.incidents_resolved, rec.complaints_handled, rec.bookings_created,
            rec.tasks_completed * 2 + rec.incidents_resolved * 5 + rec.complaints_handled * 3 + rec.bookings_created * 1
        );
        total := total + 1;
    END LOOP;

    -- Assign ranks and badges
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

CREATE TRIGGER update_staff_leaderboard_updated_at BEFORE UPDATE ON public.staff_leaderboard
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();