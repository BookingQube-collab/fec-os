import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { requireCapability } from "@/lib/server/authorize";

import {
  canAssignTarget,
  decideCompletion,
  type AssignmentTarget,
  type PublicCertificate,
  toPublicCertificateVerification,
} from "./engine";

/**
 * Server boundary for the training engine.
 *
 * Write path (later phases, not this one):
 * - Completion, scores, competencies, and certificates change only inside
 *   SECURITY DEFINER RPCs that set the training.authoritative_write flag.
 *   Authenticated clients have no INSERT/UPDATE/DELETE on those tables.
 * - training_apply_completion rejects a client boolean and does not write.
 * - training_issue_certificate and training_revoke_certificate write only
 *   inside SECURITY DEFINER functions. Certificates are never deleted.
 * - Audit rows are inserted only by training_write_audit. Update and delete
 *   on training_audit_logs always fail.
 * - Notifications go through public.notifications (category training).
 *   There is no training notification table.
 * - Files live in the private training-materials bucket. Lesson rows store
 *   a storage path, not a public URL. Signed URLs are a later phase.
 * - Chat sharing is not implemented. A later phase may insert chat_entity_links.
 */
export class TrainingNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingNotImplementedError";
  }
}

export async function evaluateCompletion(
  context: AuthContext,
  input: { clientCompleted?: boolean | null; enrollmentId: string },
): Promise<never> {
  const decision = decideCompletion({ clientCompleted: input.clientCompleted ?? null });
  if (decision.reason === "client_flag_rejected") {
    throw new TrainingNotImplementedError("completion cannot be granted from a client flag");
  }
  await requireCapability(context, "training.view");
  void input.enrollmentId;
  throw new TrainingNotImplementedError("completion evaluation is not implemented (phase 3+)");
}

export async function applyAssignmentRules(
  context: AuthContext,
  target: AssignmentTarget,
): Promise<never> {
  const capability =
    target === "COMPANY"
      ? "training.assign.company"
      : target === "SITE"
        ? "training.assign.site"
        : target === "DEPARTMENT"
          ? "training.assign.department"
          : "training.assign";
  await requireCapability(context, capability);
  if (!canAssignTarget(context.roles ?? [], target)) {
    throw new TrainingNotImplementedError("assignment target is outside this role");
  }
  throw new TrainingNotImplementedError(
    "automatic rule execution is not implemented. Saved rules are stored and not run on staff changes.",
  );
}

export async function issueCertificate(context: AuthContext, enrollmentId: string): Promise<string> {
  await requireCapability(context, "training.certificate.issue");
  const { data, error } = await context.supabase.rpc("training_issue_certificate", {
    _enrollment_id: enrollmentId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("certificate was not issued");
  return data;
}

export async function revokeCertificate(context: AuthContext, certificateId: string, reason: string): Promise<void> {
  await requireCapability(context, "training.certificate.revoke");
  if (!reason.trim()) {
    throw new TrainingNotImplementedError("revocation requires a reason");
  }
  const { error } = await context.supabase.rpc("training_revoke_certificate", {
    _certificate_id: certificateId,
    _reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function verifyCertificatePublic(
  _context: AuthContext | null,
  row: Record<string, unknown>,
): Promise<PublicCertificate> {
  return toPublicCertificateVerification(row);
}
