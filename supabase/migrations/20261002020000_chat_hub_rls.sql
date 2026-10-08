-- Chat Hub phase 3: RLS policies, authorization helpers, and column masking.
-- Does not add realtime, storage, notifications, or UI.
--
-- Account activity: public.profiles has no disabled/banned column, and the app
-- never reads auth.users.banned_until. There is no account-ban flag to enforce.
-- Reads are not blocked because staff.deleted_at is set. New chat_members.staff_id
-- values are rejected when that staff row is soft-deleted, when staff.user_id is
-- null, or when staff.user_id is not the member user_id. staff.user_id stays
-- non-unique.
--
-- chat_messages_visible runs as the view owner (not security_invoker) and masks
-- body/metadata. The owner bypasses RLS, so the view WHERE clause requires
-- chat_is_active_member. Table-level SELECT from phase 2 would still let
-- authenticated read every column, and a column REVOKE does not override a
-- table-level GRANT, so this migration drops table SELECT and grants SELECT
-- only on the non-content columns. INSERT and UPDATE on body stay. Clients
-- must read content from the view.
--
-- Inserting a conversation does not grant read access. PostgREST INSERT ...
-- RETURNING checks SELECT policies, so a creator insert that asks for the row
-- back fails until a membership exists. A later phase should insert the
-- conversation and the owner membership in one definer RPC, or insert without
-- RETURNING. There is no creator SELECT policy.
--
-- Owner transfer is not expressible safely here. Policies and triggers reject
-- any role change that touches OWNER. Setting left_at on the last active OWNER
-- is rejected. A later RPC will transfer ownership. A member cannot clear
-- their own left_at.
-- Poll votes cannot be updated or deleted by authenticated users.
-- Call recording_enabled true is rejected for every role, including service_role.
-- Provider other than NONE is rejected in this phase.
--
-- service_role and the table owner bypass RLS and do not bypass triggers.
-- chat_caller_is_privileged() is true when the JWT role is service_role, or when
-- there is no JWT and session_user is service_role, postgres, or supabase_admin.
-- A JWT role of authenticated is never privileged, including when a superuser
-- SET ROLE authenticated in a test. Inside SECURITY DEFINER, current_user is the
-- function owner, so the JWT role is the API signal.

-- ---------------------------------------------------------------------------
-- Existing integrity triggers read or write other chat rows. As INVOKER they
-- would fail closed or, for the allow_multiple guard, miss rows hidden by RLS.
-- Keep the phase 2 bodies. Run them as the function owner.
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.chat_tg_dm_pair_direct_only() SECURITY DEFINER;
ALTER FUNCTION public.chat_tg_conversation_kind_guard() SECURITY DEFINER;
ALTER FUNCTION public.chat_tg_message_thread_refs() SECURITY DEFINER;
ALTER FUNCTION public.chat_tg_message_same_conversation() SECURITY DEFINER;
ALTER FUNCTION public.chat_tg_read_state_message() SECURITY DEFINER;
ALTER FUNCTION public.chat_tg_poll_vote_single_choice() SECURITY DEFINER;
ALTER FUNCTION public.chat_tg_poll_allow_multiple_guard() SECURITY DEFINER;
ALTER FUNCTION public.chat_tg_conversation_before_delete() SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.chat_tg_dm_pair_direct_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_conversation_kind_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_message_thread_refs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_message_same_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_read_state_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_poll_vote_single_choice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_poll_allow_multiple_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_conversation_before_delete() FROM PUBLIC, anon, authenticated;

-- Append-only audit does not read other rows. It is still DEFINER so a later
-- edit cannot accidentally run as the caller under RLS.
ALTER FUNCTION public.chat_tg_audit_append_only() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.chat_tg_audit_append_only() FROM PUBLIC, anon, authenticated;

-- Phase 2 already set search_path. Repeat it after the security change so the
-- lock is visible in this migration.
ALTER FUNCTION public.chat_tg_dm_pair_direct_only() SET search_path = public;
ALTER FUNCTION public.chat_tg_conversation_kind_guard() SET search_path = public;
ALTER FUNCTION public.chat_tg_message_thread_refs() SET search_path = public;
ALTER FUNCTION public.chat_tg_message_same_conversation() SET search_path = public;
ALTER FUNCTION public.chat_tg_read_state_message() SET search_path = public;
ALTER FUNCTION public.chat_tg_poll_vote_single_choice() SET search_path = public;
ALTER FUNCTION public.chat_tg_poll_allow_multiple_guard() SET search_path = public;
ALTER FUNCTION public.chat_tg_audit_append_only() SET search_path = public;
ALTER FUNCTION public.chat_tg_conversation_before_delete() SET search_path = public;

