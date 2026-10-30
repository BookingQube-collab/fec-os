import { describe, expect, it } from "vitest";

import { buildFallbackHrLetterDraft } from "@/lib/hr/hr-letter-fallback";
import type { HrLetterFacts } from "@/lib/hr/hr-letter-types";

const staff = {
  fullName: "Samir Ali",
  employeeCode: "E3-101",
  jobTitle: "Host",
  department: "Operations",
  locationLabel: "Inflata Park",
};

function facts(partial: Partial<HrLetterFacts> & Pick<HrLetterFacts, "letterType" | "reason">): HrLetterFacts {
  return {
    staffId: "00000000-0000-4000-8000-000000000001",
    letterDate: "2026-10-30",
    effectiveDate: "2026-11-01",
    amountQar: null,
    previousTitle: null,
    newTitle: null,
    additionalNotes: null,
    warningLevel: null,
    locale: "en",
    ...partial,
  };
}

describe("buildFallbackHrLetterDraft", () => {
  it("builds a warning letter with level in the subject", () => {
    const draft = buildFallbackHrLetterDraft(
      facts({ letterType: "warning_letter", reason: "Late arrival on three occasions.", warningLevel: "final" }),
      staff,
    );
    expect(draft.subject.toLowerCase()).toContain("final");
    expect(draft.salutation).toContain("Samir Ali");
    expect(draft.bodyParagraphs.join(" ")).toMatch(/Late arrival/i);
    expect(draft.closing).toBeTruthy();
  });

  it("includes increment amount when provided", () => {
    const draft = buildFallbackHrLetterDraft(
      facts({
        letterType: "increment_letter",
        reason: "Performance review cycle.",
        amountQar: 250,
      }),
      staff,
    );
    expect(draft.subject.toLowerCase()).toMatch(/increment|salary/i);
    expect(draft.bodyParagraphs.join(" ")).toMatch(/250/);
  });

  it("builds Arabic resignation acknowledgement", () => {
    const draft = buildFallbackHrLetterDraft(
      facts({
        letterType: "resignation_letter",
        reason: "Personal reasons",
        locale: "ar",
      }),
      staff,
    );
    expect(draft.subject).toMatch(/استقالة/);
    expect(draft.salutation).toContain("Samir Ali");
    expect(draft.bodyParagraphs.length).toBeGreaterThan(0);
  });
});
