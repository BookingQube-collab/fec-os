"use server";

import { z } from "zod";

import { createAuthenticatedAction } from "@/lib/server/create-action";
import {
  resolveMaintenanceCategoryName,
  resolveMaintenanceIssueTypeName,
} from "@/lib/queries/maintenance-options.core";

export const ensureMaintenanceCategory = createAuthenticatedAction(
  z.object({ name: z.string().min(1).max(100) }),
  async (data, context) => {
    const name = await resolveMaintenanceCategoryName(context, data.name);
    return { name };
  },
  { auth: { capability: "maintenance.request_submit" } },
);

export const ensureMaintenanceIssueType = createAuthenticatedAction(
  z.object({ name: z.string().min(1).max(100) }),
  async (data, context) => {
    const name = await resolveMaintenanceIssueTypeName(context, data.name);
    return { name };
  },
  { auth: { capability: "maintenance.request_submit" } },
);
