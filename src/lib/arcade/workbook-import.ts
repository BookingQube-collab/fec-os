/**
 * Reads the technician workbooks the arcade admin is expected to show:
 * the Magic Table damage report, and the E3 August monthly maintenance report.
 * Purchase-invoice amounts are not in these files. Supplier names from the
 * parts sheet are kept only when they are not another machine or a site label.
 */

export type SheetCell = { row: number; col: string; value: string };

export type SheetGrid = { name: string; cells: SheetCell[] };

export type WorkbookMachine = {
  key: string;
  name: string;
  locationCode: string;
  locationText: string;
  assetCode: string;
  status: "WORKING" | "UNDER_REPAIR" | "WAITING_PART";
  notes: string | null;
  supplierName: string | null;
};

export type WorkbookDamage = {
  externalKey: string;
  machineKey: string;
  reportedOn: string;
  damageType: string;
  description: string;
  correctiveAction: string | null;
  preventiveAction: string | null;
  partsRequired: string | null;
};

export type WorkbookMaintenance = {
  externalKey: string;
  machineKey: string;
  reportedOn: string;
  resolvedOn: string | null;
  status: "RESOLVED" | "WAITING_PART" | "UNDER_REPAIR";
  category: string;
  description: string;
  diagnosis: string | null;
  actionTaken: string | null;
  partsUsed: string | null;
  recommendations: string | null;
};

export type WorkbookPart = {
  externalKey: string;
  machineKey: string | null;
  locationCode: string | null;
  item: string;
  supplierName: string | null;
  qty: number;
  issue: string | null;
  remarks: string | null;
  workshopTool: boolean;
};

export type WorkbookHeadline = {
  units: number | null;
  repaired: number | null;
  pending: number | null;
  ongoing: number | null;
};

export type ArcadeWorkbookPlan = {
  source: string;
  headline: WorkbookHeadline;
  machines: WorkbookMachine[];
  damage: WorkbookDamage[];
  maintenance: WorkbookMaintenance[];
  parts: WorkbookPart[];
  /** Rows that name a machine but not a known site. */
  unmapped: { name: string; locationText: string; reason: string }[];
};

