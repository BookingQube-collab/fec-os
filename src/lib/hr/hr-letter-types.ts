import { z } from "zod";

/** HR letter doc types filed on employee records (subset of HR_DOC_TYPES). */
export const HR_LETTER_DOC_TYPES = [
  "warning_letter",
  "increment_letter",
  "demotion_letter",
  "resignation_letter",
  "termination_letter",
] as const;

export type HrLetterDocType = (typeof HR_LETTER_DOC_TYPES)[number];

export const HR_LETTER_WARNING_LEVELS = ["verbal", "written", "final"] as const;

export const HrLetterDraftSchema = z.object({
  subject: z.string().min(1).max(200),
  reference: z.string().max(80).optional().nullable(),
  salutation: z.string().min(1).max(120),
  bodyParagraphs: z.array(z.string().min(1).max(2000)).min(1).max(12),
  closing: z.string().min(1).max(200),
  signatoryTitle: z.string().min(1).max(120),
});

export type HrLetterDraft = z.infer<typeof HrLetterDraftSchema>;

export const HrLetterFactsSchema = z.object({
  staffId: z.string().uuid(),
  letterType: z.enum(HR_LETTER_DOC_TYPES),
  letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  amountQar: z.number().min(0).max(1_000_000).optional().nullable(),
  previousTitle: z.string().max(120).optional().nullable(),
  newTitle: z.string().max(120).optional().nullable(),
  reason: z.string().trim().min(3).max(4000),
  additionalNotes: z.string().max(2000).optional().nullable(),
  warningLevel: z.enum(HR_LETTER_WARNING_LEVELS).optional().nullable(),
  locale: z.enum(["en", "ar"]).default("en"),
});

export type HrLetterFacts = z.infer<typeof HrLetterFactsSchema>;

export function isHrLetterDocType(value: string): value is HrLetterDocType {
  return (HR_LETTER_DOC_TYPES as readonly string[]).includes(value);
}

export function letterTypeLabelEn(type: HrLetterDocType): string {
  switch (type) {
    case "warning_letter":
      return "Warning letter";
    case "increment_letter":
      return "Increment letter";
    case "demotion_letter":
      return "Demotion letter";
    case "resignation_letter":
      return "Resignation letter";
    case "termination_letter":
      return "Termination letter";
  }
}
