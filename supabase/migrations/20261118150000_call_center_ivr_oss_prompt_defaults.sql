-- Seed open-source Piper IVR prompt Play URLs (EN + AR) as bridge defaults.
-- Relative paths are served from public/ivr/ and absolutized at Telnyx Play time.
-- TTS (Joanna EN / Fatima AR) remains fallback when a clip is missing or Play fails.
-- Arabic Piper voice is ar_JO (Jordanian) — clearer than silent/manual-only; not true Qatari.

ALTER TABLE call_center_settings
  ALTER COLUMN bridge_prompt_audio_url_en SET DEFAULT '/ivr/en/bridge-connecting.mp3',
  ALTER COLUMN bridge_prompt_audio_url_ar SET DEFAULT '/ivr/ar/bridge-connecting.mp3';

UPDATE call_center_settings
SET
  bridge_prompt_audio_url_en = '/ivr/en/bridge-connecting.mp3'
WHERE NULLIF(TRIM(bridge_prompt_audio_url_en), '') IS NULL;

UPDATE call_center_settings
SET
  bridge_prompt_audio_url_ar = '/ivr/ar/bridge-connecting.mp3'
WHERE NULLIF(TRIM(bridge_prompt_audio_url_ar), '') IS NULL;

COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_en IS
  'Public HTTPS or app-relative MP3/WAV for EN recording-disclosure + connecting; default /ivr/en/bridge-connecting.mp3 (Piper OSS).';
COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_ar IS
  'Public HTTPS or app-relative MP3/WAV for AR recording-disclosure + connecting; default /ivr/ar/bridge-connecting.mp3 (Piper ar_JO).';
