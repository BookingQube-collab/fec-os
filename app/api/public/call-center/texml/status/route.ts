import { NextResponse } from "next/server";

import { finalizeCarrierHangup } from "@/lib/call-center/carrier";
import { findCallByProviderCallId } from "@/lib/call-center/db";
import { parseTexmlForm, texmlCallIds } from "@/lib/call-center/texml";
import { assertCallCenterWebhook } from "@/lib/call-center/webhook-auth";

export const maxDuration = 30;

/**
 * TeXML status callback — sync hangup into CDR.
 * POST /api/public/call-center/texml/status
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const authError = await assertCallCenterWebhook(request, { rawBody });
  if (authError) return authError;

  const form = parseTexmlForm(rawBody, request.headers.get("content-type"));
  const ids = texmlCallIds(form);
  const status = ids.callStatus;

  const call =
    (ids.callControlId ? await findCallByProviderCallId(ids.callControlId) : null) ||
    (ids.callSid ? await findCallByProviderCallId(ids.callSid) : null);

  // Persist AccountSid early so Answer can Update Call → Dial Sip immediately.
  if (call && ids.accountSid) {
    const meta = (call.metadata as Record<string, unknown> | null) ?? {};
    if (meta.texmlAccountSid !== ids.accountSid) {
      const { updateCall } = await import("@/lib/call-center/db");
      await updateCall(call.id, {
        metadata: { ...meta, texml: true, texmlAccountSid: ids.accountSid, texmlCallSid: ids.callSid },
      });
    }
  }

  if (!["completed", "busy", "failed", "no-answer", "canceled", "cancelled"].includes(status)) {
    return NextResponse.json({ ok: true, ignored: status || "unknown" });
  }

  if (!call) return NextResponse.json({ ok: true, note: "unknown call" });

  const updated = await finalizeCarrierHangup(call, `TeXML ${status}`);
  return NextResponse.json({ ok: true, callId: updated.id, status: updated.status });
}
