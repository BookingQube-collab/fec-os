-- Store Telnyx Integration Secret identifier for ElevenLabs IVR Speak/Say.
-- Raw ElevenLabs API keys are never stored in FEC — only the Telnyx secret ref.
-- Runtime reads: settings.telnyx_elevenlabs_api_key_ref OR env TELNYX_ELEVENLABS_API_KEY_REF.

ALTER TABLE call_center_settings
  ADD COLUMN IF NOT EXISTS telnyx_elevenlabs_api_key_ref text NOT NULL DEFAULT '';

COMMENT ON COLUMN call_center_settings.telnyx_elevenlabs_api_key_ref IS
  'Telnyx Integration Secret identifier for ElevenLabs BYOK (not the raw API key). When set, Joanna/Fatima auto-upgrade to ElevenLabs Rachel/Charlotte on Call Control + TeXML.';
