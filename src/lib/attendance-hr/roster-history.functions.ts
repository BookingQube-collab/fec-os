"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  classifyRosterHistoryChangeKinds,
  rosterAuditChangeReason,
  rosterAuditLocationId,
  rosterAuditPayrollMonth,
  ROSTER_AUDIT_ACTIONS,
  summarizeRosterAuditChange,
  type RosterHistoryChangeKind,
} from "@/lib/attendance-hr/roster-audit";
import { monthBounds } from "@/lib/attendance-hr/roster-period";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const listInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  locationId: z.string().uuid().nullable().optional(),
  staffSearch: z.string().max(200).nullable().optional(),
});

export type RosterHistoryRow = {
  id: string;
  createdAt: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  staffId: string | null;
  staffName: string | null;
  employeeCode: string | null;
  workDate: string | null;
  payrollMonth: string | null;
  summary: string;
  changeReason: string | null;
  changeKind: RosterHistoryChangeKind;
  before: unknown;
  after: unknown;
};

export const listMonthlyRosterHistory = createAuthenticatedAction(
  listInput,
  async (data, context) => {
    const period = monthBounds(data.month);
    const staffQuery = data.staffSearch?.trim().toLowerCase() ?? "";

    let staffFilterIds: string[] | null = null;
    if (staffQuery) {
      const { data: staffRows, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("id, full_name, employee_code")
        .or(
          `full_name.ilike.%${staffQuery.replace(/[%_]/g, "")}%,employee_code.ilike.%${staffQuery.replace(/[%_]/g, "")}%`,
        )
        .limit(200);
      if (staffErr) throw staffErr;
      staffFilterIds = (staffRows ?? []).map((r) => String(r.id));
      if (!staffFilterIds.length) {
        return { month: data.month, period, rows: [] as RosterHistoryRow[] };
      }
    }

    const { data: events, error } = await supabaseAdmin
      .from("attendance_audit_events")
      .select("id, created_at, action, actor_id, location_id, before, after, entity_id")
      .in("action", [...ROSTER_AUDIT_ACTIONS])
      .order("created_at", { ascending: false })
      .limit(1500);
    if (error) throw error;

    const monthScoped = (events ?? []).filter((row) => rosterAuditPayrollMonth(row.after, row.before) === data.month);
    const locationScoped = data.locationId
      ? monthScoped.filter(
          (row) =>
            row.location_id === data.locationId ||
            rosterAuditLocationId(row.after, row.before) === data.locationId,
        )
      : monthScoped;

    const filtered = locationScoped.filter((row) => {
      if (!staffFilterIds) return true;
      const after = row.after as Record<string, unknown> | null;
      const before = row.before as Record<string, unknown> | null;
      const staffId = (after?.staffId ?? before?.staffId) as string | undefined;
      return staffId && staffFilterIds.includes(staffId);
    });

    const actorIds = [...new Set(filtered.map((r) => r.actor_id).filter(Boolean))] as string[];
    const locationIds = [
      ...new Set(
        filtered
          .map((r) => r.location_id ?? rosterAuditLocationId(r.after, r.before))
          .filter(Boolean),
      ),
    ] as string[];
    const staffIds = [
      ...new Set(
        filtered.flatMap((r) => {
          const after = r.after as Record<string, unknown> | null;
          const before = r.before as Record<string, unknown> | null;
          const id = (after?.staffId ?? before?.staffId) as string | undefined;
          return id ? [id] : [];
        }),
      ),
    ];

    const [actorsRes, locRes, staffRes] = await Promise.all([
      actorIds.length
        ? supabaseAdmin.from("profiles").select("id, display_name").in("id", actorIds)
        : Promise.resolve({ data: [], error: null }),
      locationIds.length
        ? supabaseAdmin.from("locations").select("id, code, name").in("id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      staffIds.length
        ? supabaseAdmin.from("staff").select("id, full_name, employee_code").in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (actorsRes.error) throw actorsRes.error;
    if (locRes.error) throw locRes.error;
    if (staffRes.error) throw staffRes.error;

    const actorName = new Map((actorsRes.data ?? []).map((r) => [String(r.id), String(r.display_name ?? "")]));
    const locById = new Map(
      (locRes.data ?? []).map((r) => [String(r.id), { code: r.code as string | null, name: r.name as string | null }]),
    );
    const staffById = new Map(
      (staffRes.data ?? []).map((r) => [
        String(r.id),
        { name: r.full_name as string | null, code: r.employee_code as string | null },
      ]),
    );

    const baseRows = filtered.map((row) => {
      const locationId = row.location_id ?? rosterAuditLocationId(row.after, row.before);
      const payrollMonth = rosterAuditPayrollMonth(row.after, row.before);
      const after = row.after as Record<string, unknown> | null;
      const before = row.before as Record<string, unknown> | null;
      const staffId = ((after?.staffId ?? before?.staffId) as string | undefined) ?? null;
      const workDate =
        ((after?.workDate ?? before?.workDate) as string | undefined)?.slice(0, 10) ?? null;
      const loc = locationId ? locById.get(locationId) : undefined;
      const staff = staffId ? staffById.get(staffId) : undefined;
      return {
        id: String(row.id),
        createdAt: String(row.created_at),
        action: String(row.action),
        actorId: row.actor_id as string | null,
        actorName: row.actor_id ? actorName.get(String(row.actor_id)) ?? null : null,
        locationId,
        locationCode: loc?.code ?? null,
        locationName: loc?.name ?? null,
        staffId,
        staffName: staff?.name ?? null,
        employeeCode: staff?.code ?? null,
        workDate,
        payrollMonth,
        summary: summarizeRosterAuditChange(String(row.action), row.before, row.after),
        changeReason: rosterAuditChangeReason(row.after, row.before),
        changeKind: "amendment" as RosterHistoryChangeKind,
        before: row.before,
        after: row.after,
      };
    });

    const kinds = classifyRosterHistoryChangeKinds(
      baseRows.map((r) => ({
        id: r.id,
        action: r.action,
        locationId: r.locationId,
        payrollMonth: r.payrollMonth,
        createdAt: r.createdAt,
      })),
    );

    const rows = baseRows.map((r) => ({ ...r, changeKind: kinds.get(r.id) ?? "amendment" }));

    return { month: data.month, period, rows };
  },
  { auth: { capability: "people.roster_history" } },
);
