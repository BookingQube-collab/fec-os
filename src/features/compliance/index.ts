/**
 * Compliance feature module (pilot).
 *
 * Re-exports existing compliance paths so new code can import from `@/features/compliance`
 * without a big-bang move. Physical files remain under `src/lib/compliance/` and
 * `src/lib/queries/compliance-*.core.ts` until incremental migration completes.
 *
 * @see docs/ENTERPRISE_ARCHITECTURE_REPORT.md — migration plan
 */

export * from "@/lib/compliance/constants";
export * from "@/lib/compliance/compliance-derive";
export * from "@/lib/compliance/location-compliance-derive";
export { canViewComplianceExpiryAlerts } from "@/lib/compliance/compliance-expiry-access";
