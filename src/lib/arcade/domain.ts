/**
 * Pure arcade technical rules. Server actions and SQL guards follow these
 * outcomes; keep the constants aligned with supabase/migrations/20260929120000_arcade_technical.sql.
 */

export const REPEAT_WINDOW_DAYS = 90;
export const CLOSURE_MIN_LENGTH = 8;
export const PARTS_USED_MIN_LENGTH = 2;
export const MTTR_MIN_SAMPLES = 3;
export const MTBF_MIN_FAULTS = 3;
export const PM_DUE_HORIZON_DAYS = 7;

export const MACHINE_STATUSES = [
  "WORKING",
  "DOWN",
  "UNDER_REPAIR",
  "UNDER_OBSERVATION",
  "WAITING_PART",
  "WAITING_SUPPLIER",
  "OUT_OF_SERVICE",
  "DECOMMISSIONED",
] as const;

export const FAULT_STATUSES = [
  "REPORTED",
  "DIAGNOSING",
  "UNDER_REPAIR",
  "WAITING_PART",
  "WAITING_SUPPLIER",
  "TESTING",
  "UNDER_OBSERVATION",
  "RESOLVED",
  "CLOSED",
] as const;

export const FAULT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const OPERATIONAL_IMPACTS = ["FULLY_OPERATIONAL", "PARTIALLY_OPERATIONAL", "OUT_OF_SERVICE"] as const;

export const FAULT_CATEGORIES = [
  "Electrical",
  "Mechanical",
  "Sensor",
  "PCB",
  "Software",
  "Display",
  "Network",
  "Controller",
  "Power",
  "Card/RFID",
  "Physical Damage",
  "Other",
] as const;

export const PM_CADENCES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "CUSTOM"] as const;
export const PM_RESULTS = ["PASS", "ATTENTION", "FAIL", "NA"] as const;

export const SUPPLIER_CASE_STATUSES = [
  "DRAFT",
  "CONTACTED",
  "AWAITING_RESPONSE",
  "SUPPLIER_DIAGNOSING",
  "AWAITING_PART",
  "SOLUTION_RECEIVED",
  "TESTING",
  "RESOLVED",
  "CLOSED",
] as const;

export const PART_STATUSES = [
  "IN_STOCK",
  "LOW_STOCK",
  "REQUESTED",
  "APPROVAL_PENDING",
  "ORDERED",
  "IN_TRANSIT",
  "RECEIVED",
  "OUT_OF_STOCK",
] as const;

export const INSTALLATION_STATUSES = [
  "DELIVERED",
  "ASSEMBLY",
  "INSTALLATION",
  "TESTING",
  "ISSUE_FOUND",
  "SUPPLIER_SUPPORT",
  "COMMISSIONED",
] as const;

export const OPEN_FAULT_STATUSES = [
  "REPORTED",
  "DIAGNOSING",
  "UNDER_REPAIR",
  "WAITING_PART",
  "WAITING_SUPPLIER",
  "TESTING",
  "UNDER_OBSERVATION",
] as const;

const TERMINAL_FAULT = new Set(["RESOLVED", "CLOSED"]);
const SUPPLY_PIPELINE = new Set(["REQUESTED", "APPROVAL_PENDING", "ORDERED", "IN_TRANSIT"]);

const FAULT_TRANSITIONS: Record<(typeof FAULT_STATUSES)[number], readonly (typeof FAULT_STATUSES)[number][]> = {
  REPORTED: ["DIAGNOSING", "WAITING_PART", "WAITING_SUPPLIER"],
  DIAGNOSING: ["UNDER_REPAIR", "WAITING_PART", "WAITING_SUPPLIER", "TESTING"],
  UNDER_REPAIR: ["WAITING_PART", "WAITING_SUPPLIER", "TESTING"],
  WAITING_PART: ["UNDER_REPAIR", "TESTING", "WAITING_SUPPLIER"],
  WAITING_SUPPLIER: ["UNDER_REPAIR", "TESTING", "WAITING_PART"],
  TESTING: ["UNDER_OBSERVATION", "RESOLVED", "UNDER_REPAIR"],
  UNDER_OBSERVATION: ["RESOLVED", "UNDER_REPAIR"],
  RESOLVED: ["CLOSED", "UNDER_REPAIR"],
  CLOSED: [],
};

