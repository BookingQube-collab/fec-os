import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findUsersWithCapability, notifyUsers } from "@/lib/notifications/action-notify";

import {
  DEFAULT_HR_NOTIFY_TOGGLES,
  mapHrNotifyEvent,
  shouldSendHrNotify,
  type HrNotifyEvent,
  type HrNotifyToggles,
} from "./hr-notify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadHrNotifyToggles(): Promise<HrNotifyToggles> {
  try {
    const { data } = await supabaseAdmin.from("hr_field_settings").select(
      "notify_missed_punch, notify_late, notify_geofence_exit, notify_corrections",
    ).limit(1).maybeSingle();
    if (!data) return DEFAULT_HR_NOTIFY_TOGGLES;
    return {
      notifyMissedPunch: data.notify_missed_punch !== false,
      notifyLate: data.notify_late !== false,
      notifyGeofenceExit: data.notify_geofence_exit !== false,
      notifyCorrections: data.notify_corrections !== false,
    };
  } catch {
    return DEFAULT_HR_NOTIFY_TOGGLES;
  }
}

export async function dispatchHrNotify(event: HrNotifyEvent, extraUserIds?: string[]): Promise<number> {
  try {
    const toggles = await loadHrNotifyToggles();
    if (!shouldSendHrNotify(event.kind, toggles)) return 0;
    const payload = mapHrNotifyEvent(event);
    const sourceId = payload.sourceId && UUID_RE.test(payload.sourceId) ? payload.sourceId : null;
    if (sourceId) {
      const { count } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("source_type", payload.sourceType)
        .eq("source_id", sourceId);
      if ((count ?? 0) > 0) return 0;
    }
    const userIds =
      extraUserIds && extraUserIds.length > 0
        ? extraUserIds
        : await findUsersWithCapability("attendance.view_all", event.locationId ?? null);
    return notifyUsers({
      userIds,
      locationId: event.locationId ?? null,
      category: payload.category,
      title: payload.title,
      body: payload.body,
      severity: payload.severity,
      actionUrl: payload.actionUrl,
      sourceType: payload.sourceType,
      sourceId,
    });
  } catch (error) {
    console.warn("[hr-notify] dispatch failed", error instanceof Error ? error.message : error);
    return 0;
  }
}
