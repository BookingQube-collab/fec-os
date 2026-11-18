-- Restore Piper 8 kHz mono /ivr/ bridge defaults after silence incident.
-- Clips are regenerated at 8 kHz; TeXML/Call Control fall back to TTS when Play fails.
-- Opt out with env IVR_OSS_PLAY_ENABLED=0.

ALTER TABLE call_center_settings
  ALTER COLUMN bridge_prompt_audio_url_en SET DEFAULT '/ivr/en/bridge-connecting.mp3',
  ALTER COLUMN bridge_prompt_audio_url_ar SET DEFAULT '/ivr/ar/bridge-connecting.mp3';

UPDATE call_center_settings
SET
  bridge_prompt_audio_url_en = '/ivr/en/bridge-connecting.mp3'
WHERE NULLIF(TRIM(bridge_prompt_audio_url_en), '') IS NULL
   OR bridge_prompt_audio_url_en ILIKE '%/ivr/%';

UPDATE call_center_settings
SET
  bridge_prompt_audio_url_ar = '/ivr/ar/bridge-connecting.mp3'
WHERE NULLIF(TRIM(bridge_prompt_audio_url_ar), '') IS NULL
   OR bridge_prompt_audio_url_ar ILIKE '%/ivr/%';

COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_en IS
  'Public HTTPS or app-relative MP3/WAV for EN recording-disclosure + connecting; default /ivr/en/bridge-connecting.mp3 (Piper OSS 8 kHz). TTS fallback if Play fails. Disable OSS with IVR_OSS_PLAY_ENABLED=0.';
COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_ar IS
  'Public HTTPS or app-relative MP3/WAV for AR recording-disclosure + connecting; default /ivr/ar/bridge-connecting.mp3 (Piper ar_JO Jordanian — not Qatari). TTS fallback if Play fails.';
