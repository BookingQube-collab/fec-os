import { z } from "zod";

import {
  FAULT_CATEGORIES,
  FAULT_SEVERITIES,
  FAULT_STATUSES,
  INSTALLATION_STATUSES,
  MACHINE_STATUSES,
  OPERATIONAL_IMPACTS,
  PART_STATUSES,
  PM_CADENCES,
  PM_RESULTS,
  SUPPLIER_CASE_STATUSES,
} from "./domain";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max = 2000) => z.string().max(max).optional().nullable();

export const PageQuery = z
  .object({
    locationId: uuid.optional().nullable(),
    status: z.string().max(40).optional().nullable(),
    q: z.string().max(80).optional().nullable(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(200).default(25),
    machineId: uuid.optional().nullable(),
  })
  .default({});

export const MachineInput = z.object({
  id: uuid.optional(),
  assetCode: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9-]+$/, "Asset ID uses letters, numbers, and hyphens"),
  name: z.string().trim().min(2).max(160),
  gameCategory: z.string().trim().min(2).max(80),
  locationId: uuid,
  areaId: uuid.optional().nullable(),
  zone: optionalText(120),
  unitNumber: optionalText(40),
  manufacturer: optionalText(120),
  vendorId: uuid.optional().nullable(),
  model: optionalText(120),
  serialNumber: optionalText(120),
  installedOn: day.optional().nullable(),
  purchasedOn: day.optional().nullable(),
  warrantyStart: day.optional().nullable(),
  warrantyExpiresOn: day.optional().nullable(),
  machineCost: z.number().nonnegative().optional().nullable(),
  supplierName: optionalText(160),
  amountPaid: z.number().nonnegative().optional().nullable(),
  paidCurrency: optionalText(8),
  paidOn: day.optional().nullable(),
  status: z.enum(MACHINE_STATUSES).default("WORKING"),
  technicianStaffId: uuid.optional().nullable(),
  powerRequirement: optionalText(200),
  networkRequirement: optionalText(200),
  ipAddress: optionalText(64),
  softwareVersion: optionalText(80),
  controllerPcb: optionalText(160),
  cardRfidInterface: optionalText(160),
  notes: optionalText(4000),
  nextPmOn: day.optional().nullable(),
});

export const FaultInput = z.object({
  locationId: uuid,
  machineId: uuid,
  unitNumber: optionalText(40),
  reportedAt: z.string().datetime().optional(),
  reportedByStaffId: uuid.optional().nullable(),
  technicianStaffId: uuid.optional().nullable(),
  category: z.enum(FAULT_CATEGORIES),
  description: z.string().trim().min(8).max(4000),
  severity: z.enum(FAULT_SEVERITIES).default("MEDIUM"),
  operationalImpact: z.enum(OPERATIONAL_IMPACTS).default("PARTIALLY_OPERATIONAL"),
  machineStatus: z.enum(MACHINE_STATUSES).optional(),
});

export const FaultStatusInput = z.object({
  id: uuid,
  status: z.enum(FAULT_STATUSES),
  note: z.string().max(2000).optional().nullable(),
  problem: optionalText(),
  diagnosis: optionalText(),
  actionTaken: optionalText(),
  partsUsed: optionalText(),
  testingPerformed: optionalText(),
  finalResult: optionalText(),
  recommendations: optionalText(),
  description: z.string().trim().min(8).max(4000).optional(),
  locationId: uuid.optional(),
  machineId: uuid.optional(),
  reportedAt: z.string().datetime().optional(),
});

export const PmCompleteInput = z.object({
  scheduleId: uuid.optional().nullable(),
  machineId: uuid,
  locationId: uuid,
  technicianStaffId: uuid.optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
  notes: optionalText(),
  issuesFound: optionalText(),
  items: z.array(z.object({
    label: z.string().min(1).max(200),
    result: z.enum(PM_RESULTS),
    notes: optionalText(500),
  })).min(1),
});

export const CaseInput = z.object({
  id: uuid.optional(),
  vendorId: uuid,
  machineId: uuid.optional().nullable(),
  locationId: uuid.optional().nullable(),
  faultId: uuid.optional().nullable(),
  problem: z.string().trim().min(8).max(4000),
  troubleshootingDone: optionalText(),
  partsTested: optionalText(),
  technicianFindings: optionalText(),
  supplierResponse: optionalText(),
  nextFollowUpOn: day.optional().nullable(),
  warrantyStatus: optionalText(80),
  status: z.enum(SUPPLIER_CASE_STATUSES).default("DRAFT"),
  technicianStaffId: uuid.optional().nullable(),
  updateBody: optionalText(),
});

export const PartInput = z.object({
  id: uuid.optional(),
  partCode: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80).default("spare"),
  manufacturer: optionalText(120),
  vendorId: uuid.optional().nullable(),
  partNumber: optionalText(80),
  minStock: z.number().nonnegative().default(0),
  reorderLevel: z.number().nonnegative().default(0),
  warehouseLocationId: uuid,
  unitCost: z.number().nonnegative().optional().nullable(),
  spec: optionalText(),
  notes: optionalText(),
  machineIds: z.array(uuid).default([]),
  openingQty: z.number().nonnegative().default(0),
});

export const PartSupplyInput = z.object({
  id: uuid,
  supplyStatus: z.enum(PART_STATUSES),
  orderedQty: z.number().nonnegative().optional(),
  eta: day.optional().nullable(),
  lastPurchasePrice: z.number().nonnegative().optional().nullable(),
});

