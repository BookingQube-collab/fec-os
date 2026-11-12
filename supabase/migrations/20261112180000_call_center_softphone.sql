-- Softphone polish: transcripts + whisper metadata columns for Call Center CDR.

BEGIN;

ALTER TABLE public.call_center_calls
  ADD COLUMN IF NOT EXISTS transcript_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS transcript_status text NOT NULL DEFAULT 'none'
    CHECK (transcript_status IN ('none', 'partial', 'final', 'stub')),
  ADD COLUMN IF NOT EXISTS transcript_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS whisper_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS barge_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.call_center_calls.transcript_text IS
  'Call transcript body (live partial, final STT, or manual stub).';
COMMENT ON COLUMN public.call_center_calls.transcript_status IS
  'none | partial | final | stub — pluggable STT / Generate transcript MVP.';
COMMENT ON COLUMN public.call_center_calls.whisper_active IS
  'Supervisor whisper session currently joined (LiveKit web agents).';
COMMENT ON COLUMN public.call_center_calls.barge_active IS
  'Supervisor barge (both parties hear) currently joined.';

COMMIT;
