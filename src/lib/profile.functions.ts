"use server";

import { z } from "zod";

import { createAuthenticatedAction } from "@/lib/server/create-action";

/** Self-service update of the signed-in user's `profiles` row. */
export const updateMyProfile = createAuthenticatedAction(
  z.object({
    display_name: z.string().trim().min(1).max(120),
  }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ display_name: data.display_name })
      .eq("id", context.userId);
    if (error) throw error;
    return { display_name: data.display_name };
  },
);
