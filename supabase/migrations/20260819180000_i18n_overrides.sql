-- Runtime Arabic (and other locale) translation overlays. Bundled JSON stays the default;
-- this table is applied on top so corrections survive a read-only production filesystem.

CREATE TABLE IF NOT EXISTS public.i18n_overrides (
  locale text NOT NULL CHECK (locale IN ('en', 'ar')),
  key text NOT NULL CHECK (key ~ '^[a-zA-Z0-9_.]+$' AND char_length(key) BETWEEN 1 AND 200),
  value text NOT NULL CHECK (char_length(value) <= 2000),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (locale, key)
);

CREATE INDEX IF NOT EXISTS idx_i18n_overrides_locale ON public.i18n_overrides (locale);

GRANT SELECT ON public.i18n_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.i18n_overrides TO authenticated;
GRANT ALL ON public.i18n_overrides TO service_role;

ALTER TABLE public.i18n_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "i18n_overrides read" ON public.i18n_overrides;
CREATE POLICY "i18n_overrides read" ON public.i18n_overrides
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "i18n_overrides write" ON public.i18n_overrides;
CREATE POLICY "i18n_overrides write" ON public.i18n_overrides
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 80)
  WITH CHECK (public.current_user_role_level() >= 80);

DROP TRIGGER IF EXISTS trg_i18n_overrides_updated ON public.i18n_overrides;
CREATE TRIGGER trg_i18n_overrides_updated
  BEFORE UPDATE ON public.i18n_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
