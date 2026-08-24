import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { cookies } from "next/headers";

import type { AppRole } from "@/lib/rbac";

export const ROLES_COOKIE_NAME = "fec-roles";
const ROLES_COOKIE_TTL_SEC = 5 * 60;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

type RolesCookiePayload = {
  u: string;
  r: AppRole[];
  e: number;
};

function signingSecret(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.CRON_SECRET ??
    null
  );
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function readRolesCookie(cookieStore: CookieStore, userId: string): AppRole[] | null {
  const secret = signingSecret();
  const raw = cookieStore.get(ROLES_COOKIE_NAME)?.value;
  if (!secret || !raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  if (!safeEqual(sign(body, secret), mac)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RolesCookiePayload;
    if (payload.u !== userId) return null;
    if (typeof payload.e !== "number" || Date.now() > payload.e) return null;
    if (!Array.isArray(payload.r)) return null;
    return payload.r;
  } catch {
    return null;
  }
}

export function writeRolesCookie(cookieStore: CookieStore, userId: string, roles: AppRole[]): void {
  const secret = signingSecret();
  if (!secret) return;
  const payload: RolesCookiePayload = {
    u: userId,
    r: roles,
    e: Date.now() + ROLES_COOKIE_TTL_SEC * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  try {
    cookieStore.set(ROLES_COOKIE_NAME, `${body}.${sign(body, secret)}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ROLES_COOKIE_TTL_SEC,
    });
  } catch {
    /* Server Component cookie writes are ignored */
  }
}
