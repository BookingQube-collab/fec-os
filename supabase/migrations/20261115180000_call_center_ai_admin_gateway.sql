-- Allow Call Center AI to use Admin → AI Integrations (Gemini → OpenRouter) instead of OpenAI.
ALTER TABLE public.call_center_settings
  DROP CONSTRAINT IF EXISTS call_center_settings_ai_provider_check;

ALTER TABLE public.call_center_settings
  ADD CONSTRAINT call_center_settings_ai_provider_check
  CHECK (ai_provider IN ('admin_gateway', 'openai', 'openai_compatible', 'livekit_agents'));

ALTER TABLE public.call_center_settings
  ALTER COLUMN ai_provider SET DEFAULT 'admin_gateway';

ALTER TABLE public.call_center_settings
  ALTER COLUMN ai_model SET DEFAULT 'gemini-flash-latest';

-- Prefer admin gateway when the row still has the legacy OpenAI default and no dedicated key.
UPDATE public.call_center_settings
SET ai_provider = 'admin_gateway',
    ai_model = CASE
      WHEN ai_model ~* '^gpt-' OR ai_model ~* '^o[0-9]' OR ai_model = '' THEN 'gemini-flash-latest'
      ELSE ai_model
    END
WHERE ai_provider = 'openai'
  AND coalesce(trim(ai_api_key), '') = '';

COMMENT ON COLUMN public.call_center_settings.ai_provider IS
  'Call Center AI path: admin_gateway uses Admin → AI Integrations (Gemini/OpenRouter); openai / openai_compatible use dedicated keys; livekit_agents dispatches an external worker.';
