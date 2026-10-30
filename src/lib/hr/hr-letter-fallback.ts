import {
  letterTypeLabelEn,
  type HrLetterDraft,
  type HrLetterFacts,
} from "@/lib/hr/hr-letter-types";

export type HrLetterStaffContext = {
  fullName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  locationLabel: string | null;
};

function formatDisplayDate(iso: string, locale: "en" | "ar"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "ar" ? "ar-QA" : "en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function clampParagraphs(paragraphs: string[]): string[] {
  return paragraphs
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Deterministic formal letter when AI is offline or returns invalid JSON. */
export function buildFallbackHrLetterDraft(
  facts: HrLetterFacts,
  staff: HrLetterStaffContext,
): HrLetterDraft {
  const locale = facts.locale ?? "en";
  const typeLabel = letterTypeLabelEn(facts.letterType);
  const name = staff.fullName.trim() || "the employee";
  const code = staff.employeeCode?.trim() || null;
  const title = staff.jobTitle?.trim() || null;
  const letterDate = formatDisplayDate(facts.letterDate, locale);
  const effective = facts.effectiveDate
    ? formatDisplayDate(facts.effectiveDate, locale)
    : letterDate;
  const reason = facts.reason.trim();
  const notes = facts.additionalNotes?.trim() || null;

  if (locale === "ar") {
    return buildFallbackArabic(facts, {
      name,
      code,
      title,
      letterDate,
      effective,
      reason,
      notes,
      typeLabel,
    });
  }

  const salutation = `Dear ${name},`;
  const identity = [code ? `Employee ID ${code}` : null, title ? `currently serving as ${title}` : null]
    .filter(Boolean)
    .join(", ");

  let subject = typeLabel;
  let paragraphs: string[] = [];

  switch (facts.letterType) {
    case "warning_letter": {
      const level = facts.warningLevel ?? "written";
      subject = `${level === "final" ? "Final" : level === "verbal" ? "Verbal" : "Written"} warning`;
      paragraphs = [
        `This letter serves as a formal ${level} warning regarding your conduct/performance${identity ? ` (${identity})` : ""}.`,
        `The matter relates to the following: ${reason}`,
        `You are expected to correct this immediately and maintain the standards required by E3 Entertainment. Further breaches may lead to additional disciplinary action up to and including termination of employment.`,
      ];
      break;
    }
    case "increment_letter": {
      const amount =
        facts.amountQar != null && Number.isFinite(facts.amountQar)
          ? `QAR ${facts.amountQar.toLocaleString("en-QA", { maximumFractionDigits: 2 })}`
          : null;
      subject = "Salary increment";
      paragraphs = [
        `We are pleased to confirm a salary increment${identity ? ` for you (${identity})` : ""}${amount ? ` of ${amount}` : ""}, effective ${effective}.`,
        `This adjustment reflects the reasons recorded by HR: ${reason}`,
        `All other terms and conditions of your employment remain unchanged unless stated separately in writing.`,
      ];
      break;
    }
    case "demotion_letter": {
      const from = facts.previousTitle?.trim() || title || "your current role";
      const to = facts.newTitle?.trim() || "the revised role";
      subject = "Change of position";
      paragraphs = [
        `This letter confirms a change in your position${identity ? ` (${identity})` : ""} from ${from} to ${to}, effective ${effective}.`,
        `The decision is based on: ${reason}`,
        `Please coordinate with your line manager and HR for any handover, reporting-line, or compensation adjustments that accompany this change.`,
      ];
      break;
    }
    case "resignation_letter": {
      subject = "Acknowledgement of resignation";
      paragraphs = [
        `We write to acknowledge receipt of your resignation${identity ? ` (${identity})` : ""}. Your last working day is recorded as ${effective}.`,
        `Reason noted: ${reason}`,
        `Please complete exit clearance, return company property, and coordinate final settlement with HR according to company policy and applicable law.`,
      ];
      break;
    }
    case "termination_letter": {
      subject = "Termination of employment";
      paragraphs = [
        `This letter confirms that your employment with E3 Entertainment${identity ? ` (${identity})` : ""} will end effective ${effective}.`,
        `The decision is based on: ${reason}`,
        `You are required to complete exit clearance and return all company property. Final dues will be processed in line with company policy and applicable Qatar labour law.`,
      ];
      break;
    }
  }

  if (notes) paragraphs.push(notes);

  return {
    subject,
    reference: null,
    salutation,
    bodyParagraphs: clampParagraphs(paragraphs),
    closing: "Yours sincerely,",
    signatoryTitle: "Human Resources",
  };
}

function buildFallbackArabic(
  facts: HrLetterFacts,
  ctx: {
    name: string;
    code: string | null;
    title: string | null;
    letterDate: string;
    effective: string;
    reason: string;
    notes: string | null;
    typeLabel: string;
  },
): HrLetterDraft {
  const identity = [ctx.code ? `الرقم الوظيفي ${ctx.code}` : null, ctx.title ? `المنصب: ${ctx.title}` : null]
    .filter(Boolean)
    .join("، ");

  let subject = ctx.typeLabel;
  let paragraphs: string[] = [];

  switch (facts.letterType) {
    case "warning_letter":
      subject = "خطاب إنذار";
      paragraphs = [
        `نحيطكم علماً بموجب هذا الخطاب بإنذار رسمي بخصوص سلوككم/أداءكم${identity ? ` (${identity})` : ""}.`,
        `وذلك للأسباب التالية: ${ctx.reason}`,
        `يرجى تصحيح الوضع فوراً والالتزام بمعايير العمل لدى الشركة. وقد يؤدي تكرار المخالفة إلى إجراءات تأديبية إضافية بما في ذلك إنهاء الخدمة.`,
      ];
      break;
    case "increment_letter": {
      const amount =
        facts.amountQar != null && Number.isFinite(facts.amountQar)
          ? `${facts.amountQar.toLocaleString("en-QA", { maximumFractionDigits: 2 })} ر.ق`
          : null;
      subject = "خطاب زيادة راتب";
      paragraphs = [
        `يسعدنا إبلاغكم بالموافقة على زيادة راتبكم${identity ? ` (${identity})` : ""}${amount ? ` بمقدار ${amount}` : ""} اعتباراً من ${ctx.effective}.`,
        `وذلك بناءً على: ${ctx.reason}`,
        `وتبقى بقية شروط عقد العمل دون تغيير ما لم يُذكر خلاف ذلك كتابياً.`,
      ];
      break;
    }
    case "demotion_letter":
      subject = "خطاب تعديل المنصب";
      paragraphs = [
        `نؤكد بموجب هذا الخطاب تعديل منصبكم${identity ? ` (${identity})` : ""} من ${facts.previousTitle?.trim() || ctx.title || "المنصب الحالي"} إلى ${facts.newTitle?.trim() || "المنصب الجديد"} اعتباراً من ${ctx.effective}.`,
        `وذلك بناءً على: ${ctx.reason}`,
        `يرجى التنسيق مع المدير المباشر والموارد البشرية بشأن التسليم وأي تعديلات مرتبطة.`,
      ];
      break;
    case "resignation_letter":
      subject = "إقرار باستلام الاستقالة";
      paragraphs = [
        `نؤكد استلام استقالتكم${identity ? ` (${identity})` : ""}، وآخر يوم عمل لكم هو ${ctx.effective}.`,
        `السبب المسجل: ${ctx.reason}`,
        `يرجى إتمام إجراءات المغادرة وتسليم ممتلكات الشركة والتنسيق بشأن المستحقات النهائية وفق سياسة الشركة.`,
      ];
      break;
    case "termination_letter":
      subject = "خطاب إنهاء خدمة";
      paragraphs = [
        `نؤكد بموجب هذا الخطاب إنهاء خدمتكم لدى الشركة${identity ? ` (${identity})` : ""} اعتباراً من ${ctx.effective}.`,
        `وذلك بناءً على: ${ctx.reason}`,
        `يرجى إتمام إجراءات المخالصة وتسليم ممتلكات الشركة. وسيتم تسوية المستحقات وفق سياسة الشركة وقانون العمل المعمول به.`,
      ];
      break;
  }

  if (ctx.notes) paragraphs.push(ctx.notes);

  return {
    subject,
    reference: null,
    salutation: `السيد/ة ${ctx.name} المحترم/ة،`,
    bodyParagraphs: clampParagraphs(paragraphs),
    closing: "وتفضلوا بقبول فائق الاحترام،",
    signatoryTitle: "الموارد البشرية",
  };
}
