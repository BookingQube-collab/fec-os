import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import {
  decodeProfileAvatarDataUrl,
  isProfileAvatarDataUrl,
} from "@/lib/profile-avatar";
import { getAuthenticatedContext } from "@/lib/server/auth";
import { byteaToBuffer, isStaffPhotoMime } from "@/lib/staff-photo";

export const runtime = "nodejs";

async function serveStaffPhoto(staffId: string): Promise<NextResponse | null> {
  const { data: staff, error } = await supabaseAdmin
    .from("staff")
    .select("photo_data, photo_mime, photo_updated_at, deleted_at")
    .eq("id", staffId)
    .maybeSingle();
  if (error || !staff || staff.deleted_at || !staff.photo_data || !staff.photo_updated_at) {
    return null;
  }
  const bytes = byteaToBuffer(staff.photo_data);
  if (!bytes?.length) return null;
  const mime =
    typeof staff.photo_mime === "string" && isStaffPhotoMime(staff.photo_mime)
      ? staff.photo_mime
      : "image/jpeg";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(bytes.length),
    },
  });
}

/** Serves the signed-in user's profile photo for `<img src="/api/auth/avatar">`. */
export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;

    const raw = typeof profile?.avatar_url === "string" ? profile.avatar_url.trim() : "";
    if (raw && isProfileAvatarDataUrl(raw)) {
      const { bytes, contentType } = decodeProfileAvatarDataUrl(raw);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
          "Content-Length": String(bytes.length),
        },
      });
    }

    if (raw && /^https?:\/\//i.test(raw)) {
      return NextResponse.redirect(raw, 302);
    }

    const linked = await loadLinkedStaffRecord(context.userId).catch(() => null);
    if (linked?.id) {
      const staffPhoto = await serveStaffPhoto(linked.id);
      if (staffPhoto) return staffPhoto;
    }

    return NextResponse.json({ error: "No photo" }, { status: 404 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[auth/avatar]", msg, e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
