-- Security Advisor (splinter): Function Search Path Mutable.
-- Sets search_path = public on every public-schema function/procedure/aggregate
-- that does not already pin search_path. Includes pgvector helpers installed in
-- public (extension members) so the advisor clears for the public schema.
-- Does not alter auth/storage/realtime/extensions schemas (platform-managed).

DO $$
DECLARE
  r record;
  altered int := 0;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname,
      p.prokind,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p', 'a')
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
    ORDER BY p.proname, args
  LOOP
    BEGIN
      IF r.prokind = 'a' THEN
        EXECUTE format(
          'ALTER AGGREGATE public.%I(%s) SET search_path = public',
          r.proname,
          r.args
        );
      ELSIF r.prokind = 'p' THEN
        EXECUTE format(
          'ALTER PROCEDURE public.%I(%s) SET search_path = public',
          r.proname,
          r.args
        );
      ELSE
        EXECUTE format(
          'ALTER FUNCTION public.%I(%s) SET search_path = public',
          r.proname,
          r.args
        );
      END IF;
      altered := altered + 1;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'skip %(%): insufficient privilege', r.proname, r.args;
      WHEN OTHERS THEN
        RAISE NOTICE 'skip %(%): %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'security_advisor_function_search_path: altered % object(s)', altered;
END $$;
