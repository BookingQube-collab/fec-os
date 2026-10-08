export const HELPDESK_STATUSES = ["open", "waiting", "in_progress", "resolved"] as const;
export type HelpdeskStatus = (typeof HELPDESK_STATUSES)[number];

export const DEFAULT_HELPDESK_CATEGORIES = [
  "payroll",
  "attendance",
  "document",
  "shift",
  "transport",
  "equipment",
  "relations",
  "other",
] as const;

export const HELPDESK_STORAGE_MISSING = "HELPDESK_STORAGE_MISSING";
export const HELPDESK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const HELPDESK_ATTACHMENT_BUCKET = "hr-helpdesk";

const ATTACHMENT_MIMES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type HelpdeskAttachmentMime = (typeof ATTACHMENT_MIMES)[number];

export function isHelpdeskStatus(value: string): value is HelpdeskStatus {
  return (HELPDESK_STATUSES as readonly string[]).includes(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function parseHelpdeskPayload(payload: Record<string, unknown>) {
  const question = typeof payload.question === "string" ? payload.question : "";
  const titleRaw = typeof payload.title === "string" ? payload.title.trim() : "";
  const statusRaw = typeof payload.status === "string" ? payload.status : "open";
  const categoryRaw = typeof payload.category === "string" ? payload.category.trim() : "";
  const assigneeRaw = payload.assigneeStaffId;
  const ticketNo = numberOrNull(payload.ticketNo);
  return {
    title: titleRaw || question,
    question,
    status: isHelpdeskStatus(statusRaw) ? statusRaw : "open",
    category: categoryRaw || "other",
    assigneeStaffId: typeof assigneeRaw === "string" && assigneeRaw ? assigneeRaw : null,
    ticketNo: ticketNo != null && ticketNo > 0 ? Math.trunc(ticketNo) : null,
    confidential: payload.confidential === true || payload.confidential === "true",
    firstResponseHours: numberOrNull(payload.firstResponseHours),
    resolutionHours: numberOrNull(payload.resolutionHours),
    resolutionAnchor: typeof payload.resolutionAnchor === "string" ? payload.resolutionAnchor : null,
    firstPublicReplyAt: typeof payload.firstPublicReplyAt === "string" ? payload.firstPublicReplyAt : null,
  };
}

export function helpdeskStorageMissing(message: string | undefined): boolean {
  return Boolean(
    message && /does not exist|schema cache|Could not find the function|relation|bucket/i.test(message),
  );
}

export function helpdeskAttachmentMime(mime: string): HelpdeskAttachmentMime | null {
  const base = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (base === "image/jpg" || base === "image/pjpeg") return "image/jpeg";
  if (base === "application/pdf" || base === "image/png" || base === "image/jpeg") return base;
  return null;
}

export function helpdeskFileMime(file: { type: string; name: string }): HelpdeskAttachmentMime | null {
  return (
    helpdeskAttachmentMime(file.type) ??
    (file.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : file.name.toLowerCase().endsWith(".png")
        ? "image/png"
        : file.name.toLowerCase().endsWith(".jpg") || file.name.toLowerCase().endsWith(".jpeg")
          ? "image/jpeg"
          : null)
  );
}

export function helpdeskAttachmentMagicOk(mime: string, bytes: Uint8Array): boolean {
  const canonical = helpdeskAttachmentMime(mime);
  if (!canonical || bytes.length === 0 || bytes.length > HELPDESK_ATTACHMENT_MAX_BYTES) return false;
  if (canonical === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (canonical === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export type HelpdeskTargetInput = {
  createdAt: string;
  resolutionAnchor: string | null;
  status: string;
  firstResponseHours: number | null;
  resolutionHours: number | null;
  firstPublicReplyAt: string | null;
  now?: Date;
};

export type HelpdeskTargets = {
  firstResponseDue: string | null;
  firstResponseOverdue: boolean;
  resolutionDue: string | null;
  resolutionOverdue: boolean;
};

function addHours(iso: string, hours: number): string | null {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(hours)) return null;
  return new Date(start.getTime() + hours * 3_600_000).toISOString();
}

/** Due times from saved response hours. Missing hours stay unset. */
export function helpdeskTargets(input: HelpdeskTargetInput): HelpdeskTargets {
  const now = input.now ?? new Date();
  const firstResponseDue =
    input.firstResponseHours != null ? addHours(input.createdAt, input.firstResponseHours) : null;
  const anchor = input.resolutionAnchor || input.createdAt;
  const resolutionDue = input.resolutionHours != null ? addHours(anchor, input.resolutionHours) : null;
  const firstDueMs = firstResponseDue ? new Date(firstResponseDue).getTime() : Number.NaN;
  const resolutionDueMs = resolutionDue ? new Date(resolutionDue).getTime() : Number.NaN;
  return {
    firstResponseDue,
    firstResponseOverdue: Boolean(
      firstResponseDue && !input.firstPublicReplyAt && firstDueMs < now.getTime(),
    ),
    resolutionDue,
    resolutionOverdue: Boolean(
      resolutionDue && input.status !== "resolved" && resolutionDueMs < now.getTime(),
    ),
  };
}
