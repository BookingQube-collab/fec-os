import { canUserDo, type AppRole, type Capability } from "@/lib/rbac";
import { STEP_CAPABILITY, type ApprovalStepRole } from "@/lib/procurement/routing";

const BLOCKED_ACT_STATUSES = [
  "draft",
  "approved",
  "rejected",
  "cancelled",
  "po_created",
  "returned",
  "changes_requested",
] as const;

/** Hard reject is final (`rejected`). Revision uses `returned` (and aliases if they appear). */
export const REISSUE_STATUSES = ["rejected", "returned"] as const;
export const EDITABLE_STATUSES = ["draft", "returned", "changes_requested"] as const;
const CANCEL_BLOCKED = ["approved", "cancelled", "po_created"] as const;

export function isEditablePrStatus(status: string): boolean {
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}

export function isReissuePrStatus(status: string): boolean {
  return (REISSUE_STATUSES as readonly string[]).includes(status);
}

export type PrActionInput = {
  status: string;
  currentStepRole?: string | null;
  requestedBy?: string | null;
  userId: string;
  roles: AppRole[];
};

export type PrActionFlags = {
  isOwner: boolean;
  canAct: boolean;
  canEdit: boolean;
  canReissue: boolean;
  canCancel: boolean;
  isLocked: boolean;
};

/** Single access rule used by list, dashboard, and PR detail. */
export function resolvePrActions(input: PrActionInput): PrActionFlags {
  const isOwner = Boolean(input.requestedBy) && input.requestedBy === input.userId;
  const cap = input.currentStepRole
    ? (STEP_CAPABILITY[input.currentStepRole as ApprovalStepRole] as Capability | undefined)
    : undefined;
  const canAct =
    Boolean(cap) &&
    canUserDo(input.roles, cap!) &&
    !isOwner &&
    !BLOCKED_ACT_STATUSES.includes(input.status as (typeof BLOCKED_ACT_STATUSES)[number]);
  const canEdit = isOwner && isEditablePrStatus(input.status);
  const canReissue =
    isReissuePrStatus(input.status) &&
    (isOwner || canUserDo(input.roles, "procurement.configure"));
  const canCancel = isOwner && !CANCEL_BLOCKED.includes(input.status as (typeof CANCEL_BLOCKED)[number]);

  return {
    isOwner,
    canAct,
    canEdit,
    canReissue,
    canCancel,
    isLocked: !canEdit,
  };
}
