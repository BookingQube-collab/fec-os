import { QueryClient } from "@tanstack/react-query";

/** Default stale/gc times used when hooks do not override. */
export const QUERY_DEFAULTS = {
  staleTime: 60_000,
  gcTime: 5 * 60_000,
} as const;

/** Per-domain cache windows (ms). */
export const STALE = {
  auth: 10 * 60_000,
  sites: 10 * 60_000,
  roles: 15 * 60_000,
  dashboardKpis: 30_000,
  dashboardCharts: 60_000,
  workOrders: 30_000,
  amcContracts: 60_000,
  amcSchedules: 60_000,
  assets: 5 * 60_000,
  inspections: 60_000,
  complianceRenewals: 60_000,
  complianceDocuments: 60_000,
  complianceRegister: 60_000,
  vendors: 5 * 60_000,
  branches: 60_000,
  issues: 30_000,
  bookings: 30_000,
  tasks: 30_000,
  notifications: 30_000,
  people: 60_000,
  peopleDashboard: 60_000,
  facility: 60_000,
  utilities: 60_000,
  amcDashboard: 60_000,
  operationsBranches: 60_000,
  pmSchedules: 60_000,
  maintenanceDashboard: 60_000,
  inventoryDashboard: 60_000,
  downtime: 30_000,
  occRollup: 60_000,
  e3Compliance: 60_000,
  lists: 30_000,
} as const;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_DEFAULTS.staleTime,
        gcTime: QUERY_DEFAULTS.gcTime,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
