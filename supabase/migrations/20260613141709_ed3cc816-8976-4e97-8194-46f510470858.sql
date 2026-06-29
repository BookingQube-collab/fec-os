
CREATE OR REPLACE FUNCTION public.create_purchase_order(
  _location_id uuid, _vendor_name text, _amount numeric,
  _category text DEFAULT NULL, _description text DEFAULT NULL, _currency text DEFAULT 'AED'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid; _num text;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _num := 'PO-' || to_char(now(),'YYMM') || '-' || upper(substr(md5(random()::text), 1, 6));
  INSERT INTO public.purchase_orders(location_id, po_number, vendor_name, category, description, amount, currency, status, requested_by)
    VALUES (_location_id, _num, _vendor_name, _category, _description, _amount, _currency, 'draft', auth.uid())
    RETURNING id INTO _id;
  PERFORM public.log_audit('po.created','purchase_orders',_id,_location_id, NULL,
    jsonb_build_object('po_number',_num,'vendor',_vendor_name,'amount',_amount,'currency',_currency), NULL, '{}'::jsonb);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_po_status(_id uuid, _status po_status, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record; _level int; _max numeric;
BEGIN
  SELECT * INTO _row FROM public.purchase_orders WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF _status = 'approved' THEN
    SELECT public.current_user_role_level() INTO _level;
    _max := CASE
      WHEN _level >= 80 THEN NULL                  -- exec: unlimited
      WHEN _level >= 70 THEN 100000
      WHEN _level >= 60 THEN 20000
      WHEN _level >= 50 THEN 5000
      ELSE 0
    END;
    IF _max IS NOT NULL AND _row.amount > _max THEN
      RAISE EXCEPTION 'approval_limit_exceeded: amount % > limit % for role level %', _row.amount, _max, _level;
    END IF;
    UPDATE public.purchase_orders SET status='approved', approved_by=auth.uid(), approved_at=now() WHERE id=_id;
  ELSIF _status = 'received' THEN
    UPDATE public.purchase_orders SET status='received', received_at=now() WHERE id=_id;
  ELSE
    UPDATE public.purchase_orders SET status=_status WHERE id=_id;
  END IF;

  PERFORM public.log_audit('po.status_changed','purchase_orders',_id,_row.location_id,to_jsonb(_row),
    jsonb_build_object('status',_status,'amount',_row.amount,'approver_level',_level),_reason,'{}'::jsonb);
END; $$;
