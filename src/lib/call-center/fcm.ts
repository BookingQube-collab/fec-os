import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CallCenterFcmOfferPayload = {
  callId: string;
  from: string;
  queue: string;
};

export type CallCenterFcmDeliveryResult = {
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skipped: boolean;
  reason?: string;
};

type FcmTokenRow = {
  user_id: string;
  token: string;
  platform: string;
};

type TokenListResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

type TokenTable = {
  select: (columns: string) => {
    in: (column: string, values: string[]) => Promise<TokenListResult>;
  };
  delete: () => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
  };
  upsert: (
    row: Record<string, unknown>,
    opts?: { onConflict?: string },
  ) => Promise<{ error: { message: string } | null }>;
};

function tokensTable(): TokenTable {
  const db = supabaseAdmin as unknown as { from: (table: string) => TokenTable };
  return db.from("call_center_fcm_tokens");
}

/** Prefer service-role admin client for writes (same cast pattern as chat push). */
function adminTokens() {
  return supabaseAdmin as unknown as {
    from: (name: string) => {
      upsert: (
        values: Record<string, unknown>,
        options: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
      delete: () => {
        eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

function warnFcm(message: string) {
  console.warn(`[call-center-fcm] ${message}`);
}

/** True when Firebase Admin credentials are present (env). */
export function isFirebaseAdminConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON?.trim()) return true;
  if (env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH?.trim()) return true;
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.trim();
  return Boolean(projectId && clientEmail && privateKey);
}

function parseServiceAccountJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    return null;
  }
  return null;
}

async function loadServiceAccount(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, unknown> | null> {
  const jsonInline = env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonInline) {
    return parseServiceAccountJson(jsonInline);
  }

  const path = env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH?.trim();
  if (path) {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(path, "utf8");
      return parseServiceAccountJson(raw);
    } catch {
      warnFcm("failed to read FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH");
      return null;
    }
  }

  const projectId = env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  let privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  privateKey = privateKey.replace(/\\n/g, "\n");
  return {
    type: "service_account",
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

type MessagingLike = {
  sendEachForMulticast: (message: {
    tokens: string[];
    data: Record<string, string>;
    android?: {
      priority?: "high" | "normal";
      ttl?: number;
      notification?: {
        channelId?: string;
        priority?: "max" | "high" | "default" | "low" | "min";
        title?: string;
        body?: string;
        sound?: string;
      };
    };
    notification?: { title: string; body: string };
    apns?: { payload?: { aps?: Record<string, unknown> } };
  }) => Promise<{
    successCount: number;
    failureCount: number;
    responses: Array<{ success: boolean; error?: { code?: string } }>;
  }>;
};

let messagingPromise: Promise<MessagingLike | null> | null = null;

async function getMessaging(): Promise<MessagingLike | null> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (!isFirebaseAdminConfigured()) return null;
      const account = await loadServiceAccount();
      if (!account) return null;
      try {
        const admin = await import("firebase-admin");
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(account as Parameters<typeof admin.credential.cert>[0]),
          });
        }
        return admin.messaging() as unknown as MessagingLike;
      } catch (error) {
        warnFcm(error instanceof Error ? error.message : "firebase-admin init failed");
        return null;
      }
    })();
  }
  return messagingPromise;
}

/** Reset cached messaging client (tests). */
export function resetFirebaseAdminForTests() {
  messagingPromise = null;
}

export function buildCallCenterFcmData(
  payload: CallCenterFcmOfferPayload,
): Record<string, string> {
  return {
    type: "incoming_call",
    callId: payload.callId,
    from: payload.from || "",
    queue: payload.queue || "",
    deepLink: `/call-center?callId=${encodeURIComponent(payload.callId)}`,
  };
}

