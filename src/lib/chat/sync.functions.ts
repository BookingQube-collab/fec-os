"use server";

import { z } from "zod";

import { mapChatError } from "@/lib/chat/group-rules";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

async function enableChatRoom(context: AuthContext, fn: string, args: Record<string, unknown>): Promise<string> {
  const supabase = context.supabase as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(mapChatError(error));
  if (typeof data !== "string" || !z.string().uuid().safeParse(data).success) {
    throw new Error("Chat request failed.");
  }
  return data;
}

/** Turns on the one live department chat, then syncs members from staff_departments. */
export const enableDepartmentChat = createAuthenticatedAction(
  z.object({ departmentId: z.string().uuid() }),
  async (data, context) => {
    const id = await enableChatRoom(context, "chat_enable_department_chat", {
      _department_id: data.departmentId,
    });
    return { id };
  },
  { auth: { capability: "people.edit_roster" } },
);

/** Turns on the one live site chat, then syncs members from current site assignments. */
export const enableSiteChat = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    const id = await enableChatRoom(context, "chat_enable_site_chat", {
      _location_id: data.locationId,
    });
    return { id };
  },
  { auth: { capability: "branches.edit", minRoleLevel: 80 } },
);
