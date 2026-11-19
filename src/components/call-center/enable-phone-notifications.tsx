"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  isCallCenterCapacitorNative,
  registerCallCenterDevicePush,
} from "@/lib/call-center/capacitor-push";
import {
  registerCallCenterFcmToken,
  unregisterCallCenterFcmToken,
} from "@/lib/call-center/call-center.functions";

const TOKEN_KEY = "cc-fcm-token:v1";

/**
 * Shown on Call Center when running inside the Capacitor Android shell.
 * Registers the FCM token so closed-app offers can wake the agent.
 */
export function EnablePhoneNotifications() {
  const { t } = useTranslation();
  const [native, setNative] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNative(isCallCenterCapacitorNative());
    try {
      setEnabled(Boolean(localStorage.getItem(TOKEN_KEY)));
    } catch {
      setEnabled(false);
    }
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await registerCallCenterDevicePush({
        onToken: async (token, platform) => {
          const saved = await registerCallCenterFcmToken({ token, platform });
          if (!saved.ok) throw new Error(saved.error);
          try {
            localStorage.setItem(TOKEN_KEY, token);
          } catch {
            // ignore
          }
          setEnabled(true);
        },
      });
      if (result.error === "permission_denied") {
        toast.error(t("callCenter.phoneNotificationsDenied"));
        return;
      }
      if (result.error === "not_capacitor") {
        toast.message(t("callCenter.phoneNotificationsDesktopHint"));
        return;
      }
      if (result.token) {
        const saved = await registerCallCenterFcmToken({
          token: result.token,
          platform: result.platform,
        });
        if (!saved.ok) throw new Error(saved.error);
        try {
          localStorage.setItem(TOKEN_KEY, result.token);
        } catch {
          // ignore
        }
        setEnabled(true);
        toast.success(t("callCenter.phoneNotificationsEnabled"));
      } else if (!result.error) {
        toast.message(t("callCenter.phoneNotificationsPending"));
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.phoneNotificationsFailed"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      let token: string | null = null;
      try {
        token = localStorage.getItem(TOKEN_KEY);
      } catch {
        token = null;
      }
      const result = await unregisterCallCenterFcmToken(token ? { token } : {});
      if (!result.ok) throw new Error(result.error);
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        // ignore
      }
      setEnabled(false);
      toast.message(t("callCenter.phoneNotificationsDisabled"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.phoneNotificationsFailed"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  // Desktop: still show a compact control that explains Android APK is required.
  if (!native) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10"
        onClick={() => toast.message(t("callCenter.phoneNotificationsDesktopHint"))}
      >
        <BellOff className="me-1.5 h-4 w-4" aria-hidden />
        {t("callCenter.phoneNotifications")}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={enabled ? "secondary" : "outline"}
      size="sm"
      className="min-h-10"
      disabled={busy}
      onClick={() => void (enabled ? disable() : enable())}
    >
      {busy ? (
        <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden />
      ) : enabled ? (
        <Bell className="me-1.5 h-4 w-4" aria-hidden />
      ) : (
        <BellOff className="me-1.5 h-4 w-4" aria-hidden />
      )}
      {enabled ? t("callCenter.phoneNotificationsOn") : t("callCenter.enablePhoneNotifications")}
    </Button>
  );
}
