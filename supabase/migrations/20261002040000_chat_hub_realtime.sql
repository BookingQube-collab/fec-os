-- Phase 5: text messages and realtime invalidation.
--
-- Publication column lists require PostgreSQL 15 (Supabase PG15). body and
-- metadata are omitted on purpose. Clients must not render a realtime payload.
-- They refetch chat_messages_visible.
--
-- If ADD TABLE ... (column list) is rejected, do not publish chat_messages.
-- An invalidation subscription still requires the table to be published, so
-- the column list is preferred over publishing every column.
--
-- Replica identity stays the primary key. REPLICA IDENTITY FULL would include
-- body in the old row image and is not compatible with a column list that
-- hides body. INSERT events still carry conversation_id because that column
-- is in the publication list, which is what the open-thread filter uses.
--
-- chat_can_post did not look at archived_at. This migration replaces it so
-- RLS (via chat_message_type_allowed) denies archived rooms as well as
-- deleted rooms, non-members, and READ_ONLY. Phase 2 and phase 3 files are
-- unchanged.

CREATE OR REPLACE FUNCTION public.chat_can_post(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = _conversation_id
      AND m.user_id = auth.uid()
      AND m.left_at IS NULL
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND m.role <> 'READ_ONLY'
      AND (
        (c.posting_policy = 'MEMBERS' AND m.role IN ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER'))
        OR (c.posting_policy = 'ADMINS_ONLY' AND m.role IN ('OWNER', 'ADMIN'))
      )
  );
$$;

COMMENT ON FUNCTION public.chat_can_post(uuid) IS
  'Active member who is not READ_ONLY, whose role matches posting_policy, in a conversation that is not deleted or archived.';

-- Runs before trg_chat_messages_write (post_guard < write). Archived text
-- gets a specific error. Other denials still come from the write trigger.
CREATE OR REPLACE FUNCTION public.chat_tg_text_post_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.type IS DISTINCT FROM 'TEXT' THEN
    RETURN NEW;
  END IF;

  IF public.chat_caller_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.chat_conversations c
    WHERE c.id = NEW.conversation_id
      AND c.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'cannot post in an archived conversation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Runs after trg_chat_messages_write (write_rate > write) so a permission
-- failure is raised before the cap. Counts TEXT rows by auth.uid() in the
-- last minute across conversations. The row being inserted is not visible yet,
-- so 30 existing rows reject the next insert.
-- Privileged callers follow chat_tg_messages_write and skip the cap. Group
-- RPCs do not insert chat_messages. This does not write chat_audit_logs.
CREATE OR REPLACE FUNCTION public.chat_tg_text_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  recent_count int;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.type IS DISTINCT FROM 'TEXT' THEN
    RETURN NEW;
  END IF;

  IF public.chat_caller_is_privileged() THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO recent_count
  FROM public.chat_messages m
  WHERE m.sender_id = auth.uid()
    AND m.type = 'TEXT'
    AND m.created_at > now() - interval '1 minute';

  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'chat message rate limit exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.chat_tg_text_rate_limit() IS
  'Max 30 TEXT inserts per auth.uid() per minute. Keep in sync with CHAT_TEXT_RATE_PER_MINUTE.';

REVOKE ALL ON FUNCTION public.chat_tg_text_post_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_text_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_messages_post_guard ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_post_guard
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_text_post_guard();

DROP TRIGGER IF EXISTS trg_chat_messages_write_rate ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_write_rate
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_text_rate_limit();

-- Publish non-content columns only. Drop first when the table is already a
-- member so a previous full-row publication cannot keep body.
DO $pub$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'chat_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages';
  END IF;
END
$pub$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages (
  id,
  conversation_id,
  sender_id,
  client_message_id,
  type,
  reply_to_message_id,
  thread_root_message_id,
  forwarded_from_message_id,
  created_at,
  updated_at,
  edited_at,
  deleted_at,
  deleted_by,
  deletion_scope,
  content_hidden
);
