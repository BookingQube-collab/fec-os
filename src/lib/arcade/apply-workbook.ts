import type { ArcadeWorkbookPlan } from "./workbook-import";

type QueryError = { message: string } | null;

type Query = PromiseLike<{ data: unknown; error: QueryError }> & {
  select: (columns?: string) => Query;
  insert: (row: Record<string, unknown> | Record<string, unknown>[]) => Query;
  update: (row: Record<string, unknown>) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: unknown[]) => Query;
  ilike: (column: string, value: string) => Query;
  limit: (count: number) => Query;
  maybeSingle: () => Promise<{ data: unknown; error: QueryError }>;
  single: () => Promise<{ data: unknown; error: QueryError }>;
};

export type ArcadeDb = {
  from: (table: string) => Query;
};

export type ApplyArcadeWorkbookResult = {
  machinesCreated: number;
  machinesExisting: number;
  suppliersAttached: number;
  damageCreated: number;
  maintenanceCreated: number;
  partsCreated: number;
  skipped: number;
  unmapped: ArcadeWorkbookPlan["unmapped"];
  headline: ArcadeWorkbookPlan["headline"];
  failures: string[];
};

type MachineRow = {
  id: string;
  asset_code: string;
  name: string;
  location_id: string;
  supplier_name: string | null;
  notes: string | null;
};

