import type { LocationRollup, RagStatus } from "@/lib/queries/occ.core";

export type OccStatusFilter = "all" | RagStatus;

export type OccDriverKey = "urgent" | "incidents" | "overdue" | "high" | "complaints";

export type OccDriver = { key: OccDriverKey; count: number };

export function rollupDrivers(rollup: LocationRollup): OccDriver[] {
  const drivers: OccDriver[] = [];
  if (rollup.urgent_tickets > 0) drivers.push({ key: "urgent", count: rollup.urgent_tickets });
  if (rollup.incidents_24h > 0) drivers.push({ key: "incidents", count: rollup.incidents_24h });
  if (rollup.overdue_work_orders > 0) drivers.push({ key: "overdue", count: rollup.overdue_work_orders });
  if (rollup.high_tickets > 0) drivers.push({ key: "high", count: rollup.high_tickets });
  if (rollup.open_complaints > 0) drivers.push({ key: "complaints", count: rollup.open_complaints });
  return drivers;
}

export function sharedCity(rollups: LocationRollup[]): string | null {
  const cities = [...new Set(rollups.map((r) => r.city).filter(Boolean))];
  return cities.length === 1 ? cities[0] : null;
}

export function matchesVenueQuery(rollup: LocationRollup, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [rollup.name, rollup.code, rollup.city].some((value) => value.toLowerCase().includes(q));
}
