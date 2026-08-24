-- Centralized AI provider credentials, routing, and lightweight usage.
-- Encrypted keys are service-role only. Authenticated clients never read ciphertext.

CREATE TABLE IF NOT EXISTS public.ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL UNIQUE CHECK (provider_code IN ('gemini', 'groq', 'openrouter')),
  display_name text NOT NULL,
  encrypted_api_key text,
  key_last_four text,
  selected_model text,
  base_url text,
  enabled boolean NOT NULL DEFAULT false,
  connection_status text NOT NULL DEFAULT 'not_configured'
    CHECK (connection_status IN ('not_configured', 'untested', 'connected', 'failed', 'disabled')),
  last_tested_at timestamptz,
  last_test_result text,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_routing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_provider text CHECK (primary_provider IS NULL OR primary_provider IN ('gemini', 'groq', 'openrouter')),
  secondary_provider text CHECK (secondary_provider IS NULL OR secondary_provider IN ('gemini', 'groq', 'openrouter')),
  tertiary_provider text CHECK (tertiary_provider IS NULL OR tertiary_provider IN ('gemini', 'groq', 'openrouter')),
  timeout_ms integer NOT NULL DEFAULT 30000 CHECK (timeout_ms BETWEEN 3000 AND 120000),
  max_retries integer NOT NULL DEFAULT 1 CHECK (max_retries BETWEEN 0 AND 3),
  auto_fallback boolean NOT NULL DEFAULT true,
  monthly_limit_usd numeric,
  provider_monthly_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_routing_settings_no_dup_primary_secondary
    CHECK (primary_provider IS NULL OR secondary_provider IS NULL OR primary_provider <> secondary_provider),
  CONSTRAINT ai_routing_settings_no_dup_primary_tertiary
    CHECK (primary_provider IS NULL OR tertiary_provider IS NULL OR primary_provider <> tertiary_provider),
  CONSTRAINT ai_routing_settings_no_dup_secondary_tertiary
    CHECK (secondary_provider IS NULL OR tertiary_provider IS NULL OR secondary_provider <> tertiary_provider)
);

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date date NOT NULL,
  provider_code text NOT NULL,
  model text NOT NULL,
  module_source text NOT NULL DEFAULT 'unknown',
  success_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  estimated_cost_usd numeric NOT NULL DEFAULT 0,
  latency_ms_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_daily_unique UNIQUE (usage_date, provider_code, model, module_source)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_date
  ON public.ai_usage_daily (usage_date DESC);

INSERT INTO public.ai_provider_configs (provider_code, display_name, base_url, selected_model, enabled, connection_status)
VALUES
  ('gemini', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-flash-latest', false, 'not_configured'),
  ('groq', 'Groq', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', false, 'not_configured'),
  ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'openrouter/free', false, 'not_configured')
ON CONFLICT (provider_code) DO NOTHING;

INSERT INTO public.ai_routing_settings (timeout_ms, max_retries, auto_fallback)
SELECT 30000, 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.ai_routing_settings);

ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_routing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_provider_configs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_routing_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_usage_daily FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ai_provider_configs TO service_role;
GRANT ALL ON public.ai_routing_settings TO service_role;
GRANT ALL ON public.ai_usage_daily TO service_role;
