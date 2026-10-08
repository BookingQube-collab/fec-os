-- Close the quarantine bypass on chat_mark_attachment_skipped.
--
-- Phase 7 let signed-in users execute the function and elevated the JWT role claim
-- so the scan-status trigger would allow SKIPPED. A member who
-- can attach could call the function on their own PENDING row and publish the
-- file even when a scan webhook is configured. Postgres cannot see that env var.
--
-- This replaces only that function. It does not drop the bucket, publish
-- chat_messages body or metadata, disable RLS, or grant anon.
--
-- chat_tg_attachments_auth already rejects scan_status changes unless
-- chat_caller_is_privileged() is true (JWT role service_role, or no JWT and
-- session_user is service_role, postgres, or supabase_admin). The service-role
-- client already satisfies that check, so this function does not set a role
-- claim and does not widen the trigger. A signed-in user JWT fails the same
-- check before any update.
--
-- The only mutation is PENDING -> SKIPPED for the attachment id passed in.

CREATE OR REPLACE FUNCTION public.chat_mark_attachment_skipped(attachment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  updated_count integer := 0;
BEGIN
  IF NOT public.chat_caller_is_privileged() THEN
    RAISE EXCEPTION 'scan_status changes are service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF attachment_id IS NULL THEN
    RAISE EXCEPTION 'attachment not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.chat_attachments
  SET scan_status = 'SKIPPED'
  WHERE id = attachment_id
    AND scan_status = 'PENDING';
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 1 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.chat_attachments
    WHERE id = attachment_id
      AND scan_status = 'SKIPPED'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_attachments
    WHERE id = attachment_id
  ) THEN
    RAISE EXCEPTION 'attachment not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RAISE EXCEPTION 'attachment is not pending'
    USING ERRCODE = 'check_violation';
END;
$fn$;

COMMENT ON FUNCTION public.chat_mark_attachment_skipped(uuid) IS
  'Service-role only. Sets scan_status from PENDING to SKIPPED for the given attachment id. Does not set a JWT role claim. Does not set CLEAN or REJECTED. The app calls this only when CHAT_ATTACHMENT_SCAN_WEBHOOK is unset.';

REVOKE ALL ON FUNCTION public.chat_mark_attachment_skipped(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_mark_attachment_skipped(uuid) TO service_role;
