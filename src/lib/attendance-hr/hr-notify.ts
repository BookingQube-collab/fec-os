import {
  NOTIFICATIONS_INBOX_HREF,
  PEOPLE_CORRECTIONS_HREF,
} from "@/lib/attendance-hr/missed-punch-approval";

export const HR_NOTIFY_CATEGORY = "people" as const;
/** Leave request lifecycle uses dedicated preference category (Phase 11). */
export const HR_LEAVE_NOTIFY_CATEGORY = "hr_leave" as const;

export type HrNotifyKind =
  | "missed_punch"
  | "late"
  | "geofence_exit"
  | "restricted"
  | "correction_submitted"
  | "correction_approved"
  | "correction_rejected"
  | "leave_submitted"
  | "leave_approved"
  | "leave_rejected";

export type HrNotifyEvent = {
  kind: HrNotifyKind;
  staffName?: string | null;
  locationName?: string | null;
  workDate?: string | null;
  minutes?: number | null;
  distanceMeters?: number | null;
  locationId?: string | null;
  sourceId?: string | null;
  /** Human-facing request number (e.g. LV-20261021-0001) when available. */
  requestNumber?: string | null;
};

export type HrNotifyPayload = {
  category: typeof HR_NOTIFY_CATEGORY | typeof HR_LEAVE_NOTIFY_CATEGORY;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  actionUrl: string;
  sourceType: string;
  sourceId: string | null;
};

const TITLES: Record<HrNotifyKind, string> = {
  missed_punch: "Missed punch",
  late: "Late arrival",
  geofence_exit: "Geofence exit",
  restricted: "Restricted area",
  correction_submitted: "Attendance correction submitted",
  correction_approved: "Attendance correction approved",
  correction_rejected: "Attendance correction rejected",
  leave_submitted: "Leave request needs your approval",
  leave_approved: "Leave approved",
  leave_rejected: "Leave rejected",
};

export function mapHrNotifyEvent(event: HrNotifyEvent): HrNotifyPayload {
  const staff = (event.staffName ?? "Staff").trim() || "Staff";
  const site = (event.locationName ?? "site").trim() || "site";
  const date = event.workDate ?? "";
  const number = event.requestNumber?.trim() || "";
  const numberSuffix = number ? ` (${number})` : "";
  const actionUrl =
    event.kind === "correction_submitted"
      ? NOTIFICATIONS_INBOX_HREF
      : event.kind === "correction_approved" || event.kind === "correction_rejected"
        ? PEOPLE_CORRECTIONS_HREF
        : event.kind.startsWith("leave")
          ? event.kind === "leave_submitted"
            ? "/hr/me#me-leave-approvals"
            : "/hr/me"
          : event.kind === "geofence_exit" || event.kind === "restricted"
            ? "/people/field"
            : "/people/attendance/reports";

  let body: string;
  let severity: HrNotifyPayload["severity"] = "warning";

  switch (event.kind) {
    case "missed_punch":
      body = `${staff} has a missed punch${date ? ` on ${date}` : ""} at ${site}.`;
      break;
    case "late":
      body = `${staff} was late${event.minutes ? ` by ${event.minutes} min` : ""}${date ? ` on ${date}` : ""} at ${site}.`;
      break;
    case "geofence_exit":
      body = `${staff} checked in outside the operate zone at ${site}${
        event.distanceMeters != null ? ` (${event.distanceMeters} m from centre)` : ""
      }.`;
      severity = "critical";
      break;
    case "restricted":
      body = `${staff} reported a location inside a restricted zone at ${site}.`;
      severity = "critical";
      break;
    case "correction_submitted":
      body = `A correction for ${staff}${date ? ` (${date})` : ""}${numberSuffix} is waiting for review.`;
      break;
    case "correction_approved":
      body = `Your correction for ${staff}${date ? ` on ${date}` : ""}${numberSuffix} was approved.`;
      severity = "info";
      break;
    case "correction_rejected":
      body = `Your correction for ${staff}${date ? ` on ${date}` : ""}${numberSuffix} was rejected.`;
      break;
    case "leave_submitted":
      body = `${staff} submitted leave request${numberSuffix}${date ? ` from ${date}` : ""}. It is waiting for their line manager.`;
      break;
    case "leave_approved":
      body = `Leave for ${staff}${numberSuffix}${date ? ` from ${date}` : ""} was approved.`;
      severity = "info";
      break;
    case "leave_rejected":
      body = `Leave for ${staff}${numberSuffix}${date ? ` from ${date}` : ""} was rejected.`;
      break;
  }

  const leaveKind = event.kind.startsWith("leave_");
  const title = number && leaveKind ? `${TITLES[event.kind]} · ${number}` : TITLES[event.kind];
  return {
    category: leaveKind ? HR_LEAVE_NOTIFY_CATEGORY : HR_NOTIFY_CATEGORY,
    title,
    body,
    severity,
    actionUrl,
    sourceType: leaveKind ? "hr_leave" : "attendance_hr",
    sourceId: event.sourceId ?? null,
  };
}

export type HrNotifyToggles = {
  notifyMissedPunch: boolean;
  notifyLate: boolean;
  notifyGeofenceExit: boolean;
  notifyCorrections: boolean;
};

export const DEFAULT_HR_NOTIFY_TOGGLES: HrNotifyToggles = {
  notifyMissedPunch: true,
  notifyLate: true,
  notifyGeofenceExit: true,
  notifyCorrections: true,
};

export function shouldSendHrNotify(kind: HrNotifyKind, toggles: HrNotifyToggles): boolean {
  // Leave approval workflow always notifies the next actor (line manager / employee).
  if (kind.startsWith("leave_")) return true;
  if (kind === "missed_punch") return toggles.notifyMissedPunch;
  if (kind === "late") return toggles.notifyLate;
  if (kind === "geofence_exit" || kind === "restricted") return toggles.notifyGeofenceExit;
  return toggles.notifyCorrections;
}
