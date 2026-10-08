"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

const AVATAR_MAX_CHARS = 350_000;
const AVATAR_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i;

const updateSchema = z.object({
  display_name: z.string().trim().min(1).max(120),
  /** Omit to leave the current photo. Null clears it. */
  avatar_url: z.string().max(AVATAR_MAX_CHARS).nullable().optional(),
});

function assertAvatar(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!AVATAR_DATA_URL.test(compact)) {
    throw new Error("Photo must be a JPEG, PNG, or WebP image.");
  }
  return compact;
}

function readClientIp(headerList: Headers): string | null {
  const raw =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    null;
  if (!raw || raw.length > 64 || !/^[\da-f:.]+$/i.test(raw)) return null;
  return raw;
}

type DeptLink = {
  master_departments?: { name?: string | null } | { name?: string | null }[] | null;
};

/** Self-service update of the signed-in user's `profiles` row. */
export const updateMyProfile = createAuthenticatedAction(
  updateSchema,
  async (data, context) => {
    const patch: { display_name: string; avatar_url?: string | null } = {
      display_name: data.display_name,
    };
    if (data.avatar_url !== undefined) {
      patch.avatar_url = data.avatar_url === null ? null : assertAvatar(data.avatar_url);
    }
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", context.userId);
    if (error) throw error;
    return { display_name: data.display_name, avatar_url: patch.avatar_url };
  },
);

/** Own staff department and the current request IP. No other sessions are stored. */
export const getMyAccountSnapshot = createAuthenticatedActionNoInput(async (context) => {
  const headerList = await headers();
  const ip = readClientIp(headerList);
  let department: string | null = null;
  const { data, error } = await context.supabase
    .from("staff")
    .select("department, staff_departments(master_departments(name))")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!error && data) {
    const links = (data.staff_departments ?? []) as DeptLink[];
    const names = links
      .map((link) => {
        const dept = Array.isArray(link.master_departments) ? link.master_departments[0] : link.master_departments;
        return dept?.name?.trim() || null;
      })
      .filter((name): name is string => Boolean(name));
    const fallback = typeof data.department === "string" ? data.department.trim() : "";
    department = names.length > 0 ? names.join(", ") : fallback || null;
  }
  return { department, ip };
});
