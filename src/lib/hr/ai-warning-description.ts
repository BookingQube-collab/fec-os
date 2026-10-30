import "server-only";

import { z } from "zod";

import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import type { HrLetterStaffContext } from "@/lib/hr/ai-letter-draft";
import type { HrWarningCategory, HrWarningLevel } from "@/lib/hr-warnings";

const DraftSchema = z.object({
  description: z.string().min(20).max(4000),
});

function formatDisplayDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function levelLabel(level: HrWarningLevel): string {
  switch (level) {
    case "verbal":
      return "verbal";
    case "final":
      return "final written";
    case "other":
      return "formal";
    default:
      return "written";
  }
}

function categoryLabel(category: HrWarningCategory): string {
  return category.replace(/_/g, " ");
}

export type WarningDescriptionFacts = {
  category: HrWarningCategory;
  warningLevel: HrWarningLevel;
  incidentOn: string;
  notes?: string | null;
  locale?: "en" | "ar";
};

/** Deterministic description when AI is offline or returns invalid JSON. */
export function buildFallbackWarningDescription(
  facts: WarningDescriptionFacts,
  staff: HrLetterStaffContext,
): string {
  const name = staff.fullName.trim() || "the employee";
  const code = staff.employeeCode?.trim();
  const title = staff.jobTitle?.trim();
  const identity = [code ? `Employee ID ${code}` : null, title ? title : null].filter(Boolean).join(", ");
  const date = formatDisplayDate(facts.incidentOn);
  const notes = facts.notes?.trim();
  const level = levelLabel(facts.warningLevel);
  const category = categoryLabel(facts.category);

  if (facts.locale === "ar") {
    const parts = [
      `يُسجَّل هذا الإنذار (${level}) بحق ${name}${identity ? ` (${identity})` : ""} بخصوص ${category} بتاريخ ${date}.`,
      notes
        ? `تفاصيل الواقعة: ${notes}`
        : `يتعلق الأمر بمخالفة تتعلق بـ${category} وتتطلب تصحيحاً فورياً والالتزام بمعايير الشركة.`,
      `يُتوقع من الموظف تصحيح الوضع فوراً. وقد يؤدي تكرار المخالفة إلى إجراءات تأديبية إضافية وفق سياسة الشركة، دون إنهاء تلقائي للخدمة.`,
    ];
    return parts.join("\n\n");
  }

  const parts = [
    `This ${level} warning is issued to ${name}${identity ? ` (${identity})` : ""} regarding ${category}, relating to an incident on ${date}.`,
    notes
      ? `Incident details: ${notes}`
      : `The matter concerns a ${category} issue that requires immediate corrective action and adherence to company standards.`,
    `The employee is expected to correct this immediately and maintain the standards required by E3 Entertainment. Further breaches may lead to additional disciplinary action in line with company policy. Warnings do not auto-terminate employment.`,
  ];
  return parts.join("\n\n");
}

export async function callAiWarningDescription(
  facts: WarningDescriptionFacts,
  staff: HrLetterStaffContext,
): Promise<{ description: string; aiGenerated: boolean }> {
  const fallback = buildFallbackWarningDescription(facts, staff);
  const locale = facts.locale === "ar" ? "Arabic" : "English";
  const parsed = await completeJsonViaGateway(
    [
      {
        role: "system",
        content:
          "You write formal HR disciplinary warning descriptions for employee files at E3 Entertainment (Qatar). Output only valid JSON with key description. Never invent dates, names, or facts not provided. Do not recommend or imply automatic termination.",
      },
      {
        role: "user",
        content: [
          `Write a professional disciplinary warning description in ${locale}.`,
          "Output ONLY JSON: {\"description\":\"...\"}.",
          "2–4 short paragraphs suitable for the HR file and for printing on a company warning letter.",
          "Tone: formal, clear, factual. Include expectation to correct conduct and that further breaches may lead to further disciplinary action under policy.",
          "Facts:",
          JSON.stringify(
            {
              category: facts.category,
              warningLevel: facts.warningLevel,
              incidentOn: facts.incidentOn,
              notes: facts.notes?.trim() || null,
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
        ].join("\n"),
      },
    ],
    { temperature: 0.35, moduleSource: "hr.warning_description" },
  );

  if (!parsed) return { description: fallback, aiGenerated: false };
  try {
    const draft = DraftSchema.parse(parsed);
    return { description: draft.description.trim(), aiGenerated: true };
  } catch {
    return { description: fallback, aiGenerated: false };
  }
}