function machineIdentity(name: string): string {
  return name.toLowerCase().replace(/grafi+t+i/g, "graffiti").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function applyArcadeWorkbookPlan(
  db: ArcadeDb,
  plan: ArcadeWorkbookPlan,
  userId: string | null,
): Promise<ApplyArcadeWorkbookResult> {
  const result: ApplyArcadeWorkbookResult = {
    machinesCreated: 0,
    machinesExisting: 0,
    suppliersAttached: 0,
    damageCreated: 0,
    maintenanceCreated: 0,
    partsCreated: 0,
    skipped: 0,
    unmapped: plan.unmapped,
    headline: plan.headline,
    failures: [],
  };
  const codes = [...new Set(plan.machines.map((machine) => machine.locationCode).concat(plan.parts.map((part) => part.locationCode).filter((code): code is string => Boolean(code))))];
  if (!codes.length) {
    result.unmapped = plan.unmapped;
    return result;
  }
  const locations = await db.from("locations").select("id, code").in("code", codes);
  if (locations.error) throw new Error(locations.error.message);
  const locationId = new Map(((locations.data ?? []) as { id: string; code: string }[]).map((row) => [row.code, row.id]));

  const existingQuery = await db.from("arcade_machines").select("id, asset_code, name, location_id, supplier_name, notes").limit(2000);
  if (existingQuery.error) throw new Error(existingQuery.error.message);
  const existing = (existingQuery.data ?? []) as MachineRow[];
  const byAsset = new Map(existing.map((row) => [row.asset_code.toLowerCase(), row]));
  const byName = new Map(existing.map((row) => [`${row.location_id}:${machineIdentity(row.name)}`, row]));
  const ids = new Map<string, string>();

  for (const machine of plan.machines) {
    const siteId = locationId.get(machine.locationCode);
    if (!siteId) {
      result.failures.push(`${machine.name}: venue ${machine.locationCode} is not in the location master`);
      continue;
    }
    const found = byAsset.get(machine.assetCode.toLowerCase()) ?? byName.get(`${siteId}:${machineIdentity(machine.name)}`);
    if (found) {
      ids.set(machine.key, found.id);
      result.machinesExisting += 1;
      const patch: Record<string, unknown> = {};
      if (!found.supplier_name && machine.supplierName) {
        patch.supplier_name = machine.supplierName;
        result.suppliersAttached += 1;
      }
      if (!found.notes && machine.notes) patch.notes = machine.notes;
      if (Object.keys(patch).length) {
        patch.updated_by = userId;
        const updated = await db.from("arcade_machines").update(patch).eq("id", found.id);
        if (updated.error) result.failures.push(`${machine.name}: ${updated.error.message}`);
      }
      continue;
    }
    const inserted = await db
      .from("arcade_machines")
      .insert({
        asset_code: machine.assetCode,
        name: machine.name,
        game_category: "Arcade",
        location_id: siteId,
        status: machine.status,
        notes: machine.notes,
        supplier_name: machine.supplierName,
        active: true,
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      result.failures.push(`${machine.name}: ${inserted.error?.message ?? "Machine was not created"}`);
      continue;
    }
    const id = (inserted.data as { id: string }).id;
    ids.set(machine.key, id);
    result.machinesCreated += 1;
    if (machine.supplierName) result.suppliersAttached += 1;
    byAsset.set(machine.assetCode.toLowerCase(), {
      id,
      asset_code: machine.assetCode,
      name: machine.name,
      location_id: siteId,
      supplier_name: machine.supplierName,
      notes: machine.notes,
    });
  }

  for (const damage of plan.damage) {
    const marker = `import:${damage.externalKey}`;
    const prior = await db.from("arcade_damage_reports").select("id").eq("cause", marker).maybeSingle();
    if (prior.error) {
      result.failures.push(`Damage: ${prior.error.message}`);
      continue;
    }
    if (prior.data) {
      result.skipped += 1;
      continue;
    }
    const machineId = ids.get(damage.machineKey) ?? null;
    const machine = plan.machines.find((row) => row.key === damage.machineKey);
    const inserted = await db.from("arcade_damage_reports").insert({
      machine_id: machineId,
      location_id: machine ? locationId.get(machine.locationCode) ?? null : null,
      reported_on: damage.reportedOn,
      damage_type: damage.damageType,
      description: damage.description,
      cause: marker,
      parts_required: damage.partsRequired,
      corrective_action: damage.correctiveAction,
      preventive_action: damage.preventiveAction,
      needs_mapping: !machineId,
      operational: true,
      created_by: userId,
      updated_by: userId,
    });
    if (inserted.error) result.failures.push(`Damage: ${inserted.error.message}`);
    else result.damageCreated += 1;
  }

  for (const row of plan.maintenance) {
    const prior = await db.from("arcade_faults").select("id").eq("ticket_number", row.externalKey).maybeSingle();
    if (prior.error) {
      result.failures.push(`${row.externalKey}: ${prior.error.message}`);
      continue;
    }
    if (prior.data) {
      const id = (prior.data as { id: string }).id;
      const refreshed = await db.from("arcade_faults").update({
        reported_at: `${row.reportedOn}T08:00:00Z`,
        resolved_at: row.resolvedOn ? `${row.resolvedOn}T16:00:00Z` : null,
      }).eq("id", id);
      if (refreshed.error) result.failures.push(`${row.externalKey}: ${refreshed.error.message}`);
      else result.skipped += 1;
      continue;
    }
    const machineId = ids.get(row.machineKey);
    const machine = plan.machines.find((item) => item.key === row.machineKey);
    const siteId = machine ? locationId.get(machine.locationCode) : null;
    if (!machineId || !siteId) {
      result.failures.push(`${row.externalKey}: machine is not on a known site`);
      continue;
    }
    const reportedAt = `${row.reportedOn}T08:00:00Z`;
    const inserted = await db.from("arcade_faults").insert({
      ticket_number: row.externalKey,
      location_id: siteId,
      machine_id: machineId,
      reported_at: reportedAt,
      category: row.category,
      description: row.description,
      severity: "MEDIUM",
      operational_impact: row.status === "RESOLVED" ? "FULLY_OPERATIONAL" : "PARTIALLY_OPERATIONAL",
      status: row.status,
      diagnosis: row.diagnosis,
      action_taken: row.actionTaken,
      parts_used: row.partsUsed,
      recommendations: row.recommendations,
      resolved_at: row.resolvedOn ? `${row.resolvedOn}T16:00:00Z` : null,
      created_by: userId,
      updated_by: userId,
    });
    if (inserted.error) result.failures.push(`${row.externalKey}: ${inserted.error.message}`);
    else result.maintenanceCreated += 1;
  }

  for (const part of plan.parts) {
    const marker = `import:${part.externalKey}`;
    const prior = await db.from("arcade_part_requests").select("id").ilike("notes", `${marker}%`).limit(1);
    if (prior.error) {
      result.failures.push(`${part.externalKey}: ${prior.error.message}`);
      continue;
    }
    if (Array.isArray(prior.data) && prior.data.length) {
      result.skipped += 1;
      continue;
    }
    const siteId = part.locationCode ? locationId.get(part.locationCode) : null;
    if (!siteId) {
      result.failures.push(`${part.item}: site is not in the location master`);
      continue;
    }
    const detail = [part.issue, part.remarks, part.supplierName ? `Supplier: ${part.supplierName}` : null].filter(Boolean).join(" · ");
    const inserted = await db.from("arcade_part_requests").insert({
      machine_id: part.machineKey ? ids.get(part.machineKey) ?? null : null,
      location_id: siteId,
      description: part.workshopTool ? `Workshop tool: ${part.item}` : part.item,
      qty: part.qty,
      status: "REQUESTED",
      notes: detail ? `${marker}\n${detail}` : marker,
      created_by: userId,
      updated_by: userId,
    });
    if (inserted.error) result.failures.push(`${part.item}: ${inserted.error.message}`);
    else result.partsCreated += 1;
  }

  return result;
}