export type MachineStatus = (typeof MACHINE_STATUSES)[number];
export type FaultStatus = (typeof FAULT_STATUSES)[number];
export type PmResult = (typeof PM_RESULTS)[number];
export type PmCadence = (typeof PM_CADENCES)[number];
export type PartStatus = (typeof PART_STATUSES)[number];

export type ClosureInput = {
  problem?: string | null;
  diagnosis?: string | null;
  actionTaken?: string | null;
  partsUsed?: string | null;
  testingPerformed?: string | null;
  finalResult?: string | null;
  recommendations?: string | null;
};

const CLOSURE_FIELDS: { key: keyof ClosureInput; label: string; min: number }[] = [
  { key: "problem", label: "Problem", min: CLOSURE_MIN_LENGTH },
  { key: "diagnosis", label: "Diagnosis / root cause", min: CLOSURE_MIN_LENGTH },
  { key: "actionTaken", label: "Action taken", min: CLOSURE_MIN_LENGTH },
  { key: "partsUsed", label: "Parts used", min: PARTS_USED_MIN_LENGTH },
  { key: "testingPerformed", label: "Testing performed", min: CLOSURE_MIN_LENGTH },
  { key: "finalResult", label: "Final result", min: CLOSURE_MIN_LENGTH },
  { key: "recommendations", label: "Recommendations", min: CLOSURE_MIN_LENGTH },
];

const PLACEHOLDER_WORDS = new Set(["resolved", "done", "ok", "fixed", "closed", "na", "n/a"]);

export function normalizeClosureText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function isPlaceholderResolution(value: string | null | undefined): boolean {
  const compact = normalizeClosureText(value)
    .toLowerCase()
    .replace(/[^a-z/]/g, "");
  return PLACEHOLDER_WORDS.has(compact);
}

/** A repair can move to Resolved or Closed only with a full technical write-up. */
export function closureErrors(input: ClosureInput): string[] {
  const errors: string[] = [];
  for (const field of CLOSURE_FIELDS) {
    const text = normalizeClosureText(input[field.key]);
    if (text.length < field.min) {
      errors.push(`${field.label} is required before closing`);
      continue;
    }
    if (isPlaceholderResolution(text)) {
      errors.push(`${field.label} must describe the work, not only the word Resolved`);
    }
  }
  return errors;
}

export function canTransitionFault(from: FaultStatus, to: FaultStatus): boolean {
  if (from === to) return true;
  return FAULT_TRANSITIONS[from].includes(to);
}

export function transitionFault(from: FaultStatus, to: FaultStatus, closure?: ClosureInput): string[] {
  if (!canTransitionFault(from, to)) {
    return [`Cannot move a ticket from ${from} to ${to}`];
  }
  if (to === "RESOLVED" || to === "CLOSED") {
    return closureErrors(closure ?? {});
  }
  return [];
}

export function isOpenFaultStatus(status: string): boolean {
  return (OPEN_FAULT_STATUSES as readonly string[]).includes(status);
}

export function machineStatusForFault(status: FaultStatus, impact?: string | null): MachineStatus | null {
  switch (status) {
    case "WAITING_PART":
      return "WAITING_PART";
    case "WAITING_SUPPLIER":
      return "WAITING_SUPPLIER";
    case "UNDER_REPAIR":
    case "DIAGNOSING":
    case "TESTING":
      return "UNDER_REPAIR";
    case "UNDER_OBSERVATION":
      return "UNDER_OBSERVATION";
    case "REPORTED":
      return impact === "OUT_OF_SERVICE" ? "DOWN" : null;
    case "RESOLVED":
    case "CLOSED":
      return "WORKING";
    default:
      return null;
  }
}

