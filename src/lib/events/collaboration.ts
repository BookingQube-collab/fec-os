/** Event PM Phase 6 — mentions + meeting-action helpers (pure). */

import {
  MEETING_ACTION_STATUSES,
  type MeetingActionStatus,
} from "@/lib/events/constants";

export { MEETING_ACTION_STATUSES, type MeetingActionStatus };

export const OPEN_MEETING_ACTION_STATUSES = new Set<string>(["open"]);

export const DEFAULT_WIKI_SLUG = "notes";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** Explicit token: @[staff:<uuid>] or @staff:<uuid> */
const EXPLICIT_MENTION_RE =
  /@\[staff:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]|@staff:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/gi;

export type StaffMentionOpt = { id: string; full_name: string };

export type MentionHit = {
  staffId: string;
  raw: string;
  start: number;
  end: number;
  kind: "explicit" | "name";
};

export type ParseMentionsResult = {
  staffIds: string[];
  hits: MentionHit[];
};

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Build insertable mention token for a staff id. */
export function formatStaffMentionToken(staffId: string): string {
  return `@[staff:${staffId}]`;
}

/**
 * Parse @mentions from post body.
 * - Explicit `@[staff:uuid]` / `@staff:uuid` always count.
 * - Name mentions (`@Ada Lovelace`) match longest staff full_name first (case-insensitive).
 */
export function parseMentions(body: string, staff: StaffMentionOpt[] = []): ParseMentionsResult {
  const hits: MentionHit[] = [];
  const covered = new Set<string>(); // "start:end"

  const explicit = body.matchAll(EXPLICIT_MENTION_RE);
  for (const m of explicit) {
    const staffId = (m[1] || m[2] || "").toLowerCase();
    if (!staffId || m.index == null) continue;
    const start = m.index;
    const end = start + m[0].length;
    covered.add(`${start}:${end}`);
    hits.push({ staffId, raw: m[0], start, end, kind: "explicit" });
  }

  const byName = [...staff]
    .filter((s) => s.full_name?.trim())
    .sort((a, b) => b.full_name.trim().length - a.full_name.trim().length);

  for (const s of byName) {
    const name = s.full_name.trim();
    const needle = `@${name}`;
    const lowerBody = body.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    let from = 0;
    while (from < body.length) {
      const idx = lowerBody.indexOf(lowerNeedle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      // Avoid matching mid-token / already covered ranges
      const overlaps = [...covered].some((key) => {
        const [a, b] = key.split(":").map(Number);
        return idx < b && end > a;
      });
      const boundaryOk =
        (idx === 0 || /[\s([{,]/.test(body[idx - 1] ?? "")) &&
        (end >= body.length || /[\s)\]}.,!?:;]/.test(body[end] ?? ""));
      if (!overlaps && boundaryOk) {
        covered.add(`${idx}:${end}`);
        hits.push({
          staffId: s.id,
          raw: body.slice(idx, end),
          start: idx,
          end,
          kind: "name",
        });
      }
      from = idx + 1;
    }
  }

  hits.sort((a, b) => a.start - b.start);
  const staffIds = [...new Set(hits.map((h) => h.staffId))];
  return { staffIds, hits };
}

/** Resolve mentioned staff ids, preferring explicit parse then optional extra ids. */
export function resolveMentionStaffIds(
  body: string,
  staff: StaffMentionOpt[],
  extraIds: Array<string | null | undefined> = [],
): string[] {
  const parsed = parseMentions(body, staff).staffIds;
  const extras = extraIds.filter((id): id is string => Boolean(id) && UUID_RE.test(id));
  return [...new Set([...parsed, ...extras])];
}

export function isOpenMeetingAction(status: string): boolean {
  return OPEN_MEETING_ACTION_STATUSES.has(status);
}

export function isDoneMeetingAction(status: string): boolean {
  return status === "done";
}

/** True when an action can spawn / link a task (open, not already linked). */
export function meetingActionCanLinkTask(action: {
  status: string;
  task_id?: string | null;
}): boolean {
  return isOpenMeetingAction(action.status) && !action.task_id;
}

export function normalizeMeetingActionStatus(status: string | null | undefined): MeetingActionStatus {
  if (status === "done" || status === "cancelled") return status;
  return "open";
}

export function meetingActionTaskTitle(meetingTitle: string, actionTitle: string): string {
  const mt = meetingTitle.trim() || "Meeting";
  const at = actionTitle.trim() || "Action";
  return `${mt}: ${at}`.slice(0, 200);
}

export function wikiSlugOrDefault(slug?: string | null): string {
  const s = (slug ?? DEFAULT_WIKI_SLUG).trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9_-]{0,62}$/.test(s)) return s;
  return DEFAULT_WIKI_SLUG;
}

export function staffNameIndex(staff: StaffMentionOpt[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of staff) {
    map.set(s.id, s.full_name);
    map.set(normalizeName(s.full_name), s.id);
  }
  return map;
}
