export const HR_NOTIFY_CATEGORY = "people" as const;

export type HrNotifyKind =
  | "missed_punch"
  | "late"
  | "geofence_exit"
  | "restricted"
  | "correction_submitted"
  | "correction_approved"
  | "correction_rejected";

export type HrNotifyEvent = {
  kind: HrNotifyKind;
  staffName?: string | null;
  locationName?: string | null;
  workDate?: string | null;
  minutes?: number | null;
  distanceMeters?: number | null;
  locationId?: string | null;
  sourceId?: string | null;
};

export type HrNotifyPayload = {
  category: typeof HR_NOTIFY_CATEGORY;
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
};

export function mapHrNotifyEvent(event: HrNotifyEvent): HrNotifyPayload {
  const staff = (event.staffName ?? "Staff").trim() || "Staff";
  const site = (event.locationName ?? "site").trim() || "site";
  const date = event.workDate ?? "";
  const actionUrl = event.kind.startsWith("correction")
    ? "/people/attendance/corrections"
    : event.kind === "geofence_exit" || event.kind === "restricted"
      ? "/people/attendance/field"
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
      body = `A correction for ${staff}${date ? ` (${date})` : ""} is waiting for review.`;
      break;
    case "correction_approved":
      body = `Your correction for ${staff}${date ? ` on ${date}` : ""} was approved.`;
      severity = "info";
      break;
    case "correction_rejected":
      body = `Your correction for ${staff}${date ? ` on ${date}` : ""} was rejected.`;
      break;
  }

  return {
    category: HR_NOTIFY_CATEGORY,
    title: TITLES[event.kind],
    body,
    severity,
    actionUrl,
    sourceType: "attendance_hr",
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
  if (kind === "missed_punch") return toggles.notifyMissedPunch;
  if (kind === "late") return toggles.notifyLate;
  if (kind === "geofence_exit" || kind === "restricted") return toggles.notifyGeofenceExit;
  return toggles.notifyCorrections;
}
