import "server-only";

import { z } from "zod";

import { STAFF_ROLE_LABELS, type StaffRole } from "@/lib/daily-ops/constants";

const ROSTER_AI_MODEL = "google/gemini-3-flash-preview";

const RosterAssignmentSchema = z.object({
  staff_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  role_label: z.string().max(100).optional().nullable(),
});

const RosterAiResponseSchema = z.object({
  assignments: z.array(RosterAssignmentSchema),
});

export type RosterAiAssignment = z.infer<typeof RosterAssignmentSchema>;

export interface RosterStaffMember {
  id: string;
  full_name: string;
  employee_code: string;
  staff_role: string | null;
  job_title: string | null;
  department: string | null;
  departments: string[];
}

export interface RosterAiContext {
  location_code: string;
  location_name: string;
  week_start: string;
  week_end: string;
  staff: RosterStaffMember[];
  master_departments: string[];
  existing_shifts: Array<{
    staff_id: string;
    date: string;
    start_time: string;
    end_time: string;
  }>;
}

export interface RosterAiResult {
  entries: Array<{
    staff_id: string;
    date: string;
    start_time: string;
    end_time: string;
    role_label: string;
  }>;
  ai_generated: boolean;
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function roleLabelForStaff(s: RosterStaffMember): string {
  if (s.departments.length) return s.departments[0]!;
  if (s.department) return s.department.split(/[,+/]/)[0]!.trim();
  if (s.job_title) return s.job_title;
  if (s.staff_role && s.staff_role in STAFF_ROLE_LABELS) {
    return STAFF_ROLE_LABELS[s.staff_role as StaffRole];
  }
  return "Operations";
}

function busyKey(staffId: string, date: string): string {
  return `${staffId}:${date}`;
}

function buildBusySet(
  existing: RosterAiContext["existing_shifts"],
): Set<string> {
  return new Set(existing.map((s) => busyKey(s.staff_id, s.date)));
}

function validateAssignments(
  raw: RosterAiAssignment[],
  ctx: RosterAiContext,
): RosterAiResult["entries"] {
  const staffIds = new Set(ctx.staff.map((s) => s.id));
  const staffMap = new Map(ctx.staff.map((s) => [s.id, s]));
  const dates = new Set(enumerateDates(ctx.week_start, ctx.week_end));
  const busy = buildBusySet(ctx.existing_shifts);
  const seen = new Set<string>();
  const entries: RosterAiResult["entries"] = [];

  for (const a of raw) {
    if (!staffIds.has(a.staff_id)) continue;
    if (!dates.has(a.date)) continue;
    const key = busyKey(a.staff_id, a.date);
    if (busy.has(key) || seen.has(key)) continue;
    if (a.start_time >= a.end_time) continue;

    const st = staffMap.get(a.staff_id)!;
    entries.push({
      staff_id: a.staff_id,
      date: a.date,
      start_time: a.start_time,
      end_time: a.end_time,
      role_label: (a.role_label?.trim() || roleLabelForStaff(st)).slice(0, 100),
    });
    seen.add(key);
    busy.add(key);
  }

  return entries;
}

export function buildRuleBasedRoster(ctx: RosterAiContext): RosterAiResult["entries"] {
  const activeStaff = ctx.staff;
  if (!activeStaff.length) return [];

  const dates = enumerateDates(ctx.week_start, ctx.week_end);
  const busy = buildBusySet(ctx.existing_shifts);
  const entries: RosterAiResult["entries"] = [];
  let staffIndex = 0;

  const dailyTarget = Math.min(
    activeStaff.length,
    Math.max(2, Math.ceil(activeStaff.length * 0.65)),
  );

  for (const date of dates) {
    let assignedToday = 0;
    let attempts = 0;

    while (assignedToday < dailyTarget && attempts < activeStaff.length) {
      const s = activeStaff[staffIndex % activeStaff.length]!;
      staffIndex += 1;
      attempts += 1;

      const key = busyKey(s.id, date);
      if (busy.has(key)) continue;

      entries.push({
        staff_id: s.id,
        date,
        start_time: "09:00",
        end_time: "17:00",
        role_label: roleLabelForStaff(s),
      });
      busy.add(key);
      assignedToday += 1;
    }
  }

  return entries;
}

function buildUserPrompt(ctx: RosterAiContext): string {
  const staffJson = ctx.staff.map((s) => ({
    id: s.id,
    name: s.full_name,
    code: s.employee_code,
    role: s.staff_role,
    job_title: s.job_title,
    departments: s.departments.length ? s.departments : s.department ? [s.department] : [],
  }));

  const existingJson = ctx.existing_shifts.length
    ? ctx.existing_shifts
    : "none";

  return [
    `Generate a weekly staff roster for a family entertainment centre (FEC) venue.`,
    `Location: ${ctx.location_name} (${ctx.location_code})`,
    `Week: ${ctx.week_start} to ${ctx.week_end} (inclusive, Qatar timezone).`,
    `Typical venue hours: 09:00–17:00 daily unless role requires different coverage.`,
    `Master activity departments: ${ctx.master_departments.join(", ") || "Operations"}`,
    "",
    `Active staff JSON (use staff_id exactly as given):`,
    JSON.stringify(staffJson, null, 2),
    "",
    `Existing shifts to avoid double-booking (same staff same day):`,
    JSON.stringify(existingJson, null, 2),
    "",
    "Rules:",
    "- Assign shifts only to staff listed above.",
    "- Cover key departments (Ticketing, Battle Arena, F&B, etc.) across the week.",
    "- Each staff member at most one shift per day.",
    "- Do not duplicate existing shifts.",
    "- Prefer 09:00–17:00 for standard roles; supervisors may start earlier.",
    "- Distribute workload fairly across the week.",
    "",
    "Return ONLY valid JSON:",
    '{ "assignments": [ { "staff_id": "uuid", "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "role_label": "department or role" } ] }',
  ].join("\n");
}

async function callRosterAi(prompt: string): Promise<RosterAiAssignment[] | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const attempts: Array<{
    url: string;
    headers: Record<string, string>;
    model: string;
    jsonMode?: boolean;
  }> = [];

  if (lovableKey) {
    attempts.push({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      model: ROSTER_AI_MODEL,
    });
  }
  if (openaiKey) {
    attempts.push({
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      jsonMode: true,
    });
  }

  if (!attempts.length) return null;

  const messages = [
    {
      role: "system" as const,
      content:
        "You are an FEC workforce scheduling assistant. Output only valid JSON with an assignments array.",
    },
    { role: "user" as const, content: prompt },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: "POST",
        headers: attempt.headers,
        body: JSON.stringify({
          model: attempt.model,
          ...(attempt.jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages,
          temperature: 0.35,
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content;
      if (!text) continue;
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as unknown;
      const result = RosterAiResponseSchema.parse(parsed);
      if (result.assignments.length) return result.assignments;
    } catch {
      /* try next provider */
    }
  }

  return null;
}

export async function generateLocationRosterWithAi(ctx: RosterAiContext): Promise<RosterAiResult> {
  if (!ctx.staff.length) {
    return { entries: [], ai_generated: false };
  }

  const aiRaw = await callRosterAi(buildUserPrompt(ctx));
  if (aiRaw?.length) {
    const validated = validateAssignments(aiRaw, ctx);
    if (validated.length) {
      return { entries: validated, ai_generated: true };
    }
  }

  return { entries: buildRuleBasedRoster(ctx), ai_generated: false };
}
