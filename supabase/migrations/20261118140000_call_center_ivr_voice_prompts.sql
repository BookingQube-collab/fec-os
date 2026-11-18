-- Dual IVR TTS voices (EN + AR) and optional human bridge prompt audio URLs.
-- Recorded Qatari/Gulf clips beat Polly/Azure for natural tone; TTS remains fallback.

ALTER TABLE call_center_settings
  ADD COLUMN IF NOT EXISTS tts_voice_ar text NOT NULL DEFAULT 'Azure.ar-AE-FatimaNeural',
  ADD COLUMN IF NOT EXISTS bridge_prompt_audio_url_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bridge_prompt_audio_url_ar text NOT NULL DEFAULT '';

COMMENT ON COLUMN call_center_settings.tts_voice_ar IS
  'Telnyx Call Control speak voice for Arabic-majority IVR prompts (Azure.*, Polly.*, ElevenLabs.*).';
COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_en IS
  'Public HTTPS MP3/WAV for EN recording-disclosure + connecting prompt; when set, plays instead of TTS.';
COMMENT ON COLUMN call_center_settings.bridge_prompt_audio_url_ar IS
  'Public HTTPS MP3/WAV for AR recording-disclosure + connecting prompt; when set, plays instead of TTS.';
