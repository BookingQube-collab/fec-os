"use server";

import { z } from "zod";

import {
  listMyIncompletePunchRosterDays,
  listRoamingStaffForRosterFromPunches,
  previewRosterFromPunches,
  saveMyIncompletePunchRosterDay,
  saveRosterFromPunches,
} from "@/lib/attendance-hr/roster-from-punches.server";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const adminRange = z.object({
  dateFrom: ymd,
  dateTo: ymd,
  staffIds: z.array(z.string().uuid()).max(50).optional(),
  locationId: z.string().uuid().nullable().optional(),
  deviceId: z.string().uuid().nullable().optional(),
  deviceUserKeys: z.array(z.string().min(3).max(160)).max(100).optional(),
});

/** Admin: roaming staff (staff.is_roaming) available for punch-derived roster save. */
export const listRoamingStaffForPunchRoster = createAuthenticatedActionNoInput(
  async (context) => listRoamingStaffForRosterFromPunches(context),
  { auth: { requireRole: true } },
);

/** Admin: preview how many complete punch pairs would become roster rows. */
export const previewPunchRosterMonth = createAuthenticatedAction(
  adminRange,
  async (data, context) => previewRosterFromPunches(context, data),
  { auth: { requireRole: true } },
);

/**
 * Admin: one-click monthly save — complete punch in+out only, create-only.
 * Incomplete punch-out days are skipped for staff self-entry.
 */
export const savePunchRosterMonth = createAuthenticatedAction(
  adminRange,
  async (data, context) => saveRosterFromPunches(context, data),
  { auth: { requireRole: true } },
);

/** Roaming staff: days with punch-in and no punch-out, and no roster row yet. */
export const listMyIncompletePunchRoster = createAuthenticatedAction(
  z.object({
    dateFrom: ymd,
    dateTo: ymd,
  }),
  async (data, context) => listMyIncompletePunchRosterDays(context, data),
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

/** Roaming staff: enter a roster day for an incomplete punch-out day. */
export const saveMyIncompletePunchRoster = createAuthenticatedAction(
  z.object({
    workDate: ymd,
    locationId: z.string().uuid(),
    shiftStart: z.string().min(4).max(8),
    shiftEnd: z.string().min(4).max(8),
  }),
  async (data, context) => saveMyIncompletePunchRosterDay(context, data),
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);
