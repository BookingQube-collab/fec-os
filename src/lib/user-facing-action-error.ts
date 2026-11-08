/**
 * Map server-action / React Query failures to copy safe for the UI.
 * Production Next.js digests thrown Server Action errors as React #441 —
 * never show that minified string to users.
 */
export function userFacingActionError(error: unknown, fallback: string): string {
  const msg =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  if (!msg) return fallback;
  if (
    /Minified React error|#441|Server Components render|omitted in production|digest/i.test(
      msg,
    )
  ) {
    return fallback;
  }
  // Keep remapped OT audit / validation copy; hide raw PostgREST / schema noise.
  if (
    /Could not record OT audit|An active OT claim already exists|Add at least one overtime/i.test(
      msg,
    )
  ) {
    return msg;
  }
  // Constraint failures are actionable — surface them (do not treat "column" alone as schema noise).
  if (
    /violates not-null constraint|violates check constraint|violates foreign key|duplicate key value/i.test(
      msg,
    )
  ) {
    return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
  }
  if (/Invalid uuid|Validation failed|must be on or before|must be on or after/i.test(msg)) {
    return msg;
  }
  if (/^Forbidden:\s*cannot access this branch/i.test(msg)) {
    return "You do not have access to the selected site.";
  }
  if (/^(Forbidden|Unauthorized)\b/i.test(msg)) return fallback;
  if (
    /schema cache|PGRST\d|permission denied|JWT|column .+ does not exist|relation .+ does not exist/i.test(
      msg,
    )
  ) {
    return fallback;
  }
  if (msg.length > 180) return fallback;
  return msg;
}
