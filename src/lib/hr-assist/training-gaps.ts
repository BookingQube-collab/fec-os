import { englishAssistText } from "./copy";
import { resultFrom, takeItems } from "./items";
import type { AssistItem, AssistResult } from "./types";

export type TrainingEnrollmentNote = {
  staffId: string;
  staffName: string;
  courseName: string;
  required: boolean;
  status: string;
  dueOn: string | null;
  skills: string;
};

export function buildTrainingGaps(input: {
  today: string;
  enrollments: TrainingEnrollmentNote[];
  publishedCourses: string[];
}): AssistResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today)) return { status: "insufficient", items: [] };
  if (!input.enrollments.length && !input.publishedCourses.length) return { status: "insufficient", items: [] };

  const items: AssistItem[] = [];
  const completedByStaff = new Map<string, string[]>();
  for (const row of input.enrollments) {
    if (row.status.toLowerCase() === "completed") {
      const list = completedByStaff.get(row.staffId) ?? [];
      list.push(row.courseName.toLowerCase());
      completedByStaff.set(row.staffId, list);
    }
    if (row.required && row.status.toLowerCase() !== "completed" && row.dueOn && row.dueOn < input.today) {
      items.push({
        id: `train:due:${row.staffId}:${row.courseName}`,
        titleKey: "hrAssist.training.overdue.title",
        whyKey: "hrAssist.training.overdue.why",
        evidenceKey: "hrAssist.training.overdue.evidence",
        actionKey: "hrAssist.training.action",
        linkKey: "hrAssist.openModule",
        href: "/people?tab=training",
        values: {
          staffName: row.staffName,
          courseName: row.courseName,
          status: row.status || "open",
          dueOn: row.dueOn,
        },
      });
    }
  }

  const seen = new Set<string>();
  for (const row of input.enrollments) {
    const skills = row.skills.split(/[,;|/]+/).map((part) => part.trim()).filter((part) => part.length >= 3);
    const done = completedByStaff.get(row.staffId) ?? [];
    for (const skill of skills) {
      const skillKey = skill.toLowerCase();
      if (done.some((name) => name.includes(skillKey))) continue;
      const course = input.publishedCourses.find((title) => title.toLowerCase().includes(skillKey));
      if (!course) continue;
      const id = `train:skill:${row.staffId}:${skillKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        titleKey: "hrAssist.training.skill_gap.title",
        whyKey: "hrAssist.training.skill_gap.why",
        evidenceKey: "hrAssist.training.skill_gap.evidence",
        actionKey: "hrAssist.training.action",
        linkKey: "hrAssist.openModule",
        href: "/people?tab=training",
        values: { staffName: row.staffName, skill, courseName: course },
      });
    }
  }

  return resultFrom(takeItems(items, 3, 12));
}

export function describeTrainingItem(item: AssistItem): { why: string } {
  return { why: englishAssistText(item.whyKey, item.values) };
}

export function countOverdueRequired(rows: TrainingEnrollmentNote[], today: string): number {
  return rows.filter((row) => row.required && row.status.toLowerCase() !== "completed" && Boolean(row.dueOn && row.dueOn < today)).length;
}
