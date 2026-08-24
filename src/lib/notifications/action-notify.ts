import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CAPABILITIES, type AppRole, type Capability } from "@/lib/rbac";
import { STEP_CAPABILITY, type ApprovalStepRole } from "@/lib/procurement/routing";

type NotifyInsert = {
  userIds: string[];
  excludeUserId?: string | null;
  locationId?: string | null;
  category: string;
  title: string;
  body?: string | null;
  severity?: "info" | "warning" | "critical";
  actionUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
};

/**
 * Insert in-app notifications via the service role.
 * RLS only allows self-insert (or role_level >= 80), so user-scoped clients
 * cannot notify the next approver / requester. Failures are swallowed so
 * approve/reject never breaks.
 */
export async function notifyUsers(opts: NotifyInsert): Promise<number> {
  const ids = [...new Set(opts.userIds.filter((id) => id && id !== opts.excludeUserId))];
  if (ids.length === 0) return 0;
  const rows = ids.map((user_id) => ({
    user_id,
    location_id: opts.locationId ?? null,
    category: opts.category,
    title: opts.title,
    body: opts.body ?? null,
    severity: opts.severity ?? "info",
    action_url: opts.actionUrl ?? null,
    source_type: opts.sourceType ?? null,
    source_id: opts.sourceId ?? null,
  }));
  const { error } = await supabaseAdmin.from("notifications").insert(rows);
  if (error) {
    console.warn("[notify] insert failed", error.message);
    return 0;
  }
  return rows.length;
}

export async function findUsersWithCapability(
  capability: Capability,
  locationId?: string | null,
): Promise<string[]> {
  const roles = CAPABILITIES[capability] as readonly AppRole[];
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, location_ids")
    .in("role", [...roles]);
  if (error) {
    console.warn("[notify] role lookup failed", error.message);
    return [];
  }
  return [
    ...new Set(
      (data ?? [])
        .filter((row) => {
          if (!locationId) return true;
          const locs = row.location_ids ?? [];
          return locs.length === 0 || locs.includes(locationId);
        })
        .map((row) => row.user_id),
    ),
  ];
}

export async function notifyPurchaseRequisitionEvent(opts: {
  prId: string;
  prNumber: string | null;
  locationId: string;
  requesterId: string;
  actorId: string;
  justification?: string | null;
  priority?: string | null;
  kind: "submitted" | "resubmitted" | "next_approval" | "approved" | "rejected" | "returned";
  nextStepRole?: string | null;
}): Promise<void> {
  try {
    const number = opts.prNumber?.trim() || "PR";
    const actionUrl = `/procurement/requisitions/${opts.prId}`;
    const body = (opts.justification ?? "").slice(0, 200) || null;
    const urgent = opts.priority === "emergency" || opts.priority === "high";

    if (opts.kind === "submitted" || opts.kind === "resubmitted" || opts.kind === "next_approval") {
      const step = opts.nextStepRole as ApprovalStepRole | null | undefined;
      const cap = step ? (STEP_CAPABILITY[step] as Capability | undefined) : undefined;
      if (!cap) return;
      const userIds = await findUsersWithCapability(cap, opts.locationId);
      await notifyUsers({
        userIds,
        excludeUserId: opts.requesterId,
        locationId: opts.locationId,
        category: "procurement",
        title:
          opts.kind === "resubmitted"
            ? `Purchase request ${number} was resubmitted and needs your approval`
            : `Purchase request ${number} needs your approval`,
        body,
        severity: urgent ? "critical" : "warning",
        actionUrl,
        sourceType: "purchase_requisitions",
        sourceId: opts.prId,
      });
      return;
    }

    const titles: Record<"approved" | "rejected" | "returned", string> = {
      approved: `Purchase request ${number} was approved`,
      rejected: `Purchase request ${number} was rejected`,
      returned: `Purchase request ${number} was returned to you`,
    };
    await notifyUsers({
      userIds: [opts.requesterId],
      excludeUserId: opts.actorId,
      locationId: opts.locationId,
      category: "procurement",
      title: titles[opts.kind],
      body,
      severity: opts.kind === "approved" ? "info" : "warning",
      actionUrl,
      sourceType: "purchase_requisitions",
      sourceId: opts.prId,
    });
  } catch (error) {
    console.warn("[notify] PR notify failed", error instanceof Error ? error.message : error);
  }
}
