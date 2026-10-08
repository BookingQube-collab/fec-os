-- Helpdesk cases: conversation, handler, confidentiality, status reasons, and history.
-- Tickets remain hr_employee_events rows (event_type = helpdesk_request).

CREATE SEQUENCE IF NOT EXISTS public.hr_helpdesk_ticket_seq AS bigint START WITH 100000 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.current_user_role_level() >= 55;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_my_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT s.id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
    AND s.deleted_at IS NULL
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_actor_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT left(COALESCE(
    (SELECT NULLIF(btrim(display_name), '') FROM public.profiles WHERE id = auth.uid()),
    (
      SELECT NULLIF(btrim(full_name), '')
      FROM public.staff
      WHERE user_id = auth.uid() AND deleted_at IS NULL
      LIMIT 1
    ),
    'HR'
  ), 160);
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_can_view(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_employee_events e
    WHERE e.id = p_event_id
      AND e.event_type = 'helpdesk_request'
      AND (
        public.hr_helpdesk_is_manager()
        OR e.staff_id = public.hr_helpdesk_my_staff_id()
        OR (
          COALESCE(e.payload->>'assigneeStaffId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (e.payload->>'assigneeStaffId')::uuid = public.hr_helpdesk_my_staff_id()
        )
      )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_stamp_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.event_type IS DISTINCT FROM 'helpdesk_request' THEN
    RETURN NEW;
  END IF;
  NEW.payload := COALESCE(NEW.payload, '{}'::jsonb);
  IF COALESCE(NEW.payload->>'ticketNo', '') !~ '^[0-9]+$' THEN
    NEW.payload := NEW.payload || jsonb_build_object('ticketNo', nextval('public.hr_helpdesk_ticket_seq'));
  END IF;
  IF NOT (NEW.payload ? 'confidential') THEN
    NEW.payload := NEW.payload || jsonb_build_object('confidential', false);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_hr_helpdesk_stamp_request ON public.hr_employee_events;
CREATE TRIGGER trg_hr_helpdesk_stamp_request
  BEFORE INSERT ON public.hr_employee_events
  FOR EACH ROW EXECUTE FUNCTION public.hr_helpdesk_stamp_request();

DO $do$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id
    FROM public.hr_employee_events
    WHERE event_type = 'helpdesk_request'
      AND COALESCE(payload->>'ticketNo', '') !~ '^[0-9]+$'
    ORDER BY created_at, id
  LOOP
    UPDATE public.hr_employee_events
    SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
      'ticketNo', nextval('public.hr_helpdesk_ticket_seq'),
      'confidential', CASE WHEN payload->>'confidential' = 'true' THEN true ELSE false END
    )
    WHERE id = rec.id;
  END LOOP;
END
$do$;

UPDATE public.hr_employee_events
SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('confidential', false)
WHERE event_type = 'helpdesk_request'
  AND NOT (COALESCE(payload, '{}'::jsonb) ? 'confidential');

CREATE TABLE IF NOT EXISTS public.hr_helpdesk_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.hr_employee_events(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  visibility text NOT NULL DEFAULT 'public',
  attachment jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_helpdesk_messages_body_chk CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  CONSTRAINT hr_helpdesk_messages_visibility_chk CHECK (visibility IN ('public', 'internal')),
  CONSTRAINT hr_helpdesk_messages_author_chk CHECK (char_length(btrim(author_name)) BETWEEN 1 AND 160)
);

CREATE INDEX IF NOT EXISTS idx_hr_helpdesk_messages_event
  ON public.hr_helpdesk_messages (event_id, created_at);

CREATE TABLE IF NOT EXISTS public.hr_helpdesk_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.hr_employee_events(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_helpdesk_history_kind_chk CHECK (
    kind IN ('created', 'reply', 'internal_note', 'status', 'assigned', 'unassigned', 'confidential', 'public')
  ),
  CONSTRAINT hr_helpdesk_history_actor_chk CHECK (char_length(btrim(actor_name)) BETWEEN 1 AND 160)
);

CREATE INDEX IF NOT EXISTS idx_hr_helpdesk_history_event
  ON public.hr_helpdesk_history (event_id, created_at);

INSERT INTO public.hr_helpdesk_messages (
  event_id, author_id, author_staff_id, author_name, body, visibility, created_at
)
SELECT
  e.id,
  e.actor_id,
  e.staff_id,
  left(COALESCE(NULLIF(btrim(s.full_name), ''), 'HR'), 160),
  left(btrim(COALESCE(NULLIF(e.payload->>'question', ''), NULLIF(e.payload->>'title', ''), 'Request')), 4000),
  'public',
  e.created_at
FROM public.hr_employee_events e
LEFT JOIN public.staff s ON s.id = e.staff_id
WHERE e.event_type = 'helpdesk_request'
  AND char_length(btrim(COALESCE(NULLIF(e.payload->>'question', ''), NULLIF(e.payload->>'title', ''), ''))) >= 1
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_helpdesk_messages m WHERE m.event_id = e.id
  );

