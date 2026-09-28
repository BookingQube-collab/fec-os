"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import BellToggle from "@/components/react-bits/bell-toggle";
import { useAuth } from "@/hooks/use-auth";
import { useActionInbox } from "@/hooks/queries/useNotifications";

/**
 * Phone notification control. The pill, ring, and badge are React Bits Bell Toggle.
 * Pressed opens Notifications; unread count keeps the badge visible.
 */
export function MobileNotificationBell() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const inbox = useActionInbox(user?.id, { enabled: !!user });
  const unread = inbox.data?.unreadCount ?? 0;
  const onNotifications = pathname === "/notifications" || pathname.startsWith("/notifications/");
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (unread > 0 || onNotifications) setPressed(true);
  }, [unread, onNotifications]);

  const label = t("common.notifications");

  return (
    <BellToggle
      size="sm"
      label={label}
      offLabel={label}
      onLabel={label}
      count={unread}
      pressed={pressed}
      onChange={(next) => {
        setPressed(next || unread > 0 || onNotifications);
        router.push("/notifications");
      }}
    />
  );
}
