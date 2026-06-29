
CREATE OR REPLACE FUNCTION public.create_booking(
  _location_id uuid, _kind booking_kind, _contact_name text, _party_size int,
  _starts_at timestamptz,
  _contact_email text DEFAULT NULL, _contact_phone text DEFAULT NULL,
  _ends_at timestamptz DEFAULT NULL, _quote_amount numeric DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid; _ref text;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _ref := 'BK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  INSERT INTO public.bookings(location_id, reference, kind, contact_name, contact_email, contact_phone, party_size, starts_at, ends_at, quote_amount, notes, status, created_by)
    VALUES (_location_id, _ref, _kind, _contact_name, _contact_email, _contact_phone, _party_size, _starts_at, _ends_at, _quote_amount, _notes, 'quote', auth.uid())
    RETURNING id INTO _id;
  PERFORM public.log_audit('booking.created','bookings',_id,_location_id, NULL,
    jsonb_build_object('reference',_ref,'kind',_kind,'party_size',_party_size,'starts_at',_starts_at,'quote_amount',_quote_amount), NULL, '{}'::jsonb);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_booking_status(
  _id uuid, _status booking_status,
  _deposit_amount numeric DEFAULT NULL, _total_amount numeric DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.bookings WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.bookings SET
    status=_status,
    deposit_amount=COALESCE(_deposit_amount, deposit_amount),
    total_amount=COALESCE(_total_amount, total_amount)
    WHERE id=_id;
  PERFORM public.log_audit('booking.status_changed','bookings',_id,_row.location_id,to_jsonb(_row),
    jsonb_build_object('status',_status,'deposit_amount',_deposit_amount,'total_amount',_total_amount),_reason,'{}'::jsonb);
END; $$;