async function tokensForUsers(userIds: readonly string[]): Promise<FcmTokenRow[]> {
  const rows: FcmTokenRow[] = [];
  for (let i = 0; i < userIds.length; i += 100) {
    const slice = userIds.slice(i, i + 100);
    const result = await tokensTable()
      .select("user_id, token, platform")
      .in("user_id", [...slice]);
    if (result.error) {
      warnFcm(result.error.message);
      return rows;
    }
    for (const row of result.data ?? []) {
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      const token = typeof row.token === "string" ? row.token : "";
      const platform = typeof row.platform === "string" ? row.platform : "android";
      if (!userId || !token) continue;
      rows.push({ user_id: userId, token, platform });
    }
  }
  return rows;
}

async function dropInvalidToken(token: string) {
  try {
    await tokensTable().delete().eq("token", token);
  } catch {
    warnFcm("failed to drop invalid token");
  }
}

export async function upsertCallCenterFcmToken(input: {
  userId: string;
  token: string;
  platform?: "android" | "ios" | "web";
}): Promise<void> {
  const token = input.token.trim();
  if (!token) throw new Error("FCM token is required.");
  const now = new Date().toISOString();
  const result = await adminTokens().from("call_center_fcm_tokens").upsert(
    {
      user_id: input.userId,
      token,
      platform: input.platform ?? "android",
      updated_at: now,
    },
    { onConflict: "token" },
  );
  if (result.error) throw new Error(result.error.message);
}

export async function deleteCallCenterFcmToken(input: {
  userId: string;
  token?: string;
}): Promise<void> {
  if (input.token?.trim()) {
    const result = await adminTokens()
      .from("call_center_fcm_tokens")
      .delete()
      .eq("token", input.token.trim());
    if (result.error) throw new Error(result.error.message);
    return;
  }
  const result = await adminTokens()
    .from("call_center_fcm_tokens")
    .delete()
    .eq("user_id", input.userId);
  if (result.error) throw new Error(result.error.message);
}

/**
 * Send high-priority FCM incoming-call offers.
 * Graceful no-op when Firebase is not configured (does not throw).
 */
export async function deliverCallCenterFcmOffer(
  userIds: readonly string[],
  payload: CallCenterFcmOfferPayload,
): Promise<CallCenterFcmDeliveryResult> {
  const uniqueIds = [...new Set(userIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0 || !payload.callId) {
    return { configured: isFirebaseAdminConfigured(), attempted: 0, sent: 0, failed: 0, skipped: true, reason: "no_recipients" };
  }

  if (!isFirebaseAdminConfigured()) {
    return { configured: false, attempted: 0, sent: 0, failed: 0, skipped: true, reason: "firebase_not_configured" };
  }

  const messaging = await getMessaging();
  if (!messaging) {
    return { configured: false, attempted: 0, sent: 0, failed: 0, skipped: true, reason: "firebase_init_failed" };
  }

  let tokens: FcmTokenRow[] = [];
  try {
    tokens = await tokensForUsers(uniqueIds);
  } catch (error) {
    warnFcm(error instanceof Error ? error.message : "token lookup failed");
    return { configured: true, attempted: 0, sent: 0, failed: 0, skipped: true, reason: "token_lookup_failed" };
  }

  if (tokens.length === 0) {
    return { configured: true, attempted: 0, sent: 0, failed: 0, skipped: true, reason: "no_tokens" };
  }

  const data = buildCallCenterFcmData(payload);
  const title = "Incoming call";
  const body = `${payload.from || "Unknown"} · ${payload.queue || "Queue"}`;
  let sent = 0;
  let failed = 0;

  // FCM multicast max 500 tokens.
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batch.map((t) => t.token),
        data,
        notification: { title, body },
        android: {
          priority: "high",
          ttl: 30_000,
          notification: {
            channelId: "incoming_calls",
            priority: "max",
            title,
            body,
            sound: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title, body },
              sound: "default",
              "content-available": 1,
            },
          },
        },
      });
      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((res, index) => {
        if (res.success) return;
        const code = res.error?.code ?? "";
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token") ||
          code.includes("invalid-argument")
        ) {
          void dropInvalidToken(batch[index]!.token);
        }
      });
    } catch (error) {
      failed += batch.length;
      warnFcm(error instanceof Error ? error.message : "send failed");
    }
  }

  return {
    configured: true,
    attempted: tokens.length,
    sent,
    failed,
    skipped: false,
  };
}
