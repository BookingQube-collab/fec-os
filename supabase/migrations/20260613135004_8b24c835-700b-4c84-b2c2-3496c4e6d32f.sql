
CREATE POLICY "task-photos read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-photos');
CREATE POLICY "task-photos write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-photos');
