import "server-only";

import { AccessToken } from "livekit-server-sdk";

import {
  loadLiveKitSettingsRow,
  readLiveKitEnv,
  resolveLiveKitCredentials,
  type LiveKitCredentials,
} from "@/lib/chat/livekit-settings";

/**
 * Call media issuer. This module is server-only. Do not import it from a client component.
 *
 * Audio and video are not sent through Supabase Realtime.
 * chat_calls.provider stays NONE. The LiveKit API secret is not written to chat_calls.
 * Credentials come from chat_livekit_settings when that row is enabled and complete.
 * LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are a server-only fallback
 * when the database row is missing or incomplete. This module does not read NEXT_PUBLIC_ copies.
 */

export type CallProviderName = "none" | "livekit";

export type CallSessionToken = {
  provider: CallProviderName;
  roomName: string;
  token: string;
  expiresAt: string;
  serverUrl?: string;
};

export type CallTokenRequest = {
  roomName: string;
  userId: string;
  displayName: string;
  canPublish: boolean;
};

export type CallProvider = {
  name: CallProviderName;
  issueToken(request: CallTokenRequest): Promise<CallSessionToken>;
};

export class CallProviderUnconfiguredError extends Error {
  readonly code = "CALL_PROVIDER_UNCONFIGURED" as const;

  constructor() {
    super("Calling is not configured.");
    this.name = "CallProviderUnconfiguredError";
  }
}

const TOKEN_TTL_SECONDS = 15 * 60;

const noneCallProvider: CallProvider = {
  name: "none",
  issueToken() {
    return Promise.reject(new CallProviderUnconfiguredError());
  },
};

function liveKitCallProvider(credentials: LiveKitCredentials): CallProvider {
  return {
    name: "livekit",
    async issueToken(request) {
      const displayName = request.displayName.trim().slice(0, 80) || "Member";
      const access = new AccessToken(credentials.apiKey, credentials.apiSecret, {
        identity: request.userId,
        name: displayName,
        ttl: TOKEN_TTL_SECONDS,
      });
      access.addGrant({
        roomJoin: true,
        room: request.roomName,
        canPublish: request.canPublish,
        canSubscribe: true,
        canPublishData: false,
        roomRecord: false,
      });
      const token = await access.toJwt();
      return {
        provider: "livekit",
        roomName: request.roomName,
        token,
        expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
        serverUrl: credentials.serverUrl,
      };
    },
  };
}

export async function getCallProvider(): Promise<CallProvider> {
  let row = null;
  try {
    row = await loadLiveKitSettingsRow();
  } catch {
    return noneCallProvider;
  }
  const credentials = resolveLiveKitCredentials(row, readLiveKitEnv());
  if (!credentials) return noneCallProvider;
  return liveKitCallProvider(credentials);
}
