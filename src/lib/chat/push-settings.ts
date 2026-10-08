import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Single settings row. The migration inserts this id with push disabled and empty keys. */
export const CHAT_PUSH_SETTINGS_ID = "00000000-0000-4000-8000-0000000000c5";

export const PUSH_SETTINGS_AUTH = {
  capability: "admin.view" as const,
  minRoleLevel: 95,
};

const VAPID_KEY_RE = /^[A-Za-z0-9_-]{40,200}$/;

export type PushSettingsRow = {
  enabled: boolean;
  vapid_public_key: string;
  vapid_private_key: string;
};

export type PushEnv = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type PushCredentials = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/** Safe for an admin server-action return. The private key is never a field. */
export type PushSettingsPublic = {
  enabled: boolean;
  publicKey: string;
  privateKeySet: boolean;
};

/** Safe for any signed-in chat user. The public key is present only when push can send. */
export type PushClientConfig = {
  enabled: boolean;
  publicKey: string | null;
};

type SettingsQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<{ data: PushSettingsRow | null; error: { message: string } | null }>;
    };
  };
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string },
  ) => {
    select: (columns: string) => {
      maybeSingle: () => Promise<{ data: PushSettingsRow | null; error: { message: string } | null }>;
    };
  };
};

function settingsTable(): SettingsQuery {
  const db = supabaseAdmin as unknown as { from: (table: string) => SettingsQuery };
  return db.from("chat_push_settings");
}

export function isVapidKey(value: string): boolean {
  return VAPID_KEY_RE.test(value.trim());
}

export function isVapidSubject(value: string): boolean {
  const subject = value.trim();
  return subject.startsWith("mailto:") || subject.startsWith("https://");
}

/**
 * Server env only. NEXT_PUBLIC_ copies are ignored because this only reads
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.
 */
export function readPushEnv(env: NodeJS.ProcessEnv = process.env): PushEnv {
  return {
    publicKey: env.VAPID_PUBLIC_KEY?.trim() ?? "",
    privateKey: env.VAPID_PRIVATE_KEY?.trim() ?? "",
    subject: env.VAPID_SUBJECT?.trim() ?? "",
  };
}

function credentialsIfComplete(publicKey: string, privateKey: string, subject: string): PushCredentials | null {
  const pub = publicKey.trim();
  const priv = privateKey.trim();
  const sub = subject.trim();
  if (!isVapidKey(pub) || !isVapidKey(priv) || !isVapidSubject(sub)) return null;
  return { publicKey: pub, privateKey: priv, subject: sub };
}

/**
 * The migration inserts one disabled row with empty keys, so push stays off
 * until an admin saves keys and turns it on.
 * A disabled row does not fall through to env, even when its keys are empty.
 * Env is used only when that row is missing.
 * A mailto: or https:// VAPID_SUBJECT is still required to send.
 */
export function resolvePushCredentials(row: PushSettingsRow | null, env: PushEnv): PushCredentials | null {
  if (row) {
    if (!row.enabled) return null;
    return credentialsIfComplete(row.vapid_public_key, row.vapid_private_key, env.subject);
  }
  return credentialsIfComplete(env.publicKey, env.privateKey, env.subject);
}

export function toPublicPushSettings(row: PushSettingsRow | null): PushSettingsPublic {
  return {
    enabled: Boolean(row?.enabled),
    publicKey: row?.vapid_public_key?.trim() ?? "",
    privateKeySet: (row?.vapid_private_key?.trim() ?? "").length > 0,
  };
}

export function toClientPushConfig(credentials: PushCredentials | null): PushClientConfig {
  if (!credentials) return { enabled: false, publicKey: null };
  return { enabled: true, publicKey: credentials.publicKey };
}

/** A blank submitted private key keeps the stored one. A non-blank value replaces it. */
export function keepPushPrivateKey(previous: string, submitted: string): string {
  const incoming = submitted.trim();
  return incoming.length > 0 ? incoming : previous;
}

export async function loadPushSettingsRow(): Promise<PushSettingsRow | null> {
  const result = await settingsTable()
    .select("enabled, vapid_public_key, vapid_private_key")
    .eq("id", CHAT_PUSH_SETTINGS_ID)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  return {
    enabled: Boolean(result.data.enabled),
    vapid_public_key: String(result.data.vapid_public_key ?? ""),
    vapid_private_key: String(result.data.vapid_private_key ?? ""),
  };
}

export async function savePushSettingsRow(row: PushSettingsRow, updatedBy: string): Promise<PushSettingsRow> {
  const result = await settingsTable()
    .upsert(
      {
        id: CHAT_PUSH_SETTINGS_ID,
        enabled: row.enabled,
        vapid_public_key: row.vapid_public_key,
        vapid_private_key: row.vapid_private_key,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "id" },
    )
    .select("enabled, vapid_public_key, vapid_private_key")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Push settings could not be saved.");
  return {
    enabled: Boolean(result.data.enabled),
    vapid_public_key: String(result.data.vapid_public_key ?? ""),
    vapid_private_key: String(result.data.vapid_private_key ?? ""),
  };
}
