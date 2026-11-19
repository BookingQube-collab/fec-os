"use client";

/**
 * Capacitor / native shell helpers for Call Center FCM.
 * Uses the WebView-injected Capacitor bridge (no npm import required in Next).
 * Safe no-ops in a normal browser (desktop softphone unchanged).
 */

export type CapacitorPlatform = "android" | "ios" | "web";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    PushNotifications?: PushPlugin;
  };
};

type PushPlugin = {
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (
    event: string,
    cb: (event: {
      value?: string;
      notification?: { data?: Record<string, string> };
    }) => void,
  ) => Promise<{ remove: () => void }> | { remove: () => void };
};

function capacitor(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return cap ?? null;
}

export function isCallCenterCapacitorNative(): boolean {
  const cap = capacitor();
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  } catch {
    return false;
  }
  return false;
}

export function getCallCenterCapacitorPlatform(): CapacitorPlatform {
  const cap = capacitor();
  const raw = cap?.getPlatform?.() ?? "web";
  if (raw === "android" || raw === "ios") return raw;
  return "web";
}

export function readCallCenterDeepLinkCallId(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): string | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    const callId = params.get("callId") || params.get("offer");
    if (!callId) return null;
    const trimmed = callId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

export function clearCallCenterDeepLinkParams() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("callId") && !url.searchParams.has("offer")) return;
    url.searchParams.delete("callId");
    url.searchParams.delete("offer");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // ignore
  }
}

function loadPushPlugin(): PushPlugin | null {
  if (!isCallCenterCapacitorNative()) return null;
  return capacitor()?.Plugins?.PushNotifications ?? null;
}

/**
 * Request permission, register for FCM, and return the device token (or null).
 * Also wires notification-open → navigate to /call-center?callId=…
 */
export async function registerCallCenterDevicePush(opts?: {
  onToken?: (token: string, platform: CapacitorPlatform) => void | Promise<void>;
  onIncomingCallId?: (callId: string) => void;
}): Promise<{ token: string | null; platform: CapacitorPlatform; error?: string }> {
  const platform = getCallCenterCapacitorPlatform();
  const push = loadPushPlugin();
  if (!push) {
    return { token: null, platform, error: "not_capacitor" };
  }

  try {
    const perm = await push.requestPermissions();
    if (perm.receive !== "granted") {
      return { token: null, platform, error: "permission_denied" };
    }

    let resolvedToken: string | null = null;
    await push.addListener("registration", (event) => {
      if (typeof event.value === "string" && event.value.trim()) {
        resolvedToken = event.value.trim();
        void opts?.onToken?.(resolvedToken, platform);
      }
    });

    await push.addListener("pushNotificationActionPerformed", (event) => {
      const data = event.notification?.data ?? {};
      const callId = data.callId || data.offer;
      if (typeof callId === "string" && callId.trim()) {
        opts?.onIncomingCallId?.(callId.trim());
        if (typeof window !== "undefined") {
          const target = `/call-center?callId=${encodeURIComponent(callId.trim())}`;
          if (!window.location.pathname.startsWith("/call-center")) {
            window.location.assign(target);
          } else {
            const url = new URL(window.location.href);
            url.searchParams.set("callId", callId.trim());
            window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
            opts?.onIncomingCallId?.(callId.trim());
          }
        }
      }
    });

    await push.register();

    const deadline = Date.now() + 8_000;
    while (!resolvedToken && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    return { token: resolvedToken, platform };
  } catch (error) {
    return {
      token: null,
      platform,
      error: error instanceof Error ? error.message : "push_register_failed",
    };
  }
}
