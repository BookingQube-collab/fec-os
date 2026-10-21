-- Digital signature images for senior staff (opt-in auto-stamp on approval print slips).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS signature_auto_apply boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.signature_url IS
  'Storage path in staff-signatures bucket for the user''s digital signature image.';
COMMENT ON COLUMN public.profiles.signature_auto_apply IS
  'When true, approval print slips stamp this signature after the user approves. Default false (wet-ink).';

ALTER TABLE public.hr_ot_claims
  ADD COLUMN IF NOT EXISTS verified_signer_signature_url text,
  ADD COLUMN IF NOT EXISTS ops_approved_signer_signature_url text,
  ADD COLUMN IF NOT EXISTS gm_approved_signer_signature_url text,
  ADD COLUMN IF NOT EXISTS approved_signer_signature_url text;

COMMENT ON COLUMN public.hr_ot_claims.verified_signer_signature_url IS
  'Snapshot of site supervisor signature storage path at verify time (only when opted in).';
COMMENT ON COLUMN public.hr_ot_claims.ops_approved_signer_signature_url IS
  'Snapshot of Head of Operations signature storage path at ops approve time (only when opted in).';
COMMENT ON COLUMN public.hr_ot_claims.gm_approved_signer_signature_url IS
  'Snapshot of General Manager signature storage path at GM approve time (only when opted in).';
COMMENT ON COLUMN public.hr_ot_claims.approved_signer_signature_url IS
  'Snapshot of HR signature storage path at HR approve time (only when opted in).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-signatures',
  'staff-signatures',
  false,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Own folder only: {user_id}/signature.*
DROP POLICY IF EXISTS staff_signatures_storage_select ON storage.objects;
CREATE POLICY staff_signatures_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS staff_signatures_storage_insert ON storage.objects;
CREATE POLICY staff_signatures_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS staff_signatures_storage_update ON storage.objects;
CREATE POLICY staff_signatures_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS staff_signatures_storage_delete ON storage.objects;
CREATE POLICY staff_signatures_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
