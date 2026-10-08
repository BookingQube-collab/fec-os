-- Employees can open a direct chat with teammates who share their reporting manager,
-- even when location access does not already include that staff row.

CREATE OR REPLACE FUNCTION public.chat_shares_reporting_manager(_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff viewer
    JOIN public.staff_profile_ext viewer_ext ON viewer_ext.staff_id = viewer.id
    JOIN public.staff other ON other.user_id = _other_user_id
    JOIN public.staff_profile_ext other_ext ON other_ext.staff_id = other.id
    WHERE viewer.user_id = auth.uid()
      AND viewer.deleted_at IS NULL
      AND other.deleted_at IS NULL
      AND other.id <> viewer.id
      AND viewer_ext.reporting_manager_staff_id IS NOT NULL
      AND viewer_ext.reporting_manager_staff_id = other_ext.reporting_manager_staff_id
      AND COALESCE(lower(other.employment_type), '') <> 'joker'
      AND COALESCE(lower(replace(other.status, '-', '_')), 'active') IN ('', 'active', 'probation', 'secondment', 'remote')
  );
$$;

REVOKE ALL ON FUNCTION public.chat_shares_reporting_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_shares_reporting_manager(uuid) TO authenticated, service_role;

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

  -- Location access, or a teammate under the same reporting manager.
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = _other_user_id
      AND s.deleted_at IS NULL
      AND (
        public.user_can_access_staff(s.id)
        OR public.chat_shares_reporting_manager(_other_user_id)
      )
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
  'Opens one DIRECT conversation per user pair. Target must be a visible staff login, or a teammate who shares the caller''s reporting manager.';