type MachineDraft = {
  key: string;
  name: string;
  locationCode: string;
  locationText: string;
  notes: string | null;
  supplierName: string | null;
  waitingPart: boolean;
  open: boolean;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  augsut: 8,
  augsust: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function gridFromSheet(
  name: string,
  sheet: Record<string, { w?: unknown; v?: unknown } | undefined>,
): SheetGrid {
  const cells: SheetCell[] = [];
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const match = address.match(/^([A-Z]+)(\d+)$/);
    const cell = sheet[address];
    if (!match || !cell) continue;
    const value = String(cell.w ?? cell.v ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    cells.push({ col: match[1]!, row: Number(match[2]), value });
  }
  return { name, cells };
}

export function machineKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/grafi+t+i/g, "graffiti")
    .replace(/\s*-\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveVenueCode(raw: string): string | null {
  const text = raw.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const crayons = /crayon|brik|c and b/.test(text);
  const dar = /dar al salam|dar al salaam|al salaam/.test(text);
  const vendome = /vendome/.test(text);
  const dohaMall = /doha mall/.test(text);
  const cityCenter = /city center|city centre/.test(text);
  if (crayons && dar) return "CB-DSM";
  if (crayons && vendome) return "CB-VM";
  if (crayons && !dar && !vendome) return null;
  if (/urban arena/.test(text)) return "UA-DM";
  if (/inflata/.test(text)) return "INF-CC";
  if (/kids|kds|driving school/.test(text) && dohaMall) return "KDS-DM";
  if (/kids|kds|driving school/.test(text) && cityCenter) return "KDS-CC";
  if (text === "kds") return "KDS-CC";
  if (text === "urban arena") return "UA-DM";
  if (text === "inflata park" || text === "inflatapark") return "INF-CC";
  return null;
}

export function parseCalendarDate(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || /1900/.test(text) || /^_+$/.test(text)) return null;
  const monthDay = text.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const year = text.match(/\b(20\d{2})\b/);
  if (!monthDay || !year) return null;
  const month = MONTHS[monthDay[1]!.toLowerCase()];
  const day = Number(monthDay[2]);
  if (!month || day < 1 || day > 31) return null;
  return `${year[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rowsOf(grid: SheetGrid): Map<number, Record<string, string[]>> {
  const rows = new Map<number, Record<string, string[]>>();
  for (const cell of grid.cells) {
    const row = rows.get(cell.row) ?? {};
    const list = row[cell.col] ?? [];
    list.push(cell.value);
    row[cell.col] = list;
    rows.set(cell.row, row);
  }
  return rows;
}

function cell(row: Record<string, string[]> | undefined, col: string): string {
  return row?.[col]?.join(" ").replace(/\s+/g, " ").trim() ?? "";
}

function meaningful(value: string): string | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || /^_+$/.test(text)) return null;
  return text;
}

function joinLines(lines: string[]): string | null {
  const unique: string[] = [];
  for (const line of lines) {
    const text = meaningful(line);
    if (!text || unique.includes(text)) continue;
    unique.push(text);
  }
  return unique.length ? unique.join("\n") : null;
}

function assetCodeFor(locationCode: string, name: string, taken: Set<string>): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 22);
  const base = `ARC-${locationCode}-${slug || "UNIT"}`.slice(0, 40);
  let code = base;
  let n = 2;
  while (taken.has(code)) {
    const suffix = `-${n}`;
    code = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    n += 1;
  }
  taken.add(code);
  return code;
}

function faultCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/screen|display|picture|image|audio|sound|monitor/.test(lower)) return "Display";
  if (/sensor|rfid|camera|crosshair|calibration/.test(lower)) return "Sensor";
  if (/software|boot|program|filter effect/.test(lower)) return "Software";
  if (/power|battery|charger|smps|no power/.test(lower)) return "Power";
  if (/board|pcb|i\s*\/\s*o|console/.test(lower)) return "PCB";
  if (/cable|lan|network/.test(lower)) return "Network";
  if (/solenoid|wheel|mechanical|pedal|steering|gun|glove|joystick|gear/.test(lower)) return "Mechanical";
  return "Other";
}

function blankHeadline(): WorkbookHeadline {
  return { units: null, repaired: null, pending: null, ongoing: null };
}

export function parseDamageGrid(grid: SheetGrid): { damage: WorkbookDamage | null; machine: MachineDraft | null } {
  const rows = [...rowsOf(grid).entries()].sort((a, b) => a[0] - b[0]);
  const header = rows.find(([, row]) => /machine name/i.test(cell(row, "B")));
  if (!header) return { damage: null, machine: null };
  const body = rows.filter(([index]) => index > header[0]);
  const names = body.map(([, row]) => cell(row, "B")).filter((value) => value && !/machine damage report/i.test(value));
  const name = names[0]?.replace(/\s+/g, " ").trim();
  if (!name) return { damage: null, machine: null };
  const locationText = body.map(([, row]) => cell(row, "C")).find(Boolean) ?? "";
  const locationCode = resolveVenueCode(locationText);
  const issue = joinLines(body.map(([, row]) => cell(row, "E"))) ?? "Damage reported";
  const initial = joinLines(body.map(([, row]) => cell(row, "F")));
  const followUp = joinLines(body.map(([, row]) => cell(row, "G")));
  const remarks = joinLines(body.map(([, row]) => cell(row, "H")));
  const parts = joinLines(body.map(([, row]) => cell(row, "I")));
  const reportedOn = body.map(([, row]) => parseCalendarDate(cell(row, "D"))).find(Boolean) ?? "2026-09-11";
  const subtitle = names.slice(1).join(" ").replace(/\s+/g, " ").trim();
  const key = `${locationCode ?? "UNMAPPED"}:${machineKey(name)}`;
  const machine: MachineDraft | null = locationCode
    ? {
        key,
        name,
        locationCode,
        locationText,
        notes: subtitle || null,
        supplierName: null,
        waitingPart: false,
        open: true,
      }
    : null;
  return {
    machine,
    damage: {
      externalKey: "DMG-W39-MAGIC-TABLE",
      machineKey: key,
      reportedOn,
      damageType: "Touch screen",
      description: issue,
      correctiveAction: initial,
      preventiveAction: followUp ?? remarks,
      partsRequired: parts,
    },
  };
}

type UnitBlock = {
  name: string;
  locationText: string;
  dates: string[];
  repairDates: string[];
  issues: string[];
  assessments: string[];
  parts: string[];
  remarks: string[];
};

function parseUnitSheet(grid: SheetGrid): UnitBlock[] {
  const rows = [...rowsOf(grid).entries()].sort((a, b) => a[0] - b[0]);
  const header = rows.find(([, row]) => /name of unit/i.test(cell(row, "B")));
  if (!header) return [];
  const blocks: UnitBlock[] = [];
  let current: Omit<UnitBlock, "name"> = { locationText: "", dates: [], repairDates: [], issues: [], assessments: [], parts: [], remarks: [] };
  const pushText = (bucket: string[], value: string) => {
    if (meaningful(value)) bucket.push(value);
  };
  for (const [, row] of rows.filter(([index]) => index > header[0])) {
    const name = cell(row, "B");
    const location = cell(row, "C");
    if (location) {
      current.locationText = /doha mall|city center|vendome|salam|salaam/i.test(location) && current.locationText && !/mall|center|vendome|salam/i.test(current.locationText)
        ? `${current.locationText} ${location}`
        : location;
    }
    const inspected = cell(row, "D");
    const repaired = cell(row, "I");
    if (inspected) current.dates.push(inspected);
    if (repaired) current.repairDates.push(repaired);
    pushText(current.issues, cell(row, "E"));
    pushText(current.assessments, cell(row, "F"));
    pushText(current.parts, cell(row, "G"));
    pushText(current.remarks, cell(row, "H"));
    if (name && !/name of unit/i.test(name)) {
      blocks.push({ name, ...current });
      current = { locationText: "", dates: [], repairDates: [], issues: [], assessments: [], parts: [], remarks: [] };
    }
  }
  return blocks;
}

function reportMonthDate(values: string[], fallback: string): { reportedOn: string; sheetDate: string | null } {
  const parsed = values.map(parseCalendarDate).filter((value): value is string => Boolean(value));
  const august = parsed.find((value) => value.startsWith("2026-08"));
  const first = parsed[0] ?? null;
  if (august) return { reportedOn: august, sheetDate: first !== august ? first : null };
  if (first) return { reportedOn: fallback, sheetDate: first };
  return { reportedOn: fallback, sheetDate: null };
}

export function parseMaintenanceGrids(grids: SheetGrid[]): ArcadeWorkbookPlan {
  const summary = grids.find((grid) => /monthly report/i.test(grid.name));
  const partsGrid = grids.find((grid) => /parts request/i.test(grid.name));
  const repaired = grids.find((grid) => /repaired/i.test(grid.name));
  const pending = grids.find((grid) => /pending/i.test(grid.name));
  const machines = new Map<string, MachineDraft>();
  const unmapped: ArcadeWorkbookPlan["unmapped"] = [];
  const maintenance: WorkbookMaintenance[] = [];
  const parts: WorkbookPart[] = [];
  let repairIndex = 0;
  let pendingIndex = 0;

  const ensure = (name: string, locationText: string, notes: string | null): MachineDraft | null => {
    const locationCode = resolveVenueCode(locationText);
    if (!locationCode) {
      unmapped.push({ name, locationText, reason: "Site name does not match a venue" });
      return null;
    }
    const key = `${locationCode}:${machineKey(name)}`;
    const existing = machines.get(key);
    if (existing) {
      if (notes && !existing.notes) existing.notes = notes;
      return existing;
    }
    const draft: MachineDraft = {
      key,
      name: name.replace(/\s+/g, " ").trim(),
      locationCode,
      locationText: locationText.replace(/\s+/g, " ").trim(),
      notes,
      supplierName: null,
      waitingPart: false,
      open: false,
    };
    machines.set(key, draft);
    return draft;
  };

  const addMaintenance = (
    blockName: string,
    locationText: string,
    status: WorkbookMaintenance["status"],
    description: string,
    extra: Partial<WorkbookMaintenance>,
    externalKey: string,
  ) => {
    const machine = ensure(blockName, locationText, null);
    if (!machine) return;
    if (status !== "RESOLVED") machine.open = true;
    if (status === "WAITING_PART") machine.waitingPart = true;
    maintenance.push({
      externalKey,
      machineKey: machine.key,
      reportedOn: extra.reportedOn ?? "2026-08-01",
      resolvedOn: extra.resolvedOn ?? null,
      status,
      category: extra.category ?? faultCategory(description),
      description,
      diagnosis: extra.diagnosis ?? null,
      actionTaken: extra.actionTaken ?? null,
      partsUsed: extra.partsUsed ?? null,
      recommendations: extra.recommendations ?? null,
    });
  };

  for (const block of repaired ? parseUnitSheet(repaired) : []) {
    const description = joinLines(block.issues) ?? joinLines(block.remarks) ?? joinLines(block.assessments);
    if (!description) {
      ensure(block.name, block.locationText, null);
      continue;
    }
    const dated = reportMonthDate([...block.dates, ...block.repairDates], "2026-08-01");
    const resolved = reportMonthDate(block.repairDates, dated.reportedOn);
    const sheetNote = dated.sheetDate ? `Inspection date on the sheet: ${dated.sheetDate}` : null;
    repairIndex += 1;
    addMaintenance(block.name, block.locationText, "RESOLVED", description, {
      reportedOn: dated.reportedOn,
      resolvedOn: resolved.reportedOn,
      diagnosis: joinLines(block.assessments),
      actionTaken: joinLines(block.parts),
      partsUsed: joinLines(block.parts),
      recommendations: joinLines([...(block.remarks), ...(sheetNote ? [sheetNote] : [])]),
      category: faultCategory(`${description} ${joinLines(block.assessments) ?? ""}`),
    }, `MNT-202608-R${String(repairIndex).padStart(2, "0")}`);
  }

  for (const block of pending ? parseUnitSheet(pending) : []) {
    const description = joinLines(block.issues) ?? joinLines(block.assessments) ?? joinLines(block.remarks);
    const partsText = joinLines(block.parts);
    if (!description && !partsText) {
      ensure(block.name, block.locationText, null);
      continue;
    }
    pendingIndex += 1;
    const dated = reportMonthDate(block.dates, "2026-08-31");
    const sheetNote = dated.sheetDate ? `Inspection date on the sheet: ${dated.sheetDate}` : null;
    const status = partsText || /part/i.test(description ?? "") ? "WAITING_PART" : "UNDER_REPAIR";
    addMaintenance(block.name, block.locationText, status, description ?? partsText!, {
      reportedOn: dated.reportedOn,
      diagnosis: joinLines(block.assessments),
      partsUsed: partsText,
      recommendations: joinLines([...(block.remarks), ...(sheetNote ? [sheetNote] : [])]),
      category: faultCategory(`${description ?? ""} ${partsText ?? ""}`),
    }, `MNT-202608-P${String(pendingIndex).padStart(2, "0")}`);
  }

  const knownNames = new Set([...machines.values()].map((machine) => machineKey(machine.name)));
  if (partsGrid) {
    const rows = [...rowsOf(partsGrid).entries()].sort((a, b) => a[0] - b[0]);
    const header = rows.find(([, row]) => /item requested/i.test(cell(row, "B")));
    let section = "";
    let partIndex = 0;
    for (const [, row] of rows.filter(([index]) => header && index > header[0])) {
      const item = cell(row, "B");
      const machineName = cell(row, "C");
      const supplier = cell(row, "D");
      const numbered = Boolean(cell(row, "A"));
      if (!numbered && item && !machineName) {
        section = item;
        continue;
      }
      if (!numbered || !item) continue;
      partIndex += 1;
      const workshopTool = /technical/i.test(section);
      const locationText = workshopTool ? "Kids City Driving School City Center" : section;
      const locationCode = resolveVenueCode(locationText);
      let linked = machineName && !workshopTool
        ? [...machines.values()].find((machine) => machine.locationCode === locationCode && machineKey(machine.name) === machineKey(machineName)) ?? null
        : null;
      if (!linked && machineName && !workshopTool) linked = matchNamedMachine(machineName, machines, locationCode);
      const resolvedCode = locationCode ?? linked?.locationCode ?? null;
      if (!linked && machineName && resolvedCode && !workshopTool) linked = ensure(machineName, section || linkedLocationText(resolvedCode), null);
      const supplierName = purchaseInvoiceSupplier(supplier, knownNames, machineName);
      if (linked && supplierName && !linked.supplierName) linked.supplierName = supplierName;
      parts.push({
        externalKey: `PRT-202608-${String(partIndex).padStart(2, "0")}`,
        machineKey: linked?.key ?? null,
        locationCode: resolvedCode,
        item,
        supplierName,
        qty: Number(cell(row, "E").match(/(\d+(?:\.\d+)?)/)?.[1] ?? 1),
        issue: meaningful(cell(row, "F")),
        remarks: meaningful(cell(row, "G")),
        workshopTool,
      });
    }
  }

  if (summary) addSummaryLines(summary, maintenance, ensure);

  const named = new Set([...machines.values()].map((machine) => machineKey(machine.name)));
  const stillUnmapped = unmapped.filter((row) => !named.has(machineKey(row.name)));
  const taken = new Set<string>();
  return {
    source: "e3-monthly-maintenance-2026-08",
    headline: summary ? parseHeadline(summary) : blankHeadline(),
    machines: [...machines.values()].map((machine) => ({
      key: machine.key,
      name: machine.name,
      locationCode: machine.locationCode,
      locationText: machine.locationText,
      assetCode: assetCodeFor(machine.locationCode, machine.name, taken),
      status: machine.waitingPart ? "WAITING_PART" : machine.open ? "UNDER_REPAIR" : "WORKING",
      notes: machine.notes,
      supplierName: machine.supplierName,
    })),
    damage: [],
    maintenance,
    parts,
    unmapped: stillUnmapped,
  };
}

function matchNamedMachine(name: string, machines: Map<string, MachineDraft>, locationCode: string | null): MachineDraft | null {
  const key = machineKey(name);
  const pool = [...machines.values()].filter((machine) => !locationCode || machine.locationCode === locationCode);
  const exact = pool.find((machine) => machineKey(machine.name) === key);
  if (exact) return exact;
  const hits = pool.filter((machine) => {
    const other = machineKey(machine.name);
    return other.startsWith(`${key} `) || key.startsWith(`${other} `) || (key.includes("magic pen") && other.includes("magic pen"));
  });
  const sites = new Set(hits.map((machine) => machine.locationCode));
  return sites.size === 1 ? hits[0]! : null;
}

function linkedLocationText(code: string): string {
  if (code === "CB-VM") return "Crayons and Bricks Place Vendome";
  if (code === "CB-DSM") return "Crayons and Bricks Dar Al Salam";
  if (code === "KDS-CC") return "Kids City Driving School City Center";
  if (code === "KDS-DM") return "Kids City Driving School Doha Mall";
  if (code === "UA-DM") return "Urban Arena Doha Mall";
  return "Inflata Park City Center";
}

function purchaseInvoiceSupplier(supplier: string, machineNames: Set<string>, machineName: string): string | null {
  const text = supplier.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const key = machineKey(text);
  if (!key || key === machineKey(machineName) || machineNames.has(key)) return null;
  if (/^(rc track|urban arena|inflata park|city center|doha mall|kds|5meters)$/.test(key)) return null;
  return text;
}

function parseHeadline(grid: SheetGrid): WorkbookHeadline {
  const text = grid.cells.map((cell) => cell.value).join(" ");
  const number = (label: string) => {
    const match = text.match(new RegExp(`${label}\\s*=\\s*(\\d+)`, "i"));
    return match ? Number(match[1]) : null;
  };
  return {
    units: number("TOTAL"),
    repaired: number("REPAIRED"),
    pending: number("PENDING"),
    ongoing: number("ONGOING"),
  };
}

function addSummaryLines(
  grid: SheetGrid,
  maintenance: WorkbookMaintenance[],
  ensure: (name: string, locationText: string, notes: string | null) => MachineDraft | null,
) {
  const rows = [...rowsOf(grid).entries()].sort((a, b) => a[0] - b[0]);
  let section: "pending" | "ongoing" | "achievement" | "skip" = "skip";
  let venue = "";
  let lastKey: string | null = null;
  let summaryIndex = 0;
  for (const [, row] of rows) {
    const label = cell(row, "B");
    const detail = cell(row, "C");
    if (/^pending units/i.test(label)) {
      section = "pending";
      continue;
    }
    if (/^ongoing/i.test(label)) {
      section = "ongoing";
      continue;
    }
    if (/^achievement/i.test(label)) {
      section = "achievement";
      continue;
    }
    if (/^recommendation|^maintenance plan|^total/i.test(label)) {
      section = "skip";
      lastKey = null;
      continue;
    }
    if (section === "skip") continue;
    if (label && !detail && resolveVenueCode(label)) {
      venue = label;
      lastKey = null;
      continue;
    }
    if (!label && detail && lastKey) {
      const rowMatch = maintenance.find((item) => item.externalKey === lastKey);
      if (rowMatch) rowMatch.description = `${rowMatch.description}\n${detail}`;
      continue;
    }
    if (!label || !detail || !venue) continue;
    const locationCode = resolveVenueCode(venue);
    const key = locationCode ? `${locationCode}:${machineKey(label)}` : null;
    if (key && maintenance.some((item) => item.machineKey === key)) {
      lastKey = null;
      continue;
    }
    summaryIndex += 1;
    const status = section === "achievement" ? "RESOLVED" : section === "pending" ? "WAITING_PART" : "UNDER_REPAIR";
    const externalKey = `MNT-202608-S${String(summaryIndex).padStart(2, "0")}`;
    const machine = ensure(label, venue, null);
    if (!machine) {
      lastKey = null;
      continue;
    }
    if (status !== "RESOLVED") machine.open = true;
    if (status === "WAITING_PART") machine.waitingPart = true;
    maintenance.push({
      externalKey,
      machineKey: machine.key,
      reportedOn: "2026-08-31",
      resolvedOn: status === "RESOLVED" ? "2026-08-31" : null,
      status,
      category: faultCategory(detail),
      description: detail,
      diagnosis: null,
      actionTaken: null,
      partsUsed: null,
      recommendations: null,
    });
    lastKey = externalKey;
  }
}

export function parseArcadeWorkbooks(input: { damage?: SheetGrid | null; maintenance?: SheetGrid[] }): ArcadeWorkbookPlan {
  const maintenance = parseMaintenanceGrids(input.maintenance ?? []);
  const damage = input.damage ? parseDamageGrid(input.damage) : { damage: null, machine: null };
  if (damage.machine) {
    const existing = maintenance.machines.find((machine) => machine.key === damage.machine!.key);
    if (!existing) {
      const taken = new Set(maintenance.machines.map((machine) => machine.assetCode));
      maintenance.machines.push({
        key: damage.machine.key,
        name: damage.machine.name,
        locationCode: damage.machine.locationCode,
        locationText: damage.machine.locationText,
        assetCode: assetCodeFor(damage.machine.locationCode, damage.machine.name, taken),
        status: damage.machine.waitingPart ? "WAITING_PART" : "UNDER_REPAIR",
        notes: damage.machine.notes,
        supplierName: null,
      });
    } else if (damage.machine.notes && !existing.notes) {
      existing.notes = damage.machine.notes;
    }
  } else if (input.damage && damage.damage) {
    maintenance.unmapped.push({ name: "Magic Table", locationText: "", reason: "Damage report has no matching site" });
  }
  if (damage.damage) maintenance.damage = [damage.damage];
  if (input.damage) maintenance.source = maintenance.machines.length ? "week39-damage-and-august-maintenance" : "week39-damage";
  for (const row of maintenance.maintenance) {
    row.description = clip(row.description, 4000) ?? row.description;
    row.diagnosis = clip(row.diagnosis, 4000);
    row.actionTaken = clip(row.actionTaken, 4000);
    row.partsUsed = clip(row.partsUsed, 2000);
    row.recommendations = clip(row.recommendations, 4000);
  }
  for (const row of maintenance.damage) {
    row.description = clip(row.description, 4000) ?? row.description;
    row.correctiveAction = clip(row.correctiveAction, 4000);
    row.preventiveAction = clip(row.preventiveAction, 4000);
    row.partsRequired = clip(row.partsRequired, 2000);
  }
  for (const row of maintenance.parts) {
    row.issue = clip(row.issue, 2000);
    row.remarks = clip(row.remarks, 2000);
  }
  return maintenance;
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
