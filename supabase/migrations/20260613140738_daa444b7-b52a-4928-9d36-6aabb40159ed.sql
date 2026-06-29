
-- close_incident RPC
CREATE OR REPLACE FUNCTION public.close_incident(_id uuid, _root_cause text, _actions text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.incidents WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.incidents SET status='closed', closed_at=now(), rca_root_cause=_root_cause, rca_actions=_actions WHERE id=_id;
  PERFORM public.log_audit('incident.closed','incidents',_id,_row.location_id,to_jsonb(_row),
    jsonb_build_object('status','closed','rca_root_cause',_root_cause,'rca_actions',_actions),_reason,'{}'::jsonb);
END; $$;

-- update_finding_status RPC
CREATE OR REPLACE FUNCTION public.update_finding_status(_id uuid, _status finding_status, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.findings WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.findings SET status=_status,
    closed_at=CASE WHEN _status='closed' THEN now() ELSE closed_at END
    WHERE id=_id;
  PERFORM public.log_audit('finding.status_changed','findings',_id,_row.location_id,to_jsonb(_row),
    jsonb_build_object('status',_status),_reason,'{}'::jsonb);
END; $$;

-- update_obligation_status RPC
CREATE OR REPLACE FUNCTION public.update_obligation_status(_id uuid, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.obligations WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.obligations SET status=_status WHERE id=_id;
  PERFORM public.log_audit('obligation.status_changed','obligations',_id,_row.location_id,to_jsonb(_row),
    jsonb_build_object('status',_status),_reason,'{}'::jsonb);
END; $$;

-- respond_mall_request RPC
CREATE OR REPLACE FUNCTION public.respond_mall_request(_id uuid, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.mall_requests WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.mall_requests SET status=_status,
    responded_at=CASE WHEN _status IN ('responded','closed') AND responded_at IS NULL THEN now() ELSE responded_at END
    WHERE id=_id;
  PERFORM public.log_audit('mall_request.status_changed','mall_requests',_id,_row.location_id,to_jsonb(_row),
    jsonb_build_object('status',_status),_reason,'{}'::jsonb);
END; $$;
