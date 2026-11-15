-- Public audio for Call Center welcome / hold music (Telnyx playback_start needs HTTPS).
-- Writes go through the service role after MIME + size checks; no authenticated INSERT.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-center-media',
  'call-center-media',
  true,
  8388608,
  ARRAY[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
