"use server";

import { z } from "zod";

import { SIDEBAR_NAV_ORDER_AUTH } from "@/lib/nav-order";
import {
  loadSidebarNavOrderState,
  resolveSidebarOrderInstruction,
  saveSidebarNavOrderState,
} from "@/lib/nav-order.server";
import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

const saveSchema = z.object({
  departmentIds: z.array(z.string().trim().min(1).max(40)).min(1).max(24),
  itemOrders: z.record(z.string().trim().min(1).max(80), z.array(z.string().trim().min(3).max(240)).max(400)).optional(),
});

const instructionSchema = z.object({
  instruction: z.string().trim().min(2).max(400),
});

export const loadSidebarNavOrder = createSafeAuthenticatedAction(
  z.object({}),
  async () => loadSidebarNavOrderState(),
);

export const saveSidebarNavOrder = createSafeAuthenticatedAction(
  saveSchema,
  async (data, context) =>
    saveSidebarNavOrderState(data.departmentIds, context.userId, data.itemOrders),
  { auth: SIDEBAR_NAV_ORDER_AUTH },
);

export const reorderSidebarNavWithInstruction = createSafeAuthenticatedAction(
  instructionSchema,
  async (data, context) => {
    const current = await loadSidebarNavOrderState();
    const resolved = await resolveSidebarOrderInstruction(
      current.departmentIds,
      current.itemOrders,
      data.instruction,
    );
    if (!resolved) {
      throw new Error(
        "That instruction did not match a sidebar section. Try “put People & HR first” or “move Smart Board under Leave”.",
      );
    }
    const saved = await saveSidebarNavOrderState(
      resolved.departmentIds,
      context.userId,
      resolved.itemOrders,
    );
    return { ...saved, source: resolved.source };
  },
  { auth: SIDEBAR_NAV_ORDER_AUTH },
);