/** Keep the machine down while any other fault is still open. */
export function nextMachineStatus(input: {
  proposed: MachineStatus | null;
  openFaultCountExcludingCurrent: number;
  current: MachineStatus;
}): MachineStatus {
  if (input.current === "DECOMMISSIONED") return "DECOMMISSIONED";
  if (
    (input.proposed === "WORKING" || input.proposed === null) &&
    input.openFaultCountExcludingCurrent > 0
  ) {
    return input.current === "WORKING" ? "UNDER_REPAIR" : input.current;
  }
  return input.proposed ?? input.current;
}

export type PriorFault = {
  id: string;
  category: string;
  reportedAt: string;
  resolvedAt?: string | null;
};

export function detectRepeatFault(
  history: PriorFault[],
  category: string,
  reportedAt: string,
  windowDays = REPEAT_WINDOW_DAYS,
): { isRepeat: boolean; repeatCount: number; lastFailureAt: string | null; priorFaultId: string | null; daysSinceLastRepair: number | null } {
  const at = new Date(reportedAt).getTime();
  const windowMs = windowDays * 86400000;
  const same = history
    .filter((row) => row.category.trim().toLowerCase() === category.trim().toLowerCase())
    .filter((row) => {
      const t = new Date(row.reportedAt).getTime();
      return Number.isFinite(t) && at >= t && at - t <= windowMs;
    })
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());

  const lastRepair = history
    .map((row) => row.resolvedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const daysSinceLastRepair = lastRepair
    ? Math.max(0, Math.floor((at - new Date(lastRepair).getTime()) / 86400000))
    : null;

  if (same.length === 0) {
    return { isRepeat: false, repeatCount: 0, lastFailureAt: null, priorFaultId: null, daysSinceLastRepair };
  }
  return {
    isRepeat: true,
    repeatCount: same.length,
    lastFailureAt: same[0]?.reportedAt ?? null,
    priorFaultId: same[0]?.id ?? null,
    daysSinceLastRepair,
  };
}

export function operationalPercent(working: number, active: number): number | null {
  if (active <= 0) return null;
  return Math.round((working / active) * 1000) / 10;
}

export type SiteMachineCounts = {
  locationId: string;
  active: number;
  working: number;
  down: number;
  underRepair: number;
  underObservation: number;
  waitingPart: number;
  waitingSupplier: number;
  pmDue: number;
  pmOverdue: number;
};

export function siteAvailability(site: Pick<SiteMachineCounts, "working" | "active">): number | null {
  return operationalPercent(site.working, site.active);
}

/** First stored photo for each site, in row order. Later photos for the same site are ignored. */
export function firstCoverByLocation(
  rows: ReadonlyArray<{ location_id: string; photo_path: string | null }>,
): Record<string, string> {
  const covers: Record<string, string> = {};
  for (const row of rows) {
    if (!row.photo_path || covers[row.location_id]) continue;
    covers[row.location_id] = row.photo_path;
  }
  return covers;
}

const CADENCE_DAYS: Record<Exclude<PmCadence, "CUSTOM">, number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  QUARTERLY: 90,
};

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nextPmDate(cadence: PmCadence, fromDate: string, customIntervalDays?: number | null): string {
  const days = cadence === "CUSTOM" ? Math.max(1, customIntervalDays ?? 1) : CADENCE_DAYS[cadence];
  return addDays(fromDate, days);
}

export type PmChecklistItem = { label: string; result: PmResult; notes?: string | null };

export type PmFaultDraft = {
  description: string;
  category: (typeof FAULT_CATEGORIES)[number];
  severity: (typeof FAULT_SEVERITIES)[number];
  status: "REPORTED";
};