INSERT INTO public.hr_helpdesk_history (event_id, actor_id, actor_name, kind, detail, created_at)
SELECT
  e.id,
  e.actor_id,
  left(COALESCE(NULLIF(btrim(s.full_name), ''), 'HR'), 160),
  'created',
  '{}'::jsonb,
  e.created_at
FROM public.hr_employee_events e
LEFT JOIN public.staff s ON s.id = e.staff_id
WHERE e.event_type = 'helpdesk_request'
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_helpdesk_history h WHERE h.event_id = e.id
  );

GRANT SELECT ON public.hr_helpdesk_messages, public.hr_helpdesk_history TO authenticated;
GRANT ALL ON public.hr_helpdesk_messages, public.hr_helpdesk_history TO service_role;

ALTER TABLE public.hr_helpdesk_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_helpdesk_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_helpdesk_messages read" ON public.hr_helpdesk_messages;
CREATE POLICY "hr_helpdesk_messages read" ON public.hr_helpdesk_messages
  FOR SELECT TO authenticated
  USING (
    public.hr_helpdesk_can_view(event_id)
    AND (visibility = 'public' OR public.hr_helpdesk_is_manager())
  );

DROP POLICY IF EXISTS "hr_helpdesk_history read" ON public.hr_helpdesk_history;
CREATE POLICY "hr_helpdesk_history read" ON public.hr_helpdesk_history
  FOR SELECT TO authenticated
  USING (
    public.hr_helpdesk_can_view(event_id)
    AND (kind <> 'internal_note' OR public.hr_helpdesk_is_manager())
  );

DROP POLICY IF EXISTS "hr_helpdesk_handler read" ON public.hr_employee_events;
CREATE POLICY "hr_helpdesk_handler read" ON public.hr_employee_events
  FOR SELECT TO authenticated
  USING (
    event_type = 'helpdesk_request'
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.deleted_at IS NULL
        AND s.id::text = hr_employee_events.payload->>'assigneeStaffId'
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-helpdesk',
  'hr-helpdesk',
  false,
  10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS hr_helpdesk_storage_select ON storage.objects;
CREATE POLICY hr_helpdesk_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hr-helpdesk'
    AND EXISTS (
      SELECT 1
      FROM public.hr_helpdesk_messages m
      WHERE m.attachment->>'path' = name
        AND public.hr_helpdesk_can_view(m.event_id)
        AND (m.visibility = 'public' OR public.hr_helpdesk_is_manager())
    )
  );

