import "server-only";

import type { AuthContext } from "@/lib/server/create-action";
import { notifyUsers } from "@/lib/notifications/action-notify";

import { TRAINING_EVENT_LINK_TYPES, trainingEventDecision, type SAVED_RULE_TRIGGERS } from "./engine";

type SavedRuleTrigger = (typeof SAVED_RULE_TRIGGERS)[number];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Enrolls from training_saved_rules, then refuses the outside change when a
 * linked requirement is REQUIRED and BLOCK. Hire never blocks.
 */
export async function applyStoredTrainingRules(
  context: AuthContext,
  input: {
    trigger: SavedRuleTrigger;
    staffId: string;
    entityId?: string | null;
    roleCode?: string | null;
  },
): Promise<{ enrolled: number; warn: boolean }> {
  const { data, error } = await context.supabase.rpc("training_execute_saved_rules", {
    _trigger: input.trigger,
    _staff_id: input.staffId,
    _link_types: [...TRAINING_EVENT_LINK_TYPES[input.trigger]],
    _entity_id: input.entityId ?? null,
    _role_code: input.roleCode ?? null,
  });
  if (error) throw new Error(error.message);

  const record = asRecord(data);
  const enrolled = typeof record.enrolled === "number" ? record.enrolled : Number(record.enrolled ?? 0);
  const titles = Array.isArray(record.courseTitles)
    ? record.courseTitles.filter((title): title is string => typeof title === "string" && title.trim().length > 0)
    : [];
  const requirements = Array.isArray(record.requirements) ? record.requirements.map((row) => asRecord(row)) : [];
  const decision = trainingEventDecision({
    trigger: input.trigger,
    requirements: requirements.map((row) => ({
      courseTitle: typeof row.courseTitle === "string" ? row.courseTitle : "",
      status: typeof row.status === "string" ? row.status : "NOT_TRAINED",
      enforceMode: typeof row.enforceMode === "string" ? row.enforceMode : "WARN",
      requirementType: typeof row.requirementType === "string" ? row.requirementType : "REQUIRED",
    })),
  });

  if (Number.isFinite(enrolled) && enrolled > 0) {
    const { data: person } = await context.supabase
      .from("staff")
      .select("user_id")
      .eq("id", input.staffId)
      .maybeSingle();
    const userId = person?.user_id;
    if (userId) {
      await notifyUsers({
        userIds: [userId],
        category: "training",
        title: "Training assigned",
        body: titles.join(", ") || "A training rule enrolled you",
        sourceType: "training_saved_rules",
        sourceId: input.staffId,
      });
    }
  }

  if (decision.block) {
    const names = decision.blockingTitles.join(", ");
    throw new Error(
      names
        ? `Required training is not complete: ${names}`
        : "Required training is not complete.",
    );
  }

  return { enrolled: Number.isFinite(enrolled) ? enrolled : 0, warn: decision.warn };
}
