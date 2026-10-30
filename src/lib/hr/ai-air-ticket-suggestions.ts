import "server-only";

import { z } from "zod";

import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import {
  buildFallbackAirTicketAssistSummary,
  type AirTicketSuggestion,
} from "@/lib/hr-air-ticket";

const SummarySchema = z.object({
  summary: z.string().min(20).max(600),
});

/**
 * Short HR assist blurb for the air-ticket suggestions panel.
 * Falls back to a deterministic summary when AI is offline.
 */
export async function callAiAirTicketAssistSummary(
  suggestions: AirTicketSuggestion[],
  locale: "en" | "ar" = "en",
): Promise<{ summary: string; aiGenerated: boolean }> {
  const fallback = buildFallbackAirTicketAssistSummary(suggestions);
  if (suggestions.length === 0) {
    return { summary: fallback, aiGenerated: false };
  }

  const language = locale === "ar" ? "Arabic" : "English";
  const payload = suggestions.slice(0, 12).map((s) => ({
    name: s.staffName,
    employeeCode: s.employeeCode,
    kind: s.kind,
    eligibilityOn: s.eligibilityOn,
    daysUntilEligibility: s.daysUntilEligibility,
    cycleIndex: s.cycleIndex,
    yearsOfService: s.yearsOfService,
  }));

  const parsed = await completeJsonViaGateway(
    [
      {
        role: "system",
        content:
          "You write concise HR operations briefings for E3 Entertainment (Qatar) air-ticket entitlements. Output only valid JSON with key summary. Never invent staff names or dates. Do not mention AI.",
      },
      {
        role: "user",
        content: [
          `Write a 1–2 sentence briefing in ${language} for HR about permanent staff air-ticket anniversaries.`,
          'Output ONLY JSON: {"summary":"..."}.',
          "Tone: clear, operational, helpful. Mention how many are due vs approaching if both exist.",
          "Facts:",
          JSON.stringify({ dueCount: suggestions.filter((s) => s.kind === "due").length, approachingCount: suggestions.filter((s) => s.kind === "approaching").length, staff: payload }),
        ].join("\n"),
      },
    ],
    { temperature: 0.2, moduleSource: "hr.air_ticket.suggestions" },
  );

  if (!parsed) return { summary: fallback, aiGenerated: false };
  const checked = SummarySchema.safeParse(parsed);
  if (!checked.success) return { summary: fallback, aiGenerated: false };
  return { summary: checked.data.summary.trim(), aiGenerated: true };
}
