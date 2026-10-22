"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  canUploadDigitalSignature,
  decodeSignatureDataUrl,
  extensionForSignatureMime,
  signatureStoragePath,
  STAFF_SIGNATURES_BUCKET,
} from "@/lib/digital-signature";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import { profileAvatarApiUrl } from "@/lib/profile-avatar";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  createSafeAuthenticatedAction,
  createSafeAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

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

async function assertCanManageSignature(context: {
  userId: string;
  roles?: readonly string[] | null;
}) {
  const linked = await loadLinkedStaffRecord(context.userId).catch(() => null);
  const allowed = canUploadDigitalSignature({
    roles: context.roles ?? [],
    jobTitle: linked?.jobTitle ?? null,
    staffRole: linked?.staffRole ?? null,
    department: linked?.department ?? null,
  });
  if (!allowed) {
    throw new ForbiddenError("Digital signatures are available for senior positions only.");
  }
  return linked;
}

async function signedPreviewUrl(path: string | null | undefined): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(STAFF_SIGNATURES_BUCKET)
    .createSignedUrl(path.trim(), 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

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
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(patch)
      .eq("id", context.userId)
      .select("id, updated_at, avatar_url")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Profile not found.");
    // Session / topbar use a short same-origin URL — never echo the data URL back.
    const stored = typeof row.avatar_url === "string" ? row.avatar_url.trim() : "";
    const avatarUrl = stored
      ? profileAvatarApiUrl(typeof row.updated_at === "string" ? row.updated_at : null)
      : null;
    return { display_name: data.display_name, avatar_url: avatarUrl };
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

/** Whether the signed-in user may manage a digital signature, plus current settings. */
export const getMyDigitalSignature = createSafeAuthenticatedActionNoInput(async (context) => {
  const linked = await loadLinkedStaffRecord(context.userId).catch(() => null);
  const canManage = canUploadDigitalSignature({
    roles: context.roles ?? [],
    jobTitle: linked?.jobTitle ?? null,
    staffRole: linked?.staffRole ?? null,
    department: linked?.department ?? null,
  });
  if (!canManage) {
    return {
      canManage: false as const,
      signatureUrl: null,
      previewUrl: null,
      autoApply: false,
    };
  }
  const { data, error } = await context.supabase
    .from("profiles")
    .select("signature_url, signature_auto_apply")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw error;
  const signatureUrl = (data as { signature_url?: string | null } | null)?.signature_url ?? null;
  const autoApply = Boolean(
    (data as { signature_auto_apply?: boolean | null } | null)?.signature_auto_apply,
  );
  const previewUrl = await signedPreviewUrl(signatureUrl);
  return {
    canManage: true as const,
    signatureUrl,
    previewUrl,
    autoApply,
  };
});

/** Upload or replace the signed-in user's digital signature image. */
export const uploadMyDigitalSignature = createSafeAuthenticatedAction(
  z.object({
    dataUrl: z.string().min(80).max(3_000_000),
  }),
  async (data, context) => {
    await assertCanManageSignature(context);
    const { bytes, contentType } = decodeSignatureDataUrl(data.dataUrl);
    const ext = extensionForSignatureMime(contentType);
    const path = signatureStoragePath(context.userId, ext);

    const { data: existing } = await context.supabase
      .from("profiles")
      .select("signature_url")
      .eq("id", context.userId)
      .maybeSingle();
    const previous =
      (existing as { signature_url?: string | null } | null)?.signature_url?.trim() || null;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STAFF_SIGNATURES_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) {
      const msg = uploadError.message || "Storage upload failed";
      if (/bucket|not found|does not exist/i.test(msg)) {
        throw new Error("Signature storage is not ready. Apply the digital signatures migration.");
      }
      throw new Error(msg);
    }

    const { error: updateError } = await context.supabase
      .from("profiles")
      .update({ signature_url: path, updated_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (updateError) throw updateError;

    if (previous && previous !== path) {
      await supabaseAdmin.storage.from(STAFF_SIGNATURES_BUCKET).remove([previous]).catch(() => undefined);
    }

    const previewUrl = await signedPreviewUrl(path);
    return { signatureUrl: path, previewUrl };
  },
);

/** Remove the signed-in user's digital signature image (opt-in stays until they change it). */
export const deleteMyDigitalSignature = createSafeAuthenticatedActionNoInput(async (context) => {
  await assertCanManageSignature(context);
  const { data, error } = await context.supabase
    .from("profiles")
    .select("signature_url")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw error;
  const path = (data as { signature_url?: string | null } | null)?.signature_url?.trim() || null;

  const { error: updateError } = await context.supabase
    .from("profiles")
    .update({ signature_url: null, updated_at: new Date().toISOString() })
    .eq("id", context.userId);
  if (updateError) throw updateError;

  if (path) {
    await supabaseAdmin.storage.from(STAFF_SIGNATURES_BUCKET).remove([path]).catch(() => undefined);
  }
  return { removed: true as const };
});

/** Toggle whether approvals auto-stamp this signature on print slips. Default remains off. */
export const setMySignatureAutoApply = createSafeAuthenticatedAction(
  z.object({
    autoApply: z.boolean(),
  }),
  async (data, context) => {
    await assertCanManageSignature(context);
    if (data.autoApply) {
      const { data: row, error } = await context.supabase
        .from("profiles")
        .select("signature_url")
        .eq("id", context.userId)
        .maybeSingle();
      if (error) throw error;
      if (!(row as { signature_url?: string | null } | null)?.signature_url?.trim()) {
        throw new Error("Upload a signature image before enabling automatic stamping.");
      }
    }
    const { error: updateError } = await context.supabase
      .from("profiles")
      .update({
        signature_auto_apply: data.autoApply,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (updateError) throw updateError;
    return { autoApply: data.autoApply };
  },
);
