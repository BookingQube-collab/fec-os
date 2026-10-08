import { englishAssistText } from "./copy";
import { resultFrom, takeItems } from "./items";
import type { AssistItem, AssistResult } from "./types";

export type RoleMatchInput = {
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  requiredSkills: string;
  candidateSkills: string;
  cvText: string;
  requiredExperienceYears: number | null;
  candidateExperienceYears: number | null;
  requiredEducation: string;
  candidateEducation: string;
  requiresQid: boolean;
  qidOnFile: boolean;
  requiresVisa: boolean;
  visaOnFile: boolean;
};

function tokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;|/]+/)) {
    const token = part.trim();
    const key = token.toLowerCase();
    if (token.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function haystack(row: RoleMatchInput): string {
  return `${row.candidateSkills}\n${row.cvText}\n${row.candidateEducation}`.toLowerCase();
}

function item(id: string, titleKey: string, whyKey: string, evidenceKey: string, row: RoleMatchInput, extra: Record<string, string | number>): AssistItem {
  return {
    id,
    titleKey,
    whyKey,
    evidenceKey,
    actionKey: "hrAssist.recruitment.action",
    linkKey: "hrAssist.openModule",
    href: `/people/recruitment/candidates/${row.candidateId}`,
    values: {
      candidateName: row.candidateName,
      jobTitle: row.jobTitle,
      requiredSkills: row.requiredSkills || "—",
      candidateSkills: row.candidateSkills || "—",
      requiredEducation: row.requiredEducation || "—",
      candidateEducation: row.candidateEducation || "—",
      ...extra,
    },
  };
}

/** Public facts only. Document numbers stay off the review note. */
export function candidateMatchFacts(row: {
  qid?: string | null;
  visa_status?: string | null;
}): { qidOnFile: boolean; visaOnFile: boolean } {
  return {
    qidOnFile: Boolean(row.qid && String(row.qid).trim()),
    visaOnFile: Boolean(row.visa_status && String(row.visa_status).trim()),
  };
}

export function buildRecruitmentMatch(input: { rows: RoleMatchInput[] }): AssistResult {
  if (!input.rows.length) return { status: "empty", items: [] };
  const anyRequirement = input.rows.some(
    (row) =>
      tokens(row.requiredSkills).length > 0 ||
      (row.requiredExperienceYears != null && row.requiredExperienceYears > 0) ||
      tokens(row.requiredEducation).length > 0 ||
      row.requiresQid ||
      row.requiresVisa,
  );
  if (!anyRequirement) return { status: "insufficient", items: [] };

  const items: AssistItem[] = [];
  for (const row of input.rows) {
    const found = haystack(row);
    const missingSkills = tokens(row.requiredSkills).filter((token) => !found.includes(token.toLowerCase()));
    if (missingSkills.length) {
      items.push(
        item(
          `role:skill:${row.candidateId}`,
          "hrAssist.recruitment.skill.title",
          "hrAssist.recruitment.skill.why",
          "hrAssist.recruitment.skill.evidence",
          row,
          { skills: missingSkills.join(", ") },
        ),
      );
    }
    if (row.requiredExperienceYears != null && row.requiredExperienceYears > 0) {
      if (row.candidateExperienceYears == null) {
        items.push(
          item(
            `role:exp-missing:${row.candidateId}`,
            "hrAssist.recruitment.experience_missing.title",
            "hrAssist.recruitment.experience_missing.why",
            "hrAssist.recruitment.experience_missing.evidence",
            row,
            { requiredYears: row.requiredExperienceYears },
          ),
        );
      } else if (row.candidateExperienceYears < row.requiredExperienceYears) {
        items.push(
          item(
            `role:exp:${row.candidateId}`,
            "hrAssist.recruitment.experience.title",
            "hrAssist.recruitment.experience.why",
            "hrAssist.recruitment.experience.evidence",
            row,
            { requiredYears: row.requiredExperienceYears, candidateYears: row.candidateExperienceYears },
          ),
        );
      }
    }
    const missingEducation = tokens(row.requiredEducation).filter((token) => !found.includes(token.toLowerCase()));
    if (missingEducation.length) {
      items.push(
        item(
          `role:edu:${row.candidateId}`,
          "hrAssist.recruitment.education.title",
          "hrAssist.recruitment.education.why",
          "hrAssist.recruitment.education.evidence",
          row,
          { education: missingEducation.join(", ") },
        ),
      );
    }
    if (row.requiresQid && !row.qidOnFile) {
      items.push(
        item(`role:qid:${row.candidateId}`, "hrAssist.recruitment.qid.title", "hrAssist.recruitment.qid.why", "hrAssist.recruitment.qid.evidence", row, {}),
      );
    }
    if (row.requiresVisa && !row.visaOnFile) {
      items.push(
        item(`role:visa:${row.candidateId}`, "hrAssist.recruitment.visa.title", "hrAssist.recruitment.visa.why", "hrAssist.recruitment.visa.evidence", row, {}),
      );
    }
  }
  return resultFrom(takeItems(items, 3, 12));
}

export function describeRecruitmentItem(item: AssistItem): { why: string; evidence: string } {
  return { why: englishAssistText(item.whyKey, item.values), evidence: englishAssistText(item.evidenceKey, item.values) };
}
