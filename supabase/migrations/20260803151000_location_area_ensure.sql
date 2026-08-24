-- Case-insensitive location area uniqueness + ensure helper for form "Other"

ALTER TABLE public.location_areas
  DROP CONSTRAINT IF EXISTS location_areas_location_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS location_areas_location_name_ci_unique
  ON public.location_areas (location_id, lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.ensure_location_area(p_location_id uuid, p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_existing text;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'Location is required';
  END IF;
  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'Area name is required';
  END IF;
  IF lower(v_trimmed) = 'other' THEN
    RAISE EXCEPTION 'Enter a custom area name instead of Other';
  END IF;
  IF NOT public.user_can_access_location(p_location_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT a.name INTO v_existing
  FROM public.location_areas a
  WHERE a.location_id = p_location_id
    AND lower(btrim(a.name)) = lower(v_trimmed)
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.location_areas
    SET is_active = true
    WHERE location_id = p_location_id
      AND lower(btrim(name)) = lower(v_trimmed)
      AND is_active IS DISTINCT FROM true;
    RETURN v_existing;
  END IF;

  INSERT INTO public.location_areas (location_id, name, sort_order, is_active)
  VALUES (p_location_id, v_trimmed, 500, true)
  RETURNING name INTO v_existing;
  RETURN v_existing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_location_area(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_location_area(uuid, text) TO service_role;
