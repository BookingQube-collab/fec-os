CREATE TYPE public.forecast_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.decision_status AS ENUM ('proposed', 'reviewing', 'approved', 'rejected', 'implemented', 'cancelled');
CREATE TYPE public.decision_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.vote_type AS ENUM ('approve', 'reject', 'abstain', 'request_info');

CREATE TABLE public.forecasts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    status public.forecast_status NOT NULL DEFAULT 'draft',
    horizon_months integer NOT NULL DEFAULT 12,
    base_revenue_growth_pct numeric NOT NULL DEFAULT 0,
    base_margin_pct numeric NOT NULL DEFAULT 20,
    footfall_uplift_pct numeric NOT NULL DEFAULT 0,
    opex_change_pct numeric NOT NULL DEFAULT 0,
    capex_plan_aed numeric NOT NULL DEFAULT 0,
    ai_commentary text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.forecast_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id uuid NOT NULL REFERENCES public.forecasts(id) ON DELETE CASCADE,
    location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    projected_revenue numeric NOT NULL DEFAULT 0,
    projected_ebitda numeric NOT NULL DEFAULT 0,
    projected_margin_pct numeric NOT NULL DEFAULT 0,
    projected_footfall numeric NOT NULL DEFAULT 0,
    assumptions jsonb DEFAULT '{}',
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    priority public.decision_priority NOT NULL DEFAULT 'medium',
    status public.decision_status NOT NULL DEFAULT 'proposed',
    estimated_impact_aed numeric DEFAULT 0,
    due_date date,
    ai_summary text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.decision_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id uuid NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
    voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vote public.vote_type NOT NULL,
    note text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (decision_id, voter_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forecasts TO authenticated;
GRANT ALL ON public.forecasts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forecast_results TO authenticated;
GRANT ALL ON public.forecast_results TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_votes TO authenticated;
GRANT ALL ON public.decision_votes TO service_role;

ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage forecasts they created" ON public.forecasts FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can view published forecasts" ON public.forecasts FOR SELECT USING (status = 'published');

CREATE POLICY "Users can view forecast results" ON public.forecast_results FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.forecasts f
        WHERE f.id = forecast_results.forecast_id
        AND (f.created_by = auth.uid() OR f.status = 'published')
    )
);
CREATE POLICY "Users can insert forecast results for own forecasts" ON public.forecast_results FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.forecasts f
        WHERE f.id = forecast_results.forecast_id
        AND f.created_by = auth.uid()
    )
);
CREATE POLICY "Users can update forecast results for own forecasts" ON public.forecast_results FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.forecasts f
        WHERE f.id = forecast_results.forecast_id
        AND f.created_by = auth.uid()
    )
);
CREATE POLICY "Users can delete forecast results for own forecasts" ON public.forecast_results FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.forecasts f
        WHERE f.id = forecast_results.forecast_id
        AND f.created_by = auth.uid()
    )
);

CREATE POLICY "Users can manage decisions" ON public.decisions FOR ALL USING (auth.uid() = proposed_by);
CREATE POLICY "Users can view all decisions" ON public.decisions FOR SELECT USING (true);

CREATE POLICY "Users can vote on decisions" ON public.decision_votes FOR INSERT WITH CHECK (
    voter_id = auth.uid()
);
CREATE POLICY "Users can manage own votes" ON public.decision_votes FOR UPDATE USING (voter_id = auth.uid());
CREATE POLICY "Users can delete own votes" ON public.decision_votes FOR DELETE USING (voter_id = auth.uid());
CREATE POLICY "Users can view all votes" ON public.decision_votes FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.update_forecast_results(_forecast_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    f record;
    loc record;
    base_rev numeric;
    base_ebitda numeric;
    base_footfall numeric;
    projected_rev numeric;
    projected_ebitda numeric;
    projected_margin numeric;
    projected_footfall numeric;
BEGIN
    SELECT * INTO f FROM public.forecasts WHERE id = _forecast_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Forecast not found';
    END IF;

    DELETE FROM public.forecast_results WHERE forecast_id = _forecast_id;

    FOR loc IN SELECT id, name FROM public.locations WHERE status = 'active' LOOP
        SELECT COALESCE(SUM(revenue), 0), COALESCE(SUM(ebitda), 0), COALESCE(SUM(footfall), 0)
        INTO base_rev, base_ebitda, base_footfall
        FROM public.financial_snapshots
        WHERE location_id = loc.id
          AND period_kind = 'day'
          AND period_start >= (now() - interval '30 days')::date;

        projected_rev := base_rev * (1 + f.base_revenue_growth_pct / 100.0);
        projected_ebitda := base_rev * (1 + f.base_revenue_growth_pct / 100.0) * (f.base_margin_pct / 100.0);
        projected_margin := f.base_margin_pct;
        projected_footfall := base_footfall * (1 + f.footfall_uplift_pct / 100.0);

        INSERT INTO public.forecast_results (
            forecast_id, location_id, projected_revenue, projected_ebitda,
            projected_margin_pct, projected_footfall, assumptions
        ) VALUES (
            _forecast_id, loc.id, projected_rev, projected_ebitda,
            projected_margin, projected_footfall,
            jsonb_build_object(
                'base_revenue', base_rev,
                'base_ebitda', base_ebitda,
                'base_footfall', base_footfall
            )
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.decision_vote_summary(_decision_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'approve', COUNT(*) FILTER (WHERE vote = 'approve'),
        'reject', COUNT(*) FILTER (WHERE vote = 'reject'),
        'abstain', COUNT(*) FILTER (WHERE vote = 'abstain'),
        'request_info', COUNT(*) FILTER (WHERE vote = 'request_info'),
        'total', COUNT(*)
    )
    FROM public.decision_votes
    WHERE decision_id = _decision_id
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_forecasts_updated_at BEFORE UPDATE ON public.forecasts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_decisions_updated_at BEFORE UPDATE ON public.decisions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();