-- Chat Hub RLS checks. Not wired into vitest or CI.
-- Do not run this against production or an unknown Postgres on port 5432.
--
-- Requires phase 2 and phase 3 migrations on a local throwaway database.
-- Run as the migration owner (postgres / supabase_admin). The script switches
-- to authenticated, then rolls the transaction back.
--
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/chat_hub_rls.sql
--
-- This repo has no earlier SQL test that sets a JWT. Supabase auth.uid() and
-- auth.role() read request.jwt.claim.sub / request.jwt.claim.role, then fall
-- back to request.jwt.claims. The script sets both, then SET LOCAL ROLE
-- authenticated. Seed writes run as the migration owner with the JWT cleared
-- so chat_caller_is_privileged() stays true (session_user postgres,
-- supabase_admin, or service_role, and no JWT role).

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'authenticated', 'authenticated', 'chat-rls-a@example.com', '',
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'authenticated', 'authenticated', 'chat-rls-b@example.com', '',
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'authenticated', 'authenticated', 'chat-rls-c@example.com', '',
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

INSERT INTO public.chat_conversations (id, kind, posting_policy, file_policy, call_policy, created_by)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'PRIVATE', 'MEMBERS', 'MEMBERS', 'MEMBERS',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

INSERT INTO public.chat_members (conversation_id, user_id, role, membership_source, added_by)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'OWNER', 'MANUAL',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

INSERT INTO public.chat_messages (id, conversation_id, sender_id, type, body, metadata)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'TEXT', 'keep-for-audit', '{"keep":true}'::jsonb
);

INSERT INTO public.chat_attachments (
  id, conversation_id, storage_path, original_filename, mime_type, byte_size, scan_status, created_by
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'chat-rls/pending.txt', 'pending.txt', 'text/plain', 12, 'PENDING',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

INSERT INTO public.chat_messages (id, conversation_id, sender_id, type, body)
VALUES (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'POLL', 'pick one'
);

INSERT INTO public.chat_polls (id, message_id, conversation_id, anonymous)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  true
);

INSERT INTO public.chat_poll_options (id, poll_id, label, position)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  '44444444-4444-4444-8444-444444444444',
  'Yes', 0
);

INSERT INTO public.chat_poll_votes (poll_id, option_id, user_id)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '66666666-6666-4666-8666-666666666666',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

DO $t$
DECLARE
  n int;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid THEN
    RAISE EXCEPTION 'FAIL: auth.uid() was not user B';
  END IF;
  SELECT count(*) INTO n FROM public.chat_conversations;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B saw % conversations', n;
  END IF;
  SELECT count(*) INTO n FROM public.chat_messages;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: non-member saw % messages', n;
  END IF;
  SELECT count(*) INTO n FROM public.chat_messages_visible;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: non-member saw % visible messages', n;
  END IF;
END
$t$;

RESET ROLE;
-- Clear the test JWT so later owner-session writes stay privileged.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.chat_members (conversation_id, user_id, role, membership_source, added_by)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'READ_ONLY', 'MANUAL',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

DO $t$
BEGIN
  INSERT INTO public.chat_messages (conversation_id, sender_id, type, body)
  VALUES (
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'TEXT', 'read only should fail'
  );
  RAISE EXCEPTION 'FAIL: READ_ONLY insert succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END
$t$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claims', '', true);

UPDATE public.chat_members
SET role = 'MEMBER'
WHERE conversation_id = '11111111-1111-4111-8111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

INSERT INTO public.chat_messages (id, conversation_id, sender_id, type, body)
VALUES (
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'TEXT', 'forged sender'
);

DO $t$
DECLARE
  stored uuid;
BEGIN
  SELECT sender_id INTO stored
  FROM public.chat_messages
  WHERE id = '77777777-7777-4777-8777-777777777777';
  IF stored IS DISTINCT FROM 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid THEN
    RAISE EXCEPTION 'FAIL: forged sender stored as %', stored;
  END IF;
END
$t$;

DO $t$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.chat_poll_votes
  WHERE poll_id = '44444444-4444-4444-8444-444444444444'
    AND user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B saw % anonymous votes belonging to A', n;
  END IF;
END
$t$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

DO $t$
BEGIN
  UPDATE public.chat_attachments
  SET scan_status = 'CLEAN'
  WHERE id = '33333333-3333-4333-8333-333333333333';
  RAISE EXCEPTION 'FAIL: scan_status CLEAN update succeeded';
EXCEPTION
  WHEN insufficient_privilege OR check_violation THEN
    NULL;
END
$t$;

DO $t$
BEGIN
  INSERT INTO public.chat_members (conversation_id, user_id, role, membership_source, added_by)
  VALUES (
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'MEMBER', 'DEPARTMENT',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  );
  RAISE EXCEPTION 'FAIL: DEPARTMENT membership insert succeeded';
EXCEPTION
  WHEN insufficient_privilege OR check_violation THEN
    NULL;
END
$t$;

DO $t$
BEGIN
  PERFORM 1 FROM public.chat_audit_logs;
  RAISE EXCEPTION 'FAIL: authenticated read chat_audit_logs';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END
$t$;

UPDATE public.chat_messages
SET deletion_scope = 'EVERYONE',
    content_hidden = true,
    deleted_at = now(),
    deleted_by = auth.uid()
WHERE id = '22222222-2222-4222-8222-222222222222';

DO $t$
DECLARE
  visible_body text;
BEGIN
  SELECT body INTO visible_body
  FROM public.chat_messages_visible
  WHERE id = '22222222-2222-4222-8222-222222222222';
  IF visible_body IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: EVERYONE-deleted view body was %', visible_body;
  END IF;
END
$t$;

DO $t$
BEGIN
  PERFORM body FROM public.chat_messages
  WHERE id = '22222222-2222-4222-8222-222222222222';
  RAISE EXCEPTION 'FAIL: authenticated selected chat_messages.body';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END
$t$;

RESET ROLE;
ROLLBACK;
