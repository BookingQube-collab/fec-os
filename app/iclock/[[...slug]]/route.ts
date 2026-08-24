import { handleAdmsGet, handleAdmsHead, handleAdmsOptions, handleAdmsPost } from "@/lib/attendance-hr/adms-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ slug?: string[] }> };

/**
 * ZKTeco ADMS / iClock push (device-initiated).
 * Devices POST/GET /iclock, /iclock/cdata, /iclock/getrequest, /iclock/devicecmd.
 * Auth: serial number allowlist on attendance_devices + optional ADMS_COMM_KEY / ADMS_IP_ALLOWLIST.
 */
export async function GET(request: Request, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  return handleAdmsGet(request, slug);
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  return handleAdmsPost(request, slug);
}

export async function HEAD() {
  return handleAdmsHead();
}

export async function OPTIONS() {
  return handleAdmsOptions();
}
