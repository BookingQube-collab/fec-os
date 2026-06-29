
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE POLICY "ticket_photos_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'ticket-photos');

CREATE POLICY "ticket_photos_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-photos');

CREATE POLICY "ticket_photos_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'ticket-photos' AND public.current_user_role_level() >= 80);
