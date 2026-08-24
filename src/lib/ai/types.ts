export const AI_PROVIDER_CODES = ["gemini", "groq", "openrouter"] as const;
export type AiProviderCode = (typeof AI_PROVIDER_CODES)[number];

export const AI_CONNECTION_STATUSES = [
  "not_configured",
  "untested",
  "connected",
  "failed",
  "disabled",
] as const;
export type AiConnectionStatus = (typeof AI_CONNECTION_STATUSES)[number];

export const AI_ERROR_KINDS = [
  "auth",
  "rate_limit",
  "timeout",
  "unavailable_model",
  "server",
  "invalid",
  "unknown",
] as const;
export type AiErrorKind = (typeof AI_ERROR_KINDS)[number];

export type AiMessageRole = "system" | "user" | "assistant";

export type AiTextPart = { type: "text"; text: string };
export type AiImagePart = {
  type: "image";
  mimeType: string;
  /** Raw base64 without data: prefix */
  data: string;
};

export type AiContentPart = AiTextPart | AiImagePart;

export type AiMessage = {
  role: AiMessageRole;
  content: string | AiContentPart[];
};

export type AiGenerateRequest = {
  messages: AiMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  moduleSource?: string;
};

export type AiGenerateResult = {
  text: string;
  provider: AiProviderCode | "env_fallback";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  estimatedCostUsd?: number;
};

export type AiModelOption = {
  id: string;
  displayName: string;
  ownedBy?: string;
};

export type AiProviderCatalog = {
  code: AiProviderCode;
  displayName: string;
  description: string;
  docsUrl: string;
  keysUrl: string;
  pricingUrl?: string;
  defaultModel: string;
  defaultBaseUrl: string;
  extraModels: AiModelOption[];
};

export type AiRoutingSettings = {
  primary: AiProviderCode | null;
  secondary: AiProviderCode | null;
  tertiary: AiProviderCode | null;
  timeout_ms: number;
  max_retries: number;
  auto_fallback: boolean;
  monthly_limit_usd: number | null;
  provider_monthly_limits: Partial<Record<AiProviderCode, number>>;
};

export const DEFAULT_AI_ROUTING: AiRoutingSettings = {
  primary: null,
  secondary: null,
  tertiary: null,
  timeout_ms: 30_000,
  max_retries: 1,
  auto_fallback: true,
  monthly_limit_usd: null,
  provider_monthly_limits: {},
};

export type AiProviderPublicConfig = {
  id: string;
  provider_code: AiProviderCode;
  display_name: string;
  key_last_four: string | null;
  key_masked: string | null;
  selected_model: string | null;
  base_url: string | null;
  enabled: boolean;
  connection_status: AiConnectionStatus;
  last_tested_at: string | null;
  last_test_result: string | null;
  models: AiModelOption[];
  created_at: string;
  updated_at: string;
};

export type AiUsageRow = {
  usage_date: string;
  provider_code: string;
  model: string;
  module_source: string;
  success_count: number;
  fail_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  latency_ms_total: number;
  avg_latency_ms: number;
};

export type AiProviderRow = {
  id: string;
  provider_code: AiProviderCode;
  display_name: string;
  encrypted_api_key: string | null;
  key_last_four: string | null;
  selected_model: string | null;
  base_url: string | null;
  enabled: boolean;
  connection_status: AiConnectionStatus;
  last_tested_at: string | null;
  last_test_result: string | null;
  config_json: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const AI_INTEGRATIONS_AUTH = {
  capability: "admin.view" as const,
  minRoleLevel: 95,
};

export const AI_INTEGRATIONS_MIN_LEVEL = 95;

export type AiCatalogPublic = {
  code: AiProviderCode;
  displayName: string;
  description: string;
  docsUrl: string;
  keysUrl: string;
  pricingUrl?: string;
  defaultModel: string;
};

export type AiIntegrationsSnapshot = {
  providers: Array<AiProviderPublicConfig & { routing_eligible: boolean }>;
  routing: AiRoutingSettings;
  usage: AiUsageRow[];
  catalog: AiCatalogPublic[];
  encryption_configured: boolean;
  cost_is_estimate: boolean;
};
