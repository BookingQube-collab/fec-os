import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  acknowledgeAdmsDiagnosticCommand,
  claimAdmsDiagnosticDelivery,
  noteAdmsDeviceRequest,
  recordUnknownAdmsSerial,
} from "@/lib/attendance-hr/adms-connection-test.server";
import {
  ackAdmsCommand,
  findAdmsDeviceBySerial,
  ingestAdmsPayload,
  markAdmsCommandDelivered,
  pendingAdmsCommandLine,
  touchAdmsDevice,
  type AdmsDeviceRow,
} from "@/lib/attendance-hr/adms-ingest";
import { getRequestSourceIp } from "@/lib/attendance-ingest-log";
import {
  admsOk,
  buildAdmsHandshake,
  parseAdmsDeviceCmdAck,
  parseAdmsEndpoint,
  parseAdmsQuery,
} from "@/lib/attendance-hr/parse-adms";
import { decodeAttendanceText } from "@/lib/attendance-hr/parse-attlog";
import { shouldTouchAdmsHeartbeat } from "@/lib/attendance-hr/constants";
import { validateAdmsCommKey, validateAdmsIp } from "@/lib/server/adms-auth";

/** Identity cache for idle polls. Pending commands wait at most this long on a warm instance. */
const DEVICE_CACHE_MS = 60_000;
const deviceCache = new Map<string, { at: number; device: AdmsDeviceRow | null }>();
const lastHeartbeatTouch = new Map<string, number>();

function serialKey(sn: string) {
  return sn.trim().toLowerCase();
}

function cachedDevice(sn: string): AdmsDeviceRow | null | undefined {
  const hit = deviceCache.get(serialKey(sn));
  if (!hit || Date.now() - hit.at >= DEVICE_CACHE_MS) return undefined;
  return hit.device;
}

function rememberDevice(sn: string, device: AdmsDeviceRow | null) {
  deviceCache.set(serialKey(sn), { at: Date.now(), device });
}

async function touchHeartbeat(
  deviceId: string,
  meta?: { endpoint?: string | null; sourceIp?: string | null; pushver?: string | null },
) {
  const now = Date.now();
  const prev = lastHeartbeatTouch.get(deviceId) ?? 0;
  if (!shouldTouchAdmsHeartbeat(prev, now)) return;
  lastHeartbeatTouch.set(deviceId, now);
  try {
    await touchAdmsDevice(supabaseAdmin, deviceId, {
      error: null,
      endpoint: meta?.endpoint,
      sourceIp: meta?.sourceIp,
      pushver: meta?.pushver,
    });
  } catch (e) {
    lastHeartbeatTouch.delete(deviceId);
    throw e;
  }
}

function requestMeta(request: Request, endpoint: string, pushver: string | null) {
  return { endpoint, sourceIp: getRequestSourceIp(request), pushver };
}

async function observeDevice(
  device: AdmsDeviceRow,
  request: Request,
  endpoint: string,
  pushver: string | null,
) {
  const meta = requestMeta(request, endpoint, pushver);
  try {
    await touchHeartbeat(device.id, meta);
  } catch (e) {
    console.error("adms heartbeat touch failed:", e);
  }
  await noteAdmsDeviceRequest(supabaseAdmin, {
    deviceId: device.id,
    serialNumber: device.serial_number,
    locationId: device.location_id,
    endpoint,
    sourceIp: meta.sourceIp,
    pushver,
  });
}

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

export function handleAdmsHead() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      Pragma: "no-cache",
      "Cache-Control": "no-store",
    },
  });
}

export function handleAdmsOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, HEAD, OPTIONS",
    },
  });
}

async function readBodyText(request: Request): Promise<string> {
  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) return "";
  return decodeAttendanceText(buf);
}