/** PM stays completed. Each FAIL line becomes its own fault ticket. */
export function faultsFromPmChecklist(items: PmChecklistItem[]): PmFaultDraft[] {
  return items
    .filter((item) => item.result === "FAIL")
    .map((item) => ({
      description: [item.label, item.notes?.trim()].filter(Boolean).join(" — "),
      category: "Other",
      severity: "MEDIUM",
      status: "REPORTED" as const,
    }));
}

export function pmCompliancePercent(completed: number, overdue: number): number | null {
  const denom = completed + overdue;
  if (denom <= 0) return null;
  return Math.round((completed / denom) * 1000) / 10;
}

export function stockStatus(onHand: number, minimum: number): "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" {
  if (onHand <= 0) return "OUT_OF_STOCK";
  if (onHand <= minimum) return "LOW_STOCK";
  return "IN_STOCK";
}

export function consumeStock(input: { onHand: number; quantity: number; minimum: number }): {
  onHand: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
} {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantity must be greater than zero");
  }
  if (input.quantity > input.onHand) {
    throw new Error("Insufficient stock for this movement.");
  }
  const onHand = Math.round((input.onHand - input.quantity) * 100) / 100;
  return { onHand, stockStatus: stockStatus(onHand, input.minimum) };
}

export function nextPartSupplyStatus(current: PartStatus, onHand: number, minimum: number): PartStatus {
  if (SUPPLY_PIPELINE.has(current)) return current;
  if (current === "RECEIVED") return stockStatus(onHand, minimum);
  return stockStatus(onHand, minimum);
}

export type SupplierCaseTrail = {
  troubleshootingDone: string;
  partsTested: string;
  technicianFindings: string;
  supplierResponse: string;
  updates: { at: string; body: string }[];
};

/** Later edits add to the trail. They do not erase troubleshooting already recorded. */
export function patchSupplierCase(
  existing: SupplierCaseTrail,
  patch: Partial<Omit<SupplierCaseTrail, "updates">> & { update?: { at: string; body: string } | null },
): SupplierCaseTrail {
  return {
    troubleshootingDone: patch.troubleshootingDone?.trim()
      ? patch.troubleshootingDone.trim()
      : existing.troubleshootingDone,
    partsTested: patch.partsTested?.trim() ? patch.partsTested.trim() : existing.partsTested,
    technicianFindings: patch.technicianFindings?.trim()
      ? patch.technicianFindings.trim()
      : existing.technicianFindings,
    supplierResponse: patch.supplierResponse?.trim() ? patch.supplierResponse.trim() : existing.supplierResponse,
    updates: patch.update?.body.trim()
      ? [...existing.updates, { at: patch.update.at, body: patch.update.body.trim() }]
      : existing.updates,
  };
}

export function observationFailedAgain(results: Array<"PASS" | "ISSUE_FOUND">): boolean {
  if (results.length < 2) return false;
  const last = results[results.length - 1];
  const prev = results[results.length - 2];
  return last === "ISSUE_FOUND" && prev === "ISSUE_FOUND";
}

export type WorkPriority =
  | "critical_down"
  | "revenue_impact"
  | "waiting_parts"
  | "repeat"
  | "pm_overdue"
  | "normal";

const PRIORITY_RANK: Record<WorkPriority, number> = {
  critical_down: 0,
  revenue_impact: 1,
  waiting_parts: 2,
  repeat: 3,
  pm_overdue: 4,
  normal: 5,
};

export function workPriority(input: {
  severity?: string | null;
  machineStatus?: string | null;
  impact?: string | null;
  waitingPart?: boolean;
  isRepeat?: boolean;
  pmOverdue?: boolean;
}): WorkPriority {
  if (input.severity === "CRITICAL" || input.machineStatus === "DOWN") return "critical_down";
  if (input.impact === "OUT_OF_SERVICE" || input.impact === "PARTIALLY_OPERATIONAL") return "revenue_impact";
  if (input.waitingPart || input.machineStatus === "WAITING_PART") return "waiting_parts";
  if (input.isRepeat) return "repeat";
  if (input.pmOverdue) return "pm_overdue";
  return "normal";
}

