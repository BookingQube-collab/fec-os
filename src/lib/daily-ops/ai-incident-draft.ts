import "server-only";

import { z } from "zod";

import {
  INCIDENT_TYPE_LABELS,
  type IncidentType,
} from "@/lib/daily-ops/constants";

const INCIDENT_AI_MODEL = "google/gemini-3-flash-preview";

const IncidentDraftSchema = z.object({
  description: z.string(),
  action_taken: z.string(),
});

export type IncidentDraftFields = z.infer<typeof IncidentDraftSchema>;

export interface IncidentAiDraftContext {
  category: IncidentType;
  severity: string;
  location_code: string;
  location_name: string;
  occurred_at: string;
  partial_notes?: string | null;
}

function formatOccurredAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Qatar",
    });
  } catch {
    return iso;
  }
}

function buildFallbackDraft(ctx: IncidentAiDraftContext): IncidentDraftFields {
  const typeLabel = INCIDENT_TYPE_LABELS[ctx.category];
  const when = formatOccurredAt(ctx.occurred_at);
  const venue = `${ctx.location_name} (${ctx.location_code})`;
  const notes = ctx.partial_notes?.trim();

  const templates: Record<IncidentType, IncidentDraftFields> = {
    guest_injury_first_aid: {
      description: `A guest injury requiring first aid was reported at ${venue} on ${when}. Initial assessment was carried out on site.${notes ? ` Notes: ${notes}` : ""}`,
      action_taken:
        "First aid administered by trained staff. Guest comforted and incident area secured. Parents/guardians informed where applicable. Incident photos and witness details captured. Duty manager notified for follow-up and documentation.",
    },
    slip_trip_fall: {
      description: `A slip, trip, or fall incident occurred at ${venue} on ${when}.${notes ? ` Details: ${notes}` : " Area inspected for hazards such as wet floors or obstructions."}`,
      action_taken:
        "Area cordoned and hazard removed or signage placed. Guest/staff welfare checked. Cleaning or maintenance team alerted if surface defect identified. CCTV reviewed where available.",
    },
    equipment_malfunction: {
      description: `Equipment or ride malfunction reported at ${venue} on ${when}. Affected attraction taken out of service pending inspection.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "Attraction stopped safely and guests cleared from the area. Maintenance/technical team dispatched. Manufacturer SOP followed. Reopening only after engineer sign-off.",
    },
    attraction_stoppage_evacuation: {
      description: `Attraction stoppage or partial evacuation at ${venue} on ${when}. Operations paused to ensure guest safety.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "Evacuation procedure executed per venue protocol. All guests accounted for. Technical reset and safety checks completed before resuming operations. Incident debrief with shift supervisor.",
    },
    crowd_control_queue: {
      description: `Crowd control or queue management issue at ${venue} on ${when}.${notes ? ` ${notes}` : " Extended wait times or congestion observed in guest areas."}`,
      action_taken:
        "Additional floor staff deployed to manage queues. Guest communication improved at pinch points. Capacity controls adjusted if required. Duty manager informed.",
    },
    food_beverage: {
      description: `Food & beverage related incident at ${venue} on ${when}.${notes ? ` ${notes}` : " Guest complaint or hygiene concern raised."}`,
      action_taken:
        "Affected product/service withdrawn if applicable. Guest offered replacement or refund per policy. F&B supervisor notified. Cleaning/sanitisation completed. Stock batch noted for traceability.",
    },
    child_lost_found_welfare: {
      description: `Child lost, found, or welfare concern at ${venue} on ${when}.${notes ? ` ${notes}` : " Child separated from guardian in the venue."}`,
      action_taken:
        "Venue-wide alert issued to all zones. Child reunited with guardian or held in safe supervised area. ID verification completed. Security and duty manager notified. Incident logged for safeguarding records.",
    },
    security_theft_altercation: {
      description: `Security incident (theft, altercation, or suspicious behaviour) at ${venue} on ${when}.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "Security team responded and de-escalated where possible. CCTV preserved. Mall security notified if required. Police contacted per escalation matrix. Witness statements collected.",
    },
    fire_smoke_emergency_alarm: {
      description: `Fire, smoke, or emergency alarm activation at ${venue} on ${when}.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "Evacuation or investigation per fire safety plan. Fire panel and cause verified. Mall fire warden and authorities notified as per protocol. All-clear only after authorised sign-off.",
    },
    weather_power_outage: {
      description: `Weather-related disruption or power outage affecting operations at ${venue} on ${when}.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "Affected areas secured and guests guided to safe zones. Backup power/generators checked. Operations paused or modified until conditions stabilised. Regional ops updated on downtime impact.",
    },
    staff_injury: {
      description: `Staff injury reported at ${venue} on ${when}.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "First aid provided and HR notified. Work area made safe. Incident report completed for occupational health records. Cover arranged for affected shift if needed.",
    },
    property_damage: {
      description: `Property or asset damage reported at ${venue} on ${when}.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "Area secured to prevent further damage. Maintenance ticket raised with photos. Insurance/mall notification assessed by duty manager. Repair timeline communicated to operations.",
    },
    near_miss: {
      description: `Near-miss safety event recorded at ${venue} on ${when}. No injury occurred but potential hazard identified.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "Hazard removed or controlled immediately. Team briefed on corrective action. Added to safety observation log for weekly review. No guest impact at time of report.",
    },
    other: {
      description: `Operational incident reported at ${venue} on ${when}. Category: ${typeLabel}. Severity: ${ctx.severity}.${notes ? ` ${notes}` : ""}`,
      action_taken:
        "Duty manager notified. Area secured as needed. Standard incident documentation completed. Follow-up assigned to venue supervisor.",
    },
  };

  return templates[ctx.category];
}

function buildUserPrompt(ctx: IncidentAiDraftContext): string {
  return [
    "Draft a professional FEC (family entertainment centre) incident report for managers and supervisors.",
    `Venue: ${ctx.location_name} (${ctx.location_code})`,
    `Date/time: ${formatOccurredAt(ctx.occurred_at)}`,
    `Incident type: ${INCIDENT_TYPE_LABELS[ctx.category]}`,
    `Severity: ${ctx.severity}`,
    ctx.partial_notes?.trim() ? `Reporter notes: ${ctx.partial_notes.trim()}` : "",
    "",
    "Return ONLY valid JSON with two string fields:",
    "description — 2-4 sentences describing what happened (factual, professional, suitable for management review)",
    "action_taken — bullet-style actions already taken or recommended immediate steps (first aid, evacuation, notifications, etc.)",
    "Use Qatar FEC venue operations context. Do not invent specific guest names.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function callIncidentReportAiDraft(
  ctx: IncidentAiDraftContext,
): Promise<{ fields: IncidentDraftFields; ai_generated: boolean; suggested_severity?: string }> {
  const fallback = buildFallbackDraft(ctx);
  const messages = [
    {
      role: "system" as const,
      content:
        "You are a safety and operations reporting assistant for FEC venues in Qatar. Output only valid JSON with description and action_taken fields.",
    },
    { role: "user" as const, content: buildUserPrompt(ctx) },
  ];

  const lovableKey = process.env.LOVABLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const attempts: Array<{ url: string; headers: Record<string, string>; model: string; jsonMode?: boolean }> = [];
  if (lovableKey) {
    attempts.push({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      model: INCIDENT_AI_MODEL,
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

  if (!attempts.length) {
    return { fields: fallback, ai_generated: false };
  }

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
      const fields = IncidentDraftSchema.parse(parsed);
      return { fields, ai_generated: true };
    } catch {
      /* try next provider */
    }
  }

  return { fields: fallback, ai_generated: false };
}