async function authorize(request: Request, sn: string, queryKey: string | null, endpoint: string) {
  const ipErr = validateAdmsIp(request);
  if (ipErr) return { error: admsText(ipErr.body, ipErr.status), device: null };
  const keyErr = validateAdmsCommKey(request, queryKey);
  if (keyErr) return { error: admsText(keyErr.body, keyErr.status), device: null };
  if (!sn) return { error: admsText("AUTH_ERROR", 403), device: null };
  const cached = cachedDevice(sn);
  if (cached !== undefined) {
    if (!cached) return { error: admsText("AUTH_ERROR", 403), device: null };
    return { error: null, device: cached };
  }
  const device = await findAdmsDeviceBySerial(supabaseAdmin, sn);
  rememberDevice(sn, device);
  if (!device) {
    await recordUnknownAdmsSerial(supabaseAdmin, {
      serialNumber: sn,
      sourceIp: getRequestSourceIp(request),
      endpoint,
    });
    return { error: admsText("AUTH_ERROR", 403), device: null };
  }
  return { error: null, device };
}

async function handleGetRequest(request: Request, sn: string, queryKey: string | null, pushver: string | null) {
  const auth = await authorize(request, sn, queryKey, "getrequest");
  if (auth.error) return auth.error;
  await observeDevice(auth.device, request, "getrequest", pushver);
  const diagnostic = await claimAdmsDiagnosticDelivery(supabaseAdmin, auth.device.id);
  if (diagnostic) return admsText(`${diagnostic.line}\r\n`);
  const command = pendingAdmsCommandLine(auth.device);
  if (!command) return admsText("OK");
  try {
    await markAdmsCommandDelivered(supabaseAdmin, auth.device.id, auth.device.adms_cmd_id || 1);
    rememberDevice(sn, { ...auth.device, adms_pending_cmd: null });
  } catch (e) {
    console.error("adms getrequest consume failed:", e);
  }
  return admsText(`${command}\r\n`);
}

export async function handleAdmsGet(request: Request, slug?: string[]) {
  const url = new URL(request.url);
  const q = parseAdmsQuery(url);
  const endpoint = parseAdmsEndpoint(slug);

  if (endpoint === "getrequest") {
    return handleGetRequest(request, q.sn, q.pushcommkey, q.pushver);
  }

  if (endpoint === "cdata" || endpoint === "registry" || endpoint === "root") {
    const auth = await authorize(request, q.sn, q.pushcommkey, endpoint);
    if (auth.error) return auth.error;
    await observeDevice(auth.device, request, endpoint, q.pushver);
    return admsText(
      buildAdmsHandshake({
        sn: q.sn,
        attlogStamp: auth.device.adms_attlog_stamp,
        operlogStamp: auth.device.adms_operlog_stamp,
      }),
    );
  }

  const auth = await authorize(request, q.sn, q.pushcommkey, endpoint);
  if (auth.error) return auth.error;
  await observeDevice(auth.device, request, endpoint, q.pushver);
  return admsText("OK");
}

export async function handleAdmsPost(request: Request, slug?: string[]) {
  const url = new URL(request.url);
  const q = parseAdmsQuery(url);
  const endpoint = parseAdmsEndpoint(slug);

  if (endpoint === "getrequest") {
    return handleGetRequest(request, q.sn, q.pushcommkey, q.pushver);
  }

  const auth = await authorize(request, q.sn, q.pushcommkey, endpoint);
  if (auth.error) return auth.error;
  await observeDevice(auth.device, request, endpoint, q.pushver);

  if (endpoint === "devicecmd") {
    const body = await readBodyText(request);
    const ack = parseAdmsDeviceCmdAck(body);
    if (ack) {
      try {
        await ackAdmsCommand(supabaseAdmin, auth.device.id, ack.id);
        await acknowledgeAdmsDiagnosticCommand(supabaseAdmin, {
          deviceId: auth.device.id,
          serialNumber: auth.device.serial_number ?? q.sn,
          commandId: ack.id,
          returnCode: ack.returnCode,
        });
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
      endpoint,
      sourceIp: getRequestSourceIp(request),
      pushver: q.pushver,
    });
    if (q.stamp && table === "ATTLOG") {
      rememberDevice(q.sn, { ...auth.device, adms_attlog_stamp: q.stamp });
    } else if (q.stamp && (table === "OPERLOG" || table === "USERINFO" || table === "USER")) {
      rememberDevice(q.sn, { ...auth.device, adms_operlog_stamp: q.stamp });
    }
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
