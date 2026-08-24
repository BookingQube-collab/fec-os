import "server-only";

import { z } from "zod";

import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import {
  cleanAssigneeNameHint,
  ensurePolishedDescription,
  formatQatarDatetimeLocal,
  inferAssigneeFromNotes,
  matchLocationByCodeOrName,
  matchTechnicianByName,
  normalizeReportedAtValue,
  parseReportedAtFromNotes,
  polishDescription,
  type MaintenanceLocationOption,
  type MaintenanceTechnicianOption,
} from "@/lib/maintenance/ai-request-draft";
import { MAINTENANCE_PRIORITIES, type MaintenancePriority } from "@/lib/maintenance/sla";

const WO_KINDS = ["corrective", "preventive", "inspection", "installation"] as const;
export type WorkOrderKind = (typeof WO_KINDS)[number];

const PrioritySchema = z.enum(["normal", "medium", "urgent"]);
const KindSchema = z.enum(WO_KINDS);

export type MaintenanceAssetOption = {
  id: string;
  tag: string;
  name: string;
};

export type MaintenanceWorkOrderDraftFields = {
  title: string;
  kind: WorkOrderKind;
  priority: MaintenancePriority;
  description: string;
  polished_description: string;
  /** `datetime-local` in Asia/Qatar, or null. */
  planned_end: string | null;
  asset_id: string | null;
  asset_tag: string | null;
  asset_name: string | null;
  assignee_name: string | null;
  /** Profile UUID when uniquely matched (not `requested:*`). */
  assigned_to: string | null;
  assignee_ambiguous: boolean;
  location_id: string | null;
  location_code: string | null;
  location_name: string | null;
};

export interface MaintenanceWorkOrderAiDraftContext {
  notes: string;
  location_id?: string;
  location_code: string;
  location_name: string;
  available_locations?: MaintenanceLocationOption[];
  available_technicians?: MaintenanceTechnicianOption[];
  available_assets?: MaintenanceAssetOption[];
  now?: Date;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickAllowed<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const trimmed = value.trim().toLowerCase();
  const hit = allowed.find((a) => a.toLowerCase() === trimmed);
  return hit ?? fallback;
}

function inferPriority(notes: string): MaintenancePriority {
  const lower = notes.toLowerCase();
  if (/urgent|emergency|asap|danger|fire|flood|smoke|safety|guest impact|critical/.test(lower)) {
    return "urgent";
  }
  if (/soon|important|busy|queue|affecting|medium/.test(lower)) return "medium";
  return "normal";
}

function inferKind(notes: string): WorkOrderKind {
  const lower = notes.toLowerCase();
  if (/preventive|pm schedule|scheduled maintenance|routine service/.test(lower)) return "preventive";
  if (/inspect|inspection|check.?up|audit/.test(lower)) return "inspection";
  if (/install|installation|new (?:unit|machine|equipment)|commission/.test(lower)) return "installation";
  return "corrective";
}

/** Match an asset by tag or name mentioned in free text. */
export function matchAssetFromNotes(
  notes: string,
  assets: MaintenanceAssetOption[],
): MaintenanceAssetOption | null {
  if (!notes.trim() || !assets.length) return null;
  const normalizedNotes = normalizeKey(notes);
  type Hit = { asset: MaintenanceAssetOption; score: number };
  const hits: Hit[] = [];

  for (const asset of assets) {
    let best = 0;
    for (const alias of [asset.tag, asset.name, `${asset.tag} ${asset.name}`]) {
      const key = normalizeKey(alias);
      if (key.length < 2) continue;
      let matched = false;
      if (key.includes(" ")) {
        matched = normalizedNotes.includes(key);
      } else {
        matched = new RegExp(`(?:^|\\s)${escapeRegExp(key)}(?:\\s|$)`).test(normalizedNotes);
      }
      if (matched && key.length > best) best = key.length;
    }
    if (best > 0) hits.push({ asset, score: best });
  }

  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  const top = hits[0].score;
  const winners = hits.filter((h) => h.score === top);
  const uniqueIds = new Set(winners.map((w) => w.asset.id));
  if (uniqueIds.size !== 1) return null;
  return winners[0].asset;
}

function titleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Build a short work-order title from free-text notes. */
export function inferWorkOrderTitle(notes: string, venue: string): string {
  const trimmed = notes.trim().replace(/\s+/g, " ");
  if (!trimmed) return `Maintenance — ${venue.split("(")[0]?.trim() || venue}`;

  const lower = trimmed.toLowerCase();
  if (/\barcade\b/.test(lower) && /not work|broken|down|out of order/.test(lower)) {
    return "Arcade game not working";
  }
  if (/ac\b|a\/c|air.?cond|hvac/.test(lower) && /not|broken|warm|hot|cool/.test(lower)) {
    return "HVAC / AC issue";
  }
  if (/leak|drip|flood|water/.test(lower)) return "Water leak";
  if (/power|electric|light|breaker|outage/.test(lower)) return "Electrical issue";
  if (/door|lock|gate/.test(lower)) return "Door / access issue";
  if (/toilet|restroom|bathroom|plumb/.test(lower)) return "Plumbing issue";

  // First clause, shortened
  const clause = trimmed.split(/[.!?;]/)[0]?.trim() ?? trimmed;
  let title = clause
    .replace(/\b(please|i want you to|kindly|urgent|asap)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length > 80) title = `${title.slice(0, 77).trim()}…`;
  if (title.length < 3) return `Maintenance work — ${venue.split("(")[0]?.trim() || venue}`;
  return titleCase(title);
}

function venueLabel(ctx: MaintenanceWorkOrderAiDraftContext): string {
  return `${ctx.location_name} (${ctx.location_code})`;
}

