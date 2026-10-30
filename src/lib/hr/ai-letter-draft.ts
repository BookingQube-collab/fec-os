import "server-only";

import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import {
  buildFallbackHrLetterDraft,
  type HrLetterStaffContext,
} from "@/lib/hr/hr-letter-fallback";
import {
  HrLetterDraftSchema,
  letterTypeLabelEn,
  type HrLetterDocType,
  type HrLetterDraft,
  type HrLetterFacts,
} from "@/lib/hr/hr-letter-types";

export type { HrLetterStaffContext } from "@/lib/hr/hr-letter-fallback";
export { buildFallbackHrLetterDraft } from "@/lib/hr/hr-letter-fallback";

function clampParagraphs(paragraphs: string[]): string[] {
  return paragraphs
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function buildUserPrompt(facts: HrLetterFacts, staff: HrLetterStaffContext): string {
  const type = facts.letterType as HrLetterDocType;
  return [
    `Write a formal HR ${letterTypeLabelEn(type)} for E3 Entertainment (FEC operations) in Qatar.`,
    `Locale/language for the letter body: ${facts.locale === "ar" ? "Arabic" : "English"}.`,
    "Output ONLY valid JSON with keys: subject, reference (nullable), salutation, bodyParagraphs (array of strings), closing, signatoryTitle.",
    "Do not invent salary figures, dates, job titles, or legal claims that are not in the facts.",
    "Keep tone formal, clear, and suitable for printing on company letterhead. 2–5 body paragraphs.",
    "Facts:",
    JSON.stringify(
      {
        letterType: facts.letterType,
        letterDate: facts.letterDate,
        effectiveDate: facts.effectiveDate ?? null,
        amountQar: facts.amountQar ?? null,
        previousTitle: facts.previousTitle ?? null,
        newTitle: facts.newTitle ?? null,
        reason: facts.reason,
        additionalNotes: facts.additionalNotes ?? null,
        warningLevel: facts.warningLevel ?? null,
        employee: {
          fullName: staff.fullName,
          employeeCode: staff.employeeCode,
          jobTitle: staff.jobTitle,
          department: staff.department,
          location: staff.locationLabel,
        },
      },
      null,
      2,
    ),
  ].join("\n");
}

export async function callHrLetterAiDraft(
  facts: HrLetterFacts,
  staff: HrLetterStaffContext,
): Promise<{ draft: HrLetterDraft; aiGenerated: boolean }> {
  const fallback = buildFallbackHrLetterDraft(facts, staff);
  const parsed = await completeJsonViaGateway(
    [
      {
        role: "system",
        content:
          "You are an HR letter writer for E3 Entertainment in Qatar. Output only valid JSON. Never invent facts. Prefer clear formal language appropriate for employee files.",
      },
      { role: "user", content: buildUserPrompt(facts, staff) },
    ],
    { temperature: 0.35, moduleSource: "hr.letter_draft" },
  );

  if (!parsed) return { draft: fallback, aiGenerated: false };

  try {
    const draft = HrLetterDraftSchema.parse(parsed);
    return {
      draft: {
        ...draft,
        bodyParagraphs: clampParagraphs(draft.bodyParagraphs),
        reference: draft.reference?.trim() || null,
      },
      aiGenerated: true,
    };
  } catch {
    return { draft: fallback, aiGenerated: false };
  }
}
