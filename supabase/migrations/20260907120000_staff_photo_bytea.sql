-- Staff directory photos stored as binary on the staff row (not Supabase Storage).
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS photo_data bytea,
  ADD COLUMN IF NOT EXISTS photo_mime text,
  ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz;

COMMENT ON COLUMN public.staff.photo_data IS 'Staff directory avatar bytes (jpeg/png/webp). Kept small via client compress.';
COMMENT ON COLUMN public.staff.photo_mime IS 'MIME type for photo_data (image/jpeg|png|webp).';
COMMENT ON COLUMN public.staff.photo_updated_at IS 'When photo_data last changed (null means no photo).';

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_photo_mime_check;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_photo_mime_check
  CHECK (
    photo_mime IS NULL
    OR photo_mime IN ('image/jpeg', 'image/png', 'image/webp')
  );

CREATE INDEX IF NOT EXISTS staff_has_photo_idx
  ON public.staff (id)
  WHERE photo_updated_at IS NOT NULL;

-- Reliable bytea write via base64 (avoids PostgREST hex edge cases). RLS still applies (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.set_staff_photo_bytes(
  _staff_id uuid,
  _photo_base64 text,
  _mime text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF _mime IS NULL OR _mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'Unsupported photo mime';
  END IF;
  IF _photo_base64 IS NULL OR length(_photo_base64) < 32 THEN
    RAISE EXCEPTION 'Photo is empty';
  END IF;
  IF length(_photo_base64) > 280000 THEN
    RAISE EXCEPTION 'Photo exceeds maximum size';
  END IF;

  UPDATE public.staff
  SET
    photo_data = decode(_photo_base64, 'base64'),
    photo_mime = _mime,
    photo_updated_at = now()
  WHERE id = _staff_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_staff_photo_bytes(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_photo_bytes(uuid, text, text) TO service_role;
