import {
  downtimeHours,
  mtbfDays,
  mttrHours,
  operationalPercent,
  pmCompliancePercent,
  siteAvailability,
  type SiteMachineCounts,
} from "./domain";

export type WeeklyFaultRow = {
  ticketNumber: string;
  site: string;
  machine: string;
  status: string;
  severity: string;
  category: string;
  summary: string;
};

export type WeeklyReportInput = {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  sites: (SiteMachineCounts & { siteName: string })[];
  opened: number;
  resolved: number;
  pending: number;
  waitingParts: number;
  waitingSuppliers: number;
  repeatFaults: number;
  pmCompleted: number;
  pmOverdue: number;
  partsConsumed: number;
  partsCost: number;
  faults: WeeklyFaultRow[];
};

export type WeeklyReport = WeeklyReportInput & {
  title: string;
  availability: number | null;
  pmCompliance: number | null;
  activeMachines: number;
  working: number;
  down: number;
  siteGroups: {
    siteName: string;
    active: number;
    working: number;
    down: number;
    underRepair: number;
    waitingPart: number;
    availability: number | null;
    faults: WeeklyFaultRow[];
  }[];
};

export function buildWeeklyArcadeReport(input: WeeklyReportInput): WeeklyReport {
  const activeMachines = input.sites.reduce((sum, site) => sum + site.active, 0);
  const working = input.sites.reduce((sum, site) => sum + site.working, 0);
  const down = input.sites.reduce((sum, site) => sum + site.down, 0);
  return {
    ...input,
    title: "E3 ARCADE TECHNICAL WEEKLY REPORT",
    availability: operationalPercent(working, activeMachines),
    pmCompliance: pmCompliancePercent(input.pmCompleted, input.pmOverdue),
    activeMachines,
    working,
    down,
    siteGroups: input.sites.map((site) => ({
      siteName: site.siteName,
      active: site.active,
      working: site.working,
      down: site.down,
      underRepair: site.underRepair,
      waitingPart: site.waitingPart,
      availability: siteAvailability(site),
      faults: input.faults.filter((fault) => fault.site === site.siteName),
    })),
  };
}

export type MonthlyFault = {
  id: string;
  machineId: string;
  machineName: string;
  siteName: string;
  category: string;
  status: string;
  severity: string;
  reportedAt: string;
  resolvedAt: string | null;
  isRepeat: boolean;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
};

export type MonthlyReport = {
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  faults: number;
  resolved: number;
  pending: number;
  resolutionRate: number | null;
  previousFaults: number;
  previousResolved: number;
  pmCompliance: number | null;
  availability: number | null;
  downtimeHours: number;
  averageRepairHours: number | null;
  repeatFaults: number;
  partsConsumed: number;
  partsCost: number;
  supplierCases: number;
  supplierResponseHours: number | null;
  highestFailureMachines: { machineId: string; machineName: string; siteName: string; faults: number; repeatFaults: number; downtimeHours: number; partsCost: number }[];
  sitesByFaults: { siteName: string; faults: number }[];
  faultCategories: { category: string; faults: number }[];
  downtimeBySite: { siteName: string; hours: number }[];
  mttrHours: number | null;
  mtbfDays: number | null;
};

function inRange(iso: string | null, start: string, end: string): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= start && day <= end;
}

