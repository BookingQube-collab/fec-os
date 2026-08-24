-- ============================================================
-- Event documents: BOQ, permits, and project files
-- Extends event_documents so required placeholders can exist
-- without a file, then persist real uploads in storage.
-- ============================================================

ALTER TABLE public.event_documents
  DROP CONSTRAINT IF EXISTS event_documents_has_ref;

ALTER TABLE public.event_documents
  DROP CONSTRAINT IF EXISTS event_documents_doc_type_check;

ALTER TABLE public.event_documents
  ADD CONSTRAINT event_documents_doc_type_check
  CHECK (doc_type IN (
    'boq', 'permit', 'drawing', 'floor_plan', 'contract',
    'insurance', 'photo', 'manual', 'other'
  ));

ALTER TABLE public.event_documents
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_mime text,
  ADD COLUMN IF NOT EXISTS owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wbs_id uuid REFERENCES public.event_wbs_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;

ALTER TABLE public.event_documents
  DROP CONSTRAINT IF EXISTS event_documents_status_check;

ALTER TABLE public.event_documents
  ADD CONSTRAINT event_documents_status_check
  CHECK (status IN ('missing', 'uploaded', 'waived'));

CREATE INDEX IF NOT EXISTS idx_event_documents_event_status
  ON public.event_documents (event_id, status)
  WHERE deleted_at IS NULL;

UPDATE public.event_documents
SET status = 'uploaded'
WHERE deleted_at IS NULL
  AND status = 'missing'
  AND (file_path IS NOT NULL OR url IS NOT NULL);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-documents',
  'event-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "event_documents_storage_read" ON storage.objects;
CREATE POLICY "event_documents_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'event-documents');

DROP POLICY IF EXISTS "event_documents_storage_insert" ON storage.objects;
CREATE POLICY "event_documents_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-documents');

DROP POLICY IF EXISTS "event_documents_storage_update" ON storage.objects;
CREATE POLICY "event_documents_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'event-documents')
  WITH CHECK (bucket_id = 'event-documents');

DROP POLICY IF EXISTS "event_documents_storage_delete" ON storage.objects;
CREATE POLICY "event_documents_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-documents' AND public.current_user_role_level() >= 50);

INSERT INTO public.event_documents (event_id, title, doc_type, required, status)
SELECT e.id, 'Bill of quantities', 'boq', true, 'missing'
FROM public.events e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_documents d
    WHERE d.event_id = e.id AND d.deleted_at IS NULL AND d.doc_type = 'boq'
  );

INSERT INTO public.event_documents (event_id, title, doc_type, required, status)
SELECT e.id, 'Venue permit', 'permit', true, 'missing'
FROM public.events e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_documents d
    WHERE d.event_id = e.id AND d.deleted_at IS NULL AND d.doc_type = 'permit'
  );
