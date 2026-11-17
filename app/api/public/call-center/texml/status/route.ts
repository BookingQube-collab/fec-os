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

  if (!["completed", "busy", "failed", "no-answer", "canceled", "cancelled"].includes(status)) {
    return NextResponse.json({ ok: true, ignored: status || "unknown" });
  }

  const call =
    (ids.callControlId ? await findCallByProviderCallId(ids.callControlId) : null) ||
    (ids.callSid ? await findCallByProviderCallId(ids.callSid) : null);

  if (!call) return NextResponse.json({ ok: true, note: "unknown call" });

  const updated = await finalizeCarrierHangup(call, `TeXML ${status}`);
  return NextResponse.json({ ok: true, callId: updated.id, status: updated.status });
}
