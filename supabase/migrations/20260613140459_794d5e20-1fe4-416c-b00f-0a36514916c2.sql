
CREATE OR REPLACE FUNCTION public.create_leakage_case(
  _location_id uuid, _category text, _hypothesis text DEFAULT NULL, _estimated_loss numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce(length(_category),0) = 0 THEN RAISE EXCEPTION 'category required'; END IF;
  INSERT INTO public.leakage_cases (location_id, category, hypothesis, estimated_loss, owner_id)
  VALUES (_location_id, _category, _hypothesis, _estimated_loss, auth.uid())
  RETURNING id INTO _id;
  PERFORM public.log_audit('leakage.opened','leakage_cases',_id,_location_id, NULL,
    jsonb_build_object('category',_category,'estimated_loss',_estimated_loss),
    _hypothesis, '{}'::jsonb);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_leakage_status(
  _id uuid, _status leakage_status, _recovered_amount numeric DEFAULT NULL,
  _root_cause text DEFAULT NULL, _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.leakage_cases WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.leakage_cases
    SET status = _status,
        recovered_amount = COALESCE(_recovered_amount, recovered_amount),
        root_cause = COALESCE(_root_cause, root_cause),
        closed_at = CASE WHEN _status IN ('recovered','dismissed') THEN now() ELSE closed_at END
    WHERE id = _id;

  PERFORM public.log_audit(
    'leakage.status_changed','leakage_cases',_id,_row.location_id,
    to_jsonb(_row),
    jsonb_build_object('status',_status,'recovered_amount',_recovered_amount,'root_cause',_root_cause),
    _reason, '{}'::jsonb);
END; $$;
