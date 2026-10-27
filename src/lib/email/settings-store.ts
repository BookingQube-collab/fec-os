import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  readEmailEnv,
  resolveOutboundEmailConfig,
  toPublicEmailSettings,
  type EmailEnv,
  type EmailSettingsPublic,
  type EmailSettingsRow,
  type OutboundEmailConfig,
} from "@/lib/email/outbound-config";

export const APP_EMAIL_SETTINGS_ID = "00000000-0000-4000-8000-0000000000e1";

export const EMAIL_SETTINGS_AUTH = {
  capability: "admin.view" as const,
  minRoleLevel: 95,
};

type SettingsQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<{ data: EmailSettingsRow | null; error: { message: string } | null }>;
    };
  };
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string },
  ) => {
    select: (columns: string) => {
      maybeSingle: () => Promise<{ data: EmailSettingsRow | null; error: { message: string } | null }>;
    };
  };
};

function settingsTable(): SettingsQuery {
  const db = supabaseAdmin as unknown as { from: (table: string) => SettingsQuery };
  return db.from("app_email_settings");
}

function normalizeRow(data: EmailSettingsRow): EmailSettingsRow {
  return {
    managed: Boolean(data.managed),
    enabled: Boolean(data.enabled),
    from_address: String(data.from_address ?? ""),
    resend_api_key: String(data.resend_api_key ?? ""),
    webhook_url: String(data.webhook_url ?? ""),
  };
}

export async function loadEmailSettingsRow(): Promise<EmailSettingsRow | null> {
  const result = await settingsTable()
    .select("managed, enabled, from_address, resend_api_key, webhook_url")
    .eq("id", APP_EMAIL_SETTINGS_ID)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  return normalizeRow(result.data);
}

export async function saveEmailSettingsRow(
  row: EmailSettingsRow,
  updatedBy: string,
): Promise<EmailSettingsRow> {
  const result = await settingsTable()
    .upsert(
      {
        id: APP_EMAIL_SETTINGS_ID,
        managed: true,
        enabled: row.enabled,
        from_address: row.from_address,
        resend_api_key: row.resend_api_key,
        webhook_url: row.webhook_url,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "id" },
    )
    .select("managed, enabled, from_address, resend_api_key, webhook_url")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Email settings could not be saved.");
  return normalizeRow(result.data);
}

function hasSupabaseAdminEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  return Boolean(url?.trim() && key?.trim());
}

/**
 * Load DB settings (when available) and resolve against env.
 * On DB errors, fall back to env so senders stay resilient.
 */
export async function getOutboundEmailConfig(
  env: EmailEnv = readEmailEnv(),
): Promise<OutboundEmailConfig | null> {
  if (!hasSupabaseAdminEnv()) {
    return resolveOutboundEmailConfig(null, env);
  }
  try {
    const row = await loadEmailSettingsRow();
    return resolveOutboundEmailConfig(row, env);
  } catch {
    return resolveOutboundEmailConfig(null, env);
  }
}

export async function getPublicEmailSettings(): Promise<EmailSettingsPublic> {
  const env = readEmailEnv();
  const row = await loadEmailSettingsRow();
  return toPublicEmailSettings(row, env);
}
