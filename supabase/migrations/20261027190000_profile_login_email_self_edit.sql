-- One-time self-serve sign-in email change on /profile.
-- Null = still available; timestamptz = already used (locked forever).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_email_self_edit_at timestamptz;

COMMENT ON COLUMN public.profiles.login_email_self_edit_at IS
  'When set, the user has used their one-time self-serve sign-in email change. Null means they may still edit once.';

-- Clients can UPDATE own profiles; keep this flag server/service-role only.
CREATE OR REPLACE FUNCTION public.profiles_guard_login_email_self_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.login_email_self_edit_at IS NOT NULL
     AND coalesce(auth.role(), '') = 'authenticated' THEN
    NEW.login_email_self_edit_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.login_email_self_edit_at IS DISTINCT FROM OLD.login_email_self_edit_at
     AND coalesce(auth.role(), '') = 'authenticated' THEN
    RAISE EXCEPTION 'login_email_self_edit_at is server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_login_email_self_edit ON public.profiles;
CREATE TRIGGER trg_profiles_guard_login_email_self_edit
  BEFORE INSERT OR UPDATE OF login_email_self_edit_at ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_login_email_self_edit();
