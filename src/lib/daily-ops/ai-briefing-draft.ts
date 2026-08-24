import "server-only";

import { z } from "zod";

import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import { SHIFT_PERIOD_LABELS, type ShiftPeriod } from "@/lib/daily-ops/constants";

const BriefingDraftSchema = z.object({
  key_notes: z.string(),
  handover_items: z.string(),
});

export type BriefingDraftFields = z.infer<typeof BriefingDraftSchema>;

export interface BriefingAiDraftContext {
  location_code: string;
  location_name: string;
  briefing_date: string;
  shift: ShiftPeriod;
  supervisor_name: string;
  staff_scheduled: number;
  staff_present: number;
  partial_notes?: string | null;
}

function buildFallbackDraft(ctx: BriefingAiDraftContext): BriefingDraftFields {
  const absent = Math.max(0, ctx.staff_scheduled - ctx.staff_present);
  const attendance =
    ctx.staff_scheduled > 0 ? Math.round((ctx.staff_present / ctx.staff_scheduled) * 100) : 0;
  const notes = ctx.partial_notes?.trim();
  const shiftLabel = SHIFT_PERIOD_LABELS[ctx.shift];

  return {
    key_notes: [
      `${shiftLabel} briefing at ${ctx.location_name} (${ctx.location_code}) on ${ctx.briefing_date}.`,
      `Attendance: ${ctx.staff_present}/${ctx.staff_scheduled} (${attendance}%).${absent ? ` ${absent} absent.` : ""}`,
      notes ? `Supervisor notes: ${notes}` : "No exceptional items flagged in the draft prompt.",
    ].join("\n"),
    handover_items: [
      "Confirm attraction readiness and guest-facing staffing for the next shift.",
      absent ? `Cover gaps from ${absent} absence(s) before doors.` : "Maintain current coverage unless demand changes.",
      "Escalate any open incidents, complaints, or maintenance blockers to the incoming supervisor.",
    ].join("\n"),
  };
}

export async function callBriefingAiDraft(
  ctx: BriefingAiDraftContext,
): Promise<{ fields: BriefingDraftFields; ai_generated: boolean }> {
  const fallback = buildFallbackDraft(ctx);
  const parsed = await completeJsonViaGateway(
    [
      {
        role: "system",
        content:
          "You are an FEC shift-briefing assistant for Qatar venues. Output only valid JSON with key_notes and handover_items.",
      },
      {
        role: "user",
        content: [
          "Draft a professional shift briefing for a family entertainment centre.",
          `Venue: ${ctx.location_name} (${ctx.location_code})`,
          `Date: ${ctx.briefing_date}`,
          `Shift: ${SHIFT_PERIOD_LABELS[ctx.shift]}`,
          `Supervisor: ${ctx.supervisor_name || "Duty supervisor"}`,
          `Staff scheduled: ${ctx.staff_scheduled}`,
          `Staff present: ${ctx.staff_present}`,
          ctx.partial_notes?.trim() ? `Supervisor notes: ${ctx.partial_notes.trim()}` : "",
          "",
          "Return ONLY valid JSON with two string fields:",
          "key_notes — 3-6 short bullets: attendance, VIP/ops highlights, issues (plain text, newlines ok)",
          "handover_items — 3-6 short bullets for the next supervisor (coverage, open tickets, guest issues)",
          "Use Qatar FEC operations language. Do not invent guest names or incidents that are not in the notes.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    { temperature: 0.35, moduleSource: "daily_ops.briefing_draft" },
  );

  if (!parsed) return { fields: fallback, ai_generated: false };
  try {
    return { fields: BriefingDraftSchema.parse(parsed), ai_generated: true };
  } catch {
    return { fields: fallback, ai_generated: false };
  }
}