export const UploadInput = z.object({
  entityType: z.enum(["machine", "fault", "pm", "case", "damage", "installation", "document", "part"]),
  entityId: uuid,
  locationId: uuid.optional().nullable(),
  kind: z.enum(["photo", "video", "file"]).default("file"),
  filename: z.string().min(1).max(200),
  dataBase64: z.string().min(10).max(36_000_000),
  contentType: z.string().max(120),
});

export const DamageInput = z.object({
  id: uuid.optional(),
  machineId: uuid.optional().nullable(),
  locationId: uuid.optional().nullable(),
  reportedOn: day.optional(),
  reportedByStaffId: uuid.optional().nullable(),
  damageType: z.string().trim().min(2).max(80),
  description: z.string().trim().min(8).max(4000),
  cause: optionalText(),
  customerCaused: z.boolean().default(false),
  staffCaused: z.boolean().default(false),
  accidental: z.boolean().default(false),
  estimatedCost: z.number().nonnegative().optional().nullable(),
  partsRequired: optionalText(),
  supplierAssistance: z.boolean().default(false),
  operational: z.boolean().default(true),
  correctiveAction: optionalText(),
  preventiveAction: optionalText(),
});

export const InstallationInput = z.object({
  id: uuid.optional(),
  machineId: uuid.optional().nullable(),
  vendorId: uuid.optional().nullable(),
  locationId: uuid,
  deliveryOn: day.optional().nullable(),
  installedOn: day.optional().nullable(),
  technicianStaffId: uuid.optional().nullable(),
  supplierTechnician: optionalText(160),
  checks: z.record(z.boolean()).default({}),
  issues: optionalText(),
  finalAcceptance: optionalText(),
  status: z.enum(INSTALLATION_STATUSES).default("DELIVERED"),
});

export const DocumentInput = z.object({
  id: uuid.optional(),
  vendorId: uuid.optional().nullable(),
  manufacturer: optionalText(120),
  machineId: uuid.optional().nullable(),
  model: optionalText(120),
  locationId: uuid.optional().nullable(),
  docType: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(200),
  notes: optionalText(),
  errorCode: optionalText(80),
  faultCategory: optionalText(80),
  partHint: optionalText(120),
  externalUrl: z.string().url().max(500).optional().nullable(),
});

export const WorkbookPlanInput = z.object({
  source: z.string().trim().min(2).max(80),
  headline: z.object({
    units: z.number().int().nullable(),
    repaired: z.number().int().nullable(),
    pending: z.number().int().nullable(),
    ongoing: z.number().int().nullable(),
  }),
  machines: z.array(z.object({
    key: z.string().trim().min(3).max(200),
    name: z.string().trim().min(2).max(160),
    locationCode: z.string().trim().min(2).max(20),
    locationText: z.string().max(200),
    assetCode: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9-]+$/),
    status: z.enum(["WORKING", "UNDER_REPAIR", "WAITING_PART"]),
    notes: z.string().max(500).nullable(),
    supplierName: z.string().max(160).nullable(),
  })).max(200),
  damage: z.array(z.object({
    externalKey: z.string().trim().min(3).max(80),
    machineKey: z.string().trim().min(3).max(200),
    reportedOn: day,
    damageType: z.string().trim().min(2).max(80),
    description: z.string().trim().min(2).max(4000),
    correctiveAction: z.string().max(4000).nullable(),
    preventiveAction: z.string().max(4000).nullable(),
    partsRequired: z.string().max(2000).nullable(),
  })).max(20),
  maintenance: z.array(z.object({
    externalKey: z.string().trim().min(3).max(80),
    machineKey: z.string().trim().min(3).max(200),
    reportedOn: day,
    resolvedOn: day.nullable(),
    status: z.enum(["RESOLVED", "WAITING_PART", "UNDER_REPAIR"]),
    category: z.enum(FAULT_CATEGORIES),
    description: z.string().trim().min(2).max(4000),
    diagnosis: z.string().max(4000).nullable(),
    actionTaken: z.string().max(4000).nullable(),
    partsUsed: z.string().max(2000).nullable(),
    recommendations: z.string().max(4000).nullable(),
  })).max(200),
  parts: z.array(z.object({
    externalKey: z.string().trim().min(3).max(80),
    machineKey: z.string().max(200).nullable(),
    locationCode: z.string().max(20).nullable(),
    item: z.string().trim().min(2).max(200),
    supplierName: z.string().max(160).nullable(),
    qty: z.number().positive().max(100000),
    issue: z.string().max(2000).nullable(),
    remarks: z.string().max(2000).nullable(),
    workshopTool: z.boolean(),
  })).max(80),
  unmapped: z.array(z.object({
    name: z.string().max(160),
    locationText: z.string().max(200),
    reason: z.string().max(200),
  })).max(80),
});

export const ImportInput = z.object({
  source: z.string().trim().min(2).max(80),
  rows: z.array(z.object({
    externalKey: z.string().max(120).optional().nullable(),
    kind: z.enum(["fault", "part_request", "damage", "note"]),
    assetCode: z.string().max(40).optional().nullable(),
    machineName: z.string().max(160).optional().nullable(),
    locationCode: z.string().max(40).optional().nullable(),
    payload: z.record(z.unknown()).default({}),
  })).min(1).max(200),
});
