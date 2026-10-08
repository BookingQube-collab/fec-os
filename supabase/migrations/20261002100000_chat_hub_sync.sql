-- Chat Hub phase 11: sync DEPARTMENT and SITE membership from staff assignment.
-- Does not edit earlier chat migrations. Does not backfill rooms.
-- Does not delete messages or membership rows. Does not auto-set sensitive.
--
-- Authenticated users still cannot insert membership_source DEPARTMENT or SITE.
-- chat_sync_guard is written only by these definer functions. The member trigger
-- allows those sources only while a guard row exists for this backend pid.
-- The guard table is not granted to anon or authenticated.
--
-- Direct calls check the same roles as the create actions:
--   departments: people.edit_roster (ceo, coo, regional_ops, branch_gm,
--     duty_manager, tech_supervisor, hr)
--   sites: branches.edit (ceo, coo, regional_ops)
-- Triggers skip that check and only recompute from the assignment tables.
-- They do not accept a member list. role_level >= 80 is not a membership grant.
--
-- A person is on a site when staff.location_id, staff_work_locations, or an
-- active staff_temporary_site_moves row (to_location_id, inclusive Qatar dates)
-- includes that location. Home location is not removed by a temporary move.

BEGIN;

-- ---------------------------------------------------------------------------
-- One live room per department and per site.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_live_department_uidx
  ON public.chat_conversations (department_id)
  WHERE kind = 'DEPARTMENT' AND deleted_at IS NULL AND department_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_live_site_uidx
  ON public.chat_conversations (location_id)
  WHERE kind = 'SITE' AND deleted_at IS NULL AND location_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Guard. Not a client-set GUC. Authenticated cannot write it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_sync_guard (
  pid integer PRIMARY KEY,
  kind text NOT NULL,
  CONSTRAINT chat_sync_guard_kind_chk CHECK (kind IN ('department', 'site'))
);

COMMENT ON TABLE public.chat_sync_guard IS
  'Transaction-scoped marker that chat_sync_department or chat_sync_site is applying membership. Not granted to anon or authenticated.';

ALTER TABLE public.chat_sync_guard ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_sync_guard FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permission checks. Same role lists as the server actions. Not granted out.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_caller_can_manage_departments()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'ceo'::public.app_role)
      OR public.has_role(auth.uid(), 'coo'::public.app_role)
      OR public.has_role(auth.uid(), 'regional_ops'::public.app_role)
      OR public.has_role(auth.uid(), 'branch_gm'::public.app_role)
      OR public.has_role(auth.uid(), 'duty_manager'::public.app_role)
      OR public.has_role(auth.uid(), 'tech_supervisor'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)
    );
$$;

CREATE OR REPLACE FUNCTION public.chat_caller_can_manage_sites()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'ceo'::public.app_role)
      OR public.has_role(auth.uid(), 'coo'::public.app_role)
      OR public.has_role(auth.uid(), 'regional_ops'::public.app_role)
    );
$$;

REVOKE ALL ON FUNCTION public.chat_caller_can_manage_departments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_caller_can_manage_sites() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit: sync may write member.synced_join / member.synced_leave without the
-- caller being a chat member. The guard row is the only bypass.
-- ---------------------------------------------------------------------------

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
  syncing boolean;
BEGIN
  syncing := EXISTS (
    SELECT 1 FROM public.chat_sync_guard g WHERE g.pid = pg_backend_pid()
  );

  IF auth.uid() IS NULL AND NOT syncing THEN
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

  clean_metadata := clean_metadata - 'body' - 'actor' - 'actor_id';

  IF NOT syncing AND _conversation_id IS NOT NULL THEN
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

-- ---------------------------------------------------------------------------
-- Member trigger: DEPARTMENT / SITE writes only while the guard matches.
-- Sync may change left_at on those rows. It cannot change OWNER or ADMIN,
-- and it cannot change any other column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_tg_members_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  staff_user uuid;
  staff_deleted timestamptz;
  sync_kind text;
