-- Team Chat Ember-parity (Vercel): bots, Slack-style webhooks, AI agents.
-- Messages still live in chat_messages; bots post as creator with metadata.bot.

CREATE TABLE IF NOT EXISTS public.chat_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  avatar_url text,
  webhook_token_hash text NOT NULL,
  webhook_token_prefix text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_bots_name_len_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT chat_bots_prefix_len_chk CHECK (char_length(webhook_token_prefix) BETWEEN 6 AND 16)
);

CREATE TABLE IF NOT EXISTS public.chat_bot_rooms (
  bot_id uuid NOT NULL REFERENCES public.chat_bots(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS public.chat_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mention_key text NOT NULL,
  display_name text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  model_key text,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_agents_mention_chk CHECK (mention_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT chat_agents_name_len_chk CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  CONSTRAINT chat_agents_instructions_len_chk CHECK (char_length(instructions) <= 8000)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_agents_mention_uidx
  ON public.chat_agents (lower(mention_key));

CREATE INDEX IF NOT EXISTS chat_bot_rooms_conversation_idx
  ON public.chat_bot_rooms (conversation_id);

ALTER TABLE public.chat_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_bot_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_agents ENABLE ROW LEVEL SECURITY;

-- Authenticated members with chat.manage_members equivalent is enforced in app;
-- RLS: creators and service role manage; all authenticated can read enabled bots/agents they need for UI.
CREATE POLICY chat_bots_select ON public.chat_bots
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY chat_bots_insert ON public.chat_bots
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY chat_bots_update ON public.chat_bots
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY chat_bots_delete ON public.chat_bots
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY chat_bot_rooms_select ON public.chat_bot_rooms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_bots b
      WHERE b.id = bot_id AND b.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.chat_members m
      WHERE m.conversation_id = chat_bot_rooms.conversation_id
        AND m.user_id = auth.uid()
        AND m.left_at IS NULL
    )
  );

CREATE POLICY chat_bot_rooms_write ON public.chat_bot_rooms
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_bots b
      WHERE b.id = bot_id AND b.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_bots b
      WHERE b.id = bot_id AND b.created_by = auth.uid()
    )
  );

CREATE POLICY chat_agents_select ON public.chat_agents
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY chat_agents_insert ON public.chat_agents
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY chat_agents_update ON public.chat_agents
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY chat_agents_delete ON public.chat_agents
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

COMMENT ON TABLE public.chat_bots IS
  'Incoming Slack-compatible webhook bots for Team Chat (Vercel). Token hash only; plaintext shown once.';
COMMENT ON TABLE public.chat_agents IS
  'Mentionable AI agents for Team Chat; replies via FEC AI providers.';
