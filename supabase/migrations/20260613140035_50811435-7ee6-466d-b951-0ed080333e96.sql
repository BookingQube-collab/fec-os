
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS clock_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS clock_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS swap_requested_for uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS swap_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_shifts_user_window ON public.shifts(user_id, starts_at);

-- create_shift
CREATE OR REPLACE FUNCTION public.create_shift(
  _location_id uuid, _user_id uuid, _starts_at timestamptz, _ends_at timestamptz,
  _role_label text DEFAULT NULL, _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _ends_at <= _starts_at THEN RAISE EXCEPTION 'invalid window'; END IF;
  INSERT INTO public.shifts (location_id, user_id, starts_at, ends_at, role_label, notes, status)
  VALUES (_location_id, _user_id, _starts_at, _ends_at, _role_label, _notes, 'scheduled')
  RETURNING id INTO _id;
  PERFORM public.log_audit('shift.created','shifts',_id,_location_id,NULL,
    jsonb_build_object('user_id',_user_id,'starts_at',_starts_at,'ends_at',_ends_at), NULL,'{}'::jsonb);
  RETURN _id;
END; $$;

-- cancel_shift
CREATE OR REPLACE FUNCTION public.cancel_shift(_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.shifts WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.shifts SET status = 'cancelled' WHERE id = _id;
  PERFORM public.log_audit('shift.cancelled','shifts',_id,_row.location_id, to_jsonb(_row),
    jsonb_build_object('status','cancelled'), _reason, '{}'::jsonb);
END; $$;

-- clock_in
CREATE OR REPLACE FUNCTION public.clock_in_shift(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.shifts WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _row.user_id IS NOT NULL AND _row.user_id <> auth.uid()
     AND public.current_user_role_level() < 60 THEN
    RAISE EXCEPTION 'cannot clock in another user';
  END IF;
  IF _row.clock_in_at IS NOT NULL THEN RAISE EXCEPTION 'already clocked in'; END IF;
  UPDATE public.shifts SET clock_in_at = now(), status = 'in_progress' WHERE id = _id;
  PERFORM public.log_audit('shift.clock_in','shifts',_id,_row.location_id, NULL,
    jsonb_build_object('clock_in_at', now()), NULL, '{}'::jsonb);
END; $$;

-- clock_out
CREATE OR REPLACE FUNCTION public.clock_out_shift(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.shifts WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _row.user_id IS NOT NULL AND _row.user_id <> auth.uid()
     AND public.current_user_role_level() < 60 THEN
    RAISE EXCEPTION 'cannot clock out another user';
  END IF;
  IF _row.clock_in_at IS NULL THEN RAISE EXCEPTION 'not clocked in'; END IF;
  IF _row.clock_out_at IS NOT NULL THEN RAISE EXCEPTION 'already clocked out'; END IF;
  UPDATE public.shifts SET clock_out_at = now(), status = 'completed' WHERE id = _id;
  PERFORM public.log_audit('shift.clock_out','shifts',_id,_row.location_id, NULL,
    jsonb_build_object('clock_out_at', now()), NULL, '{}'::jsonb);
END; $$;

-- request_shift_swap
CREATE OR REPLACE FUNCTION public.request_shift_swap(_id uuid, _to_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.shifts WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _row.user_id IS DISTINCT FROM auth.uid() AND public.current_user_role_level() < 60 THEN
    RAISE EXCEPTION 'only owner or manager can request swap';
  END IF;
  UPDATE public.shifts
    SET swap_requested_for = _to_user, swap_requested_at = now()
    WHERE id = _id;
  PERFORM public.log_audit('shift.swap_requested','shifts',_id,_row.location_id, NULL,
    jsonb_build_object('to_user', _to_user), NULL, '{}'::jsonb);
END; $$;

-- approve_shift_swap (manager)
CREATE OR REPLACE FUNCTION public.approve_shift_swap(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.shifts WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.current_user_role_level() < 60 THEN RAISE EXCEPTION 'manager required'; END IF;
  IF _row.swap_requested_for IS NULL THEN RAISE EXCEPTION 'no swap pending'; END IF;
  UPDATE public.shifts
    SET user_id = _row.swap_requested_for,
        swap_requested_for = NULL,
        swap_requested_at = NULL
    WHERE id = _id;
  PERFORM public.log_audit('shift.swap_approved','shifts',_id,_row.location_id, to_jsonb(_row),
    jsonb_build_object('user_id', _row.swap_requested_for), NULL, '{}'::jsonb);
END; $$;

-- complete_training
CREATE OR REPLACE FUNCTION public.complete_training(_id uuid, _score integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  SELECT * INTO _row FROM public.training_enrollments WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.user_can_access_location(_row.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.training_enrollments
    SET status = 'completed', completed_on = now()::date, score = COALESCE(_score, score)
    WHERE id = _id;
  PERFORM public.log_audit('training.completed','training_enrollments',_id,_row.location_id,
    to_jsonb(_row), jsonb_build_object('completed_on', now()::date,'score',_score), NULL, '{}'::jsonb);
END; $$;
