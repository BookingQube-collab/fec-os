
-- 1. Surge mode on locations
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS surge_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surge_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS surge_started_by uuid,
  ADD COLUMN IF NOT EXISTS surge_reason text;

-- 2. Handovers ledger
CREATE TABLE IF NOT EXISTS public.handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  from_user uuid,
  to_user uuid,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL DEFAULT now(),
  digest jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_handovers_loc ON public.handovers(location_id, signed_at DESC);

GRANT SELECT, INSERT ON public.handovers TO authenticated;
GRANT ALL ON public.handovers TO service_role;

ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handovers_select_scoped" ON public.handovers FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));
CREATE POLICY "handovers_insert_scoped" ON public.handovers FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location(location_id));

-- 3. Toggle surge RPC
CREATE OR REPLACE FUNCTION public.toggle_surge_mode(_location_id uuid, _enable boolean, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _before jsonb;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT to_jsonb(l) INTO _before FROM public.locations l WHERE id = _location_id;
  UPDATE public.locations
    SET surge_mode = _enable,
        surge_started_at = CASE WHEN _enable THEN now() ELSE NULL END,
        surge_started_by = CASE WHEN _enable THEN auth.uid() ELSE NULL END,
        surge_reason = CASE WHEN _enable THEN _reason ELSE NULL END
    WHERE id = _location_id;
  PERFORM public.log_audit(
    CASE WHEN _enable THEN 'occ.surge_enabled' ELSE 'occ.surge_disabled' END,
    'locations', _location_id, _location_id, _before,
    jsonb_build_object('surge_mode', _enable, 'reason', _reason), _reason, '{}'::jsonb);
END; $$;

-- 4. Submit handover RPC
CREATE OR REPLACE FUNCTION public.submit_handover(
  _location_id uuid, _to_user uuid, _window_start timestamptz, _digest jsonb, _notes text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.handovers (location_id, from_user, to_user, window_start, digest, notes)
  VALUES (_location_id, auth.uid(), _to_user, _window_start, COALESCE(_digest,'{}'::jsonb), _notes)
  RETURNING id INTO _id;
  PERFORM public.log_audit('occ.handover_signed','handovers',_id,_location_id, NULL,
    jsonb_build_object('to_user',_to_user,'window_start',_window_start), _notes, '{}'::jsonb);
  RETURN _id;
END; $$;
