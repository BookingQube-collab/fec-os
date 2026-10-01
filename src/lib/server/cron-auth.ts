import { NextResponse } from "next/server";

import { secretsEqual } from "@/lib/server/secret-equal";

/**
 * Validates cron/webhook requests using CRON_SECRET.
 * Accepts Authorization: Bearer <secret> or x-cron-secret header.
 * Rejects the request when CRON_SECRET is unset or empty.
 */
export function validateCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!cronSecret.trim()) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = bearer ?? cronHeader;

  if (!token || !secretsEqual(token, cronSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return null;
}
