-- Silence regression after 0ed0b99: Piper /ivr/ Play HEAD-ok but Telnyx played silence
-- (TeXML Play-only / gather_using_audio success with no TTS). Clear bridge OSS defaults
-- so production uses Polly Joanna / Azure Fatima. Re-enable only with BOTH
-- IVR_OSS_PLAY_ENABLED=1 and IVR_OSS_PLAY_VERIFIED=1 after a live audible test.

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
  'Optional HTTPS or app-relative MP3/WAV for EN recording-disclosure + connecting. Empty = TTS. Piper /ivr/ off by default (requires IVR_OSS_PLAY_ENABLED + IVR_OSS_PLAY_VERIFIED).';
COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_ar IS
  'Optional HTTPS or app-relative MP3/WAV for AR recording-disclosure + connecting. Empty = TTS. Piper /ivr/ off by default (requires IVR_OSS_PLAY_ENABLED + IVR_OSS_PLAY_VERIFIED).';
