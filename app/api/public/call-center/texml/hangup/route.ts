import { NextResponse } from "next/server";

import { texmlHangup } from "@/lib/call-center/texml";
import { assertCallCenterWebhook } from "@/lib/call-center/webhook-auth";

export const maxDuration = 10;

/**
 * TeXML Update Call `Url` target — returns Hangup only (no Speak).
 * Used to force-release the inbound leg before LiveKit connect-back dial.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const authError = await assertCallCenterWebhook(request, { rawBody });
  if (authError) return authError;
  return new NextResponse(texmlHangup(), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  return POST(request);
}
