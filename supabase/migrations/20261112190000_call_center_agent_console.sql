-- Agent console: disposition notes on CDR + per-agent speed dial favorites.

BEGIN;

ALTER TABLE public.call_center_calls
  ADD COLUMN IF NOT EXISTS agent_notes text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_calls.agent_notes IS
  'Agent disposition / wrap-up notes saved from softphone or Calls detail.';

CREATE TABLE IF NOT EXISTS public.call_center_speed_dials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  e164 text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_center_speed_dials_e164_len CHECK (char_length(e164) BETWEEN 3 AND 32)
);

CREATE INDEX IF NOT EXISTS call_center_speed_dials_user_idx
  ON public.call_center_speed_dials (user_id, sort_order, created_at);

ALTER TABLE public.call_center_speed_dials ENABLE ROW LEVEL SECURITY;

COMMIT;
