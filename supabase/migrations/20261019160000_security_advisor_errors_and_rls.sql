-- Security Advisor (splinter): clear ERROR + INFO findings that are safe to fix.
--
-- Errors addressed:
--   - Security Definer View on five compliance/ops enriched views → security_invoker
--   - RLS Disabled on schema_migrations + arcade_number_counters
-- Intentionally left:
--   - public.chat_messages_visible stays security_invoker=false (owner-run mask;
--     authenticated has no SELECT on chat_messages.body/metadata; membership is
--     enforced in the view WHERE via chat_is_active_member).
--
-- Info addressed:
--   - RLS Enabled No Policy on service-role-only tables → explicit deny policies
--     for anon/authenticated (app uses supabaseAdmin / service_role for these).

-- ---------------------------------------------------------------------------
-- 1) Enriched views: run as invoker so underlying table RLS applies
-- ---------------------------------------------------------------------------

ALTER VIEW public.compliance_items_enriched SET (security_invoker = true);
ALTER VIEW public.compliance_documents_enriched SET (security_invoker = true);
ALTER VIEW public.location_compliance_items_enriched SET (security_invoker = true);
ALTER VIEW public.supervisor_issues_enriched SET (security_invoker = true);
ALTER VIEW public.e3_compliance_items_enriched SET (security_invoker = true);

COMMENT ON VIEW public.compliance_items_enriched IS
  'Enriched compliance register. security_invoker so caller RLS on compliance_items applies.';
COMMENT ON VIEW public.compliance_documents_enriched IS
  'Enriched document register. security_invoker so caller RLS on compliance_documents applies.';
COMMENT ON VIEW public.location_compliance_items_enriched IS
  'Location compliance tracker enrichment. security_invoker so caller RLS applies.';
COMMENT ON VIEW public.supervisor_issues_enriched IS
  'Supervisor issues with days_open. security_invoker so caller RLS applies.';
COMMENT ON VIEW public.e3_compliance_items_enriched IS
  'E3 tracker enrichment. security_invoker so caller RLS on e3_compliance_items applies.';

COMMENT ON VIEW public.chat_messages_visible IS
  'Owner-run mask for body and metadata (security_invoker=false). Requires chat_is_active_member because the view owner bypasses RLS. content_hidden nulls body and metadata for everyone. A SELF delete does that only when deleted_by is the current user. Clients must read message content from this view. Not converted to security_invoker: authenticated cannot SELECT body/metadata on chat_messages.';

-- ---------------------------------------------------------------------------
-- 2) schema_migrations: enable RLS, revoke API roles (db:push uses postgres)
-- ---------------------------------------------------------------------------

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.schema_migrations TO postgres, service_role;

DROP POLICY IF EXISTS schema_migrations_no_direct_anon ON public.schema_migrations;
DROP POLICY IF EXISTS schema_migrations_no_direct_authenticated ON public.schema_migrations;

CREATE POLICY schema_migrations_no_direct_anon
  ON public.schema_migrations
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY schema_migrations_no_direct_authenticated
  ON public.schema_migrations
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.schema_migrations IS
  'Applied SQL migration versions for npm run db:push. Not exposed to anon/authenticated; service_role/postgres only.';

-- ---------------------------------------------------------------------------
-- 3) arcade_number_counters: RLS + read for authenticated; writes via definer RPC
-- ---------------------------------------------------------------------------

ALTER TABLE public.arcade_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS arcade_number_counters_read ON public.arcade_number_counters;
CREATE POLICY arcade_number_counters_read
  ON public.arcade_number_counters
  FOR SELECT TO authenticated
  USING (true);

-- Inserts/updates go through public.arcade_next_number() (SECURITY DEFINER).
-- No authenticated write policies.

-- ---------------------------------------------------------------------------
-- 4) Service-role-only tables: explicit deny policies (clear "RLS Enabled No Policy")
--    Grants already revoke anon/authenticated; policies document intent for the linter.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_provider_configs',
    'ai_routing_settings',
    'ai_usage_daily',
    'attendance_adms_unknown_serials',
    'attendance_correction_approvals',
    'chat_audit_logs',
    'chat_livekit_settings',
    'chat_push_settings',
    'chat_sync_guard',
    'sidebar_nav_order',
    'webauthn_challenges'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_direct_anon', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_direct_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)',
      t || '_no_direct_anon', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      t || '_no_direct_authenticated', t
    );
  END LOOP;
END $$;
