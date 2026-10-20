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
  if (/^(Forbidden|Unauthorized)\b/i.test(msg)) return fallback;
  if (/column|relation|PGRST|schema cache|permission denied|JWT|does not exist/i.test(msg)) {
    return fallback;
  }
  if (msg.length > 180) return fallback;
  return msg;
}
