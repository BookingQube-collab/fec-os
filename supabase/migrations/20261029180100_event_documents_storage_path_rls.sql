-- ============================================================
-- Phase 0c — event-documents storage path scoping
-- Object paths must be `{event_id}/...` (UUID first segment).
-- Access ties to user_can_access_event + events.view / events.edit.
--
-- Pre-check (run on staging before apply):
--   SELECT name FROM storage.objects
--   WHERE bucket_id = 'event-documents'
--     AND (storage.foldername(name))[1] !~* '^[0-9a-f-]{36}$';
-- Objects with non-UUID first segments (legacy seed paths like
-- `events/EVT-...`) will become inaccessible after apply until
-- re-uploaded under `{event_id}/...`.
--
-- Rollback (manual)
-- -----------------
-- DROP POLICY IF EXISTS event_documents_storage_*;
-- Recreate bucket-wide policies from
--   20260823160000_event_documents_boq_permits.sql
-- DROP FUNCTION IF EXISTS public.event_document_path_event_id(text);
-- DROP FUNCTION IF EXISTS public.user_can_read_event_document_object(text);
-- DROP FUNCTION IF EXISTS public.user_can_write_event_document_object(text);
-- ============================================================

CREATE OR REPLACE FUNCTION public.event_document_path_event_id(_object_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seg text;
  eid uuid;
BEGIN
  seg := (storage.foldername(_object_name))[1];
  IF seg IS NULL OR seg !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  eid := seg::uuid;
  RETURN eid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_event_document_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = public.event_document_path_event_id(_object_name)
      AND public.user_can_access_location(e.location_id)
      AND public.events_capability_allows('events.view')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_write_event_document_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = public.event_document_path_event_id(_object_name)
      AND public.user_can_access_location(e.location_id)
      AND public.events_capability_allows('events.edit')
  );
$$;

GRANT EXECUTE ON FUNCTION public.event_document_path_event_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_read_event_document_object(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_write_event_document_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "event_documents_storage_read" ON storage.objects;
CREATE POLICY "event_documents_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'event-documents'
    AND public.user_can_read_event_document_object(name)
  );

DROP POLICY IF EXISTS "event_documents_storage_insert" ON storage.objects;
CREATE POLICY "event_documents_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-documents'
    AND public.user_can_write_event_document_object(name)
  );

DROP POLICY IF EXISTS "event_documents_storage_update" ON storage.objects;
CREATE POLICY "event_documents_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-documents'
    AND public.user_can_write_event_document_object(name)
  )
  WITH CHECK (
    bucket_id = 'event-documents'
    AND public.user_can_write_event_document_object(name)
  );

DROP POLICY IF EXISTS "event_documents_storage_delete" ON storage.objects;
CREATE POLICY "event_documents_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-documents'
    AND public.user_can_write_event_document_object(name)
  );