export function compareWorkPriority(a: WorkPriority, b: WorkPriority): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

export function mttrHours(samples: { startedAt: string; endedAt: string }[]): number | null {
  const hours = samples
    .map((sample) => (new Date(sample.endedAt).getTime() - new Date(sample.startedAt).getTime()) / 3600000)
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (hours.length < MTTR_MIN_SAMPLES) return null;
  const avg = hours.reduce((sum, value) => sum + value, 0) / hours.length;
  return Math.round(avg * 10) / 10;
}

export function mtbfDays(faultTimestamps: string[]): number | null {
  const times = faultTimestamps
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (times.length < MTBF_MIN_FAULTS) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    gaps.push((times[i]! - times[i - 1]!) / 86400000);
  }
  const avg = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
  return Math.round(avg * 10) / 10;
}

export function downtimeHours(samples: { startedAt: string; endedAt: string | null; now?: string }[]): number {
  const now = samples.find((sample) => sample.now)?.now ?? new Date().toISOString();
  return samples.reduce((sum, sample) => {
    const end = sample.endedAt ?? now;
    const hours = (new Date(end).getTime() - new Date(sample.startedAt).getTime()) / 3600000;
    return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
  }, 0);
}

export function searchToken(query: string): string | null {
  const cleaned = query.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").slice(0, 80);
  return cleaned.length >= 2 ? cleaned : null;
}

export type ImportCandidate = {
  assetCode?: string | null;
  machineName?: string | null;
  locationCode?: string | null;
};

export type MachineMatch = { id: string; assetCode: string; name: string; locationCode: string | null };

export function matchImportMachine(
  row: ImportCandidate,
  machines: MachineMatch[],
): { machineId: string } | { needsMapping: true; reason: string } {
  const asset = row.assetCode?.trim().toLowerCase();
  if (asset) {
    const hits = machines.filter((machine) => machine.assetCode.trim().toLowerCase() === asset);
    if (hits.length === 1) return { machineId: hits[0]!.id };
    if (hits.length > 1) return { needsMapping: true, reason: "Asset ID matches more than one machine" };
    return { needsMapping: true, reason: "Asset ID does not match a machine" };
  }
  const name = row.machineName?.trim().toLowerCase();
  const location = row.locationCode?.trim().toLowerCase();
  if (name && location) {
    const hits = machines.filter(
      (machine) =>
        machine.name.trim().toLowerCase() === name &&
        (machine.locationCode ?? "").trim().toLowerCase() === location,
    );
    if (hits.length === 1) return { machineId: hits[0]!.id };
    if (hits.length === 0) return { needsMapping: true, reason: "Machine name and site do not match a machine" };
    return { needsMapping: true, reason: "Machine name and site match more than one machine" };
  }
  return { needsMapping: true, reason: "Row has no asset ID or exact machine and site" };
}

export type AlertRule =
  | "critical_down"
  | "fault_24h"
  | "fault_3d"
  | "fault_7d"
  | "pm_overdue"
  | "warranty_expiring"
  | "supplier_overdue"
  | "part_below_min"
  | "part_delivery_overdue"
  | "repeat_failure"
  | "observation_failed_again";

export type AlertDraft = {
  rule: AlertRule;
  entityId: string;
  title: string;
  severity: "info" | "warning" | "critical";
  href: string;
};

