import "server-only";

import ar from "@/i18n/locales/ar.json";
import en from "@/i18n/locales/en.json";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import type { NavDepartmentId } from "@/lib/nav-config";
import {
  defaultItemOrders,
  defaultNavDepartmentOrder,
  interpretNavItemInstruction,
  interpretNavOrderInstruction,
  navOrderLabelsForPrompt,
  navPlanFromAiPayload,
  normalizeItemOrders,
  normalizeNavDepartmentOrder,
  sidebarItemLabelCatalog,
  type SidebarItemOrders,
} from "@/lib/nav-order";

const SIDEBAR_NAV_ORDER_ID = "00000000-0000-4000-8000-0000000000c6";

type OrderRow = { department_ids: string[] | null; item_orders: unknown };

function orderTable() {
  const db = supabaseAdmin as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: OrderRow | null; error: { message: string } | null }>;
        };
      };
      upsert: (
        values: Record<string, unknown>,
        options: { onConflict: string },
      ) => {
        select: (columns: string) => {
          maybeSingle: () => Promise<{ data: OrderRow | null; error: { message: string } | null }>;
        };
      };
    };
  };
  return db.from("sidebar_nav_order");
}

const itemCatalog = sidebarItemLabelCatalog(
  en.nav as Record<string, unknown>,
  ar.nav as Record<string, unknown>,
);

export async function loadSidebarNavOrderState(): Promise<{
  departmentIds: NavDepartmentId[];
  itemOrders: SidebarItemOrders;
}> {
  try {
    const result = await orderTable()
      .select("department_ids, item_orders")
      .eq("id", SIDEBAR_NAV_ORDER_ID)
      .maybeSingle();
    if (result.error || !result.data) {
      return { departmentIds: defaultNavDepartmentOrder(), itemOrders: defaultItemOrders() };
    }
    return {
      departmentIds: normalizeNavDepartmentOrder(result.data.department_ids ?? []),
      itemOrders: normalizeItemOrders(result.data.item_orders),
    };
  } catch {
    return { departmentIds: defaultNavDepartmentOrder(), itemOrders: defaultItemOrders() };
  }
}

export async function loadSidebarDepartmentOrder(): Promise<NavDepartmentId[]> {
  const state = await loadSidebarNavOrderState();
  return state.departmentIds;
}

export async function saveSidebarNavOrderState(
  departmentIds: readonly string[],
  updatedBy: string,
  itemOrders?: SidebarItemOrders,
): Promise<{ departmentIds: NavDepartmentId[]; itemOrders: SidebarItemOrders }> {
  const nextIds = normalizeNavDepartmentOrder(departmentIds);
  const values: Record<string, unknown> = {
    id: SIDEBAR_NAV_ORDER_ID,
    department_ids: nextIds,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  if (itemOrders) values.item_orders = normalizeItemOrders(itemOrders);
  const result = await orderTable()
    .upsert(values, { onConflict: "id" })
    .select("department_ids, item_orders")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Sidebar order could not be saved.");
  return {
    departmentIds: normalizeNavDepartmentOrder(result.data.department_ids ?? nextIds),
    itemOrders: normalizeItemOrders(result.data.item_orders),
  };
}

export async function saveSidebarDepartmentOrder(
  departmentIds: readonly string[],
  updatedBy: string,
): Promise<NavDepartmentId[]> {
  const saved = await saveSidebarNavOrderState(departmentIds, updatedBy);
  return saved.departmentIds;
}

function itemPromptLines() {
  return itemCatalog
    .filter((row) => row.en || row.ar)
    .map((row) => `${row.bucket} | ${row.key} | ${row.en} / ${row.ar}`)
    .join("\n");
}

export async function resolveSidebarOrderInstruction(
  currentDepartments: readonly string[],
  currentItems: SidebarItemOrders,
  instruction: string,
): Promise<{ departmentIds: NavDepartmentId[]; itemOrders: SidebarItemOrders; source: "rules" | "ai" } | null> {
  const baseDepartments = normalizeNavDepartmentOrder(currentDepartments);
  const baseItems = normalizeItemOrders(currentItems);
  const ruledDepartments = interpretNavOrderInstruction(baseDepartments, instruction);
  if (ruledDepartments) {
    return { departmentIds: ruledDepartments, itemOrders: baseItems, source: "rules" };
  }
  const ruledItems = interpretNavItemInstruction(baseItems, instruction, itemCatalog);
  if (ruledItems) {
    return { departmentIds: baseDepartments, itemOrders: ruledItems, source: "rules" };
  }

  const payload = await completeJsonViaGateway(
    [
      {
        role: "system",
        content:
          "Reorder the sidebar. Reply with JSON only: " +
          '{"order":["departmentId",...],"items":{"departmentId":["labelKey|href",...]}}. ' +
          "Use every department id exactly once. " +
          "Include an items entry only for a department whose links should move. " +
          "Use the exact link keys. Do not invent keys. Do not move a link into another department.\n" +
          "Departments:\n" +
          navOrderLabelsForPrompt() +
          "\nLinks:\n" +
          itemPromptLines(),
      },
      {
        role: "user",
        content: `Current departments: ${baseDepartments.join(", ")}\nInstruction: ${instruction}`,
      },
    ],
    { temperature: 0, moduleSource: "sidebar-nav-order" },
  );
  const planned = navPlanFromAiPayload(payload, baseDepartments, baseItems);
  if (!planned) return null;
  return { ...planned, source: "ai" };
}
