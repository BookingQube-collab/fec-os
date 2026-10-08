-- Phase 6: direct-chat "Read" needs the other member's cursor.
-- chat_read_states_select is currently user_id = auth.uid(), so a member
-- cannot see that cursor. This replaces SELECT only. Insert and update stay
-- own-user. supabase_realtime is unchanged.
--
-- Do not apply this file to production from the app. Peer "Read" stays on
-- Sent until this policy is applied by hand.

DROP POLICY IF EXISTS chat_read_states_select ON public.chat_read_states;
CREATE POLICY chat_read_states_select ON public.chat_read_states
  FOR SELECT TO authenticated
  USING (public.chat_is_active_member(conversation_id));
