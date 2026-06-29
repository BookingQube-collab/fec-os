DROP POLICY IF EXISTS "Authenticated users can insert kb_chunks" ON public.kb_chunks;
DROP POLICY IF EXISTS "Authenticated users can delete kb_chunks" ON public.kb_chunks;

CREATE POLICY "Users can insert chunks for own documents"
  ON public.kb_chunks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.kb_documents d
    WHERE d.id = kb_chunks.document_id
      AND (d.created_by = auth.uid() OR public.current_user_role_level() >= 80)
  ));

CREATE POLICY "Users can delete chunks for own documents"
  ON public.kb_chunks FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kb_documents d
    WHERE d.id = kb_chunks.document_id
      AND (d.created_by = auth.uid() OR public.current_user_role_level() >= 80)
  ));

CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  title text,
  source text,
  similarity float
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT c.id, c.document_id, c.chunk_index, c.content, d.title, d.source,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.kb_chunks c
  JOIN public.kb_documents d ON d.id = c.document_id
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;