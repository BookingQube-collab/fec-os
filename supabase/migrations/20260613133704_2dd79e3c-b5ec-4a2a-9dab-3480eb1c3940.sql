
CREATE TABLE public.escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope_priority text,
  scope_category text,
  minutes_after_sla integer NOT NULL DEFAULT 0,
  target_role app_role NOT NULL,
  bump_priority boolean NOT NULL DEFAULT true,
  level integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_escrules_enabled ON public.escalation_rules(enabled, location_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalation_rules TO authenticated;
GRANT ALL ON public.escalation_rules TO service_role;

ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escrules_read" ON public.escalation_rules
FOR SELECT TO authenticated USING (true);

CREATE POLICY "escrules_manage_managers" ON public.escalation_rules
FOR ALL TO authenticated
USING (public.current_user_role_level() >= 70)
WITH CHECK (public.current_user_role_level() >= 70);

CREATE TRIGGER trg_escrules_updated BEFORE UPDATE ON public.escalation_rules
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.escalations
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.escalation_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_escalations_ticket ON public.escalations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalations_active ON public.escalations(status, due_at);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_open ON public.tickets(sla_due_at)
  WHERE deleted_at IS NULL AND status NOT IN ('resolved','closed','cancelled');

CREATE OR REPLACE FUNCTION public.run_escalation_sweep()
RETURNS TABLE(escalation_id uuid, ticket_id uuid, rule_id uuid, level integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  new_id uuid;
  new_priority text;
BEGIN
  FOR r IN
    SELECT t.id AS tid, t.location_id, t.priority::text AS priority, t.category, t.title, t.sla_due_at,
           er.id AS rid, er.target_role, er.bump_priority, er.level AS rlvl, er.name AS rname
    FROM public.tickets t
    JOIN public.escalation_rules er ON er.enabled = true
      AND (er.location_id IS NULL OR er.location_id = t.location_id)
      AND (er.scope_priority IS NULL OR er.scope_priority = t.priority::text)
      AND (er.scope_category IS NULL OR er.scope_category = t.category)
    WHERE t.deleted_at IS NULL
      AND t.status NOT IN ('resolved','closed','cancelled')
      AND t.sla_due_at IS NOT NULL
      AND t.sla_due_at + (er.minutes_after_sla || ' minutes')::interval <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.escalations e
        WHERE e.ticket_id = t.id AND e.rule_id = er.id AND e.level = er.level
      )
  LOOP
    INSERT INTO public.escalations
      (location_id, source, source_id, ticket_id, rule_id, level, title, detail, severity, status, due_at)
    VALUES
      (r.location_id, 'ticket', r.tid, r.tid, r.rid, r.rlvl,
       'SLA breach: ' || r.title,
       'Rule "' || r.rname || '" triggered escalation to ' || r.target_role::text,
       CASE WHEN r.priority = 'urgent' THEN 'high' WHEN r.priority = 'high' THEN 'medium' ELSE 'low' END,
       'open',
       now() + interval '2 hours')
    RETURNING id INTO new_id;

    IF r.bump_priority THEN
      new_priority := CASE r.priority
        WHEN 'low' THEN 'normal'
        WHEN 'normal' THEN 'high'
        WHEN 'high' THEN 'urgent'
        ELSE 'urgent'
      END;
      UPDATE public.tickets SET priority = new_priority::ticket_priority WHERE id = r.tid AND priority::text <> 'urgent';
    END IF;

    INSERT INTO public.audit_log (actor_email, action, table_name, row_id, location_id, after, reason)
    VALUES ('system@escalation', 'ticket.escalated', 'tickets', r.tid, r.location_id,
            jsonb_build_object('rule', r.rname, 'level', r.rlvl, 'new_priority', new_priority),
            'Auto SLA breach sweep');

    escalation_id := new_id; ticket_id := r.tid; rule_id := r.rid; level := r.rlvl;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_escalation_sweep() TO authenticated, service_role;