function isRealProfileId(id: string | null | undefined): boolean {
  if (!id) return false;
  if (id.startsWith("requested:")) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function resolveAssignee(
  notes: string,
  technicians: MaintenanceTechnicianOption[],
  aiAssigneeName?: string | null,
  aiAssigneeId?: string | null,
): Pick<
  MaintenanceWorkOrderDraftFields,
  "assignee_name" | "assigned_to" | "assignee_ambiguous"
> {
  if (aiAssigneeId && isRealProfileId(aiAssigneeId)) {
    const byId = technicians.find((t) => t.id === aiAssigneeId);
    if (byId) {
      return {
        assignee_name: byId.name,
        assigned_to: byId.id,
        assignee_ambiguous: false,
      };
    }
  }

  if (aiAssigneeName?.trim()) {
    const matched = matchTechnicianByName(
      cleanAssigneeNameHint(aiAssigneeName) ?? aiAssigneeName,
      technicians,
    );
    if (matched.assigned_technician_id && isRealProfileId(matched.assigned_technician_id)) {
      return {
        assignee_name: matched.assignee_name,
        assigned_to: matched.assigned_technician_id,
        assignee_ambiguous: false,
      };
    }
    if (matched.assignee_ambiguous) {
      return {
        assignee_name: matched.assignee_name,
        assigned_to: null,
        assignee_ambiguous: true,
      };
    }
  }

  const fromNotes = inferAssigneeFromNotes(notes, technicians);
  if (fromNotes.assigned_technician_id && isRealProfileId(fromNotes.assigned_technician_id)) {
    return {
      assignee_name: fromNotes.assignee_name,
      assigned_to: fromNotes.assigned_technician_id,
      assignee_ambiguous: false,
    };
  }
  if (fromNotes.assignee_ambiguous) {
    return {
      assignee_name: fromNotes.assignee_name,
      assigned_to: null,
      assignee_ambiguous: true,
    };
  }

  return {
    assignee_name: fromNotes.assignee_name ?? cleanAssigneeNameHint(aiAssigneeName),
    assigned_to: null,
    assignee_ambiguous: false,
  };
}

function withLocationFields(
  fields: Omit<
    MaintenanceWorkOrderDraftFields,
    "location_id" | "location_code" | "location_name" | "polished_description"
  > & { polished_description?: string },
  ctx: MaintenanceWorkOrderAiDraftContext,
): MaintenanceWorkOrderDraftFields {
  const polished = (fields.polished_description ?? fields.description).trim() || fields.description;
  return {
    ...fields,
    description: polished,
    polished_description: polished,
    location_id: ctx.location_id ?? null,
    location_code: ctx.location_code || null,
    location_name: ctx.location_name || null,
  };
}

function buildFallbackDraft(ctx: MaintenanceWorkOrderAiDraftContext): MaintenanceWorkOrderDraftFields {
  const venue = venueLabel(ctx);
  const techs = ctx.available_technicians ?? [];
  const assets = ctx.available_assets ?? [];
  const now = ctx.now ?? new Date();
  const assignee = resolveAssignee(ctx.notes, techs);
  const asset = matchAssetFromNotes(ctx.notes, assets);
  const description = polishDescription(ctx.notes, venue);
  return withLocationFields(
    {
      title: inferWorkOrderTitle(ctx.notes, venue),
      kind: inferKind(ctx.notes),
      priority: inferPriority(ctx.notes),
      description,
      polished_description: description,
      planned_end: parseReportedAtFromNotes(ctx.notes, now),
      asset_id: asset?.id ?? null,
      asset_tag: asset?.tag ?? null,
      asset_name: asset?.name ?? null,
      assignee_name: assignee.assignee_name,
      assigned_to: assignee.assigned_to,
      assignee_ambiguous: assignee.assignee_ambiguous,
    },
    ctx,
  );
}

function buildUserPrompt(ctx: MaintenanceWorkOrderAiDraftContext): string {
  const techs = ctx.available_technicians ?? [];
  const locations = ctx.available_locations ?? [];
  const assets = ctx.available_assets ?? [];
  const techLine = techs.length
    ? `assignee_name — person to assign if mentioned; MUST be exactly one of: ${techs.map((t) => t.name).join(", ")} (empty string if none)`
    : "assignee_name — person name if mentioned, else empty string";
  const locLine = locations.length
    ? `location_code — venue from the notes if mentioned; MUST be exactly one of: ${locations.map((l) => `${l.code} (${l.name})`).join(", ")} (empty if none — default is ${ctx.location_code})`
    : "location_code — venue code if mentioned, else empty string";
  const assetLine = assets.length
    ? `asset_tag — asset tag if mentioned; MUST be exactly one of: ${assets.map((a) => `${a.tag} (${a.name})`).join(", ")} (empty if none)`
    : "asset_tag — empty string";
  return [
    "Draft a professional FEC (family entertainment centre) maintenance work order from free-text notes.",
    `Default venue: ${ctx.location_name} (${ctx.location_code})`,
    `Reporter notes: ${ctx.notes.trim()}`,
    `Current datetime (Asia/Qatar): ${formatQatarDatetimeLocal(ctx.now ?? new Date())}`,
    "",
    "Return ONLY valid JSON with these fields:",
    locLine,
    "title — short work-order title (max ~80 chars), clear and specific",
    `kind — one of: ${WO_KINDS.join(", ")}`,
    `priority — one of: ${MAINTENANCE_PRIORITIES.join(", ")}`,
    "description — 2-4 polished factual sentences in clear professional English for technicians",
    "polished_description — same as description",
    "planned_end — requested/planned date-time from notes as YYYY-MM-DDTHH:mm in Asia/Qatar (empty if none). Prefer explicit dates; tomorrow defaults to 09:00 unless a time is given; tonight≈20:00.",
    techLine,
    assetLine,
    "If the notes name a different venue than the default, set location_code to that venue.",
  ].join("\n");
}

export async function callMaintenanceWorkOrderAiDraft(
  ctx: MaintenanceWorkOrderAiDraftContext,
): Promise<{ fields: MaintenanceWorkOrderDraftFields; ai_generated: boolean }> {
  const techs = ctx.available_technicians ?? [];
  const locations = ctx.available_locations ?? [];
  const assets = ctx.available_assets ?? [];
  const now = ctx.now ?? new Date();
  const fallback = buildFallbackDraft(ctx);

  const DraftSchema = z.object({
    location_code: z.string().optional().nullable(),
    title: z.string(),
    kind: KindSchema,
    priority: PrioritySchema,
    description: z.string(),
    polished_description: z.string().optional().nullable(),
    planned_end: z.string().optional().nullable(),
    scheduled_at: z.string().optional().nullable(),
    reported_at: z.string().optional().nullable(),
    assignee_name: z.string().optional().nullable(),
    assigned_to: z.string().optional().nullable(),
    asset_tag: z.string().optional().nullable(),
    asset_id: z.string().optional().nullable(),
  });

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a maintenance work-order assistant for FEC venues in Qatar. Output only valid JSON. Extract venue, title, kind, priority, planned date/time, assignee, and asset when present. Polish the description into clear professional English.",
    },
    { role: "user" as const, content: buildUserPrompt(ctx) },
  ];

  const parsed = await completeJsonViaGateway(messages, {
    temperature: 0.3,
    moduleSource: "maintenance.work_order",
  });
  if (!parsed) return { fields: fallback, ai_generated: false };

  try {
    const fields = DraftSchema.parse(parsed);

      const plannedEnd =
        normalizeReportedAtValue(
          fields.planned_end ?? fields.scheduled_at ?? fields.reported_at,
          now,
        ) ?? parseReportedAtFromNotes(ctx.notes, now);

      const assignee = resolveAssignee(
        ctx.notes,
        techs,
        fields.assignee_name,
        fields.assigned_to,
      );

      const aiLoc = matchLocationByCodeOrName(fields.location_code, locations);
      const resolvedCtx: MaintenanceWorkOrderAiDraftContext = aiLoc
        ? {
            ...ctx,
            location_id: aiLoc.id,
            location_code: aiLoc.code,
            location_name: aiLoc.name,
          }
        : ctx;

      const polished = ensurePolishedDescription(
        fields.polished_description?.trim() || fields.description.trim(),
        ctx.notes,
        venueLabel(resolvedCtx),
      );

      let asset: MaintenanceAssetOption | null = null;
      if (fields.asset_id) {
        asset = assets.find((a) => a.id === fields.asset_id) ?? null;
      }
      if (!asset && fields.asset_tag?.trim()) {
        const tagKey = normalizeKey(fields.asset_tag);
        asset =
          assets.find((a) => normalizeKey(a.tag) === tagKey || normalizeKey(a.name) === tagKey) ??
          null;
      }
      if (!asset) asset = matchAssetFromNotes(ctx.notes, assets);

      const titleRaw = fields.title.trim() || fallback.title;
      const title = titleRaw.length > 200 ? `${titleRaw.slice(0, 197).trim()}…` : titleRaw;

      return {
        fields: withLocationFields(
          {
            title: title.length >= 3 ? title : inferWorkOrderTitle(ctx.notes, venueLabel(resolvedCtx)),
            kind: pickAllowed(fields.kind, WO_KINDS, fallback.kind),
            priority: fields.priority,
            description: polished,
            polished_description: polished,
            planned_end: plannedEnd,
            asset_id: asset?.id ?? null,
            asset_tag: asset?.tag ?? null,
            asset_name: asset?.name ?? null,
            assignee_name: assignee.assignee_name,
            assigned_to: assignee.assigned_to,
            assignee_ambiguous: assignee.assignee_ambiguous,
          },
          resolvedCtx,
        ),
        ai_generated: true,
      };
  } catch {
    return { fields: fallback, ai_generated: false };
  }
}
