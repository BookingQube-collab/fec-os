-- HR Helpdesk: knowledge articles, configuration, routing notes, and ticket updates.
-- Tickets stay on hr_employee_events (event_type = helpdesk_request). That timeline
-- is append-only for authenticated roles, so status changes go through a definer.

CREATE TABLE IF NOT EXISTS public.hr_helpdesk_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL,
  visibility text NOT NULL DEFAULT 'all_employees',
  published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_helpdesk_articles_title_chk CHECK (char_length(btrim(title)) >= 2),
  CONSTRAINT hr_helpdesk_articles_body_chk CHECK (char_length(btrim(body)) >= 2),
  CONSTRAINT hr_helpdesk_articles_category_chk CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  CONSTRAINT hr_helpdesk_articles_visibility_chk CHECK (visibility IN ('all_employees', 'hr_only'))
);

CREATE INDEX IF NOT EXISTS idx_hr_helpdesk_articles_published
  ON public.hr_helpdesk_articles (published, updated_at DESC);

DROP TRIGGER IF EXISTS trg_hr_helpdesk_articles_updated ON public.hr_helpdesk_articles;
CREATE TRIGGER trg_hr_helpdesk_articles_updated
  BEFORE UPDATE ON public.hr_helpdesk_articles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.hr_helpdesk_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  description text,
  categories jsonb NOT NULL DEFAULT '["payroll","attendance","document","shift","transport","equipment","relations","other"]'::jsonb,
  first_response_hours int NOT NULL DEFAULT 24,
  resolution_hours int NOT NULL DEFAULT 72,
  default_assignee_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  assignment_notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_helpdesk_settings_hours_chk CHECK (
    first_response_hours BETWEEN 1 AND 720
    AND resolution_hours BETWEEN 1 AND 720
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_helpdesk_settings_singleton
  ON public.hr_helpdesk_settings ((true));

DROP TRIGGER IF EXISTS trg_hr_helpdesk_settings_updated ON public.hr_helpdesk_settings;
CREATE TRIGGER trg_hr_helpdesk_settings_updated
  BEFORE UPDATE ON public.hr_helpdesk_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.hr_helpdesk_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  category text NOT NULL,
  condition text NOT NULL,
  assignee_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_helpdesk_rules_kind_chk CHECK (kind IN ('routing', 'escalation')),
  CONSTRAINT hr_helpdesk_rules_category_chk CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  CONSTRAINT hr_helpdesk_rules_condition_chk CHECK (char_length(btrim(condition)) BETWEEN 2 AND 240)
);

CREATE INDEX IF NOT EXISTS idx_hr_helpdesk_rules_kind
  ON public.hr_helpdesk_rules (kind, active, created_at DESC);

DROP TRIGGER IF EXISTS trg_hr_helpdesk_rules_updated ON public.hr_helpdesk_rules;
CREATE TRIGGER trg_hr_helpdesk_rules_updated
  BEFORE UPDATE ON public.hr_helpdesk_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.hr_helpdesk_articles,
  public.hr_helpdesk_settings,
  public.hr_helpdesk_rules
TO authenticated;

GRANT ALL ON
  public.hr_helpdesk_articles,
  public.hr_helpdesk_settings,
  public.hr_helpdesk_rules
TO service_role;

ALTER TABLE public.hr_helpdesk_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_helpdesk_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_helpdesk_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_helpdesk_articles read" ON public.hr_helpdesk_articles;
CREATE POLICY "hr_helpdesk_articles read" ON public.hr_helpdesk_articles
  FOR SELECT TO authenticated
  USING (published = true OR public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_helpdesk_articles write" ON public.hr_helpdesk_articles;
CREATE POLICY "hr_helpdesk_articles write" ON public.hr_helpdesk_articles
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_helpdesk_settings read" ON public.hr_helpdesk_settings;
CREATE POLICY "hr_helpdesk_settings read" ON public.hr_helpdesk_settings
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_helpdesk_settings write" ON public.hr_helpdesk_settings;
CREATE POLICY "hr_helpdesk_settings write" ON public.hr_helpdesk_settings
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_helpdesk_rules read" ON public.hr_helpdesk_rules;
CREATE POLICY "hr_helpdesk_rules read" ON public.hr_helpdesk_rules
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_helpdesk_rules write" ON public.hr_helpdesk_rules;
CREATE POLICY "hr_helpdesk_rules write" ON public.hr_helpdesk_rules
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

CREATE OR REPLACE FUNCTION public.hr_helpdesk_patch_request(
  p_event_id uuid,
  p_status text,
  p_category text,
  p_assignee uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF public.current_user_role_level() < 55 THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_status NOT IN ('open', 'waiting', 'in_progress', 'resolved') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  UPDATE public.hr_employee_events
  SET payload = COALESCE(payload, '{}'::jsonb)
    || jsonb_build_object(
      'status', p_status,
      'category', COALESCE(NULLIF(btrim(COALESCE(p_category, '')), ''), payload->>'category', 'other'),
      'assigneeStaffId', CASE WHEN p_assignee IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_assignee) END
    )
  WHERE id = p_event_id
    AND event_type = 'helpdesk_request';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hr_helpdesk_patch_request(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_helpdesk_patch_request(uuid, text, text, uuid) TO authenticated;
