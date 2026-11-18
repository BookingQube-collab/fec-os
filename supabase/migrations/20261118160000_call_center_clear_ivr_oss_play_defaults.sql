-- Piper /ivr/ Play caused silent inbound IVR (TeXML Play-only, no Say fallback).
-- Clear bridge OSS defaults so production uses Polly Joanna / Azure Fatima TTS.
-- Re-enable later with IVR_OSS_PLAY_ENABLED=1 after Telnyx-safe 8 kHz clips are verified.

ALTER TABLE call_center_settings
  ALTER COLUMN bridge_prompt_audio_url_en SET DEFAULT '',
  ALTER COLUMN bridge_prompt_audio_url_ar SET DEFAULT '';

UPDATE call_center_settings
SET
  bridge_prompt_audio_url_en = ''
WHERE bridge_prompt_audio_url_en ILIKE '%/ivr/%';

UPDATE call_center_settings
SET
  bridge_prompt_audio_url_ar = ''
WHERE bridge_prompt_audio_url_ar ILIKE '%/ivr/%';

COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_en IS
  'Optional HTTPS or app-relative MP3/WAV for EN recording-disclosure + connecting. Empty = TTS. Piper /ivr/ disabled by default (IVR_OSS_PLAY_ENABLED).';
COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_ar IS
  'Optional HTTPS or app-relative MP3/WAV for AR recording-disclosure + connecting. Empty = TTS. Piper /ivr/ disabled by default (IVR_OSS_PLAY_ENABLED).';
