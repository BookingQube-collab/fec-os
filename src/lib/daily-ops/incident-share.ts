import { incidentTypeLabel } from "@/lib/daily-ops/constants";

export interface IncidentSharePayload {
  reference: string;
  location_code: string;
  location_name?: string;
  occurred_at: string;
  category: string;
  severity: string;
  summary: string;
  action_taken: string | null;
  reported_by_name: string;
}

function formatOccurredAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Qatar",
    });
  } catch {
    return iso;
  }
}

function severityEmoji(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "medium":
      return "🟡";
    case "low":
      return "🟢";
    default:
      return "⚪";
  }
}

/** Professional WhatsApp message for managers and supervisors */
export function formatIncidentWhatsAppMessage(payload: IncidentSharePayload): string {
  const venue = payload.location_name
    ? `${payload.location_name} (${payload.location_code})`
    : payload.location_code;
  const typeLabel = incidentTypeLabel(payload.category);
  const when = formatOccurredAt(payload.occurred_at);
  const action = payload.action_taken?.trim() || "Pending — follow up with reporting supervisor.";

  return [
    "📋 *FEC Incident Report*",
    "",
    `*Ref:* ${payload.reference}`,
    `*Venue:* ${venue}`,
    `*When:* ${when}`,
    `*Type:* ${typeLabel}`,
    `*Severity:* ${severityEmoji(payload.severity)} ${payload.severity.toUpperCase()}`,
    `*Reported by:* ${payload.reported_by_name}`,
    "",
    "*Description*",
    payload.summary.trim(),
    "",
    "*Action taken*",
    action,
    "",
    "_Submitted via FEC-OS Daily Operations. Please acknowledge and advise if escalation is required._",
  ].join("\n");
}

export function incidentWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export async function shareIncidentOnWhatsApp(message: string): Promise<"opened" | "copied"> {
  const url = incidentWhatsAppUrl(message);
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) return "opened";

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return "copied";
  }

  window.location.href = url;
  return "opened";
}
