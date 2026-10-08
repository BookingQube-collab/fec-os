"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { loadSidebarNavOrder, saveSidebarNavOrder } from "@/lib/nav-order.functions";
import {
  defaultItemOrders,
  defaultNavDepartmentOrder,
  normalizeItemOrders,
  normalizeNavDepartmentOrder,
  type SidebarItemOrders,
} from "@/lib/nav-order";
import type { NavDepartmentId } from "@/lib/nav-config";
import { queryKeys } from "@/lib/query-keys";

type StoredNavOrder = {
  departmentIds: NavDepartmentId[];
  itemOrders: SidebarItemOrders;
};

export function useSidebarNavOrder() {
  const queryClient = useQueryClient();
  const fallbackOrder = useMemo(() => defaultNavDepartmentOrder(), []);
  const fallbackItems = useMemo(() => defaultItemOrders(), []);
  const query = useQuery({
    queryKey: queryKeys.nav.departmentOrder(),
    queryFn: async () => {
      const result = await loadSidebarNavOrder({});
      if (!result.ok) return { departmentIds: fallbackOrder, itemOrders: fallbackItems };
      return {
        departmentIds: normalizeNavDepartmentOrder(result.data.departmentIds),
        itemOrders: normalizeItemOrders(result.data.itemOrders),
      };
    },
    staleTime: 30_000,
  });

  function readStored(): StoredNavOrder {
    return (
      queryClient.getQueryData<StoredNavOrder>(queryKeys.nav.departmentOrder()) ?? {
        departmentIds: fallbackOrder,
        itemOrders: fallbackItems,
      }
    );
  }

  async function save(departmentIds: readonly string[]) {
    const previous = readStored();
    const nextIds = normalizeNavDepartmentOrder(departmentIds);
    queryClient.setQueryData<StoredNavOrder>(queryKeys.nav.departmentOrder(), {
      departmentIds: nextIds,
      itemOrders: previous.itemOrders,
    });
    const result = await saveSidebarNavOrder({ departmentIds: nextIds });
    if (!result.ok) {
      queryClient.setQueryData(queryKeys.nav.departmentOrder(), previous);
      throw new Error(result.error);
    }
    const saved: StoredNavOrder = {
      departmentIds: normalizeNavDepartmentOrder(result.data.departmentIds),
      itemOrders: normalizeItemOrders(result.data.itemOrders),
    };
    queryClient.setQueryData(queryKeys.nav.departmentOrder(), saved);
    return saved.departmentIds;
  }

  async function saveItems(itemOrders: SidebarItemOrders) {
    const previous = readStored();
    const nextItems = normalizeItemOrders(itemOrders);
    queryClient.setQueryData<StoredNavOrder>(queryKeys.nav.departmentOrder(), {
      departmentIds: previous.departmentIds,
      itemOrders: nextItems,
    });
    const result = await saveSidebarNavOrder({
      departmentIds: previous.departmentIds,
      itemOrders: nextItems,
    });
    if (!result.ok) {
      queryClient.setQueryData(queryKeys.nav.departmentOrder(), previous);
      throw new Error(result.error);
    }
    const saved: StoredNavOrder = {
      departmentIds: normalizeNavDepartmentOrder(result.data.departmentIds),
      itemOrders: normalizeItemOrders(result.data.itemOrders),
    };
    queryClient.setQueryData(queryKeys.nav.departmentOrder(), saved);
    return saved.itemOrders;
  }

  return {
    order: query.data?.departmentIds ?? fallbackOrder,
    itemOrders: query.data?.itemOrders ?? fallbackItems,
    ready: query.isSuccess,
    save,
    saveItems,
  };
}
