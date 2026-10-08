-- Chat Hub phase 4: create a conversation and its owner membership in one
-- definer transaction, and open a direct conversation the same way.
-- PostgREST insert().select() cannot see chat_conversations until an active
-- membership exists, so the caller would observe a failure or nothing.
--
-- Does not edit 20261002020000. Does not disable trg_chat_members_last_owner.
-- Does not add department or site members (phase 11).
--
-- Sensitive flag: has_role hr, ceo, or coo. That matches hr.manage's executive
-- bypass. CFO is on hr.profile.view_sensitive and is intentionally excluded.
-- role_level >= 80 does not grant chat reads and does not mark a room sensitive.
-- user_can_access_location still treats role_level >= 80 as all locations; that
-- is only the location check on create, not a membership bypass.
--
-- staff_id: newest non-deleted staff row for that auth user
-- (created_at DESC, id DESC). staff.user_id is not unique. Null when none.
--
-- Create rate: at most 20 chat_conversations rows with created_by = auth.uid()
-- in the rolling hour, including direct opens. Returning an existing DM does
-- not count. Directory search is not limited here (the app caps the query
-- string and the row count).
--
-- Authenticated INSERT on chat_conversations and chat_dm_pairs is revoked so
-- a direct table insert cannot skip these checks. UPDATE stays. chat_members
-- INSERT stays for add-member under the existing RLS policies.

-- ---------------------------------------------------------------------------
-- Internal helpers. Not granted to authenticated.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_caller_can_mark_sensitive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'hr'::public.app_role)
      OR public.has_role(auth.uid(), 'ceo'::public.app_role)
      OR public.has_role(auth.uid(), 'coo'::public.app_role)
    );
$$;

COMMENT ON FUNCTION public.chat_caller_can_mark_sensitive() IS
  'Sensitive chats require app_role hr, ceo, or coo. CFO is not included. Not a chat read path.';

CREATE OR REPLACE FUNCTION public.chat_staff_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.user_id = _user_id
    AND s.deleted_at IS NULL
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.chat_staff_id_for_user(uuid) IS
  'Newest non-deleted staff row linked to this auth user. Null when none. staff.user_id is not unique.';

CREATE OR REPLACE FUNCTION public.chat_assert_hourly_create_limit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  recent_count int;
BEGIN
  SELECT count(*)::int INTO recent_count
  FROM public.chat_conversations c
  WHERE c.created_by = auth.uid()
    AND c.created_at > now() - interval '1 hour';

  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'chat create rate limit exceeded'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.chat_assert_hourly_create_limit() IS
  'Max 20 conversations created by auth.uid() in the last hour. Keep in sync with CHAT_CREATE_HOURLY_LIMIT.';

REVOKE ALL ON FUNCTION public.chat_caller_can_mark_sensitive() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_staff_id_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_assert_hourly_create_limit() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scope and sensitive lock on update. Last-owner trigger is untouched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_tg_conversation_phase4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP <> 'UPDATE' OR public.chat_caller_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
     OR NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    RAISE EXCEPTION 'conversation scope is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.sensitive IS TRUE
     AND OLD.sensitive IS DISTINCT FROM TRUE
     AND NOT public.chat_caller_can_mark_sensitive() THEN
    RAISE EXCEPTION 'sensitive conversations require an HR role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_chat_conversations_phase4 ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_phase4
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_conversation_phase4();

