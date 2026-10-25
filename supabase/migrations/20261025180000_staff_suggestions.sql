-- Staff suggestions: all staff can submit; Admin (ceo/coo/regional_ops) + Head of Operations review.

CREATE TABLE IF NOT EXISTS public.hr_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  seen_at timestamptz,
  seen_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_suggestions_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT hr_suggestions_body_chk CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  CONSTRAINT hr_suggestions_category_chk CHECK (
    category IS NULL
    OR category IN ('operations', 'hr', 'safety', 'other')
  ),
  CONSTRAINT hr_suggestions_status_chk CHECK (status IN ('new', 'seen', 'closed')),
  CONSTRAINT hr_suggestions_admin_note_chk CHECK (
    admin_note IS NULL OR char_length(btrim(admin_note)) BETWEEN 1 AND 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_suggestions_created
  ON public.hr_suggestions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_suggestions_status_created
  ON public.hr_suggestions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_suggestions_user
  ON public.hr_suggestions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_suggestions_staff
  ON public.hr_suggestions (staff_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.can_review_staff_suggestions()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    public.has_role(auth.uid(), 'ceo'::public.app_role)
    OR public.has_role(auth.uid(), 'coo'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_ops'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.deleted_at IS NULL
        AND COALESCE(s.job_title, '') ~* 'head of operations'
    );
$fn$;

REVOKE ALL ON FUNCTION public.can_review_staff_suggestions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_review_staff_suggestions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_staff_suggestions() TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.hr_suggestions TO authenticated;
GRANT ALL ON public.hr_suggestions TO service_role;

ALTER TABLE public.hr_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_suggestions select" ON public.hr_suggestions;
CREATE POLICY "hr_suggestions select" ON public.hr_suggestions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_review_staff_suggestions()
  );

DROP POLICY IF EXISTS "hr_suggestions insert" ON public.hr_suggestions;
CREATE POLICY "hr_suggestions insert" ON public.hr_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND staff_id IN (
      SELECT s.id FROM public.staff s
      WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
    AND status = 'new'
  );

DROP POLICY IF EXISTS "hr_suggestions update" ON public.hr_suggestions;
CREATE POLICY "hr_suggestions update" ON public.hr_suggestions
  FOR UPDATE TO authenticated
  USING (public.can_review_staff_suggestions())
  WITH CHECK (public.can_review_staff_suggestions());
