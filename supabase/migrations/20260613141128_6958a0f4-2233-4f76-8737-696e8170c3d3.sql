
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS ai_triage jsonb;

CREATE OR REPLACE FUNCTION public.create_complaint(
  _location_id uuid, _channel text, _severity text, _category text,
  _summary text, _guest_name text DEFAULT NULL, _guest_contact text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.complaints(location_id, channel, severity, category, summary, guest_name, guest_contact, status)
    VALUES (_location_id, _channel, _severity, _category, _summary, _guest_name, _guest_contact, 'new')
    RETURNING id INTO _id;
  PERFORM public.log_audit('complaint.created','complaints',_id,_location_id, NULL,
    jsonb_build_object('channel',_channel,'severity',_severity,'category',_category,'summary',_summary), NULL,'{}'::jsonb);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_complaint(_id uuid, _notes text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.complaints WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.complaints SET status='resolved', resolution_notes=_notes, resolved_at=now() WHERE id=_id;
  PERFORM public.log_audit('complaint.resolved','complaints',_id,_row.location_id,to_jsonb(_row),
    jsonb_build_object('status','resolved','resolution_notes',_notes),_reason,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.update_complaint_status(_id uuid, _status complaint_status, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.complaints WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.complaints SET status=_status WHERE id=_id;
  PERFORM public.log_audit('complaint.status_changed','complaints',_id,_row.location_id,to_jsonb(_row),
    jsonb_build_object('status',_status),_reason,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.save_complaint_triage(_id uuid, _triage jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.complaints WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.complaints SET ai_triage=_triage WHERE id=_id;
  PERFORM public.log_audit('complaint.triaged','complaints',_id,_row.location_id,
    jsonb_build_object('previous_triage',_row.ai_triage), _triage, NULL, '{}'::jsonb);
END; $$;