CREATE OR REPLACE FUNCTION public.hr_helpdesk_clean_attachment(p_attachment jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_size int;
BEGIN
  IF p_attachment IS NULL THEN
    RETURN NULL;
  END IF;
  IF COALESCE(p_attachment->>'path', '') NOT LIKE auth.uid()::text || '/%' THEN
    RAISE EXCEPTION 'invalid attachment';
  END IF;
  IF COALESCE(p_attachment->>'mimeType', '') NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN
    RAISE EXCEPTION 'invalid attachment';
  END IF;
  IF COALESCE(p_attachment->>'fileName', '') = '' THEN
    RAISE EXCEPTION 'invalid attachment';
  END IF;
  v_size := COALESCE((p_attachment->>'byteSize')::int, 0);
  IF v_size < 1 OR v_size > 10485760 THEN
    RAISE EXCEPTION 'invalid attachment';
  END IF;
  RETURN jsonb_build_object(
    'bucket', 'hr-helpdesk',
    'path', p_attachment->>'path',
    'fileName', left(p_attachment->>'fileName', 180),
    'mimeType', p_attachment->>'mimeType',
    'byteSize', v_size
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_create_request(
  p_staff_id uuid,
  p_subject text,
  p_category text,
  p_attachment jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_category text := btrim(COALESCE(p_category, ''));
  v_mine uuid;
  v_rule uuid;
  v_default uuid;
  v_assignee uuid;
  v_first int;
  v_resolution int;
  v_attachment jsonb;
  v_name text;
  v_requester_name text;
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF char_length(v_subject) < 2 OR char_length(v_subject) > 2000 THEN
    RAISE EXCEPTION 'subject required';
  END IF;
  IF char_length(v_category) < 1 OR char_length(v_category) > 80 THEN
    RAISE EXCEPTION 'invalid category';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'employee not found';
  END IF;
  v_mine := public.hr_helpdesk_my_staff_id();
  IF p_staff_id IS DISTINCT FROM v_mine AND NOT public.hr_helpdesk_is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_attachment := public.hr_helpdesk_clean_attachment(p_attachment);

  SELECT assignee_staff_id INTO v_rule
  FROM public.hr_helpdesk_rules
  WHERE kind = 'routing'
    AND category = v_category
    AND active
    AND assignee_staff_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT first_response_hours, resolution_hours, default_assignee_staff_id
  INTO v_first, v_resolution, v_default
  FROM public.hr_helpdesk_settings
  LIMIT 1;

  v_assignee := COALESCE(v_rule, v_default);

  v_payload := jsonb_build_object(
    'question', v_subject,
    'title', left(v_subject, 160),
    'status', 'open',
    'category', v_category,
    'assigneeStaffId', CASE WHEN v_assignee IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_assignee) END,
    'confidential', false,
    'resolutionAnchor', now()
  );
  IF v_first IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('firstResponseHours', v_first, 'resolutionHours', v_resolution);
  END IF;

  INSERT INTO public.hr_employee_events (
    staff_id, event_type, effective_on, payload, actor_id, source_table
  ) VALUES (
    p_staff_id,
    'helpdesk_request',
    (now() AT TIME ZONE 'Asia/Qatar')::date,
    v_payload,
    auth.uid(),
    'hr_helpdesk'
  )
  RETURNING id INTO v_id;

  SELECT full_name INTO v_requester_name FROM public.staff WHERE id = p_staff_id;
  v_name := COALESCE(NULLIF(btrim(v_requester_name), ''), public.hr_helpdesk_actor_name());

  INSERT INTO public.hr_helpdesk_messages (
    event_id, author_id, author_staff_id, author_name, body, visibility, attachment
  ) VALUES (
    v_id, auth.uid(), p_staff_id, left(v_name, 160), v_subject, 'public', v_attachment
  );

  INSERT INTO public.hr_helpdesk_history (event_id, actor_id, actor_name, kind, detail)
  VALUES (v_id, auth.uid(), public.hr_helpdesk_actor_name(), 'created', '{}'::jsonb);

  IF v_assignee IS NOT NULL THEN
    INSERT INTO public.hr_helpdesk_history (event_id, actor_id, actor_name, kind, detail)
    VALUES (
      v_id,
      auth.uid(),
      public.hr_helpdesk_actor_name(),
      'assigned',
      jsonb_build_object(
        'assigneeStaffId', v_assignee,
        'assigneeName', COALESCE((SELECT full_name FROM public.staff WHERE id = v_assignee), '')
      )
    );
  END IF;

  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_reply(
  p_event_id uuid,
  p_body text,
  p_visibility text,
  p_attachment jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_event public.hr_employee_events%ROWTYPE;
  v_body text := btrim(COALESCE(p_body, ''));
  v_visibility text := COALESCE(p_visibility, 'public');
  v_id uuid;
  v_attachment jsonb;
  v_author_staff uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.hr_helpdesk_can_view(p_event_id) THEN
    RAISE EXCEPTION 'not found';
  END IF;
  IF char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'reply required';
  END IF;
  IF v_visibility NOT IN ('public', 'internal') THEN
    RAISE EXCEPTION 'invalid visibility';
  END IF;
  IF v_visibility = 'internal' AND NOT public.hr_helpdesk_is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_event
  FROM public.hr_employee_events
  WHERE id = p_event_id AND event_type = 'helpdesk_request';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  v_attachment := public.hr_helpdesk_clean_attachment(p_attachment);
  v_author_staff := public.hr_helpdesk_my_staff_id();

  INSERT INTO public.hr_helpdesk_messages (
    event_id, author_id, author_staff_id, author_name, body, visibility, attachment
  ) VALUES (
    p_event_id,
    auth.uid(),
    v_author_staff,
    public.hr_helpdesk_actor_name(),
    v_body,
    v_visibility,
    v_attachment
  )
  RETURNING id INTO v_id;

  IF v_visibility = 'public'
     AND v_author_staff IS DISTINCT FROM v_event.staff_id
     AND COALESCE(v_event.payload->>'firstPublicReplyAt', '') = '' THEN
    UPDATE public.hr_employee_events
    SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('firstPublicReplyAt', now())
    WHERE id = p_event_id;
  END IF;

  INSERT INTO public.hr_helpdesk_history (event_id, actor_id, actor_name, kind, detail)
  VALUES (
    p_event_id,
    auth.uid(),
    public.hr_helpdesk_actor_name(),
    CASE WHEN v_visibility = 'internal' THEN 'internal_note' ELSE 'reply' END,
    '{}'::jsonb
  );

  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_set_status(
  p_event_id uuid,
  p_status text,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_event public.hr_employee_events%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.hr_helpdesk_is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_status NOT IN ('open', 'waiting', 'in_progress', 'resolved') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'invalid reason';
  END IF;

  SELECT * INTO v_event
  FROM public.hr_employee_events
  WHERE id = p_event_id AND event_type = 'helpdesk_request';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  v_payload := COALESCE(v_event.payload, '{}'::jsonb) || jsonb_build_object('status', p_status);
  IF COALESCE(v_event.payload->>'status', 'open') = 'resolved' AND p_status <> 'resolved' THEN
    v_payload := v_payload || jsonb_build_object('resolutionAnchor', now());
  END IF;

  UPDATE public.hr_employee_events
  SET payload = v_payload
  WHERE id = p_event_id;

  INSERT INTO public.hr_helpdesk_history (event_id, actor_id, actor_name, kind, detail)
  VALUES (
    p_event_id,
    auth.uid(),
    public.hr_helpdesk_actor_name(),
    'status',
    jsonb_build_object('status', p_status, 'reason', v_reason)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_set_assignee(
  p_event_id uuid,
  p_assignee uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_event public.hr_employee_events%ROWTYPE;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.hr_helpdesk_is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_event
  FROM public.hr_employee_events
  WHERE id = p_event_id AND event_type = 'helpdesk_request';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF p_assignee IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff WHERE id = p_assignee AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'employee not found';
  END IF;

  UPDATE public.hr_employee_events
  SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
    'assigneeStaffId', CASE WHEN p_assignee IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_assignee) END
  )
  WHERE id = p_event_id;

  IF p_assignee IS NULL THEN
    INSERT INTO public.hr_helpdesk_history (event_id, actor_id, actor_name, kind, detail)
    VALUES (p_event_id, auth.uid(), public.hr_helpdesk_actor_name(), 'unassigned', '{}'::jsonb);
  ELSE
    SELECT full_name INTO v_name FROM public.staff WHERE id = p_assignee;
    INSERT INTO public.hr_helpdesk_history (event_id, actor_id, actor_name, kind, detail)
    VALUES (
      p_event_id,
      auth.uid(),
      public.hr_helpdesk_actor_name(),
      'assigned',
      jsonb_build_object('assigneeStaffId', p_assignee, 'assigneeName', COALESCE(v_name, ''))
    );
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_set_confidential(
  p_event_id uuid,
  p_confidential boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.hr_helpdesk_is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_employee_events
    WHERE id = p_event_id AND event_type = 'helpdesk_request'
  ) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  UPDATE public.hr_employee_events
  SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('confidential', p_confidential)
  WHERE id = p_event_id;

  INSERT INTO public.hr_helpdesk_history (event_id, actor_id, actor_name, kind, detail)
  VALUES (
    p_event_id,
    auth.uid(),
    public.hr_helpdesk_actor_name(),
    CASE WHEN p_confidential THEN 'confidential' ELSE 'public' END,
    '{}'::jsonb
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_helpdesk_read_case(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_event public.hr_employee_events%ROWTYPE;
  v_staff_name text;
  v_staff_code text;
  v_handler_name text;
  v_messages jsonb;
  v_history jsonb;
  v_first int;
  v_resolution int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.hr_helpdesk_can_view(p_event_id) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT * INTO v_event
  FROM public.hr_employee_events
  WHERE id = p_event_id AND event_type = 'helpdesk_request';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT full_name, employee_code INTO v_staff_name, v_staff_code
  FROM public.staff WHERE id = v_event.staff_id;

  IF COALESCE(v_event.payload->>'assigneeStaffId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT full_name INTO v_handler_name
    FROM public.staff
    WHERE id = (v_event.payload->>'assigneeStaffId')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'authorName', m.author_name,
      'body', m.body,
      'visibility', m.visibility,
      'createdAt', m.created_at,
      'attachment', m.attachment
    ) ORDER BY m.created_at ASC
  ), '[]'::jsonb)
  INTO v_messages
  FROM public.hr_helpdesk_messages m
  WHERE m.event_id = p_event_id
    AND (m.visibility = 'public' OR public.hr_helpdesk_is_manager());

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'actorName', h.actor_name,
      'kind', h.kind,
      'detail', h.detail,
      'createdAt', h.created_at
    ) ORDER BY h.created_at ASC
  ), '[]'::jsonb)
  INTO v_history
  FROM public.hr_helpdesk_history h
  WHERE h.event_id = p_event_id
    AND (h.kind <> 'internal_note' OR public.hr_helpdesk_is_manager());

  SELECT first_response_hours, resolution_hours INTO v_first, v_resolution
  FROM public.hr_helpdesk_settings
  LIMIT 1;

  RETURN jsonb_build_object(
    'id', v_event.id,
    'staffId', v_event.staff_id,
    'staffName', v_staff_name,
    'employeeCode', v_staff_code,
    'createdAt', v_event.created_at,
    'payload', v_event.payload,
    'handlerName', v_handler_name,
    'messages', v_messages,
    'history', v_history,
    'settingsFirstResponseHours', v_first,
    'settingsResolutionHours', v_resolution,
    'canManage', public.hr_helpdesk_is_manager()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.hr_helpdesk_is_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_my_staff_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_actor_name() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_can_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_stamp_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_clean_attachment(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_create_request(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_reply(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_set_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_set_assignee(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_set_confidential(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_helpdesk_read_case(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hr_helpdesk_is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_helpdesk_can_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_helpdesk_create_request(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_helpdesk_reply(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_helpdesk_set_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_helpdesk_set_assignee(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_helpdesk_set_confidential(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_helpdesk_read_case(uuid) TO authenticated;
