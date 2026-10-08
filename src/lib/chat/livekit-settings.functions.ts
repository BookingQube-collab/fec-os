"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import {
  keepLiveKitSecret,
  LIVEKIT_SETTINGS_AUTH,
  loadLiveKitSettingsRow,
  saveLiveKitSettingsRow,
  toPublicLiveKitSettings,
  type LiveKitSettingsPublic,
} from "@/lib/chat/livekit-settings";

const saveSchema = z.object({
  enabled: z.boolean(),
  serverUrl: z.string().trim().max(500),
  apiKey: z.string().max(500),
  apiSecret: z.string().max(500),
});

function assertWebsocketUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("LiveKit server URL must start with wss://");
  }
  if (parsed.protocol !== "wss:") throw new Error("LiveKit server URL must start with wss://");
}

export const loadChatLiveKitSettings = createSafeAuthenticatedAction(
  z.object({}),
  async (): Promise<LiveKitSettingsPublic> => {
    const row = await loadLiveKitSettingsRow();
    return toPublicLiveKitSettings(row);
  },
  { auth: LIVEKIT_SETTINGS_AUTH },
);

export const saveChatLiveKitSettings = createSafeAuthenticatedAction(
  saveSchema,
  async (data, context): Promise<LiveKitSettingsPublic> => {
    const existing = await loadLiveKitSettingsRow();
    const serverUrl = data.serverUrl.trim();
    const apiKey = keepLiveKitSecret(existing?.api_key ?? "", data.apiKey);
    const apiSecret = keepLiveKitSecret(existing?.api_secret ?? "", data.apiSecret);
    if (serverUrl.length > 0) assertWebsocketUrl(serverUrl);
    if (data.enabled) {
      if (!serverUrl.startsWith("wss://") || apiKey.trim().length === 0 || apiSecret.trim().length === 0) {
        throw new Error("Enable calling only after the server URL, API key, and API secret are saved.");
      }
    }
    const saved = await saveLiveKitSettingsRow(
      {
        enabled: data.enabled,
        server_url: serverUrl,
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
      },
      context.userId,
    );
    return toPublicLiveKitSettings(saved);
  },
  { auth: LIVEKIT_SETTINGS_AUTH },
);
