"use server";

import { z } from "zod";

import { applyRosterPunchFill, loadRosterPunchFillStaff } from "@/lib/attendance-hr/roster-punch-fill.server";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

const rosterFillAuth = { auth: { capability: "hr.employee_app" as const } };

export const listRosterPunchFillStaff = createAuthenticatedActionNoInput(
  async (context) => loadRosterPunchFillStaff(context),
  rosterFillAuth,
);

export const approveRosterPunchFill = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => applyRosterPunchFill(context, data),
  rosterFillAuth,
);