export function buildAlertDrafts(input: {
  now: string;
  machines: {
    id: string;
    name: string;
    status: string;
    warrantyExpiresOn?: string | null;
    nextPmOn?: string | null;
  }[];
  faults: {
    id: string;
    ticketNumber: string;
    machineId: string;
    status: string;
    severity: string;
    reportedAt: string;
    isRepeat: boolean;
  }[];
  cases: { id: string; caseNumber: string; status: string; nextFollowUpOn?: string | null }[];
  parts: { id: string; name: string; onHand: number; minimum: number; supplyStatus: string; eta?: string | null }[];
  observationFailedIds: string[];
}): AlertDraft[] {
  const now = new Date(input.now).getTime();
  const day = 86400000;
  const alerts: AlertDraft[] = [];
  const today = input.now.slice(0, 10);

  for (const machine of input.machines) {
    if (machine.status === "DOWN") {
      alerts.push({
        rule: "critical_down",
        entityId: machine.id,
        title: `${machine.name} is down`,
        severity: "critical",
        href: `/arcade/machines/${machine.id}`,
      });
    }
    if (machine.nextPmOn && machine.nextPmOn < today && machine.status !== "DECOMMISSIONED") {
      alerts.push({
        rule: "pm_overdue",
        entityId: machine.id,
        title: `PM overdue on ${machine.name}`,
        severity: "warning",
        href: `/arcade/pm`,
      });
    }
    if (machine.warrantyExpiresOn) {
      const exp = new Date(machine.warrantyExpiresOn).getTime();
      if (exp >= now && exp - now <= 30 * day) {
        alerts.push({
          rule: "warranty_expiring",
          entityId: machine.id,
          title: `Warranty expiring for ${machine.name}`,
          severity: "info",
          href: `/arcade/machines/${machine.id}`,
        });
      }
    }
  }

  for (const fault of input.faults) {
    if (TERMINAL_FAULT.has(fault.status)) continue;
    const age = now - new Date(fault.reportedAt).getTime();
    if (fault.severity === "CRITICAL") {
      alerts.push({
        rule: "critical_down",
        entityId: fault.id,
        title: `${fault.ticketNumber} is critical`,
        severity: "critical",
        href: `/arcade/faults/${fault.id}`,
      });
    }
    if (age >= 7 * day) {
      alerts.push({
        rule: "fault_7d",
        entityId: fault.id,
        title: `${fault.ticketNumber} open more than 7 days`,
        severity: "critical",
        href: `/arcade/faults/${fault.id}`,
      });
    } else if (age >= 3 * day) {
      alerts.push({
        rule: "fault_3d",
        entityId: fault.id,
        title: `${fault.ticketNumber} open more than 3 days`,
        severity: "warning",
        href: `/arcade/faults/${fault.id}`,
      });
    } else if (age >= day) {
      alerts.push({
        rule: "fault_24h",
        entityId: fault.id,
        title: `${fault.ticketNumber} open more than 24 hours`,
        severity: "warning",
        href: `/arcade/faults/${fault.id}`,
      });
    }
    if (fault.isRepeat) {
      alerts.push({
        rule: "repeat_failure",
        entityId: fault.id,
        title: `${fault.ticketNumber} is a repeat fault`,
        severity: "warning",
        href: `/arcade/faults/${fault.id}`,
      });
    }
  }

  for (const item of input.cases) {
    if (TERMINAL_FAULT.has(item.status) || item.status === "RESOLVED" || item.status === "CLOSED") continue;
    if (item.nextFollowUpOn && item.nextFollowUpOn < today) {
      alerts.push({
        rule: "supplier_overdue",
        entityId: item.id,
        title: `${item.caseNumber} supplier follow-up is overdue`,
        severity: "warning",
        href: `/arcade/support/${item.id}`,
      });
    }
  }

  for (const part of input.parts) {
    if (part.onHand <= part.minimum) {
      alerts.push({
        rule: "part_below_min",
        entityId: part.id,
        title: `${part.name} is at or below minimum stock`,
        severity: part.onHand <= 0 ? "critical" : "warning",
        href: `/arcade/parts`,
      });
    }
    if (
      part.eta &&
      part.eta < today &&
      (part.supplyStatus === "ORDERED" || part.supplyStatus === "IN_TRANSIT")
    ) {
      alerts.push({
        rule: "part_delivery_overdue",
        entityId: part.id,
        title: `${part.name} delivery is overdue`,
        severity: "warning",
        href: `/arcade/parts`,
      });
    }
  }

  for (const id of input.observationFailedIds) {
    alerts.push({
      rule: "observation_failed_again",
      entityId: id,
      title: "Observation failed again",
      severity: "critical",
      href: `/arcade/observation`,
    });
  }

  const seen = new Set<string>();
  return alerts.filter((alert) => {
    const key = `${alert.rule}:${alert.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function weekBounds(anchorIso: string): { start: string; end: string; days: string[] } {
  const date = new Date(`${anchorIso.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addDays(anchorIso.slice(0, 10), mondayOffset);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return { start, end: days[6]!, days };
}

export const GAME_PAYMENT_CURRENCY = "QAR";

export type GamePayment = {
  supplierName: string | null;
  amountPaid: number | null;
  currency: string | null;
  paidOn: string | null;
};

/**
 * Supplier, amount paid, and paid date for one game.
 * All values stay empty when staff have not entered them.
 * A later bulk upload of purchase invoices writes these same fields.
 */
export function normalizeGamePayment(input: {
  supplierName?: string | null;
  amountPaid?: number | null;
  currency?: string | null;
  paidOn?: string | null;
}): GamePayment {
  const supplierName = (input.supplierName ?? "").replace(/\s+/g, " ").trim() || null;
  let amountPaid: number | null = null;
  if (input.amountPaid != null) {
    if (!Number.isFinite(input.amountPaid) || input.amountPaid < 0) {
      throw new Error("Amount paid cannot be negative");
    }
    amountPaid = Math.round(input.amountPaid * 100) / 100;
  }
  const explicit = (input.currency ?? "").trim().toUpperCase() || null;
  const currency = amountPaid != null ? explicit || GAME_PAYMENT_CURRENCY : explicit;
  const paidOn = (input.paidOn ?? "").trim() || null;
  if (paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    throw new Error("Paid date must be a calendar date");
  }
  return { supplierName, amountPaid, currency, paidOn };
}

const COMPLETED_FIX_STATUSES = new Set(["COMPLETED", "RESOLVED", "CLOSED"]);

export type MachineFixUpdate = {
  lastFixAt: string;
  lastFixSummary: string;
  lastFixStatus: string;
  lastFixTechnicianStaffId: string | null;
  /** Set only when the fix is completed. Null means leave the previous repair time. */
  lastRepairAt: string | null;
};

/** Prefer the note the technician just wrote, then the repair write-up, then the fault description. */
export function fixSummaryFromFault(input: {
  note?: string | null;
  actionTaken?: string | null;
  finalResult?: string | null;
  diagnosis?: string | null;
  description?: string | null;
}): string {
  return [input.note, input.actionTaken, input.finalResult, input.diagnosis, input.description]
    .map((value) => (value ?? "").replace(/\s+/g, " ").trim())
    .find((value) => value.length >= 2) ?? "";
}

/**
 * Logging or completing a technician fix updates that game.
 * The returned snapshot is what the machine record stores as its latest fix.
 */
export function machineFixUpdate(input: {
  at: string;
  summary?: string | null;
  status: string;
  technicianStaffId?: string | null;
}): MachineFixUpdate {
  const summary = (input.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (summary.length < 2) {
    throw new Error("A technician fix needs a short summary before it updates the game");
  }
  if (!Number.isFinite(new Date(input.at).getTime())) {
    throw new Error("Fix time is not a valid timestamp");
  }
  const status = input.status.trim();
  if (!status) throw new Error("Fix status is required");
  const completed = COMPLETED_FIX_STATUSES.has(status);
  return {
    lastFixAt: input.at,
    lastFixSummary: summary,
    lastFixStatus: status,
    lastFixTechnicianStaffId: input.technicianStaffId?.trim() || null,
    lastRepairAt: completed ? input.at : null,
  };
}

export const DEFAULT_PM_CHECKLIST = [
  "Visual condition and cabinet",
  "Power and earth",
  "Controls and buttons",
  "Display / sensors",
  "Card or RFID interface",
  "Network and software version",
  "Safety stop and player area",
  "Test game cycle",
] as const;
