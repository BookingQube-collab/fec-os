import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ackAdmsCommand,
  findAdmsDeviceBySerial,
  ingestAdmsPayload,
  pendingAdmsCommandLine,
  touchAdmsDevice,
} from "@/lib/attendance-hr/adms-ingest";
import { admsOk, buildAdmsHandshake, parseAdmsDeviceCmdAck, parseAdmsQuery } from "@/lib/attendance-hr/parse-adms";
import { decodeAttendanceText } from "@/lib/attendance-hr/parse-attlog";
import { validateAdmsCommKey, validateAdmsIp } from "@/lib/server/adms-auth";

function admsText(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      Pragma: "no-cache",
      "Cache-Control": "no-store",
    },
  });
}

function endpointFromSlug(slug: string[] | undefined): string {
  const joined = (slug ?? []).join("/").replace(/\.aspx$/i, "").toLowerCase();
  if (!joined) return "root";
  if (joined === "cdata" || joined.endsWith("/cdata")) return "cdata";
  if (joined === "getrequest" || joined.endsWith("/getrequest")) return "getrequest";
  if (joined === "devicecmd" || joined === "devicemd" || joined.endsWith("/devicecmd")) return "devicecmd";
  if (joined === "registry" || joined.endsWith("/registry")) return "registry";
  return joined;
}

async function readBodyText(request: Request): Promise<string> {
  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) return "";
  return decodeAttendanceText(buf);
}

async function authorize(request: Request, sn: string, queryKey: string | null) {
  const ipErr = validateAdmsIp(request);
  if (ipErr) return { error: admsText(ipErr.body, ipErr.status), device: null };
  const keyErr = validateAdmsCommKey(request, queryKey);
  if (keyErr) return { error: admsText(keyErr.body, keyErr.status), device: null };
  if (!sn) return { error: admsText("AUTH_ERROR", 403), device: null };
  const device = await findAdmsDeviceBySerial(supabaseAdmin, sn);
  if (!device) return { error: admsText("AUTH_ERROR", 403), device: null };
  return { error: null, device };
}

async function handleGetRequest(request: Request, sn: string, queryKey: string | null) {
  const auth = await authorize(request, sn, queryKey);
  if (auth.error) return auth.error;
  const command = pendingAdmsCommandLine(auth.device);
  return admsText(command ?? "OK");
}

export async function handleAdmsGet(request: Request, slug?: string[]) {
  const url = new URL(request.url);
  const q = parseAdmsQuery(url);
  const endpoint = endpointFromSlug(slug);

  if (endpoint === "getrequest" || endpoint === "root") {
    return handleGetRequest(request, q.sn, q.pushcommkey);
  }

  if (endpoint === "cdata" || endpoint === "registry") {
    const auth = await authorize(request, q.sn, q.pushcommkey);
    if (auth.error) return auth.error;
    try {
      await touchAdmsDevice(supabaseAdmin, auth.device.id, { error: null });
    } catch (e) {
      console.error("adms handshake touch failed:", e);
    }
    return admsText(
      buildAdmsHandshake({
        sn: q.sn,
        attlogStamp: auth.device.adms_attlog_stamp,
        operlogStamp: auth.device.adms_operlog_stamp,
      }),
    );
  }

  const auth = await authorize(request, q.sn, q.pushcommkey);
  if (auth.error) return auth.error;
  return admsText("OK");
}

export async function handleAdmsPost(request: Request, slug?: string[]) {
  const url = new URL(request.url);
  const q = parseAdmsQuery(url);
  const endpoint = endpointFromSlug(slug);

  if (endpoint === "getrequest") {
    return handleGetRequest(request, q.sn, q.pushcommkey);
  }

  const auth = await authorize(request, q.sn, q.pushcommkey);
  if (auth.error) return auth.error;

  if (endpoint === "devicecmd") {
    const body = await readBodyText(request);
    const ack = parseAdmsDeviceCmdAck(body);
    if (ack) {
      try {
        await ackAdmsCommand(supabaseAdmin, auth.device.id, ack.id);
      } catch (e) {
        console.error("adms command ack failed:", e);
      }
    }
    return admsText("OK");
  }

  const body = await readBodyText(request);
  const table = q.table === "unknown" && body ? "ATTLOG" : q.table;

  try {
    const result = await ingestAdmsPayload(supabaseAdmin, {
      device: auth.device,
      table,
      body,
      stamp: q.stamp,
    });
    return admsText(admsOk(result.users + result.punches + result.duplicates));
  } catch (e) {
    console.error("adms ingest failed:", e);
    try {
      await touchAdmsDevice(supabaseAdmin, auth.device.id, {
        error: e instanceof Error ? e.message : "ingest failed",
      });
    } catch {
      /* ignore */
    }
    return admsText("ERROR", 500);
  }
}

export { handleAdmsGet as handleAdmsGet, handleAdmsPost as handleAdmsPost };
