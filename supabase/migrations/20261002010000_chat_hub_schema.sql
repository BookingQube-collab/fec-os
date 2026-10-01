-- Chat Hub phase 2: schema, indexes, checks, and deny-by-default RLS.
-- No policies, no realtime publication, no storage bucket, no retention purge.
-- Access is membership. role_level is not an access path and is not stored here.
-- Actors are auth.users. staff_id is an optional display link and is not unique.
-- Do not treat a client-supplied user id as the actor. Later phases must set
-- sender and editor ids from auth.uid().
--
-- postgres major version is not set in supabase/config.toml. Notification
-- preferences use two partial unique indexes instead of UNIQUE NULLS NOT DISTINCT.
-- The chat-attachments bucket is intentionally not created (phase 7).

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text,
  description text,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE RESTRICT,
  sensitive boolean NOT NULL DEFAULT false,
  posting_policy text NOT NULL DEFAULT 'MEMBERS',
  file_policy text NOT NULL DEFAULT 'MEMBERS',
  call_policy text NOT NULL DEFAULT 'MEMBERS',
  retention_policy text NOT NULL DEFAULT 'FOREVER',
  retention_until timestamptz,
  archive_at timestamptz,
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT chat_conversations_kind_chk CHECK (kind IN (
    'DIRECT', 'PUBLIC', 'PRIVATE', 'DEPARTMENT', 'SITE', 'PROJECT',
    'MANAGEMENT', 'ANNOUNCEMENT', 'TEMPORARY'
  )),
  CONSTRAINT chat_conversations_posting_policy_chk CHECK (
    posting_policy IN ('MEMBERS', 'ADMINS_ONLY', 'READ_ONLY')
  ),
  CONSTRAINT chat_conversations_file_policy_chk CHECK (
    file_policy IN ('MEMBERS', 'ADMINS_ONLY', 'DISABLED')
  ),
  CONSTRAINT chat_conversations_call_policy_chk CHECK (
    call_policy IN ('MEMBERS', 'ADMINS_ONLY', 'DISABLED')
  ),
  CONSTRAINT chat_conversations_retention_policy_chk CHECK (
    retention_policy IN ('FOREVER', 'ONE_YEAR', 'TWO_YEARS', 'CUSTOM')
  ),
  -- DIRECT is not a site or department room. Title may be null for every kind.
  CONSTRAINT chat_conversations_direct_scope_chk CHECK (
    kind <> 'DIRECT' OR (location_id IS NULL AND department_id IS NULL)
  ),
  CONSTRAINT chat_conversations_department_scope_chk CHECK (
    kind <> 'DEPARTMENT' OR department_id IS NOT NULL
  ),
  CONSTRAINT chat_conversations_site_scope_chk CHECK (
    kind <> 'SITE' OR location_id IS NOT NULL
  ),
  CONSTRAINT chat_conversations_retention_until_chk CHECK (
    (retention_policy = 'CUSTOM' AND retention_until IS NOT NULL)
    OR (retention_policy <> 'CUSTOM' AND retention_until IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS chat_conversations_location_idx
  ON public.chat_conversations (location_id)
  WHERE location_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_conversations_department_idx
  ON public.chat_conversations (department_id)
  WHERE department_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_conversations_kind_idx
  ON public.chat_conversations (kind)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.chat_conversations IS
  'Chat room. sensitive conversations must be excluded from search in a later phase. retention_until and archive_at are informational; this migration does not purge rows.';

COMMENT ON COLUMN public.chat_conversations.sensitive IS
  'HR or otherwise restricted. Later search must exclude these conversations.';

COMMENT ON COLUMN public.chat_conversations.retention_until IS
  'Informational only when retention_policy is CUSTOM. No purge job.';

-- ---------------------------------------------------------------------------
-- members
-- One row per (conversation, user). Leaving sets left_at. Do not delete the row.
-- Rejoin clears left_at on that same row. The primary key is the single membership.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_members (
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  role text NOT NULL,
  membership_source text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT chat_members_role_chk CHECK (
    role IN ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER', 'READ_ONLY')
  ),
  CONSTRAINT chat_members_source_chk CHECK (
    membership_source IN ('MANUAL', 'DEPARTMENT', 'SITE', 'ROLE', 'SYSTEM')
  ),
  CONSTRAINT chat_members_left_chk CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE INDEX IF NOT EXISTS chat_members_active_user_idx
  ON public.chat_members (user_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_members_active_conversation_idx
  ON public.chat_members (conversation_id)
  WHERE left_at IS NULL;

COMMENT ON TABLE public.chat_members IS
  'Membership is the only chat access path. left_at set means the person left; the row stays. staff_id is display only.';

-- ---------------------------------------------------------------------------
-- one DM per user pair
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_dm_pairs (
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_low uuid NOT NULL REFERENCES auth.users(id),
  user_high uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (user_low, user_high),
  CONSTRAINT chat_dm_pairs_order_chk CHECK (user_low < user_high)
);

COMMENT ON TABLE public.chat_dm_pairs IS
  'One DIRECT conversation per unordered user pair. user_low and user_high are auth.users ids sorted by uuid.';

-- ---------------------------------------------------------------------------
-- messages
-- Soft delete keeps the row and the body. content_hidden is the everyone-delete flag.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  client_message_id uuid,
  type text NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reply_to_message_id uuid REFERENCES public.chat_messages(id),
  thread_root_message_id uuid REFERENCES public.chat_messages(id),
  forwarded_from_message_id uuid REFERENCES public.chat_messages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deletion_scope text,
  content_hidden boolean NOT NULL DEFAULT false,
  CONSTRAINT chat_messages_type_chk CHECK (type IN (
    'TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE_NOTE', 'DOCUMENT', 'SYSTEM',
    'ANNOUNCEMENT', 'POLL', 'EVENT', 'FEC_ENTITY', 'CALL_EVENT'
  )),
  CONSTRAINT chat_messages_body_len_chk CHECK (
    body IS NULL OR char_length(body) <= 8000
  ),
  CONSTRAINT chat_messages_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT chat_messages_deletion_scope_chk CHECK (
    deletion_scope IS NULL OR deletion_scope IN ('SELF', 'EVERYONE')
  ),
  CONSTRAINT chat_messages_delete_shape_chk CHECK (
    (
      deleted_at IS NULL
      AND deleted_by IS NULL
      AND deletion_scope IS NULL
      AND content_hidden = false
    )
    OR (
      deleted_at IS NOT NULL
      AND deletion_scope IS NOT NULL
      AND (
        (deletion_scope = 'EVERYONE' AND content_hidden = true)
        OR (deletion_scope = 'SELF' AND content_hidden = false)
      )
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_message_uidx
  ON public.chat_messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_conversation_keyset_idx
  ON public.chat_messages (conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS chat_messages_sender_created_idx
  ON public.chat_messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_reply_idx
  ON public.chat_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_thread_root_idx
  ON public.chat_messages (thread_root_message_id)
  WHERE thread_root_message_id IS NOT NULL;

COMMENT ON TABLE public.chat_messages IS
  'Plain text only. Deleted rows stay. Body is kept for audit. No view in this phase. Reply, thread, and forward foreign keys use NO ACTION so a hard delete of a message that is still referenced is rejected.';

COMMENT ON COLUMN public.chat_messages.body IS
  'Plain text. No HTML column. Hidden from readers later when content_hidden is true, or for SELF deletes of the sender.';

COMMENT ON COLUMN public.chat_messages.content_hidden IS
  'True only when deletion_scope is EVERYONE. Phase 3 must not expose body when this is true.';

COMMENT ON COLUMN public.chat_messages.client_message_id IS
  'Client idempotency key. Unique per conversation when set.';

COMMENT ON COLUMN public.chat_messages.forwarded_from_message_id IS
  'May point at a message in another conversation. reply_to and thread_root must stay in this conversation.';

-- ---------------------------------------------------------------------------
-- edits, reactions, attachments, mentions, reads, pins, saves, acks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_message_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  previous_body text,
  previous_metadata jsonb,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  edited_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_edits_body_len_chk CHECK (
    previous_body IS NULL OR char_length(previous_body) <= 8000
  ),
  CONSTRAINT chat_message_edits_metadata_obj_chk CHECK (
    previous_metadata IS NULL OR jsonb_typeof(previous_metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS chat_message_edits_message_idx
  ON public.chat_message_edits (message_id, edited_at);

COMMENT ON TABLE public.chat_message_edits IS
  'Previous body and metadata. Writers must insert a row in the same transaction as the message update. This migration does not copy them automatically.';

CREATE TABLE IF NOT EXISTS public.chat_reactions (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT chat_reactions_emoji_chk CHECK (char_length(emoji) BETWEEN 1 AND 32)
);

CREATE INDEX IF NOT EXISTS chat_reactions_conversation_idx
  ON public.chat_reactions (conversation_id);

COMMENT ON COLUMN public.chat_reactions.conversation_id IS
  'Denormalized for later RLS. A trigger keeps it equal to the message conversation.';

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'chat-attachments',
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  scan_status text NOT NULL DEFAULT 'PENDING',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_attachments_bucket_path_key UNIQUE (storage_bucket, storage_path),
  CONSTRAINT chat_attachments_size_chk CHECK (
    byte_size > 0 AND byte_size <= 26214400
  ),
  CONSTRAINT chat_attachments_scan_chk CHECK (
    scan_status IN ('PENDING', 'CLEAN', 'REJECTED', 'SKIPPED')
  ),
  CONSTRAINT chat_attachments_bucket_chk CHECK (
    char_length(storage_bucket) BETWEEN 1 AND 128
  ),
  CONSTRAINT chat_attachments_path_chk CHECK (
    char_length(storage_path) BETWEEN 1 AND 1024
    AND storage_path !~ '(^|/)\.\.(/|$)'
    AND storage_path !~ '\\'
  ),
  CONSTRAINT chat_attachments_filename_chk CHECK (
    char_length(original_filename) BETWEEN 1 AND 255
  ),
  CONSTRAINT chat_attachments_mime_chk CHECK (
    char_length(mime_type) BETWEEN 1 AND 255
  )
);

CREATE INDEX IF NOT EXISTS chat_attachments_conversation_created_idx
  ON public.chat_attachments (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON public.chat_attachments (message_id);

COMMENT ON TABLE public.chat_attachments IS
  'File metadata only. Bucket chat-attachments is not created in this migration. storage_path is the object key, not the user filename. message_id is null until the file is sent. Hard-deleting a message removes its attachment rows; soft delete does not.';

COMMENT ON COLUMN public.chat_attachments.byte_size IS
  'Greater than 0 and at most 26214400 bytes (25 MiB).';

CREATE TABLE IF NOT EXISTS public.chat_mentions (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS chat_mentions_user_idx
  ON public.chat_mentions (mentioned_user_id);

CREATE INDEX IF NOT EXISTS chat_mentions_conversation_idx
  ON public.chat_mentions (conversation_id);

CREATE TABLE IF NOT EXISTS public.chat_read_states (
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_read_states_user_idx
  ON public.chat_read_states (user_id);

CREATE TABLE IF NOT EXISTS public.chat_pins (
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES auth.users(id),
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS chat_pins_message_idx
  ON public.chat_pins (message_id);

CREATE TABLE IF NOT EXISTS public.chat_saved_messages (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS chat_saved_messages_conversation_idx
  ON public.chat_saved_messages (conversation_id);

CREATE INDEX IF NOT EXISTS chat_saved_messages_message_idx
  ON public.chat_saved_messages (message_id);

CREATE TABLE IF NOT EXISTS public.chat_acknowledgements (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_acknowledgements_user_idx
  ON public.chat_acknowledgements (user_id);

CREATE INDEX IF NOT EXISTS chat_acknowledgements_conversation_idx
  ON public.chat_acknowledgements (conversation_id);

-- ---------------------------------------------------------------------------
-- polls
-- A partial unique index cannot enforce one vote per user when allow_multiple
-- is false. chat_tg_poll_vote_single_choice does that. It is SECURITY INVOKER.
-- Phase 3 policies must allow a voter to SELECT the poll row, or the trigger
-- fails closed because it cannot see allow_multiple.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  allow_multiple boolean NOT NULL DEFAULT false,
  anonymous boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_polls_conversation_idx
  ON public.chat_polls (conversation_id);

COMMENT ON TABLE public.chat_polls IS
  'One poll per message. Single-choice votes are enforced by trigger, not by a partial unique index.';

CREATE TABLE IF NOT EXISTS public.chat_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL,
  CONSTRAINT chat_poll_options_label_chk CHECK (
    char_length(label) BETWEEN 1 AND 500 AND char_length(btrim(label)) >= 1
  ),
  CONSTRAINT chat_poll_options_position_chk CHECK (position >= 0),
  CONSTRAINT chat_poll_options_poll_position_key UNIQUE (poll_id, position),
  CONSTRAINT chat_poll_options_poll_id_key UNIQUE (poll_id, id)
);

CREATE TABLE IF NOT EXISTS public.chat_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id, option_id),
  CONSTRAINT chat_poll_votes_option_fk
    FOREIGN KEY (poll_id, option_id)
    REFERENCES public.chat_poll_options (poll_id, id)
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- polymorphic entity links (no FK from entity_id to module tables)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_entity_links_type_chk CHECK (entity_type IN (
    'MAINTENANCE_TICKET', 'PURCHASE_REQUEST', 'INCIDENT', 'TASK', 'ROSTER',
    'ATTENDANCE_ISSUE', 'INVENTORY_REQUEST', 'EMPLOYEE', 'ARCADE_MACHINE',
    'EVENT', 'BIRTHDAY_BOOKING', 'APPROVAL'
  ))
);

CREATE INDEX IF NOT EXISTS chat_entity_links_entity_idx
  ON public.chat_entity_links (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS chat_entity_links_conversation_idx
  ON public.chat_entity_links (conversation_id);

CREATE INDEX IF NOT EXISTS chat_entity_links_message_idx
  ON public.chat_entity_links (message_id);

COMMENT ON COLUMN public.chat_entity_links.entity_id IS
  'Polymorphic id. Not a foreign key. Module tables are not referenced.';

-- ---------------------------------------------------------------------------
-- calls (metadata only; provider NONE means no media)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL,
  started_by uuid NOT NULL REFERENCES auth.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'NONE',
  room_name text,
  recording_enabled boolean NOT NULL DEFAULT false,
  CONSTRAINT chat_calls_kind_chk CHECK (kind IN ('VOICE', 'VIDEO')),
  CONSTRAINT chat_calls_status_chk CHECK (status IN (
    'RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'REJECTED', 'CANCELLED'
  )),
  CONSTRAINT chat_calls_ended_chk CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS chat_calls_conversation_started_idx
  ON public.chat_calls (conversation_id, started_at DESC);

COMMENT ON COLUMN public.chat_calls.provider IS
  'NONE means metadata only. This phase does not connect a media provider.';

CREATE TABLE IF NOT EXISTS public.chat_call_participants (
  call_id uuid NOT NULL REFERENCES public.chat_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz,
  left_at timestamptz,
  outcome text,
  PRIMARY KEY (call_id, user_id),
  CONSTRAINT chat_call_participants_outcome_chk CHECK (
    outcome IS NULL OR outcome IN ('ACCEPTED', 'REJECTED', 'MISSED', 'CANCELLED', 'JOINED')
  ),
  CONSTRAINT chat_call_participants_left_chk CHECK (
    left_at IS NULL OR joined_at IS NULL OR left_at >= joined_at
  )
);

CREATE INDEX IF NOT EXISTS chat_call_participants_user_idx
  ON public.chat_call_participants (user_id);

-- ---------------------------------------------------------------------------
-- append-only audit
-- Stricter than pr_audit_logs (no authenticated insert policy).
-- Same privilege shape as attendance_correction_approvals: service_role only.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_audit_logs_event_chk CHECK (char_length(btrim(event_type)) BETWEEN 1 AND 80),
  CONSTRAINT chat_audit_logs_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS chat_audit_logs_conversation_created_idx
  ON public.chat_audit_logs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_audit_logs_created_idx
  ON public.chat_audit_logs (created_at DESC);

COMMENT ON TABLE public.chat_audit_logs IS
  'Append-only. No updated_at. UPDATE, DELETE, and TRUNCATE are rejected by trigger, including for service_role. event_type is an open vocabulary until a later phase lists it. Phase 3 decides who can read.';

-- ---------------------------------------------------------------------------
-- notification preferences
-- conversation_id null is the global row. A primary key cannot include that
-- null, so id is the primary key and two partial unique indexes enforce
-- one global row plus one row per conversation.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  level text NOT NULL,
  notify_messages boolean NOT NULL DEFAULT true,
  notify_mentions boolean NOT NULL DEFAULT true,
  notify_calls boolean NOT NULL DEFAULT true,
  notify_announcements boolean NOT NULL DEFAULT true,
  CONSTRAINT chat_notification_preferences_level_chk CHECK (
    level IN ('ALL', 'MENTIONS', 'MUTED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_notification_preferences_global_uidx
  ON public.chat_notification_preferences (user_id)
  WHERE conversation_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_notification_preferences_conversation_uidx
  ON public.chat_notification_preferences (user_id, conversation_id)
  WHERE conversation_id IS NOT NULL;

COMMENT ON TABLE public.chat_notification_preferences IS
  'Null conversation_id is the user global preference. Partial unique indexes allow one global row.';

-- ---------------------------------------------------------------------------
-- integrity triggers (not RLS policies)
-- SECURITY INVOKER. They do not bypass RLS. Phase 3 policies must let the
-- writer SELECT the conversation, message, or poll row the trigger reads,
-- or the write fails closed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_tg_dm_pair_direct_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  conv_kind text;
BEGIN
  SELECT c.kind INTO conv_kind
  FROM public.chat_conversations c
  WHERE c.id = NEW.conversation_id;

  IF conv_kind IS DISTINCT FROM 'DIRECT' THEN
    RAISE EXCEPTION 'chat_dm_pairs requires a DIRECT conversation'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_conversation_kind_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.kind IS DISTINCT FROM NEW.kind THEN
    IF EXISTS (
      SELECT 1 FROM public.chat_dm_pairs p WHERE p.conversation_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'cannot change kind of a conversation that has a DM pair'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_message_thread_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  ref_conversation uuid;
BEGIN
  IF NEW.reply_to_message_id = NEW.id
     OR NEW.thread_root_message_id = NEW.id
     OR NEW.forwarded_from_message_id = NEW.id THEN
    RAISE EXCEPTION 'message cannot reference itself'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.reply_to_message_id IS NOT NULL THEN
    SELECT m.conversation_id INTO ref_conversation
    FROM public.chat_messages m
    WHERE m.id = NEW.reply_to_message_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reply_to_message_id does not exist'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF ref_conversation IS DISTINCT FROM NEW.conversation_id THEN
      RAISE EXCEPTION 'reply_to_message_id must belong to the same conversation'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.thread_root_message_id IS NOT NULL THEN
    SELECT m.conversation_id INTO ref_conversation
    FROM public.chat_messages m
    WHERE m.id = NEW.thread_root_message_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'thread_root_message_id does not exist'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF ref_conversation IS DISTINCT FROM NEW.conversation_id THEN
      RAISE EXCEPTION 'thread_root_message_id must belong to the same conversation'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_message_same_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  ref_conversation uuid;
BEGIN
  IF NEW.message_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.conversation_id INTO ref_conversation
  FROM public.chat_messages m
  WHERE m.id = NEW.message_id;

  IF ref_conversation IS NULL THEN
    RAISE EXCEPTION 'chat message % does not exist', NEW.message_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF ref_conversation IS DISTINCT FROM NEW.conversation_id THEN
    RAISE EXCEPTION 'conversation_id does not match the message'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_read_state_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  ref_conversation uuid;
BEGIN
  IF NEW.last_read_message_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.conversation_id INTO ref_conversation
  FROM public.chat_messages m
  WHERE m.id = NEW.last_read_message_id;

  IF ref_conversation IS NULL THEN
    RAISE EXCEPTION 'last_read_message_id % does not exist', NEW.last_read_message_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF ref_conversation IS DISTINCT FROM NEW.conversation_id THEN
    RAISE EXCEPTION 'last_read_message_id must belong to the same conversation'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Locks one poll for the transaction so two single-choice votes cannot both pass.
-- FOR UPDATE is not used: it would require an UPDATE policy on chat_polls.
CREATE OR REPLACE FUNCTION public.chat_tg_poll_vote_single_choice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  allows_multiple boolean;
  has_other boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_poll:' || NEW.poll_id::text, 0));

  SELECT p.allow_multiple INTO allows_multiple
  FROM public.chat_polls p
  WHERE p.id = NEW.poll_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'poll % does not exist', NEW.poll_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF allows_multiple THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.chat_poll_votes v
      WHERE v.poll_id = NEW.poll_id
        AND v.user_id = NEW.user_id
        AND v.option_id IS DISTINCT FROM NEW.option_id
        AND v.ctid IS DISTINCT FROM OLD.ctid
    ) INTO has_other;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.chat_poll_votes v
      WHERE v.poll_id = NEW.poll_id
        AND v.user_id = NEW.user_id
        AND v.option_id IS DISTINCT FROM NEW.option_id
    ) INTO has_other;
  END IF;

  IF has_other THEN
    RAISE EXCEPTION 'poll % does not allow multiple choices', NEW.poll_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_poll_allow_multiple_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.allow_multiple AND NOT NEW.allow_multiple THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('chat_poll:' || NEW.id::text, 0));
    IF EXISTS (
      SELECT 1
      FROM public.chat_poll_votes v
      WHERE v.poll_id = NEW.id
      GROUP BY v.user_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'cannot set allow_multiple false while a user has multiple votes'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.chat_tg_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  RAISE EXCEPTION 'chat_audit_logs is append-only'
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

-- Clear read cursors before a conversation row is removed so message deletes
-- do not SET NULL a read-state row that the conversation delete is also removing.
CREATE OR REPLACE FUNCTION public.chat_tg_conversation_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.chat_read_states
  SET last_read_message_id = NULL
  WHERE conversation_id = OLD.id
    AND last_read_message_id IS NOT NULL;
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_chat_conversations_before_delete ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_before_delete
  BEFORE DELETE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_conversation_before_delete();

DROP TRIGGER IF EXISTS trg_chat_conversations_updated ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_updated
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_chat_conversations_kind_guard ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_kind_guard
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_conversation_kind_guard();

DROP TRIGGER IF EXISTS trg_chat_dm_pairs_direct_only ON public.chat_dm_pairs;
CREATE TRIGGER trg_chat_dm_pairs_direct_only
  BEFORE INSERT OR UPDATE ON public.chat_dm_pairs
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_dm_pair_direct_only();

DROP TRIGGER IF EXISTS trg_chat_messages_updated ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_updated
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_chat_messages_thread_refs ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_thread_refs
  BEFORE INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_thread_refs();

DROP TRIGGER IF EXISTS trg_chat_reactions_same_conversation ON public.chat_reactions;
CREATE TRIGGER trg_chat_reactions_same_conversation
  BEFORE INSERT OR UPDATE ON public.chat_reactions
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_same_conversation();

DROP TRIGGER IF EXISTS trg_chat_attachments_same_conversation ON public.chat_attachments;
CREATE TRIGGER trg_chat_attachments_same_conversation
  BEFORE INSERT OR UPDATE ON public.chat_attachments
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_same_conversation();

DROP TRIGGER IF EXISTS trg_chat_mentions_same_conversation ON public.chat_mentions;
CREATE TRIGGER trg_chat_mentions_same_conversation
  BEFORE INSERT OR UPDATE ON public.chat_mentions
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_same_conversation();

DROP TRIGGER IF EXISTS trg_chat_read_states_message ON public.chat_read_states;
CREATE TRIGGER trg_chat_read_states_message
  BEFORE INSERT OR UPDATE ON public.chat_read_states
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_read_state_message();

DROP TRIGGER IF EXISTS trg_chat_pins_same_conversation ON public.chat_pins;
CREATE TRIGGER trg_chat_pins_same_conversation
  BEFORE INSERT OR UPDATE ON public.chat_pins
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_same_conversation();

DROP TRIGGER IF EXISTS trg_chat_saved_messages_same_conversation ON public.chat_saved_messages;
CREATE TRIGGER trg_chat_saved_messages_same_conversation
  BEFORE INSERT OR UPDATE ON public.chat_saved_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_same_conversation();

DROP TRIGGER IF EXISTS trg_chat_acknowledgements_same_conversation ON public.chat_acknowledgements;
CREATE TRIGGER trg_chat_acknowledgements_same_conversation
  BEFORE INSERT OR UPDATE ON public.chat_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_same_conversation();

DROP TRIGGER IF EXISTS trg_chat_polls_same_conversation ON public.chat_polls;
CREATE TRIGGER trg_chat_polls_same_conversation
  BEFORE INSERT OR UPDATE ON public.chat_polls
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_same_conversation();

DROP TRIGGER IF EXISTS trg_chat_polls_allow_multiple ON public.chat_polls;
CREATE TRIGGER trg_chat_polls_allow_multiple
  BEFORE UPDATE ON public.chat_polls
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_poll_allow_multiple_guard();

DROP TRIGGER IF EXISTS trg_chat_poll_votes_single_choice ON public.chat_poll_votes;
CREATE TRIGGER trg_chat_poll_votes_single_choice
  BEFORE INSERT OR UPDATE ON public.chat_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_poll_vote_single_choice();

DROP TRIGGER IF EXISTS trg_chat_entity_links_same_conversation ON public.chat_entity_links;
CREATE TRIGGER trg_chat_entity_links_same_conversation
  BEFORE INSERT OR UPDATE ON public.chat_entity_links
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_message_same_conversation();

DROP TRIGGER IF EXISTS trg_chat_audit_logs_append_only ON public.chat_audit_logs;
CREATE TRIGGER trg_chat_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.chat_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.chat_tg_audit_append_only();

DROP TRIGGER IF EXISTS trg_chat_audit_logs_no_truncate ON public.chat_audit_logs;
CREATE TRIGGER trg_chat_audit_logs_no_truncate
  BEFORE TRUNCATE ON public.chat_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.chat_tg_audit_append_only();

REVOKE ALL ON FUNCTION public.chat_tg_dm_pair_direct_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_conversation_kind_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_message_thread_refs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_message_same_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_read_state_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_poll_vote_single_choice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_poll_allow_multiple_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_audit_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_tg_conversation_before_delete() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- privileges and RLS
-- authenticated receives table DML grants. No policies, so RLS denies them.
-- anon and PUBLIC receive nothing. service_role receives ALL and bypasses RLS.
-- chat_audit_logs is the exception: authenticated receives no grants.
-- ---------------------------------------------------------------------------

REVOKE ALL ON
  public.chat_conversations,
  public.chat_members,
  public.chat_dm_pairs,
  public.chat_messages,
  public.chat_message_edits,
  public.chat_reactions,
  public.chat_attachments,
  public.chat_mentions,
  public.chat_read_states,
  public.chat_pins,
  public.chat_saved_messages,
  public.chat_acknowledgements,
  public.chat_polls,
  public.chat_poll_options,
  public.chat_poll_votes,
  public.chat_entity_links,
  public.chat_calls,
  public.chat_call_participants,
  public.chat_notification_preferences
FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.chat_conversations,
  public.chat_members,
  public.chat_dm_pairs,
  public.chat_messages,
  public.chat_message_edits,
  public.chat_reactions,
  public.chat_attachments,
  public.chat_mentions,
  public.chat_read_states,
  public.chat_pins,
  public.chat_saved_messages,
  public.chat_acknowledgements,
  public.chat_polls,
  public.chat_poll_options,
  public.chat_poll_votes,
  public.chat_entity_links,
  public.chat_calls,
  public.chat_call_participants,
  public.chat_notification_preferences
TO authenticated;

GRANT ALL ON
  public.chat_conversations,
  public.chat_members,
  public.chat_dm_pairs,
  public.chat_messages,
  public.chat_message_edits,
  public.chat_reactions,
  public.chat_attachments,
  public.chat_mentions,
  public.chat_read_states,
  public.chat_pins,
  public.chat_saved_messages,
  public.chat_acknowledgements,
  public.chat_polls,
  public.chat_poll_options,
  public.chat_poll_votes,
  public.chat_entity_links,
  public.chat_calls,
  public.chat_call_participants,
  public.chat_notification_preferences,
  public.chat_audit_logs
TO service_role;

REVOKE ALL ON public.chat_audit_logs FROM PUBLIC, anon, authenticated;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_dm_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_saved_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_notification_preferences ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
