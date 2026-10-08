import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Single settings row. The migration inserts this id with empty credentials. */
export const CHAT_LIVEKIT_SETTINGS_ID = "00000000-0000-4000-8000-0000000000c4";

export const LIVEKIT_SETTINGS_AUTH = {
  capability: "admin.view" as const,
  minRoleLevel: 95,
};

export type LiveKitSettingsRow = {
  enabled: boolean;
  server_url: string;
  api_key: string;
  api_secret: string;
};

export type LiveKitEnv = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

export type LiveKitCredentials = {
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
};

/** Safe for a server action return value. No secret and no full API key. */
export type LiveKitSettingsPublic = {
  enabled: boolean;
  serverUrl: string;
  keyLast4: string;
  secretSet: boolean;
};

type SettingsQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<{ data: LiveKitSettingsRow | null; error: { message: string } | null }>;
    };
  };
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string },
  ) => {
    select: (columns: string) => {
      maybeSingle: () => Promise<{ data: LiveKitSettingsRow | null; error: { message: string } | null }>;
    };
  };
};

function settingsTable(): SettingsQuery {
  const db = supabaseAdmin as unknown as { from: (table: string) => SettingsQuery };
  return db.from("chat_livekit_settings");
}

export function readLiveKitEnv(env: NodeJS.ProcessEnv = process.env): LiveKitEnv {
  return {
    url: env.LIVEKIT_URL?.trim() ?? "",
    apiKey: env.LIVEKIT_API_KEY?.trim() ?? "",
    apiSecret: env.LIVEKIT_API_SECRET?.trim() ?? "",
  };
}

function credentialsIfComplete(url: string, apiKey: string, apiSecret: string): LiveKitCredentials | null {
  const serverUrl = url.trim();
  const key = apiKey.trim();
  const secret = apiSecret.trim();
  if (!serverUrl.startsWith("wss://") || key.length === 0 || secret.length === 0) return null;
  return { serverUrl, apiKey: key, apiSecret: secret };
}

/**
 * A complete enabled database row wins.
 * A complete disabled row stays off and does not fall through to env.
 * Env is used only when the row is missing or a field is empty.
 * NEXT_PUBLIC_ copies are ignored because this only reads LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.
 */
export function resolveLiveKitCredentials(row: LiveKitSettingsRow | null, env: LiveKitEnv): LiveKitCredentials | null {
  if (row) {
    const url = row.server_url.trim();
    const apiKey = row.api_key.trim();
    const apiSecret = row.api_secret.trim();
    const fieldsPresent = url.length > 0 && apiKey.length > 0 && apiSecret.length > 0;
    if (fieldsPresent) {
      if (!row.enabled) return null;
      return credentialsIfComplete(url, apiKey, apiSecret);
    }
  }
  return credentialsIfComplete(env.url, env.apiKey, env.apiSecret);
}

/** Last 4 characters only, and only when the key is longer than 4 so the full key is never returned. */
export function liveKitKeyLast4(apiKey: string): string {
  const key = apiKey.trim();
  if (key.length <= 4) return "";
  return key.slice(-4);
}

export function toPublicLiveKitSettings(row: LiveKitSettingsRow | null): LiveKitSettingsPublic {
  return {
    enabled: Boolean(row?.enabled),
    serverUrl: row?.server_url?.trim() ?? "",
    keyLast4: liveKitKeyLast4(row?.api_key ?? ""),
    secretSet: (row?.api_secret?.trim() ?? "").length > 0,
  };
}

/** A blank submitted secret keeps the stored one. A non-blank value replaces it. */
export function keepLiveKitSecret(previous: string, submitted: string): string {
  const incoming = submitted.trim();
  return incoming.length > 0 ? incoming : previous;
}

export async function loadLiveKitSettingsRow(): Promise<LiveKitSettingsRow | null> {
  const result = await settingsTable()
    .select("enabled, server_url, api_key, api_secret")
    .eq("id", CHAT_LIVEKIT_SETTINGS_ID)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  return {
    enabled: Boolean(result.data.enabled),
    server_url: String(result.data.server_url ?? ""),
    api_key: String(result.data.api_key ?? ""),
    api_secret: String(result.data.api_secret ?? ""),
  };
}

export async function saveLiveKitSettingsRow(
  row: LiveKitSettingsRow,
  updatedBy: string,
): Promise<LiveKitSettingsRow> {
  const result = await settingsTable()
    .upsert(
      {
        id: CHAT_LIVEKIT_SETTINGS_ID,
        enabled: row.enabled,
        server_url: row.server_url,
        api_key: row.api_key,
        api_secret: row.api_secret,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "id" },
    )
    .select("enabled, server_url, api_key, api_secret")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Call settings could not be saved.");
  return {
    enabled: Boolean(result.data.enabled),
    server_url: String(result.data.server_url ?? ""),
    api_key: String(result.data.api_key ?? ""),
    api_secret: String(result.data.api_secret ?? ""),
  };
}
