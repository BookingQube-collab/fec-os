-- Chat Hub phase 7: private attachment bucket, membership-scoped storage read,
-- and the only app path that may mark an attachment SKIPPED.
--
-- Does not drop unrelated objects, publish chat_messages.body or metadata,
-- disable RLS, or grant anything to anon.
-- Authenticated users cannot INSERT storage objects. The server writes with
-- the service role after MIME, magic-byte, and size checks. A user JWT upload
-- would skip those checks, so there is no INSERT policy.
-- SELECT requires an attachment row the caller can already see: active member
-- and (uploader or scan_status CLEAN/SKIPPED). PENDING and REJECTED stay
-- uploader-only, matching chat_attachments_select.
--
-- chat_tg_attachments_auth rejects scan_status changes unless the caller is
-- privileged. This function checks ownership, PENDING, membership, and
-- chat_can_attach, then sets the JWT role claim only for that update and
-- restores it. It never sets CLEAN.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS chat_attachments_storage_select ON storage.objects;
CREATE POLICY chat_attachments_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.chat_attachments a
      WHERE a.storage_bucket = bucket_id
        AND a.storage_path = name
        AND public.chat_user_is_active_member(a.conversation_id, auth.uid())
        AND (
          a.created_by = auth.uid()
          OR a.scan_status IN ('CLEAN', 'SKIPPED')
        )
    )
  );

CREATE OR REPLACE FUNCTION public.chat_mark_attachment_skipped(attachment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  attachment public.chat_attachments%ROWTYPE;
  prev_role text;
  prev_claims text;
  elevated boolean := false;
  updated_count integer := 0;
BEGIN
  IF attachment_id IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'attachment not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO attachment
  FROM public.chat_attachments
  WHERE id = attachment_id;

  IF NOT FOUND OR attachment.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'attachment not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF attachment.scan_status = 'SKIPPED' THEN
    RETURN;
  END IF;

  IF attachment.scan_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'attachment is not pending'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.chat_is_active_member(attachment.conversation_id)
     OR NOT public.chat_can_attach(attachment.conversation_id) THEN
    RAISE EXCEPTION 'cannot attach'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  prev_role := current_setting('request.jwt.claim.role', true);
  prev_claims := current_setting('request.jwt.claims', true);
  elevated := true;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  IF prev_claims IS NOT NULL AND btrim(prev_claims) <> '' THEN
    PERFORM set_config(
      'request.jwt.claims',
      jsonb_set(prev_claims::jsonb, '{role}', '"service_role"'::jsonb, true)::text,
      true
    );
  END IF;
  elevated := true;

  UPDATE public.chat_attachments
  SET scan_status = 'SKIPPED'
  WHERE id = attachment.id
    AND created_by = auth.uid()
    AND scan_status = 'PENDING';
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  PERFORM set_config('request.jwt.claim.role', coalesce(prev_role, ''), true);
  IF prev_claims IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', prev_claims, true);
  END IF;
  elevated := false;

  IF updated_count > 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.chat_attachments
    WHERE id = attachment.id
      AND created_by = auth.uid()
      AND scan_status = 'SKIPPED'
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'attachment is not pending'
    USING ERRCODE = 'check_violation';
EXCEPTION
  WHEN OTHERS THEN
    IF elevated THEN
      PERFORM set_config('request.jwt.claim.role', coalesce(prev_role, ''), true);
      IF prev_claims IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims', prev_claims, true);
      END IF;
    END IF;
    RAISE;
END;
$fn$;

COMMENT ON FUNCTION public.chat_mark_attachment_skipped(uuid) IS
  'Sets scan_status to SKIPPED for the caller''s own PENDING attachment when membership and chat_can_attach still hold. The app calls this only when CHAT_ATTACHMENT_SCAN_WEBHOOK is unset. CLEAN stays service-role only. No file bytes are sent anywhere.';

REVOKE ALL ON FUNCTION public.chat_mark_attachment_skipped(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_mark_attachment_skipped(uuid) TO authenticated, service_role;