BEGIN
  SELECT g.kind INTO sync_kind
  FROM public.chat_sync_guard g
  WHERE g.pid = pg_backend_pid();

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

    IF sync_kind IS NOT NULL THEN
      IF NEW.role IS DISTINCT FROM 'MEMBER' THEN
        RAISE EXCEPTION 'sync inserts members only'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT (
        (sync_kind = 'department' AND NEW.membership_source = 'DEPARTMENT')
        OR (sync_kind = 'site' AND NEW.membership_source = 'SITE')
      ) THEN
        RAISE EXCEPTION 'sync source does not match'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
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

  IF public.chat_caller_is_privileged() AND sync_kind IS NULL THEN
    RETURN NEW;
  END IF;

  IF sync_kind IS NOT NULL THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.staff_id IS DISTINCT FROM OLD.staff_id
       OR NEW.added_by IS DISTINCT FROM OLD.added_by
       OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'sync may only change left_at'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.role IN ('OWNER', 'ADMIN') THEN
      RAISE EXCEPTION 'sync cannot change an owner or admin'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (
      (sync_kind = 'department' AND OLD.membership_source = 'DEPARTMENT')
      OR (sync_kind = 'site' AND OLD.membership_source = 'SITE')
    ) THEN
      RAISE EXCEPTION 'sync source does not match'
        USING ERRCODE = 'check_violation';
    END IF;
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

-- ---------------------------------------------------------------------------
-- Apply the diff. Caller has already checked permission and set nothing.
-- This function sets and clears the guard. Revoked from authenticated.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_apply_membership_sync(
  _conversation_id uuid,
  _source text,
  _desired uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_kind text;
  v_rejoin int := 0;
  v_leave int := 0;
  v_add int := 0;
BEGIN
  IF _source = 'DEPARTMENT' THEN
    v_kind := 'department';
  ELSIF _source = 'SITE' THEN
    v_kind := 'site';
  ELSE
    RAISE EXCEPTION 'sync source is not allowed'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('chat_member:' || _conversation_id::text, 0));

  INSERT INTO public.chat_sync_guard (pid, kind)
  VALUES (pg_backend_pid(), v_kind)
  ON CONFLICT (pid) DO UPDATE SET kind = EXCLUDED.kind;

  UPDATE public.chat_members m
  SET left_at = NULL
  WHERE m.conversation_id = _conversation_id
    AND m.membership_source = _source
    AND m.role NOT IN ('OWNER', 'ADMIN')
    AND m.left_at IS NOT NULL
    AND m.user_id = ANY (COALESCE(_desired, ARRAY[]::uuid[]));
  GET DIAGNOSTICS v_rejoin = ROW_COUNT;

  UPDATE public.chat_members m
  SET left_at = GREATEST(now(), m.joined_at)
  WHERE m.conversation_id = _conversation_id
    AND m.membership_source = _source
    AND m.role NOT IN ('OWNER', 'ADMIN')
    AND m.left_at IS NULL
    AND NOT (m.user_id = ANY (COALESCE(_desired, ARRAY[]::uuid[])));
  GET DIAGNOSTICS v_leave = ROW_COUNT;

  INSERT INTO public.chat_members (
    conversation_id,
    user_id,
    staff_id,
    role,
    membership_source,
    added_by
  )
  SELECT
    _conversation_id,
    d.user_id,
    public.chat_staff_id_for_user(d.user_id),
    'MEMBER',
    _source,
    auth.uid()
  FROM (
    SELECT DISTINCT u AS user_id
    FROM unnest(COALESCE(_desired, ARRAY[]::uuid[])) AS u
    WHERE u IS NOT NULL
  ) d
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.chat_members m
    WHERE m.conversation_id = _conversation_id
      AND m.user_id = d.user_id
  );
  GET DIAGNOSTICS v_add = ROW_COUNT;

  IF v_rejoin + v_add > 0 THEN
    PERFORM public.chat_write_audit(
      'member.synced_join',
      _conversation_id,
      jsonb_build_object('count', v_rejoin + v_add)
    );
  END IF;

  IF v_leave > 0 THEN
    PERFORM public.chat_write_audit(
      'member.synced_leave',
      _conversation_id,
      jsonb_build_object('count', v_leave)
    );
  END IF;

  DELETE FROM public.chat_sync_guard WHERE pid = pg_backend_pid();
