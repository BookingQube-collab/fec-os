/**
 * Pure rules for sharing an existing FEC record into chat.
 * A chat_entity_links row does not grant access to the record.
 * The viewer’s own select is the card. An empty select is no access.
 * Opening the card uses the module’s existing route, which applies that module’s guard again.
 */
import { z } from "zod";

import { CHAT_TEXT_BODY_MAX } from "@/lib/chat/message-rules";

export const CHAT_ENTITY_RESULT_CAP = 15;
export const CHAT_ENTITY_QUERY_MIN = 2;
export const CHAT_ENTITY_QUERY_MAX = 80;
export const CHAT_ENTITY_FALLBACK_BODY = "Shared record";

export const CHAT_SHAREABLE_ENTITY_TYPES = [
  "MAINTENANCE_TICKET",
  "PURCHASE_REQUEST",
  "INCIDENT",
  "EVENT",
  "EMPLOYEE",
  "ARCADE_MACHINE",
  "TRAINING_COURSE",
  "TRAINING_CERTIFICATE",
  "TRAINING_SESSION",
] as const;

export type ChatShareableEntityType = (typeof CHAT_SHAREABLE_ENTITY_TYPES)[number];

/**
 * Schema allows these, but there is no single readable table with a clear permission check.
 * TASK has facility_tasks, event_tasks, arcade_week_tasks, and compliance_recurring_tasks.
 * ROSTER is a schedule, not one record route. ATTENDANCE_ISSUE is not a table.
 * INVENTORY_REQUEST is not a table. BIRTHDAY_BOOKING is not a kind on bookings.
 * APPROVAL is split across leave, overtime, procurement, and correction tables.
 */
export const CHAT_UNSHARED_ENTITY_TYPES = [
  "TASK",
  "ROSTER",
  "ATTENDANCE_ISSUE",
  "INVENTORY_REQUEST",
  "BIRTHDAY_BOOKING",
  "APPROVAL",
] as const;

export type ChatEntitySource = {
  table: string;
  columns: string;
  searchColumns: readonly string[];
  deletedAt: boolean;
};

/** Column lists are the only fields the user-scoped select may request. */
export const CHAT_ENTITY_SOURCES: Record<ChatShareableEntityType, ChatEntitySource> = {
  MAINTENANCE_TICKET: {
    table: "tickets",
    columns: "id, title, status, priority, location_id",
    searchColumns: ["title"],
    deletedAt: true,
  },
  PURCHASE_REQUEST: {
    table: "purchase_requisitions",
    columns: "id, pr_number, title, status, priority, location_id",
    searchColumns: ["pr_number", "title"],
    deletedAt: false,
  },
  INCIDENT: {
    table: "incidents",
    columns: "id, summary, status, severity, location_id",
    searchColumns: ["summary"],
    deletedAt: true,
  },
  EVENT: {
    table: "events",
    columns: "id, event_number, name, event_name, status, priority, location_id",
    searchColumns: ["event_number", "name", "event_name"],
    deletedAt: true,
  },
  EMPLOYEE: {
    table: "staff",
    columns: "id, full_name, employee_code, job_title, location_id",
    searchColumns: ["full_name", "employee_code", "job_title"],
    deletedAt: true,
  },
  ARCADE_MACHINE: {
    table: "arcade_machines",
    columns: "id, asset_code, name, status, location_id",
    searchColumns: ["asset_code", "name"],
    deletedAt: false,
  },
  TRAINING_COURSE: {
    table: "training_courses",
    columns: "id, code, title, status, location_id",
    searchColumns: ["code", "title"],
    deletedAt: false,
  },
  TRAINING_CERTIFICATE: {
    table: "training_certificates",
    columns: "id, course_title, status",
    searchColumns: ["course_title"],
    deletedAt: false,
  },
  TRAINING_SESSION: {
    table: "training_sessions",
    columns: "id, course_id, status, location_id, starts_at",
    searchColumns: [],
    deletedAt: false,
  },
};

export type ChatEmployeeCardFields = {
  fullName: string;
  employeeCode: string;
  jobTitle: string | null;
};

