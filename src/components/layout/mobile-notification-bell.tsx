"use client";

import { NotificationBell } from "@/components/layout/notification-bell";

/**
 * Phone notification control. Same portaled inbox as the desktop bell so the
 * panel is not clipped by the sticky header or the shell overflow.
 */
export function MobileNotificationBell() {
  return <NotificationBell />;
}