export function buildMonthlyArcadeReport(input: {
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  now: string;
  activeMachines: number;
  workingMachines: number;
  pmCompleted: number;
  pmOverdue: number;
  faults: MonthlyFault[];
  partUsages: { machineId: string; quantity: number; cost: number; usedOn: string }[];
  supplierCases: { openedOn: string; firstResponseAt: string | null; status: string }[];
}): MonthlyReport {
  const current = input.faults.filter((fault) => inRange(fault.reportedAt, input.periodStart, input.periodEnd));
  const previous = input.faults.filter((fault) =>
    inRange(fault.reportedAt, input.previousPeriodStart, input.previousPeriodEnd),
  );
  const resolved = current.filter((fault) => fault.resolvedAt && inRange(fault.resolvedAt, input.periodStart, input.periodEnd));
  const pending = current.filter((fault) => fault.status !== "RESOLVED" && fault.status !== "CLOSED");
  const usages = input.partUsages.filter((row) => inRange(row.usedOn, input.periodStart, input.periodEnd));
  const cases = input.supplierCases.filter((row) => inRange(row.openedOn, input.periodStart, input.periodEnd));
  const responseSamples = cases
    .filter((row) => row.firstResponseAt)
    .map((row) => (new Date(row.firstResponseAt!).getTime() - new Date(row.openedOn).getTime()) / 3600000)
    .filter((hours) => hours >= 0);

  const byMachine = new Map<string, MonthlyReport["highestFailureMachines"][number]>();
  for (const fault of current) {
    const row = byMachine.get(fault.machineId) ?? {
      machineId: fault.machineId,
      machineName: fault.machineName,
      siteName: fault.siteName,
      faults: 0,
      repeatFaults: 0,
      downtimeHours: 0,
      partsCost: 0,
    };
    row.faults += 1;
    if (fault.isRepeat) row.repeatFaults += 1;
    if (fault.downtimeStartedAt) {
      row.downtimeHours += downtimeHours([
        {
          startedAt: fault.downtimeStartedAt,
          endedAt: fault.downtimeEndedAt,
          now: input.now,
        },
      ]);
    }
    byMachine.set(fault.machineId, row);
  }
  for (const usage of usages) {
    const row = byMachine.get(usage.machineId);
    if (row) row.partsCost += usage.cost;
  }

  const bySite = new Map<string, number>();
  const downtimeSite = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const fault of current) {
    bySite.set(fault.siteName, (bySite.get(fault.siteName) ?? 0) + 1);
    byCategory.set(fault.category, (byCategory.get(fault.category) ?? 0) + 1);
    if (fault.downtimeStartedAt) {
      downtimeSite.set(
        fault.siteName,
        (downtimeSite.get(fault.siteName) ?? 0) +
          downtimeHours([{ startedAt: fault.downtimeStartedAt, endedAt: fault.downtimeEndedAt, now: input.now }]),
      );
    }
  }

  const mttr = mttrHours(
    resolved
      .filter((fault) => fault.resolvedAt)
      .map((fault) => ({ startedAt: fault.reportedAt, endedAt: fault.resolvedAt! })),
  );

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    previousPeriodStart: input.previousPeriodStart,
    faults: current.length,
    resolved: resolved.length,
    pending: pending.length,
    resolutionRate: current.length ? Math.round((resolved.length / current.length) * 1000) / 10 : null,
    previousFaults: previous.length,
    previousResolved: previous.filter((fault) => fault.status === "RESOLVED" || fault.status === "CLOSED").length,
    pmCompliance: pmCompliancePercent(input.pmCompleted, input.pmOverdue),
    availability: operationalPercent(input.workingMachines, input.activeMachines),
    downtimeHours: Math.round([...downtimeSite.values()].reduce((sum, hours) => sum + hours, 0) * 10) / 10,
    averageRepairHours: mttr,
    repeatFaults: current.filter((fault) => fault.isRepeat).length,
    partsConsumed: usages.reduce((sum, row) => sum + row.quantity, 0),
    partsCost: Math.round(usages.reduce((sum, row) => sum + row.cost, 0) * 100) / 100,
    supplierCases: cases.length,
    supplierResponseHours: responseSamples.length
      ? Math.round((responseSamples.reduce((sum, hours) => sum + hours, 0) / responseSamples.length) * 10) / 10
      : null,
    highestFailureMachines: [...byMachine.values()].sort((a, b) => b.faults - a.faults || b.downtimeHours - a.downtimeHours).slice(0, 10),
    sitesByFaults: [...bySite.entries()].map(([siteName, faults]) => ({ siteName, faults })).sort((a, b) => b.faults - a.faults),
    faultCategories: [...byCategory.entries()].map(([category, faults]) => ({ category, faults })).sort((a, b) => b.faults - a.faults),
    downtimeBySite: [...downtimeSite.entries()].map(([siteName, hours]) => ({ siteName, hours: Math.round(hours * 10) / 10 })),
    mttrHours: mttr,
    mtbfDays: mtbfDays(current.map((fault) => fault.reportedAt)),
  };
}

export type SupplierPerformanceRow = {
  vendorId: string;
  vendorName: string;
  machines: number;
  working: number;
  down: number;
  openCases: number;
  averageResponseHours: number | null;
  averageResolutionHours: number | null;
  pendingParts: number;
  warrantyMachines: number;
};

export function buildSupplierPerformance(input: {
  vendors: { id: string; name: string }[];
  machines: { vendorId: string | null; status: string; warrantyExpiresOn: string | null }[];
  cases: { vendorId: string; status: string; openedAt: string; firstResponseAt: string | null; resolvedAt: string | null }[];
  now: string;
}): SupplierPerformanceRow[] {
  const today = input.now.slice(0, 10);
  return input.vendors.map((vendor) => {
    const machines = input.machines.filter((machine) => machine.vendorId === vendor.id);
    const cases = input.cases.filter((item) => item.vendorId === vendor.id);
    const openCases = cases.filter((item) => item.status !== "RESOLVED" && item.status !== "CLOSED");
    const responses = cases
      .filter((item) => item.firstResponseAt)
      .map((item) => (new Date(item.firstResponseAt!).getTime() - new Date(item.openedAt).getTime()) / 3600000)
      .filter((hours) => hours >= 0);
    const resolutions = cases
      .filter((item) => item.resolvedAt)
      .map((item) => (new Date(item.resolvedAt!).getTime() - new Date(item.openedAt).getTime()) / 3600000)
      .filter((hours) => hours >= 0);
    const avg = (values: number[]) =>
      values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      machines: machines.length,
      working: machines.filter((machine) => machine.status === "WORKING").length,
      down: machines.filter((machine) => machine.status === "DOWN").length,
      openCases: openCases.length,
      averageResponseHours: avg(responses),
      averageResolutionHours: avg(resolutions),
      pendingParts: openCases.filter((item) => item.status === "AWAITING_PART").length,
      warrantyMachines: machines.filter((machine) => machine.warrantyExpiresOn && machine.warrantyExpiresOn >= today).length,
    };
  });
}
