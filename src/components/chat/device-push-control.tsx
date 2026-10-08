"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  deleteOwnPushSubscription,
  loadChatPushClientConfig,
  saveOwnPushSubscription,
} from "@/lib/chat/push-settings.functions";

function urlBase64ToBytes(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function DevicePushControl() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [registered, setRegistered] = useState(false);
  const config = useQuery({
    queryKey: ["chat", "push-client"],
    queryFn: async () => {
      const result = await loadChatPushClientConfig({});
      if (!result.ok) return { enabled: false, publicKey: null as string | null };
      return result.data;
    },
  });

  if (!config.data?.enabled || !config.data.publicKey) return null;

  const publicKey = config.data.publicKey;
  const blocked = typeof Notification !== "undefined" && Notification.permission === "denied";

  async function enable() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error(t("chat.push.unsupported"));
      return;
    }
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error(t("chat.push.denied"));
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(publicKey) as BufferSource,
        }));
      const json = subscription.toJSON();
      if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        toast.error(t("chat.push.failed"));
        return;
      }
      const saved = await saveOwnPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      setRegistered(true);
      toast.success(t("chat.push.enabled"));
    } catch {
      toast.error(t("chat.push.failed"));
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    if (!("serviceWorker" in navigator)) return;
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        const removed = await deleteOwnPushSubscription({ endpoint });
        if (!removed.ok) {
          toast.error(removed.error);
          return;
        }
      }
      setRegistered(false);
    } catch {
      toast.error(t("chat.push.failed"));
    } finally {
      setPending(false);
    }
  }

  if (blocked) {
    return <p className="text-xs text-muted-foreground">{t("chat.push.denied")}</p>;
  }

  if (registered) {
    return (
      <Button type="button" variant="outline" className="min-h-11 shrink-0 px-3" disabled={pending} onClick={() => void disable()}>
        {t("chat.push.disable")}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 shrink-0 px-3"
      disabled={pending}
      aria-label={pending ? t("chat.push.enabling") : t("chat.push.enable")}
      onClick={() => void enable()}
    >
      <Bell className="h-4 w-4 md:me-1" aria-hidden />
      <span className="max-md:sr-only">{pending ? t("chat.push.enabling") : t("chat.push.enable")}</span>
    </Button>
  );
}
