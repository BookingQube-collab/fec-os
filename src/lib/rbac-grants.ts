/**
 * DB overrides for CAPABILITIES (role × capability → allowed).
 * Empty / missing key = use code default from rbac.ts.
 */

import type { AppRole } from "@/lib/rbac";

export type CapabilityGrantRow = {
  role: AppRole;
  capability: string;
  allowed: boolean;
};

export type CapabilityGrantMap = ReadonlyMap<string, boolean>;

export function grantKey(role: AppRole, capability: string): string {
  return `${role}\0${capability}`;
}

export function toGrantMap(rows: readonly CapabilityGrantRow[]): CapabilityGrantMap {
  const m = new Map<string, boolean>();
  for (const row of rows) {
    m.set(grantKey(row.role, row.capability), row.allowed);
  }
  return m;
}

/** Process-wide active grants (global matrix, not per-user). */
let activeGrants: CapabilityGrantMap | null = null;

export function getActiveCapabilityGrants(): CapabilityGrantMap | null {
  return activeGrants;
}

export function setActiveCapabilityGrants(grants: CapabilityGrantMap | null): void {
  activeGrants = grants;
}
