import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveStaffProfileReadAccess } from "@/lib/staff-profile-access.server";
import { ForbiddenError } from "@/lib/server/authorize";
import { getAuthenticatedContext } from "@/lib/server/auth";
import { enforceActionAuth } from "@/lib/server/create-action";
import { byteaToBuffer, isStaffPhotoMime } from "@/lib/staff-photo";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const context = await getAuthenticatedContext();
    await enforceActionAuth(context, { requireRole: true });
    const { id } = await ctx.params;
    const access = await resolveStaffProfileReadAccess(context, id);
    const db = access.scope === "team" ? supabaseAdmin : context.supabase;

    const { data: staff, error } = await db
      .from("staff")
      .select("id, location_id, photo_data, photo_mime, photo_updated_at, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!staff || staff.deleted_at) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    if (access.scope === "company") {
      const { data: allowed, error: locErr } = await context.supabase.rpc("user_can_access_staff", {
        _staff_id: id,
      });
      if (locErr) {
        const { data: homeOk, error: homeErr } = await context.supabase.rpc("user_can_access_location", {
          _location_id: staff.location_id,
        });
        if (homeErr) throw homeErr;
        if (!homeOk) throw new ForbiddenError("Forbidden: cannot access this branch");
      } else if (!allowed) {
        throw new ForbiddenError("Forbidden: cannot access this branch");
      }
    }

    if (!staff.photo_data || !staff.photo_updated_at) {
      return NextResponse.json({ error: "No photo" }, { status: 404 });
    }

    const bytes = byteaToBuffer(staff.photo_data);
    if (!bytes?.length) {
      return NextResponse.json({ error: "Photo unavailable" }, { status: 404 });
    }

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized" || (e instanceof Error && e.name === "UnauthorizedError")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
