-- Clear Security Advisor ERROR: Security Definer View on public.chat_messages_visible.
--
-- Keep column revoke on chat_messages.body/metadata. Masking moves into a
-- SECURITY DEFINER helper; the view itself runs as the invoker so splinter no
-- longer flags it. Membership stays enforced by chat_messages RLS plus the
-- view WHERE (needed when service_role bypasses RLS). Predicate pushdown on
-- conversation_id / id still hits chat_messages.

CREATE OR REPLACE FUNCTION public.chat_visible_message_content(p_message_id uuid)
RETURNS TABLE (body text, metadata jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN m.content_hidden THEN NULL
      WHEN m.deletion_scope = 'SELF' AND m.deleted_by IS NOT DISTINCT FROM auth.uid() THEN NULL
      ELSE m.body
    END,
    CASE
      WHEN m.content_hidden THEN '{}'::jsonb
      WHEN m.deletion_scope = 'SELF' AND m.deleted_by IS NOT DISTINCT FROM auth.uid() THEN '{}'::jsonb
      ELSE m.metadata
    END
  FROM public.chat_messages m
  WHERE m.id = p_message_id
    AND public.chat_is_active_member(m.conversation_id);
$$;

COMMENT ON FUNCTION public.chat_visible_message_content(uuid) IS
  'Returns masked body/metadata for one message. Requires active membership. Used by chat_messages_visible; authenticated still has no SELECT on chat_messages.body/metadata.';

REVOKE ALL ON FUNCTION public.chat_visible_message_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_visible_message_content(uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.chat_messages_visible
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  m.id,
  m.conversation_id,
  m.sender_id,
  m.client_message_id,
  m.type,
  v.body,
  v.metadata,
  m.reply_to_message_id,
  m.thread_root_message_id,
  m.forwarded_from_message_id,
  m.created_at,
  m.updated_at,
  m.edited_at,
  m.deleted_at,
  m.deleted_by,
  m.deletion_scope,
  m.content_hidden
FROM public.chat_messages m
LEFT JOIN LATERAL public.chat_visible_message_content(m.id) v ON true
WHERE public.chat_is_active_member(m.conversation_id);

COMMENT ON VIEW public.chat_messages_visible IS
  'Invoker view over chat_messages with masked body/metadata via chat_visible_message_content. Authenticated cannot SELECT body/metadata on chat_messages. content_hidden nulls body and metadata for everyone; SELF delete does that only for deleted_by. Membership via RLS + WHERE.';

REVOKE ALL ON public.chat_messages_visible FROM PUBLIC, anon;
GRANT SELECT ON public.chat_messages_visible TO authenticated, service_role;