EXCEPTION
  WHEN OTHERS THEN
    DELETE FROM public.chat_sync_guard WHERE pid = pg_backend_pid();
    RAISE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.chat_apply_membership_sync(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Desired members
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_department_member_ids(_department_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.user_id), ARRAY[]::uuid[])
  FROM public.staff_departments sd
  JOIN public.staff s ON s.id = sd.staff_id
  WHERE sd.department_id = _department_id
    AND s.user_id IS NOT NULL
    AND s.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.chat_site_member_ids(_location_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.user_id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.user_id IS NOT NULL
    AND s.deleted_at IS NULL
    AND (
      s.location_id = _location_id
      OR EXISTS (
        SELECT 1
        FROM public.staff_work_locations w
        WHERE w.staff_id = s.id
          AND w.location_id = _location_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.staff_temporary_site_moves m
        WHERE m.staff_id = s.id
          AND m.to_location_id = _location_id
          AND m.starts_on <= (timezone('Asia/Qatar', now()))::date
          AND m.ends_on >= (timezone('Asia/Qatar', now()))::date
      )
    );
$$;

REVOKE ALL ON FUNCTION public.chat_department_member_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_site_member_ids(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.chat_sync_department(_department_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_count int;
BEGIN
  IF _department_id IS NULL THEN
    RAISE EXCEPTION 'department_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF pg_trigger_depth() = 0 AND NOT public.chat_caller_is_privileged() THEN
    IF NOT public.chat_caller_can_manage_departments() THEN
      RAISE EXCEPTION 'forbidden'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.chat_conversations c
  WHERE c.kind = 'DEPARTMENT'
    AND c.department_id = _department_id
    AND c.deleted_at IS NULL;

  IF v_count = 0 THEN
    RETURN;
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'more than one live department conversation'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT c.id INTO v_id
  FROM public.chat_conversations c
  WHERE c.kind = 'DEPARTMENT'
    AND c.department_id = _department_id
    AND c.deleted_at IS NULL;

  PERFORM pg_advisory_xact_lock(hashtextextended('chat_sync_department:' || _department_id::text, 0));

  PERFORM public.chat_apply_membership_sync(
    v_id,
    'DEPARTMENT',
    public.chat_department_member_ids(_department_id)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_sync_site(_location_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_count int;
BEGIN
  IF _location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF pg_trigger_depth() = 0 AND NOT public.chat_caller_is_privileged() THEN
    IF NOT public.chat_caller_can_manage_sites() THEN
      RAISE EXCEPTION 'forbidden'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.chat_conversations c
  WHERE c.kind = 'SITE'
    AND c.location_id = _location_id
    AND c.deleted_at IS NULL;

  IF v_count = 0 THEN
    RETURN;
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'more than one live site conversation'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT c.id INTO v_id
  FROM public.chat_conversations c
  WHERE c.kind = 'SITE'
    AND c.location_id = _location_id
    AND c.deleted_at IS NULL;

  PERFORM pg_advisory_xact_lock(hashtextextended('chat_sync_site:' || _location_id::text, 0));

  PERFORM public.chat_apply_membership_sync(
    v_id,
    'SITE',
    public.chat_site_member_ids(_location_id)
  );
END;
$fn$;

COMMENT ON FUNCTION public.chat_sync_department(uuid) IS
  'Recompute DEPARTMENT membership from staff_departments. No-op when that department has no live chat. Does not delete messages or membership rows. Does not change MANUAL, ROLE, SYSTEM, OWNER, or ADMIN rows.';

COMMENT ON FUNCTION public.chat_sync_site(uuid) IS
  'Recompute SITE membership from staff.location_id, staff_work_locations, and active temporary moves. No-op when that site has no live chat. Does not delete messages or membership rows.';

REVOKE ALL ON FUNCTION public.chat_sync_department(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_sync_site(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.chat_sync_department(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_sync_site(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable: create the one live room if missing (creator OWNER MANUAL), then sync.
-- sensitive stays false. Title is the department or location name.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_enable_department_chat(_department_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_name text;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.chat_caller_is_privileged()
     AND NOT public.chat_caller_can_manage_departments() THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _department_id IS NULL THEN
    RAISE EXCEPTION 'department_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT btrim(d.name) INTO v_name
  FROM public.master_departments d
  WHERE d.id = _department_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'department is not available'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('chat_sync_department:' || _department_id::text, 0));

  SELECT count(*)::int INTO v_count
  FROM public.chat_conversations c
  WHERE c.kind = 'DEPARTMENT'
    AND c.department_id = _department_id
    AND c.deleted_at IS NULL;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'more than one live department conversation'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT c.id INTO v_id
  FROM public.chat_conversations c
  WHERE c.kind = 'DEPARTMENT'
    AND c.department_id = _department_id
    AND c.deleted_at IS NULL;

  IF v_id IS NULL THEN
    IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
      RAISE EXCEPTION 'title is required'
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
      created_by
    ) VALUES (
      'DEPARTMENT',
      v_name,
      NULL,
      NULL,
      _department_id,
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

    PERFORM public.chat_write_audit(
      'conversation.created',
      v_id,
      jsonb_build_object(
        'kind', 'DEPARTMENT',
        'sensitive', false,
        'location_id', NULL,
        'department_id', _department_id
      )
    );
  END IF;

  PERFORM public.chat_sync_department(_department_id);
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_enable_site_chat(_location_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_name text;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.chat_caller_is_privileged()
     AND NOT public.chat_caller_can_manage_sites() THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.user_can_access_location(_location_id) AND NOT public.chat_caller_is_privileged() THEN
    RAISE EXCEPTION 'location is not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT btrim(l.name) INTO v_name
  FROM public.locations l
  WHERE l.id = _location_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'location is not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('chat_sync_site:' || _location_id::text, 0));

  SELECT count(*)::int INTO v_count
  FROM public.chat_conversations c
  WHERE c.kind = 'SITE'
    AND c.location_id = _location_id
    AND c.deleted_at IS NULL;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'more than one live site conversation'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT c.id INTO v_id
  FROM public.chat_conversations c
  WHERE c.kind = 'SITE'
    AND c.location_id = _location_id
    AND c.deleted_at IS NULL;

  IF v_id IS NULL THEN
    IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
      RAISE EXCEPTION 'title is required'
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
      created_by
    ) VALUES (
      'SITE',
      v_name,
      NULL,
      _location_id,
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

    PERFORM public.chat_write_audit(
      'conversation.created',
      v_id,
      jsonb_build_object(
        'kind', 'SITE',
        'sensitive', false,
        'location_id', _location_id,
        'department_id', NULL
      )
    );
  END IF;

  PERFORM public.chat_sync_site(_location_id);
  RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.chat_enable_department_chat(uuid) IS
  'Create the single live DEPARTMENT conversation for this department when missing, then sync members. Does not mark the room sensitive.';

COMMENT ON FUNCTION public.chat_enable_site_chat(uuid) IS
  'Create the single live SITE conversation titled with the location name when missing, then sync members. Does not mark the room sensitive.';

REVOKE ALL ON FUNCTION public.chat_enable_department_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_enable_site_chat(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.chat_enable_department_chat(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_enable_site_chat(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers. Small. Errors propagate so a membership grant is not half-applied.
-- No conversation means sync returns without raising.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_tg_staff_departments_sync_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT department_id FROM new_rows ORDER BY department_id LOOP
    PERFORM public.chat_sync_department(r.department_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_staff_departments_sync_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT department_id FROM new_rows
    UNION
    SELECT department_id FROM old_rows
    ORDER BY department_id
  LOOP
    PERFORM public.chat_sync_department(r.department_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_staff_departments_sync_del()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT department_id FROM old_rows ORDER BY department_id LOOP
    PERFORM public.chat_sync_department(r.department_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_staff_departments_chat_sync_ins ON public.staff_departments;
CREATE TRIGGER trg_staff_departments_chat_sync_ins
  AFTER INSERT ON public.staff_departments
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_departments_sync_ins();

DROP TRIGGER IF EXISTS trg_staff_departments_chat_sync_upd ON public.staff_departments;
CREATE TRIGGER trg_staff_departments_chat_sync_upd
  AFTER UPDATE ON public.staff_departments
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_departments_sync_upd();

DROP TRIGGER IF EXISTS trg_staff_departments_chat_sync_del ON public.staff_departments;
CREATE TRIGGER trg_staff_departments_chat_sync_del
  AFTER DELETE ON public.staff_departments
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_departments_sync_del();

CREATE OR REPLACE FUNCTION public.chat_tg_staff_work_locations_sync_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT location_id FROM new_rows ORDER BY location_id LOOP
    PERFORM public.chat_sync_site(r.location_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_staff_work_locations_sync_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT location_id FROM new_rows
    UNION
    SELECT location_id FROM old_rows
    ORDER BY location_id
  LOOP
    PERFORM public.chat_sync_site(r.location_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_staff_work_locations_sync_del()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT location_id FROM old_rows ORDER BY location_id LOOP
    PERFORM public.chat_sync_site(r.location_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_staff_work_locations_chat_sync_ins ON public.staff_work_locations;
CREATE TRIGGER trg_staff_work_locations_chat_sync_ins
  AFTER INSERT ON public.staff_work_locations
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_work_locations_sync_ins();

DROP TRIGGER IF EXISTS trg_staff_work_locations_chat_sync_upd ON public.staff_work_locations;
CREATE TRIGGER trg_staff_work_locations_chat_sync_upd
  AFTER UPDATE ON public.staff_work_locations
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_work_locations_sync_upd();

DROP TRIGGER IF EXISTS trg_staff_work_locations_chat_sync_del ON public.staff_work_locations;
CREATE TRIGGER trg_staff_work_locations_chat_sync_del
  AFTER DELETE ON public.staff_work_locations
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_work_locations_sync_del();

CREATE OR REPLACE FUNCTION public.chat_tg_staff_temp_moves_sync_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT to_location_id FROM new_rows ORDER BY to_location_id LOOP
    PERFORM public.chat_sync_site(r.to_location_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_staff_temp_moves_sync_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT to_location_id AS location_id FROM new_rows
    UNION
    SELECT to_location_id FROM old_rows
    ORDER BY location_id
  LOOP
    PERFORM public.chat_sync_site(r.location_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_staff_temp_moves_sync_del()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT to_location_id FROM old_rows ORDER BY to_location_id LOOP
    PERFORM public.chat_sync_site(r.to_location_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_staff_temp_moves_chat_sync_ins ON public.staff_temporary_site_moves;
CREATE TRIGGER trg_staff_temp_moves_chat_sync_ins
  AFTER INSERT ON public.staff_temporary_site_moves
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_temp_moves_sync_ins();

DROP TRIGGER IF EXISTS trg_staff_temp_moves_chat_sync_upd ON public.staff_temporary_site_moves;
CREATE TRIGGER trg_staff_temp_moves_chat_sync_upd
  AFTER UPDATE ON public.staff_temporary_site_moves
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_temp_moves_sync_upd();

DROP TRIGGER IF EXISTS trg_staff_temp_moves_chat_sync_del ON public.staff_temporary_site_moves;
CREATE TRIGGER trg_staff_temp_moves_chat_sync_del
  AFTER DELETE ON public.staff_temporary_site_moves
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.chat_tg_staff_temp_moves_sync_del();

CREATE OR REPLACE FUNCTION public.chat_tg_staff_assignment_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  loc uuid;
  dept uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.chat_sync_site(NEW.location_id);
    RETURN NEW;
  END IF;

  IF NEW.location_id IS NOT DISTINCT FROM OLD.location_id
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  FOR loc IN
    SELECT location_id
    FROM (
      SELECT OLD.location_id
      UNION
      SELECT NEW.location_id
    ) sites
    ORDER BY location_id
  LOOP
    PERFORM public.chat_sync_site(loc);
  END LOOP;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    FOR loc IN
      SELECT location_id
      FROM (
        SELECT w.location_id
        FROM public.staff_work_locations w
        WHERE w.staff_id = NEW.id
        UNION
        SELECT m.to_location_id
        FROM public.staff_temporary_site_moves m
        WHERE m.staff_id = NEW.id
      ) sites
      ORDER BY location_id
    LOOP
      PERFORM public.chat_sync_site(loc);
    END LOOP;

    FOR dept IN
      SELECT sd.department_id
      FROM public.staff_departments sd
      WHERE sd.staff_id = NEW.id
      ORDER BY sd.department_id
    LOOP
      PERFORM public.chat_sync_department(dept);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Hard delete: cascade sync would still see the staff row. Capture the
-- assignment ids first, then sync after the row is gone.
CREATE OR REPLACE FUNCTION public.chat_tg_staff_before_delete_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS chat_staff_delete_sync (
    staff_id uuid NOT NULL,
    kind text NOT NULL,
    ref_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.chat_staff_delete_sync (staff_id, kind, ref_id)
  SELECT OLD.id, 'site', OLD.location_id
  UNION ALL
  SELECT OLD.id, 'site', w.location_id
  FROM public.staff_work_locations w
  WHERE w.staff_id = OLD.id
  UNION ALL
  SELECT OLD.id, 'site', m.to_location_id
  FROM public.staff_temporary_site_moves m
  WHERE m.staff_id = OLD.id
  UNION ALL
  SELECT OLD.id, 'department', sd.department_id
  FROM public.staff_departments sd
  WHERE sd.staff_id = OLD.id;

  RETURN OLD;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_staff_after_delete_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ref_id
    FROM pg_temp.chat_staff_delete_sync
    WHERE staff_id = OLD.id
      AND kind = 'site'
    ORDER BY ref_id
  LOOP
    PERFORM public.chat_sync_site(r.ref_id);
  END LOOP;

  FOR r IN
    SELECT DISTINCT ref_id
    FROM pg_temp.chat_staff_delete_sync
    WHERE staff_id = OLD.id
      AND kind = 'department'
    ORDER BY ref_id
  LOOP
    PERFORM public.chat_sync_department(r.ref_id);
  END LOOP;

  DELETE FROM pg_temp.chat_staff_delete_sync WHERE staff_id = OLD.id;
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_staff_chat_assignment_sync ON public.staff;
CREATE TRIGGER trg_staff_chat_assignment_sync
  AFTER INSERT OR UPDATE OF location_id, deleted_at, user_id
  ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_tg_staff_assignment_sync();

DROP TRIGGER IF EXISTS trg_staff_chat_before_delete_capture ON public.staff;
CREATE TRIGGER trg_staff_chat_before_delete_capture
  BEFORE DELETE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_tg_staff_before_delete_capture();

DROP TRIGGER IF EXISTS trg_staff_chat_after_delete_sync ON public.staff;
CREATE TRIGGER trg_staff_chat_after_delete_sync
  AFTER DELETE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_tg_staff_after_delete_sync();

REVOKE ALL ON FUNCTION public.chat_tg_staff_departments_sync_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_departments_sync_upd() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_departments_sync_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_work_locations_sync_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_work_locations_sync_upd() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_work_locations_sync_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_temp_moves_sync_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_temp_moves_sync_upd() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_temp_moves_sync_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_assignment_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_before_delete_capture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_staff_after_delete_sync() FROM PUBLIC, anon, authenticated;

COMMIT;