REVOKE ALL ON FUNCTION public.chat_tg_conversation_phase4() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- chat_create_conversation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_create_conversation(
  _title text,
  _description text,
  _kind text,
  _location_id uuid,
  _department_id uuid,
  _sensitive boolean,
  _posting_policy text,
  _file_policy text,
  _call_policy text,
  _retention_policy text,
  _retention_until timestamptz,
  _archive_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_title text;
  v_description text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'a role is required to use chat'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _kind IS NOT DISTINCT FROM 'DIRECT' THEN
    RAISE EXCEPTION 'direct conversations use chat_open_direct'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _kind IS NULL
     OR _kind = 'SYSTEM'
     OR _kind NOT IN (
       'PUBLIC', 'PRIVATE', 'DEPARTMENT', 'SITE', 'PROJECT',
       'MANAGEMENT', 'ANNOUNCEMENT', 'TEMPORARY'
     ) THEN
    RAISE EXCEPTION 'kind is not allowed'
      USING ERRCODE = 'check_violation';
  END IF;

  v_title := btrim(COALESCE(_title, ''));
  IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'title is required'
      USING ERRCODE = 'check_violation';
  END IF;

  v_description := NULLIF(btrim(COALESCE(_description, '')), '');
  IF v_description IS NOT NULL AND char_length(v_description) > 2000 THEN
    RAISE EXCEPTION 'description is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _kind = 'DEPARTMENT' AND _department_id IS NULL THEN
    RAISE EXCEPTION 'department_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _kind = 'SITE' AND _location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.master_departments d WHERE d.id = _department_id
  ) THEN
    RAISE EXCEPTION 'department is not available'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _location_id IS NOT NULL AND NOT public.user_can_access_location(_location_id) THEN
    RAISE EXCEPTION 'location is not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(_sensitive, false) AND NOT public.chat_caller_can_mark_sensitive() THEN
    RAISE EXCEPTION 'sensitive conversations require an HR role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _posting_policy IS NULL OR _posting_policy NOT IN ('MEMBERS', 'ADMINS_ONLY', 'READ_ONLY') THEN
    RAISE EXCEPTION 'posting policy is not allowed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _file_policy IS NULL OR _file_policy NOT IN ('MEMBERS', 'ADMINS_ONLY', 'DISABLED') THEN
    RAISE EXCEPTION 'file policy is not allowed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _call_policy IS NULL OR _call_policy NOT IN ('MEMBERS', 'ADMINS_ONLY', 'DISABLED') THEN
    RAISE EXCEPTION 'call policy is not allowed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _retention_policy IS NULL
     OR _retention_policy NOT IN ('FOREVER', 'ONE_YEAR', 'TWO_YEARS', 'CUSTOM') THEN
    RAISE EXCEPTION 'retention policy is not allowed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _retention_policy = 'CUSTOM' AND _retention_until IS NULL THEN
    RAISE EXCEPTION 'retention_until is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _retention_policy <> 'CUSTOM' AND _retention_until IS NOT NULL THEN
    RAISE EXCEPTION 'retention_until is not allowed'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.chat_assert_hourly_create_limit();

  INSERT INTO public.chat_conversations (
    kind,
    title,
    description,
    location_id,
    department_id,
    sensitive,
    posting_policy,
    file_policy,
    call_policy,
    retention_policy,
    retention_until,
    archive_at,
    created_by
  ) VALUES (
    _kind,
    v_title,
    v_description,
    _location_id,
    _department_id,
    COALESCE(_sensitive, false),
    _posting_policy,
    _file_policy,
    _call_policy,
    _retention_policy,
    _retention_until,
    _archive_at,
    auth.uid()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.chat_members (
    conversation_id,
    user_id,
    staff_id,
    role,
    membership_source,
    added_by
  ) VALUES (
    v_id,
    auth.uid(),
    public.chat_staff_id_for_user(auth.uid()),
    'OWNER',
    'MANUAL',
    auth.uid()
  );

  PERFORM public.chat_write_audit(
    'conversation.created',
    v_id,
    jsonb_build_object(
      'kind', _kind,
      'sensitive', COALESCE(_sensitive, false),
      'location_id', _location_id,
      'department_id', _department_id
    )
  );

  RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.chat_create_conversation(
  text, text, text, uuid, uuid, boolean, text, text, text, text, timestamptz, timestamptz
) IS
  'Creates a non-direct conversation and exactly one MANUAL owner membership for auth.uid(). Does not add department or site members.';

-- ---------------------------------------------------------------------------
-- chat_open_direct
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_open_direct(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_low uuid;
  v_high uuid;
  v_existing uuid;
  v_left timestamptz;
  v_deleted timestamptz;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _other_user_id IS NULL THEN
    RAISE EXCEPTION 'other_user_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _other_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot message yourself'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'a role is required to use chat'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_low := least(auth.uid(), _other_user_id);
  v_high := greatest(auth.uid(), _other_user_id);

  PERFORM pg_advisory_xact_lock(hashtextextended('chat_dm:' || v_low::text || ':' || v_high::text, 0));

  SELECT p.conversation_id, m.left_at, c.deleted_at
  INTO v_existing, v_left, v_deleted
  FROM public.chat_dm_pairs p
  JOIN public.chat_conversations c ON c.id = p.conversation_id
  LEFT JOIN public.chat_members m
    ON m.conversation_id = p.conversation_id
   AND m.user_id = auth.uid()
  WHERE p.user_low = v_low
    AND p.user_high = v_high;

  IF v_existing IS NOT NULL THEN
    IF v_left IS NULL AND v_deleted IS NULL AND EXISTS (
      SELECT 1
      FROM public.chat_members m
      WHERE m.conversation_id = v_existing
        AND m.user_id = auth.uid()
        AND m.left_at IS NULL
    ) THEN
      RETURN v_existing;
    END IF;

    RAISE EXCEPTION 'this direct conversation is closed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _other_user_id) THEN
    RAISE EXCEPTION 'direct message target is not available'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Any visible non-deleted staff row linked to the other user is enough.
  -- A uuid with no such row cannot be targeted. chat.send is enforced in
  -- the server action for the caller; this function only requires a role.
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = _other_user_id
      AND s.deleted_at IS NULL
      AND public.user_can_access_staff(s.id)
  ) THEN
    RAISE EXCEPTION 'direct message target is not available'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.chat_assert_hourly_create_limit();

  INSERT INTO public.chat_conversations (
    kind,
    title,
    description,
    location_id,
    department_id,
    sensitive,
    posting_policy,
    file_policy,
    call_policy,
    retention_policy,
    created_by
  ) VALUES (
    'DIRECT',
    NULL,
    NULL,
    NULL,
    NULL,
    false,
    'MEMBERS',
    'MEMBERS',
    'MEMBERS',
    'FOREVER',
    auth.uid()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.chat_members (
    conversation_id,
    user_id,
    staff_id,
    role,
    membership_source,
    added_by
  ) VALUES (
    v_id,
    auth.uid(),
    public.chat_staff_id_for_user(auth.uid()),
    'OWNER',
    'MANUAL',
    auth.uid()
  );

  INSERT INTO public.chat_members (
    conversation_id,
    user_id,
    staff_id,
    role,
    membership_source,
    added_by
  ) VALUES (
    v_id,
    _other_user_id,
    public.chat_staff_id_for_user(_other_user_id),
    'MEMBER',
    'MANUAL',
    auth.uid()
  );

  INSERT INTO public.chat_dm_pairs (conversation_id, user_low, user_high)
  VALUES (v_id, v_low, v_high);

  PERFORM public.chat_write_audit(
    'conversation.direct_opened',
    v_id,
    jsonb_build_object('other_user_id', _other_user_id)
  );

  RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.chat_open_direct(uuid) IS
  'Opens one DIRECT conversation per user pair. A pair whose caller has left_at set is closed and is not duplicated. Caller must have a user_roles row. Target must be an auth user with a visible non-deleted staff link.';

REVOKE ALL ON FUNCTION public.chat_create_conversation(
  text, text, text, uuid, uuid, boolean, text, text, text, text, timestamptz, timestamptz
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.chat_open_direct(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.chat_create_conversation(
  text, text, text, uuid, uuid, boolean, text, text, text, text, timestamptz, timestamptz
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.chat_open_direct(uuid) TO authenticated, service_role;

REVOKE INSERT ON public.chat_conversations FROM authenticated;
REVOKE INSERT ON public.chat_dm_pairs FROM authenticated;

CREATE INDEX IF NOT EXISTS chat_conversations_created_by_created_idx
  ON public.chat_conversations (created_by, created_at DESC);
