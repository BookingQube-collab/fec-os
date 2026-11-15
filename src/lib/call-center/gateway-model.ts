/**
 * Call-center AI (Run test + live admin_gateway turns) uses Admin → AI Integrations (`generateText`).
 * Legacy voice defaults like `gpt-4o-mini` must not override Gemini/OpenRouter models.
 */
export function gatewayModelForCallCenter(configuredModel: string | null | undefined): string | undefined {
  const model = configuredModel?.trim() || "";
  if (!model) return undefined;
  if (/^gpt-/i.test(model) || /^o[0-9]/i.test(model)) return undefined;
  return model;
}

/** @deprecated Prefer gatewayModelForCallCenter */
export const gatewayModelForCallCenterTest = gatewayModelForCallCenter;