export type ChatEntityCardFields = {
  code: string | null;
  title: string;
  jobTitle: string | null;
  locationName: string | null;
  status: string | null;
  priority: string | null;
  href: string | null;
};

export type ChatEntityPreviewAccess =
  | { access: false }
  | { access: true; card: ChatEntityCardFields };

const HTML_TAG = /<\/?[a-z][^>]*>/i;

const noteMessages = {
  long: "Message must be 8000 characters or less.",
  html: "Messages are plain text.",
} as const;

export function chatEntityShareIssue(entityType: string): "unsupported" | null {
  if ((CHAT_SHAREABLE_ENTITY_TYPES as readonly string[]).includes(entityType)) return null;
  return "unsupported";
}

export function chatEntityPlain(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const plain = value.replace(/<\/?[a-z][^>]*>/gi, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  const chars = Array.from(plain);
  return chars.length <= max ? plain : chars.slice(0, max).join("");
}

export function chatEntityShortId(entityId: string): string {
  return entityId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Existing module routes. Incident has a log, not a record page, so it has no open link. */
export function chatEntityHref(entityType: string, entityId: string): string | null {
  if (!z.string().uuid().safeParse(entityId).success) return null;
  if (entityType === "MAINTENANCE_TICKET") return `/issues/${entityId}`;
  if (entityType === "PURCHASE_REQUEST") return `/procurement/requisitions/${entityId}`;
  if (entityType === "EVENT") return `/events/${entityId}`;
  if (entityType === "EMPLOYEE") return `/people/staff/${entityId}`;
  if (entityType === "ARCADE_MACHINE") return `/arcade/machines/${entityId}`;
  if (entityType === "TRAINING_COURSE") return `/training/${entityId}`;
  if (entityType === "TRAINING_SESSION") return `/training/sessions/${entityId}`;
  return null;
}

/**
 * Staff card identity. Reads only name, employee code, and job title.
 * Location name is supplied by a separate locations lookup, not from this row.
 */
export function chatEmployeeCardFields(row: Record<string, unknown> | null): ChatEmployeeCardFields | null {
  if (row == null) return null;
  const fullName = chatEntityPlain(row.full_name, 120);
  const employeeCode = chatEntityPlain(row.employee_code, 40);
  if (!fullName || !employeeCode) return null;
  return {
    fullName,
    employeeCode,
    jobTitle: chatEntityPlain(row.job_title, 80),
  };
}

export function chatEntityPreviewAccess(card: ChatEntityCardFields | null): ChatEntityPreviewAccess {
  if (card == null) return { access: false };
  return { access: true, card };
}

function firstPlain(row: Record<string, unknown>, keys: readonly string[], max = 160): string | null {
  for (const key of keys) {
    const value = chatEntityPlain(row[key], max);
    if (value) return value;
  }
  return null;
}

/**
 * Builds a card from a row the viewer already selected.
 * Returns null when the type is unsupported or the row is missing.
 */
export function chatEntityCardFromRow(
  entityType: string,
  row: Record<string, unknown> | null,
  locationName: string | null,
): ChatEntityCardFields | null {
  if (chatEntityShareIssue(entityType) || row == null) return null;
  const entityId = typeof row.id === "string" ? row.id : "";
  if (!entityId) return null;
  const site = chatEntityPlain(locationName, 80);
  const href = chatEntityHref(entityType, entityId);
  const status = chatEntityPlain(row.status, 40);
  const priority = chatEntityPlain(row.priority, 40);

  if (entityType === "EMPLOYEE") {
    const employee = chatEmployeeCardFields(row);
    if (!employee) return null;
    return {
      code: employee.employeeCode,
      title: employee.fullName,
      jobTitle: employee.jobTitle,
      locationName: site,
      status: null,
      priority: null,
      href,
    };
  }

  if (entityType === "MAINTENANCE_TICKET") {
    const title = firstPlain(row, ["title"]) ?? chatEntityShortId(entityId);
    return { code: chatEntityShortId(entityId), title, jobTitle: null, locationName: site, status, priority, href };
  }

  if (entityType === "PURCHASE_REQUEST") {
    const code = chatEntityPlain(row.pr_number, 40);
    const title = firstPlain(row, ["title"]) ?? code ?? chatEntityShortId(entityId);
    return { code, title, jobTitle: null, locationName: site, status, priority, href };
  }

  if (entityType === "INCIDENT") {
    const title = firstPlain(row, ["summary"]) ?? chatEntityShortId(entityId);
    return {
      code: chatEntityShortId(entityId),
      title,
      jobTitle: null,
      locationName: site,
      status,
      priority: chatEntityPlain(row.severity, 40),
      href: null,
    };
  }

  if (entityType === "EVENT") {
    const code = chatEntityPlain(row.event_number, 40);
    const title = firstPlain(row, ["name", "event_name"]) ?? code ?? chatEntityShortId(entityId);
    return { code, title, jobTitle: null, locationName: site, status, priority, href };
  }

  if (entityType === "ARCADE_MACHINE") {
    const code = chatEntityPlain(row.asset_code, 40);
    const title = firstPlain(row, ["name"]) ?? code ?? chatEntityShortId(entityId);
    return { code, title, jobTitle: null, locationName: site, status, priority: null, href };
  }

  if (entityType === "TRAINING_COURSE") {
    const code = chatEntityPlain(row.code, 40);
    const title = firstPlain(row, ["title"]) ?? code ?? chatEntityShortId(entityId);
    return { code, title, jobTitle: null, locationName: site, status, priority: null, href };
  }

  if (entityType === "TRAINING_CERTIFICATE") {
    const title = firstPlain(row, ["course_title"]) ?? chatEntityShortId(entityId);
    return {
      code: chatEntityShortId(entityId),
      title,
      jobTitle: null,
      locationName: null,
      status,
      priority: null,
      href: null,
    };
  }

  if (entityType === "TRAINING_SESSION") {
    const code = chatEntityPlain(row.course_code, 40);
    const courseTitle = firstPlain(row, ["course_title"]) ?? code ?? chatEntityShortId(entityId);
    const when = chatEntityPlain(row.starts_at, 40);
    const title = when ? `${courseTitle} · ${when}` : courseTitle;
    return { code, title, jobTitle: null, locationName: site, status, priority: null, href };
  }

  return null;
}

export function chatEntityNoteIssue(note: string): "long" | "html" | null {
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (Array.from(trimmed).length > CHAT_TEXT_BODY_MAX) return "long";
  if (HTML_TAG.test(trimmed)) return "html";
  return null;
}

/** The optional note, otherwise a type-free label. Record fields are not stored on the message. */
export function chatEntityMessageBody(note: string | null | undefined): string {
  const trimmed = note?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : CHAT_ENTITY_FALLBACK_BODY;
}

export function chatEntityLikePattern(query: string): string | null {
  const cleaned = query
    .trim()
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_ENTITY_QUERY_MAX);
  if (cleaned.length < CHAT_ENTITY_QUERY_MIN) return null;
  return `"*${cleaned.replace(/[%_*"]/g, "")}*"`;
}

const noteField = z.string().trim().superRefine((value, ctx) => {
  const issue = chatEntityNoteIssue(value);
  if (!issue) return;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: noteMessages[issue] });
});

export const shareEntityInChatSchema = z.object({
  conversationId: z.string().uuid(),
  entityType: z.enum(CHAT_SHAREABLE_ENTITY_TYPES),
  entityId: z.string().uuid(),
  note: noteField.optional(),
  clientMessageId: z.string().uuid(),
});

export const searchChatEntitiesSchema = z.object({
  query: z.string().trim().superRefine((value, ctx) => {
    if (value.length < CHAT_ENTITY_QUERY_MIN) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Type at least 2 characters." });
    }
    if (value.length > CHAT_ENTITY_QUERY_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Search must be 80 characters or less." });
    }
  }),
  entityType: z.enum(CHAT_SHAREABLE_ENTITY_TYPES).optional(),
});