-- ---------------------------------------------------------------------------
-- Helpers. DEFINER so policies do not recurse through chat_members RLS.
-- Membership reads for authorization live in these functions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_caller_is_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(auth.role(), '') = 'service_role'
    OR (
      COALESCE(auth.role(), '') = ''
      AND session_user IN ('service_role', 'postgres', 'supabase_admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.chat_user_is_active_member(_conversation_id uuid, _user_id uuid)
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
      AND m.user_id = _user_id
      AND m.left_at IS NULL
      AND c.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_is_active_member(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.chat_user_is_active_member(_conversation_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.chat_member_role(_conversation_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role
  FROM public.chat_members m
  JOIN public.chat_conversations c ON c.id = m.conversation_id
  WHERE m.conversation_id = _conversation_id
    AND m.user_id = auth.uid()
    AND m.left_at IS NULL
    AND c.deleted_at IS NULL
  LIMIT 1;
$$;

-- Ignores conversation.deleted_at so an owner can soft-delete in the same UPDATE.
CREATE OR REPLACE FUNCTION public.chat_has_manager_membership(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members m
    WHERE m.conversation_id = _conversation_id
      AND m.user_id = auth.uid()
      AND m.left_at IS NULL
      AND m.role IN ('OWNER', 'ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_manage_members(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.chat_has_manager_membership(_conversation_id)
    AND EXISTS (
      SELECT 1
      FROM public.chat_conversations c
      WHERE c.id = _conversation_id
        AND c.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_moderate(_conversation_id uuid)
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
      AND m.role IN ('OWNER', 'ADMIN', 'MODERATOR')
  );
$$;

-- MEMBERS: any active role except READ_ONLY.
-- ADMINS_ONLY: OWNER or ADMIN. MODERATOR cannot post.
-- READ_ONLY: nobody.
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
      AND m.role <> 'READ_ONLY'
      AND (
        (c.posting_policy = 'MEMBERS' AND m.role IN ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER'))
        OR (c.posting_policy = 'ADMINS_ONLY' AND m.role IN ('OWNER', 'ADMIN'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_attach(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.chat_can_post(_conversation_id)
    AND EXISTS (
      SELECT 1
      FROM public.chat_members m
      JOIN public.chat_conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = _conversation_id
        AND m.user_id = auth.uid()
        AND m.left_at IS NULL
        AND c.deleted_at IS NULL
        AND (
          c.file_policy = 'MEMBERS'
          OR (c.file_policy = 'ADMINS_ONLY' AND m.role IN ('OWNER', 'ADMIN'))
        )
    );
$$;

-- Independent of posting_policy. READ_ONLY role cannot call.
-- ADMINS_ONLY allows OWNER and ADMIN only. DISABLED allows nobody.
CREATE OR REPLACE FUNCTION public.chat_can_call(_conversation_id uuid)
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
      AND m.role <> 'READ_ONLY'
      AND (
        c.call_policy = 'MEMBERS'
        OR (c.call_policy = 'ADMINS_ONLY' AND m.role IN ('OWNER', 'ADMIN'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_bootstrap_owner(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_conversations c
    WHERE c.id = _conversation_id
      AND c.created_by = auth.uid()
      AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.chat_members m
        WHERE m.conversation_id = c.id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_member_update_allowed(_conversation_id uuid, _row_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _row_user_id = auth.uid()
    OR public.chat_can_manage_members(_conversation_id);
$$;

CREATE OR REPLACE FUNCTION public.chat_dm_insert_allowed(
  _conversation_id uuid,
  _user_low uuid,
  _user_high uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND auth.uid() IN (_user_low, _user_high)
    AND _user_low < _user_high
    AND public.chat_user_is_active_member(_conversation_id, _user_low)
    AND public.chat_user_is_active_member(_conversation_id, _user_high)
    AND EXISTS (
      SELECT 1
      FROM public.chat_conversations c
      WHERE c.id = _conversation_id
        AND c.kind = 'DIRECT'
        AND c.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.chat_message_type_allowed(_conversation_id uuid, _type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.chat_can_post(_conversation_id)
    AND _type NOT IN ('SYSTEM', 'CALL_EVENT')
    AND (
      _type IS DISTINCT FROM 'ANNOUNCEMENT'
      OR (
        public.chat_member_role(_conversation_id) IN ('OWNER', 'ADMIN')
        AND EXISTS (
          SELECT 1
          FROM public.chat_conversations c
          WHERE c.id = _conversation_id
            AND c.kind = 'ANNOUNCEMENT'
            AND c.deleted_at IS NULL
        )
      )
    );
$$;

-- content_hidden rows stay in the table for service_role (RLS bypass) and are
-- hidden from every authenticated caller, including moderators.
-- SELF-delete hides edit rows from the deleter only. Other members still see them.
CREATE OR REPLACE FUNCTION public.chat_can_read_message_edit(_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_messages m
    WHERE m.id = _message_id
      AND public.chat_is_active_member(m.conversation_id)
      AND NOT m.content_hidden
      AND NOT (
        m.deletion_scope = 'SELF'
        AND m.deleted_by IS NOT DISTINCT FROM auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_insert_mention(
  _message_id uuid,
  _mentioned_user_id uuid,
  _conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_messages m
    WHERE m.id = _message_id
      AND m.conversation_id = _conversation_id
      AND m.sender_id = auth.uid()
      AND public.chat_is_active_member(m.conversation_id)
      AND public.chat_user_is_active_member(m.conversation_id, _mentioned_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_acknowledge(_message_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
    WHERE m.id = _message_id
      AND m.conversation_id = _conversation_id
      AND m.type = 'ANNOUNCEMENT'
      AND c.kind = 'ANNOUNCEMENT'
      AND c.deleted_at IS NULL
      AND public.chat_is_active_member(m.conversation_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_see_poll(_poll_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_polls p
    WHERE p.id = _poll_id
      AND public.chat_is_active_member(p.conversation_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_message_owned_by_caller(_message_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_messages m
    WHERE m.id = _message_id
      AND m.conversation_id = _conversation_id
      AND m.sender_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_create_poll(_message_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_messages m
    WHERE m.id = _message_id
      AND m.conversation_id = _conversation_id
      AND m.sender_id = auth.uid()
      AND m.type = 'POLL'
      AND m.deleted_at IS NULL
      AND public.chat_can_post(m.conversation_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_add_poll_option(_poll_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_polls p
    JOIN public.chat_messages m ON m.id = p.message_id
    WHERE p.id = _poll_id
      AND m.sender_id = auth.uid()
      AND public.chat_can_post(p.conversation_id)
  );
$$;

-- No vote changes in this phase. UPDATE and DELETE are revoked.
CREATE OR REPLACE FUNCTION public.chat_can_vote(_poll_id uuid, _option_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_polls p
    JOIN public.chat_poll_options o ON o.poll_id = p.id AND o.id = _option_id
    WHERE p.id = _poll_id
      AND public.chat_is_active_member(p.conversation_id)
      AND public.chat_member_role(p.conversation_id) IN ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER')
      AND (p.expires_at IS NULL OR p.expires_at > now())
  );
$$;

-- Anonymous votes are visible only to the voter. Moderators do not see voter identity.
CREATE OR REPLACE FUNCTION public.chat_can_see_poll_vote(_poll_id uuid, _vote_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_polls p
    WHERE p.id = _poll_id
      AND public.chat_is_active_member(p.conversation_id)
      AND (
        NOT p.anonymous
        OR _vote_user_id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_update_call(_call_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_calls k
    WHERE k.id = _call_id
      AND public.chat_is_active_member(k.conversation_id)
      AND (
        k.started_by = auth.uid()
        OR public.chat_has_manager_membership(k.conversation_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_can_insert_call_participant(_call_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_calls k
    WHERE k.id = _call_id
      AND k.status IN ('RINGING', 'ACTIVE')
      AND _user_id = auth.uid()
      AND public.chat_is_active_member(k.conversation_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_write_audit(
  _event_type text,
  _conversation_id uuid,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  clean_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _event_type IS NULL OR char_length(btrim(_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type is required'
      USING ERRCODE = 'check_violation';
  END IF;

  clean_metadata := COALESCE(_metadata, '{}'::jsonb);
  IF jsonb_typeof(clean_metadata) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'metadata must be an object'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Ignore any actor the client stuffed into metadata. Do not store message bodies.
  clean_metadata := clean_metadata - 'body' - 'actor' - 'actor_id';

  IF _conversation_id IS NOT NULL THEN
    IF NOT public.chat_is_active_member(_conversation_id)
       AND NOT EXISTS (
         SELECT 1
         FROM public.chat_conversations c
         WHERE c.id = _conversation_id
           AND c.created_by = auth.uid()
       ) THEN
      RAISE EXCEPTION 'forbidden'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO public.chat_audit_logs (conversation_id, actor_id, event_type, metadata)
  VALUES (_conversation_id, auth.uid(), btrim(_event_type), clean_metadata);
END;
$fn$;

REVOKE ALL ON FUNCTION public.chat_caller_is_privileged() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_user_is_active_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.chat_is_active_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_member_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_has_manager_membership(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_manage_members(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_moderate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_post(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_attach(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_call(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_bootstrap_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_member_update_allowed(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_dm_insert_allowed(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_message_type_allowed(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_read_message_edit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_insert_mention(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_acknowledge(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_see_poll(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_message_owned_by_caller(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_create_poll(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_add_poll_option(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_vote(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_see_poll_vote(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_update_call(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_can_insert_call_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_write_audit(text, uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.chat_is_active_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_member_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_has_manager_membership(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_manage_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_moderate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_post(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_attach(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_call(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_bootstrap_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_member_update_allowed(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_dm_insert_allowed(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_message_type_allowed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_read_message_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_insert_mention(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_acknowledge(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_see_poll(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_message_owned_by_caller(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_create_poll(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_add_poll_option(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_vote(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_see_poll_vote(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_update_call(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_can_insert_call_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_write_audit(text, uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Actor locks and column guards. DEFINER so edit-history inserts and staff
-- lookups do not depend on the caller's SELECT policies.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_tg_conversations_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.chat_caller_is_privileged() THEN
      NEW.created_by := auth.uid();
      IF NEW.created_by IS NULL THEN
        RAISE EXCEPTION 'auth.uid() is required'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'cannot insert a deleted conversation'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'conversation id and created_by are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.chat_caller_is_privileged() THEN
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND public.chat_member_role(OLD.id) IS DISTINCT FROM 'OWNER' THEN
      RAISE EXCEPTION 'only the owner can change deleted_at'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.sensitive AND NOT NEW.sensitive
       AND public.chat_member_role(OLD.id) IS DISTINCT FROM 'OWNER' THEN
      RAISE EXCEPTION 'only the owner can clear sensitive'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_members_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  staff_user uuid;
  staff_deleted timestamptz;
BEGIN
  IF NEW.staff_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.staff_id IS DISTINCT FROM OLD.staff_id) THEN
    SELECT s.user_id, s.deleted_at
    INTO staff_user, staff_deleted
    FROM public.staff s
    WHERE s.id = NEW.staff_id;

    IF NOT FOUND
       OR staff_deleted IS NOT NULL
       OR staff_user IS NULL
       OR staff_user IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'staff_id must reference staff linked to this user and not soft-deleted'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('chat_member:' || NEW.conversation_id::text, 0));

    IF NEW.role = 'OWNER' AND EXISTS (
      SELECT 1
      FROM public.chat_members m
      WHERE m.conversation_id = NEW.conversation_id
        AND m.role = 'OWNER'
        AND m.user_id IS DISTINCT FROM NEW.user_id
    ) THEN
      RAISE EXCEPTION 'conversation already has an owner'
        USING ERRCODE = 'unique_violation';
    END IF;

    IF NOT public.chat_caller_is_privileged() THEN
      NEW.added_by := auth.uid();
      IF NEW.membership_source IS DISTINCT FROM 'MANUAL' THEN
        RAISE EXCEPTION 'only MANUAL memberships can be inserted by authenticated users'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.role = 'OWNER' THEN
        IF NEW.user_id IS DISTINCT FROM auth.uid()
           OR NOT public.chat_can_bootstrap_owner(NEW.conversation_id) THEN
          RAISE EXCEPTION 'owner bootstrap is not allowed'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      ELSIF NEW.role NOT IN ('ADMIN', 'MODERATOR', 'MEMBER', 'READ_ONLY')
            OR NOT public.chat_can_manage_members(NEW.conversation_id) THEN
        RAISE EXCEPTION 'forbidden'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.membership_source IS DISTINCT FROM OLD.membership_source THEN
    RAISE EXCEPTION 'membership identity columns are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.chat_caller_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id
     OR NEW.added_by IS DISTINCT FROM OLD.added_by
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'membership identity columns are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.role = 'OWNER' OR NEW.role = 'OWNER' THEN
      RAISE EXCEPTION 'owner transfer is deferred to a later RPC'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.role NOT IN ('ADMIN', 'MODERATOR', 'MEMBER', 'READ_ONLY')
       OR NOT public.chat_can_manage_members(NEW.conversation_id) THEN
      RAISE EXCEPTION 'forbidden'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Self may set left_at once on MANUAL, ROLE, or SYSTEM and cannot clear it.
  -- DEPARTMENT and SITE cannot be left here. A manager may set or clear
  -- left_at on a MANUAL row. Clearing left_at is the phase 2 rejoin (the
  -- primary key stays). The self branch never clears left_at, and after a
  -- member leaves chat_can_manage_members is false, so they cannot clear
  -- their own left_at. trg_chat_members_last_owner rejects setting left_at
  -- on the last active OWNER. Owner role changes stay forbidden above;
  -- owner transfer is a later RPC.
  IF NEW.left_at IS DISTINCT FROM OLD.left_at THEN
    IF auth.uid() = OLD.user_id
       AND OLD.membership_source IN ('MANUAL', 'ROLE', 'SYSTEM')
       AND OLD.left_at IS NULL
       AND NEW.left_at IS NOT NULL
       AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
      NULL;
    ELSIF public.chat_can_manage_members(NEW.conversation_id)
          AND OLD.membership_source = 'MANUAL' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'cannot change left_at'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Rejects leaving the last active owner. Runs for every role, including
-- service_role: triggers are not bypassed by RLS bypass. Does not clear
-- left_at and does not transfer ownership.
CREATE OR REPLACE FUNCTION public.chat_tg_members_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  active_owners int;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM 'OWNER'
     OR OLD.left_at IS NOT NULL
     OR NEW.left_at IS NULL
     OR NEW.left_at IS NOT DISTINCT FROM OLD.left_at THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('chat_member:' || OLD.conversation_id::text, 0));

  SELECT count(*)::int INTO active_owners
  FROM public.chat_members m
  WHERE m.conversation_id = OLD.conversation_id
    AND m.role = 'OWNER'
    AND m.left_at IS NULL;

  IF active_owners < 2 THEN
    RAISE EXCEPTION 'cannot set left_at on the last active owner'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_messages_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.chat_caller_is_privileged() THEN
      NEW.sender_id := auth.uid();
      IF NEW.sender_id IS NULL THEN
        RAISE EXCEPTION 'auth.uid() is required'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.deleted_at IS NOT NULL OR NEW.content_hidden OR NEW.deletion_scope IS NOT NULL THEN
        RAISE EXCEPTION 'cannot insert a deleted message'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT public.chat_message_type_allowed(NEW.conversation_id, NEW.type) THEN
        RAISE EXCEPTION 'cannot post this message type'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.client_message_id IS DISTINCT FROM OLD.client_message_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reply_to_message_id IS DISTINCT FROM OLD.reply_to_message_id
     OR NEW.thread_root_message_id IS DISTINCT FROM OLD.thread_root_message_id
     OR NEW.forwarded_from_message_id IS DISTINCT FROM OLD.forwarded_from_message_id THEN
    RAISE EXCEPTION 'message identity columns are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.chat_caller_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'deleted messages are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.deletion_scope IS DISTINCT FROM OLD.deletion_scope
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.content_hidden IS DISTINCT FROM OLD.content_hidden
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    NEW.body := OLD.body;
    NEW.metadata := OLD.metadata;
    IF NEW.deletion_scope = 'EVERYONE' THEN
      IF NOT public.chat_can_moderate(NEW.conversation_id) THEN
        RAISE EXCEPTION 'only moderators can delete for everyone'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      NEW.content_hidden := true;
      NEW.deleted_by := auth.uid();
      IF NEW.deleted_at IS NULL THEN
        NEW.deleted_at := now();
      END IF;
    ELSIF NEW.deletion_scope = 'SELF' THEN
      IF OLD.sender_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'only the sender can delete for self'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      NEW.content_hidden := false;
      NEW.deleted_by := auth.uid();
      IF NEW.deleted_at IS NULL THEN
        NEW.deleted_at := now();
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid deletion change'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
    RAISE EXCEPTION 'edited_at cannot be set directly'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    IF OLD.sender_id IS DISTINCT FROM auth.uid() OR NOT public.chat_can_post(NEW.conversation_id) THEN
      RAISE EXCEPTION 'cannot edit this message'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO public.chat_message_edits (message_id, previous_body, previous_metadata, edited_by, edited_at)
    VALUES (OLD.id, OLD.body, OLD.metadata, auth.uid(), now());
    NEW.edited_at := now();
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_force_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.chat_caller_is_privileged() AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'user_id is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.chat_caller_is_privileged() THEN
    NEW.user_id := auth.uid();
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'auth.uid() is required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_poll_votes_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'poll votes cannot be changed in this phase'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.chat_caller_is_privileged() THEN
    NEW.user_id := auth.uid();
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'auth.uid() is required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_mentions_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.chat_caller_is_privileged() THEN
    RAISE EXCEPTION 'mentions are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT'
     AND NOT public.chat_caller_is_privileged()
     AND NOT public.chat_can_insert_mention(NEW.message_id, NEW.mentioned_user_id, NEW.conversation_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_reactions_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'reactions cannot be updated'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.chat_caller_is_privileged() THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_attachments_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.chat_caller_is_privileged() THEN
      NEW.created_by := auth.uid();
      IF NEW.created_by IS NULL THEN
        RAISE EXCEPTION 'auth.uid() is required'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.scan_status IS DISTINCT FROM 'PENDING' THEN
        RAISE EXCEPTION 'scan_status must be PENDING'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.message_id IS NOT NULL THEN
        RAISE EXCEPTION 'message_id must be null until the file is sent'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'attachment identity columns are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.scan_status IS DISTINCT FROM OLD.scan_status AND NOT public.chat_caller_is_privileged() THEN
    RAISE EXCEPTION 'scan_status changes are service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.message_id IS DISTINCT FROM OLD.message_id THEN
    IF OLD.message_id IS NOT NULL THEN
      RAISE EXCEPTION 'message_id is already set'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.chat_caller_is_privileged() AND NOT EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = NEW.message_id
        AND m.conversation_id = NEW.conversation_id
        AND m.sender_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'message_id must be your message in this conversation'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_pins_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'pins cannot be updated'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.chat_caller_is_privileged() THEN
    NEW.pinned_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_saved_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'saved messages cannot be updated'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.chat_caller_is_privileged() THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_calls_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.recording_enabled THEN
    RAISE EXCEPTION 'call recording is disabled in this phase'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.provider IS DISTINCT FROM 'NONE' THEN
    RAISE EXCEPTION 'call provider must be NONE in this phase'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.room_name IS NOT NULL THEN
    RAISE EXCEPTION 'call room_name is not used in this phase'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.chat_caller_is_privileged() THEN
      NEW.started_by := auth.uid();
      IF NEW.started_by IS NULL THEN
        RAISE EXCEPTION 'auth.uid() is required'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.started_by IS DISTINCT FROM OLD.started_by
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'call identity columns are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.chat_caller_is_privileged() THEN
    IF NOT public.chat_can_update_call(OLD.id) THEN
      RAISE EXCEPTION 'forbidden'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('CANCELLED', 'ENDED') THEN
      RAISE EXCEPTION 'status can only move to CANCELLED or ENDED'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('ENDED', 'CANCELLED', 'MISSED', 'REJECTED')
       AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'call is already closed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_call_participants_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.chat_caller_is_privileged() THEN
    RAISE EXCEPTION 'call participants cannot be updated in this phase'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT'
     AND NOT public.chat_caller_is_privileged()
     AND NOT public.chat_can_insert_call_participant(NEW.call_id, NEW.user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_entity_links_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.chat_caller_is_privileged() THEN
    RAISE EXCEPTION 'entity links are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NOT public.chat_caller_is_privileged() THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.chat_tg_conversations_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_members_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_members_last_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_messages_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_force_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_poll_votes_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_mentions_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_reactions_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_attachments_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_pins_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_saved_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_calls_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_call_participants_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_entity_links_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_conversations_auth ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_auth
  BEFORE INSERT OR UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_conversations_auth();

DROP TRIGGER IF EXISTS trg_chat_members_auth ON public.chat_members;
CREATE TRIGGER trg_chat_members_auth
  BEFORE INSERT OR UPDATE ON public.chat_members
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_members_auth();

DROP TRIGGER IF EXISTS trg_chat_members_last_owner ON public.chat_members;
CREATE TRIGGER trg_chat_members_last_owner
  BEFORE UPDATE OF left_at ON public.chat_members
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_members_last_owner();

DROP TRIGGER IF EXISTS trg_chat_messages_write ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_write
  BEFORE INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_messages_write();

DROP TRIGGER IF EXISTS trg_chat_reactions_auth ON public.chat_reactions;
CREATE TRIGGER trg_chat_reactions_auth
  BEFORE INSERT OR UPDATE ON public.chat_reactions
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_reactions_auth();

DROP TRIGGER IF EXISTS trg_chat_attachments_auth ON public.chat_attachments;
CREATE TRIGGER trg_chat_attachments_auth
  BEFORE INSERT OR UPDATE ON public.chat_attachments
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_attachments_auth();

DROP TRIGGER IF EXISTS trg_chat_mentions_auth ON public.chat_mentions;
CREATE TRIGGER trg_chat_mentions_auth
  BEFORE INSERT OR UPDATE ON public.chat_mentions
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_mentions_auth();

DROP TRIGGER IF EXISTS trg_chat_read_states_user ON public.chat_read_states;
CREATE TRIGGER trg_chat_read_states_user
  BEFORE INSERT OR UPDATE ON public.chat_read_states
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_force_user();

DROP TRIGGER IF EXISTS trg_chat_pins_auth ON public.chat_pins;
CREATE TRIGGER trg_chat_pins_auth
  BEFORE INSERT OR UPDATE ON public.chat_pins
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_pins_auth();

DROP TRIGGER IF EXISTS trg_chat_saved_messages_auth ON public.chat_saved_messages;
CREATE TRIGGER trg_chat_saved_messages_auth
  BEFORE INSERT OR UPDATE ON public.chat_saved_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_saved_auth();

DROP TRIGGER IF EXISTS trg_chat_acknowledgements_user ON public.chat_acknowledgements;
CREATE TRIGGER trg_chat_acknowledgements_user
  BEFORE INSERT OR UPDATE ON public.chat_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_force_user();

-- Name sorts before trg_chat_poll_votes_single_choice so user_id is forced first.
DROP TRIGGER IF EXISTS trg_chat_poll_votes_user ON public.chat_poll_votes;
DROP TRIGGER IF EXISTS trg_chat_poll_votes_auth ON public.chat_poll_votes;
CREATE TRIGGER trg_chat_poll_votes_auth
  BEFORE INSERT OR UPDATE ON public.chat_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_poll_votes_auth();

DROP TRIGGER IF EXISTS trg_chat_calls_auth ON public.chat_calls;
CREATE TRIGGER trg_chat_calls_auth
  BEFORE INSERT OR UPDATE ON public.chat_calls
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_calls_auth();

DROP TRIGGER IF EXISTS trg_chat_call_participants_auth ON public.chat_call_participants;
CREATE TRIGGER trg_chat_call_participants_auth
  BEFORE INSERT OR UPDATE ON public.chat_call_participants
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_call_participants_auth();

DROP TRIGGER IF EXISTS trg_chat_entity_links_auth ON public.chat_entity_links;
CREATE TRIGGER trg_chat_entity_links_auth
  BEFORE INSERT OR UPDATE ON public.chat_entity_links
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_entity_links_auth();

DROP TRIGGER IF EXISTS trg_chat_notification_preferences_user ON public.chat_notification_preferences;
CREATE TRIGGER trg_chat_notification_preferences_user
  BEFORE INSERT OR UPDATE ON public.chat_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_force_user();

-- ---------------------------------------------------------------------------
-- Visible messages. Default security-definer view (owner). Not security_invoker.
-- The owner bypasses chat_messages RLS, so membership is enforced in WHERE.
-- security_barrier keeps caller predicates from reading hidden rows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.chat_messages_visible
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  m.id,
  m.conversation_id,
  m.sender_id,
  m.client_message_id,
  m.type,
  CASE
    WHEN m.content_hidden THEN NULL
    WHEN m.deletion_scope = 'SELF' AND m.deleted_by IS NOT DISTINCT FROM auth.uid() THEN NULL
    ELSE m.body
  END AS body,
  CASE
    WHEN m.content_hidden THEN '{}'::jsonb
    WHEN m.deletion_scope = 'SELF' AND m.deleted_by IS NOT DISTINCT FROM auth.uid() THEN '{}'::jsonb
    ELSE m.metadata
  END AS metadata,
  m.reply_to_message_id,
  m.thread_root_message_id,
  m.forwarded_from_message_id,
  m.created_at,
  m.updated_at,
  m.edited_at,
  m.deleted_at,
  m.deleted_by,
  m.deletion_scope,
  m.content_hidden
FROM public.chat_messages m
WHERE public.chat_is_active_member(m.conversation_id);

COMMENT ON VIEW public.chat_messages_visible IS
  'Owner-run mask for body and metadata. Requires chat_is_active_member because the view owner bypasses RLS. content_hidden nulls body and metadata for everyone. A SELF delete does that only when deleted_by is the current user. Clients must read message content from this view. Edit history is not exposed here.';

COMMENT ON TABLE public.chat_messages IS
  'Plain text only. Deleted rows stay and the stored body is kept for audit. Clients must read message content from chat_messages_visible. Authenticated cannot SELECT body or metadata.';

COMMENT ON TABLE public.chat_entity_links IS
  'A link does not grant access to the underlying entity. Conversation membership is the only chat access path.';

REVOKE ALL ON public.chat_messages_visible FROM PUBLIC, anon;
GRANT SELECT ON public.chat_messages_visible TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants. Hard delete is revoked wherever leaving or soft delete is the API.
-- chat_message_edits inserts only from the definer message trigger.
-- ---------------------------------------------------------------------------

REVOKE DELETE ON public.chat_conversations FROM authenticated;
REVOKE DELETE ON public.chat_members FROM authenticated;
REVOKE UPDATE, DELETE ON public.chat_dm_pairs FROM authenticated;
REVOKE DELETE ON public.chat_messages FROM authenticated;

-- Phase 2 granted table-level SELECT, which covers body and metadata. PostgreSQL
-- ORs table and column privileges, so REVOKE SELECT (body, metadata) alone would
-- leave those columns readable. Drop table SELECT, grant the non-content
-- columns, then revoke column SELECT on body and metadata. INSERT and UPDATE
-- are untouched: a new message can supply body without SELECT on it.
REVOKE SELECT ON public.chat_messages FROM authenticated, PUBLIC;
GRANT SELECT (
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
) ON public.chat_messages TO authenticated;
REVOKE SELECT (body, metadata) ON public.chat_messages FROM authenticated, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.chat_message_edits FROM authenticated;
REVOKE UPDATE ON public.chat_reactions FROM authenticated;
REVOKE DELETE ON public.chat_attachments FROM authenticated;
REVOKE UPDATE, DELETE ON public.chat_mentions FROM authenticated;
REVOKE DELETE ON public.chat_read_states FROM authenticated;
REVOKE UPDATE ON public.chat_pins FROM authenticated;
REVOKE UPDATE ON public.chat_saved_messages FROM authenticated;
REVOKE UPDATE, DELETE ON public.chat_acknowledgements FROM authenticated;
REVOKE UPDATE, DELETE ON public.chat_polls FROM authenticated;
REVOKE UPDATE, DELETE ON public.chat_poll_options FROM authenticated;
REVOKE UPDATE, DELETE ON public.chat_poll_votes FROM authenticated;
REVOKE UPDATE, DELETE ON public.chat_entity_links FROM authenticated;
REVOKE DELETE ON public.chat_calls FROM authenticated;
REVOKE UPDATE, DELETE ON public.chat_call_participants FROM authenticated;

-- ---------------------------------------------------------------------------
-- Policies. Deny unless listed. No USING (true) and no WITH CHECK (true).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS chat_conversations_select ON public.chat_conversations;
CREATE POLICY chat_conversations_select ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(id));

DROP POLICY IF EXISTS chat_conversations_insert ON public.chat_conversations;
CREATE POLICY chat_conversations_insert ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS chat_conversations_update ON public.chat_conversations;
CREATE POLICY chat_conversations_update ON public.chat_conversations
  FOR UPDATE TO authenticated
  USING (public.chat_can_manage_members(id))
  WITH CHECK (public.chat_has_manager_membership(id));

DROP POLICY IF EXISTS chat_members_select ON public.chat_members;
CREATE POLICY chat_members_select ON public.chat_members
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS chat_members_insert ON public.chat_members;
CREATE POLICY chat_members_insert ON public.chat_members
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND (
      (
        user_id = auth.uid()
        AND role = 'OWNER'
        AND membership_source = 'MANUAL'
        AND public.chat_can_bootstrap_owner(conversation_id)
      )
      OR (
        public.chat_can_manage_members(conversation_id)
        AND role IN ('ADMIN', 'MODERATOR', 'MEMBER', 'READ_ONLY')
        AND membership_source = 'MANUAL'
      )
    )
  );

DROP POLICY IF EXISTS chat_members_update ON public.chat_members;
CREATE POLICY chat_members_update ON public.chat_members
  FOR UPDATE TO authenticated
  USING (public.chat_member_update_allowed(conversation_id, user_id))
  WITH CHECK (public.chat_member_update_allowed(conversation_id, user_id));

DROP POLICY IF EXISTS chat_dm_pairs_select ON public.chat_dm_pairs;
CREATE POLICY chat_dm_pairs_select ON public.chat_dm_pairs
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (user_low, user_high)
    AND public.chat_is_active_member(conversation_id)
  );

DROP POLICY IF EXISTS chat_dm_pairs_insert ON public.chat_dm_pairs;
CREATE POLICY chat_dm_pairs_insert ON public.chat_dm_pairs
  FOR INSERT TO authenticated
  WITH CHECK (public.chat_dm_insert_allowed(conversation_id, user_low, user_high));

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND deleted_at IS NULL
    AND content_hidden = false
    AND deletion_scope IS NULL
    AND deleted_by IS NULL
    AND public.chat_message_type_allowed(conversation_id, type)
  );

DROP POLICY IF EXISTS chat_messages_update ON public.chat_messages;
CREATE POLICY chat_messages_update ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    public.chat_is_active_member(conversation_id)
    AND (
      sender_id = auth.uid()
      OR public.chat_can_moderate(conversation_id)
    )
  )
  WITH CHECK (
    public.chat_is_active_member(conversation_id)
    AND (
      sender_id = auth.uid()
      OR public.chat_can_moderate(conversation_id)
    )
  );

DROP POLICY IF EXISTS chat_message_edits_select ON public.chat_message_edits;
CREATE POLICY chat_message_edits_select ON public.chat_message_edits
  FOR SELECT TO authenticated
  USING (public.chat_can_read_message_edit(message_id));

DROP POLICY IF EXISTS chat_reactions_select ON public.chat_reactions;
CREATE POLICY chat_reactions_select ON public.chat_reactions
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_reactions_insert ON public.chat_reactions;
CREATE POLICY chat_reactions_insert ON public.chat_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.chat_is_active_member(conversation_id)
    AND public.chat_member_role(conversation_id) IN ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER')
  );

DROP POLICY IF EXISTS chat_reactions_delete ON public.chat_reactions;
CREATE POLICY chat_reactions_delete ON public.chat_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_attachments_select ON public.chat_attachments;
CREATE POLICY chat_attachments_select ON public.chat_attachments
  FOR SELECT TO authenticated
  USING (
    public.chat_is_active_member(conversation_id)
    AND (
      created_by = auth.uid()
      OR scan_status IN ('CLEAN', 'SKIPPED')
    )
  );

DROP POLICY IF EXISTS chat_attachments_insert ON public.chat_attachments;
CREATE POLICY chat_attachments_insert ON public.chat_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND message_id IS NULL
    AND scan_status = 'PENDING'
    AND public.chat_can_attach(conversation_id)
  );

DROP POLICY IF EXISTS chat_attachments_update ON public.chat_attachments;
CREATE POLICY chat_attachments_update ON public.chat_attachments
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND public.chat_is_active_member(conversation_id))
  WITH CHECK (created_by = auth.uid() AND public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_mentions_select ON public.chat_mentions;
CREATE POLICY chat_mentions_select ON public.chat_mentions
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_mentions_insert ON public.chat_mentions;
CREATE POLICY chat_mentions_insert ON public.chat_mentions
  FOR INSERT TO authenticated
  WITH CHECK (public.chat_can_insert_mention(message_id, mentioned_user_id, conversation_id));

DROP POLICY IF EXISTS chat_read_states_select ON public.chat_read_states;
CREATE POLICY chat_read_states_select ON public.chat_read_states
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_read_states_insert ON public.chat_read_states;
CREATE POLICY chat_read_states_insert ON public.chat_read_states
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_read_states_update ON public.chat_read_states;
CREATE POLICY chat_read_states_update ON public.chat_read_states
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.chat_is_active_member(conversation_id))
  WITH CHECK (user_id = auth.uid() AND public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_pins_select ON public.chat_pins;
CREATE POLICY chat_pins_select ON public.chat_pins
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_pins_insert ON public.chat_pins;
CREATE POLICY chat_pins_insert ON public.chat_pins
  FOR INSERT TO authenticated
  WITH CHECK (pinned_by = auth.uid() AND public.chat_can_moderate(conversation_id));

DROP POLICY IF EXISTS chat_pins_delete ON public.chat_pins;
CREATE POLICY chat_pins_delete ON public.chat_pins
  FOR DELETE TO authenticated
  USING (public.chat_can_moderate(conversation_id));

DROP POLICY IF EXISTS chat_saved_messages_select ON public.chat_saved_messages;
CREATE POLICY chat_saved_messages_select ON public.chat_saved_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_saved_messages_insert ON public.chat_saved_messages;
CREATE POLICY chat_saved_messages_insert ON public.chat_saved_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_saved_messages_delete ON public.chat_saved_messages;
CREATE POLICY chat_saved_messages_delete ON public.chat_saved_messages
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_acknowledgements_select ON public.chat_acknowledgements;
CREATE POLICY chat_acknowledgements_select ON public.chat_acknowledgements
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_acknowledgements_insert ON public.chat_acknowledgements;
CREATE POLICY chat_acknowledgements_insert ON public.chat_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.chat_can_acknowledge(message_id, conversation_id)
  );

DROP POLICY IF EXISTS chat_polls_select ON public.chat_polls;
CREATE POLICY chat_polls_select ON public.chat_polls
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_polls_insert ON public.chat_polls;
CREATE POLICY chat_polls_insert ON public.chat_polls
  FOR INSERT TO authenticated
  WITH CHECK (public.chat_can_create_poll(message_id, conversation_id));

DROP POLICY IF EXISTS chat_poll_options_select ON public.chat_poll_options;
CREATE POLICY chat_poll_options_select ON public.chat_poll_options
  FOR SELECT TO authenticated
  USING (public.chat_can_see_poll(poll_id));

DROP POLICY IF EXISTS chat_poll_options_insert ON public.chat_poll_options;
CREATE POLICY chat_poll_options_insert ON public.chat_poll_options
  FOR INSERT TO authenticated
  WITH CHECK (public.chat_can_add_poll_option(poll_id));

DROP POLICY IF EXISTS chat_poll_votes_select ON public.chat_poll_votes;
CREATE POLICY chat_poll_votes_select ON public.chat_poll_votes
  FOR SELECT TO authenticated
  USING (public.chat_can_see_poll_vote(poll_id, user_id));

DROP POLICY IF EXISTS chat_poll_votes_insert ON public.chat_poll_votes;
CREATE POLICY chat_poll_votes_insert ON public.chat_poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.chat_can_vote(poll_id, option_id)
  );

DROP POLICY IF EXISTS chat_entity_links_select ON public.chat_entity_links;
CREATE POLICY chat_entity_links_select ON public.chat_entity_links
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_entity_links_insert ON public.chat_entity_links;
CREATE POLICY chat_entity_links_insert ON public.chat_entity_links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.chat_can_post(conversation_id)
    AND public.chat_message_owned_by_caller(message_id, conversation_id)
  );

DROP POLICY IF EXISTS chat_calls_select ON public.chat_calls;
CREATE POLICY chat_calls_select ON public.chat_calls
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));

DROP POLICY IF EXISTS chat_calls_insert ON public.chat_calls;
CREATE POLICY chat_calls_insert ON public.chat_calls
  FOR INSERT TO authenticated
  WITH CHECK (
    started_by = auth.uid()
    AND provider = 'NONE'
    AND recording_enabled = false
    AND room_name IS NULL
    AND public.chat_can_call(conversation_id)
  );

DROP POLICY IF EXISTS chat_calls_update ON public.chat_calls;
CREATE POLICY chat_calls_update ON public.chat_calls
  FOR UPDATE TO authenticated
  USING (public.chat_can_update_call(id))
  WITH CHECK (
    public.chat_can_update_call(id)
    AND provider = 'NONE'
    AND recording_enabled = false
    AND room_name IS NULL
    AND status IN ('CANCELLED', 'ENDED')
  );

DROP POLICY IF EXISTS chat_call_participants_insert ON public.chat_call_participants;
CREATE POLICY chat_call_participants_insert ON public.chat_call_participants
  FOR INSERT TO authenticated
  WITH CHECK (public.chat_can_insert_call_participant(call_id, user_id));

DROP POLICY IF EXISTS chat_notification_preferences_select ON public.chat_notification_preferences;
CREATE POLICY chat_notification_preferences_select ON public.chat_notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_notification_preferences_insert ON public.chat_notification_preferences;
CREATE POLICY chat_notification_preferences_insert ON public.chat_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_notification_preferences_update ON public.chat_notification_preferences;
CREATE POLICY chat_notification_preferences_update ON public.chat_notification_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_notification_preferences_delete ON public.chat_notification_preferences;
CREATE POLICY chat_notification_preferences_delete ON public.chat_notification_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.chat_can_see_call(_call_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_calls k
    WHERE k.id = _call_id
      AND public.chat_is_active_member(k.conversation_id)
  );
$$;

REVOKE ALL ON FUNCTION public.chat_can_see_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_can_see_call(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS chat_call_participants_select ON public.chat_call_participants;
CREATE POLICY chat_call_participants_select ON public.chat_call_participants
  FOR SELECT TO authenticated
  USING (public.chat_can_see_call(call_id));

COMMENT ON FUNCTION public.chat_write_audit(text, uuid, jsonb) IS
  'Inserts an audit row as auth.uid(). Strips metadata keys body, actor, and actor_id. conversation_id null is allowed. A non-null conversation requires active membership or created_by = auth.uid(). Creators who already left can still write an audit row; they cannot read messages.';

COMMENT ON FUNCTION public.chat_can_vote(uuid, uuid) IS
  'Insert-only. Authenticated users cannot change or delete a vote in this phase.';

COMMENT ON FUNCTION public.chat_can_see_poll_vote(uuid, uuid) IS
  'When the poll is anonymous, only the voter can select that vote. Moderators are not an exception.';

NOTIFY pgrst, 'reload schema';
