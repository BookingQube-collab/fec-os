import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  ADMS_CONNECTION_TEST_COOLDOWN_MS,
  ADMS_CONNECTION_TEST_TIMEOUT_MS,
  ADMS_DIAGNOSTIC_COMMAND,
  ADMS_UNKNOWN_SERIAL_WINDOW_MS,
  buildDiagnosticGetRequestLine,
  classifyAdmsContact,
  correlateDiagnosticCommand,
  evaluateAdmsConnectionTest,
  nextDiagnosticCommandId,
  registrationIssues,
  roundTripMs,
  sanitizeDiagnosticMetadata,
  serialMismatchEvidence,
  type AdmsConnectionEvaluation,
  type AdmsConnectionTestFacts,
  type AdmsContactClass,
  type AdmsDiagnosis,
  type AdmsTestStage,
  type AdmsTestStatus,
  type RegistrationIssue,
} from "@/lib/attendance-hr/adms-connection-test";

type AdminClient = SupabaseClient<Database>;

/** Warm instances skip diagnostic queries after the migration is confirmed missing. */
let diagnosticTablesReady: boolean | null = null;

function rememberSchema(error?: { message?: string; code?: string } | null): void {
  if (error && schemaNotReady(error)) diagnosticTablesReady = false;
  else if (!error) diagnosticTablesReady = true;
}

export type AdmsConnectionTestEvent = {
  id: string;
  eventType: string;
  endpoint: string | null;
  commandId: number | null;
  result: string | null;
  error: string | null;
  createdAt: string;
};

export type AdmsConnectionTestView = {
  testId: string;
  deviceId: string;
  locationId: string;
  status: AdmsTestStatus;
  diagnosis: AdmsDiagnosis | null;
  stages: AdmsTestStage[];
  serialNumber: string | null;
  contactClass: AdmsContactClass;
  lastContactAt: string | null;
  lastEndpoint: string | null;
  lastSourceIp: string | null;
  pushver: string | null;
  queuedAt: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  roundTripMs: number | null;
  resultCode: number | null;
  command: string | null;
  timeoutMs: number;
  registrationIssues: RegistrationIssue[];
  events: AdmsConnectionTestEvent[];
  reused: boolean;
};

type TestRow = {
  id: string;
  device_id: string;
  location_id: string;
  serial_number: string | null;
  status: string;
  diagnosis: string | null;
  contact_class: string | null;
  command_id: number | null;
  command_body: string | null;
  queued_at: string | null;
  delivered_at: string | null;
  acknowledged_at: string | null;
  result_code: number | null;
  timeout_ms: number | null;
  last_contact_at: string | null;
  last_endpoint: string | null;
  last_source_ip: string | null;
  pushver: string | null;
  created_at: string;
  completed_at: string | null;
};

type DeviceRow = {
  id: string;
  location_id: string | null;
  serial_number: string | null;
  active: boolean | null;
  last_adms_at: string | null;
  last_adms_endpoint: string | null;
  last_adms_source_ip: string | null;
  last_adms_pushver: string | null;
  adms_diag_cmd_id: number | null;
};

type EventRow = {
  id: string;
  event_type: string;
  endpoint: string | null;
  command_id: number | null;
  result: string | null;
  error: string | null;
  created_at: string;
};

function migrationError(): Error {
  return new Error(
    "Connection test is not ready on the database yet. Apply the ADMS connection test migration, then try again.",
  );
}

function schemaNotReady(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /attendance_adms_connection_tests|attendance_adms_diagnostic_events|attendance_adms_unknown_serials|adms_diag_cmd_id|last_adms_endpoint|schema cache/i.test(
      msg,
    )
  );
}

function asTest(row: unknown): TestRow | null {
  if (!row || typeof row !== "object") return null;
  const src = row as Record<string, unknown>;
  if (!src.id || !src.device_id) return null;
  return {
    id: String(src.id),
    device_id: String(src.device_id),
    location_id: String(src.location_id ?? ""),
    serial_number: src.serial_number == null ? null : String(src.serial_number),
    status: String(src.status ?? "queued"),
    diagnosis: src.diagnosis == null ? null : String(src.diagnosis),
    contact_class: src.contact_class == null ? null : String(src.contact_class),
    command_id: src.command_id == null ? null : Number(src.command_id),
    command_body: src.command_body == null ? null : String(src.command_body),
    queued_at: src.queued_at == null ? null : String(src.queued_at),
    delivered_at: src.delivered_at == null ? null : String(src.delivered_at),
    acknowledged_at: src.acknowledged_at == null ? null : String(src.acknowledged_at),
    result_code: src.result_code == null ? null : Number(src.result_code),
    timeout_ms: src.timeout_ms == null ? ADMS_CONNECTION_TEST_TIMEOUT_MS : Number(src.timeout_ms),
    last_contact_at: src.last_contact_at == null ? null : String(src.last_contact_at),
    last_endpoint: src.last_endpoint == null ? null : String(src.last_endpoint),
    last_source_ip: src.last_source_ip == null ? null : String(src.last_source_ip),
    pushver: src.pushver == null ? null : String(src.pushver),
    created_at: String(src.created_at ?? src.queued_at ?? new Date().toISOString()),
    completed_at: src.completed_at == null ? null : String(src.completed_at),
  };
}

function asDevice(row: unknown): DeviceRow | null {
  if (!row || typeof row !== "object") return null;
  const src = row as Record<string, unknown>;
  if (!src.id) return null;
  return {
    id: String(src.id),
    location_id: src.location_id == null ? null : String(src.location_id),
    serial_number: src.serial_number == null ? null : String(src.serial_number),
    active: src.active == null ? null : Boolean(src.active),
    last_adms_at: src.last_adms_at == null ? null : String(src.last_adms_at),
    last_adms_endpoint: src.last_adms_endpoint == null ? null : String(src.last_adms_endpoint),
    last_adms_source_ip: src.last_adms_source_ip == null ? null : String(src.last_adms_source_ip),
    last_adms_pushver: src.last_adms_pushver == null ? null : String(src.last_adms_pushver),
    adms_diag_cmd_id: src.adms_diag_cmd_id == null ? null : Number(src.adms_diag_cmd_id),
  };
}

const DEVICE_COLUMNS =
  "id, location_id, serial_number, active, last_adms_at, last_adms_endpoint, last_adms_source_ip, last_adms_pushver, adms_diag_cmd_id";
const DEVICE_COLUMNS_BASE = "id, location_id, serial_number, active, last_adms_at";

async function loadDevice(sb: AdminClient, deviceId: string): Promise<DeviceRow | null> {
  const first = await sb.from("attendance_devices").select(DEVICE_COLUMNS).eq("id", deviceId).maybeSingle();
  if (first.error && schemaNotReady(first.error)) {
    const retry = await sb.from("attendance_devices").select(DEVICE_COLUMNS_BASE).eq("id", deviceId).maybeSingle();
    if (retry.error) throw retry.error;
    return asDevice(retry.data);
  }
  if (first.error) throw first.error;
  return asDevice(first.data);
}

async function logEvent(
  sb: AdminClient,
  input: {
    deviceId: string | null;
    locationId: string | null;
    serialNumber: string | null;
    testId: string | null;
    eventType: string;
    endpoint?: string | null;
    commandId?: number | null;
    result?: string | null;
    error?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await sb.from("attendance_adms_diagnostic_events").insert({
    device_id: input.deviceId,
    location_id: input.locationId,
    serial_number: input.serialNumber,
    test_id: input.testId,
    event_type: input.eventType,
    endpoint: input.endpoint ?? null,
    command_id: input.commandId ?? null,
    result: input.result ?? null,
    error: input.error ?? null,
    metadata: sanitizeDiagnosticMetadata(input.metadata),
  });
  if (error && !schemaNotReady(error)) console.error("adms diagnostic event failed:", error.message);
}

async function loadEvents(sb: AdminClient, testId: string): Promise<EventRow[]> {
  const { data, error } = await sb
    .from("attendance_adms_diagnostic_events")
    .select("id, event_type, endpoint, command_id, result, error, created_at")
    .eq("test_id", testId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    if (schemaNotReady(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => {
    const src = row as Record<string, unknown>;
    return {
      id: String(src.id),
      event_type: String(src.event_type ?? ""),
      endpoint: src.endpoint == null ? null : String(src.endpoint),
      command_id: src.command_id == null ? null : Number(src.command_id),
      result: src.result == null ? null : String(src.result),
      error: src.error == null ? null : String(src.error),
      created_at: String(src.created_at),
    };
  });
}

/** Earlier CHECK rows are the only stored proof that a command was delivered or acknowledged. */
async function loadPriorCommandEvidence(
  sb: AdminClient,
  deviceId: string,
  excludeTestId: string,
): Promise<{ delivered: boolean; acknowledged: boolean }> {
  const { data, error } = await sb
    .from("attendance_adms_connection_tests")
    .select("delivered_at, acknowledged_at")
    .eq("device_id", deviceId)
    .neq("id", excludeTestId)
    .or("delivered_at.not.is.null,acknowledged_at.not.is.null")
    .limit(20);
  if (error) {
    if (schemaNotReady(error)) return { delivered: false, acknowledged: false };
    throw error;
  }
  let delivered = false;
  let acknowledged = false;
  for (const row of data ?? []) {
    const src = row as { delivered_at?: string | null; acknowledged_at?: string | null };
    if (src.delivered_at) delivered = true;
    if (src.acknowledged_at) acknowledged = true;
    if (delivered && acknowledged) break;
  }
  return { delivered, acknowledged };
}

async function loadUnknownHits(sb: AdminClient, sourceIp: string): Promise<Array<{ serial: string; sourceIp: string | null; seenAt: string }>> {
  const since = new Date(Date.now() - ADMS_UNKNOWN_SERIAL_WINDOW_MS).toISOString();
  const { data, error } = await sb
    .from("attendance_adms_unknown_serials")
    .select("serial_number, source_ip, seen_at")
    .eq("source_ip", sourceIp)
    .gte("seen_at", since)
    .order("seen_at", { ascending: false })
    .limit(20);
  if (error) {
    if (schemaNotReady(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => {
    const src = row as Record<string, unknown>;
    return {
      serial: String(src.serial_number ?? ""),
      sourceIp: src.source_ip == null ? null : String(src.source_ip),
      seenAt: String(src.seen_at ?? ""),
    };
  });
}

function toView(input: {
  test: TestRow;
  device: DeviceRow | null;
  events: EventRow[];
  evaluation: AdmsConnectionEvaluation;
  registration: RegistrationIssue[];
  contactClass: AdmsContactClass;
  lastContactAt: string | null;
  lastEndpoint: string | null;
  lastSourceIp: string | null;
  pushver: string | null;
  reused?: boolean;
}): AdmsConnectionTestView {
  return {
    testId: input.test.id,
    deviceId: input.test.device_id,
    locationId: input.test.location_id,
    status: input.evaluation.status,
    diagnosis: input.evaluation.diagnosis,
    stages: input.evaluation.stages,
    serialNumber: input.test.serial_number,
    contactClass: input.contactClass,
    lastContactAt: input.lastContactAt,
    lastEndpoint: input.lastEndpoint,
    lastSourceIp: input.lastSourceIp,
    pushver: input.pushver,
    queuedAt: input.test.queued_at,
    deliveredAt: input.test.delivered_at,
    acknowledgedAt: input.test.acknowledged_at,
    roundTripMs: input.evaluation.roundTripMs,
    resultCode: input.test.result_code,
    command: input.test.command_body,
    timeoutMs: input.test.timeout_ms ?? ADMS_CONNECTION_TEST_TIMEOUT_MS,
    registrationIssues: input.registration,
    events: [...input.events].reverse().map((event) => ({
      id: event.id,
      eventType: event.event_type,
      endpoint: event.endpoint,
      commandId: event.command_id,
      result: event.result,
      error: event.error,
      createdAt: event.created_at,
    })),
    reused: Boolean(input.reused),
  };
}

async function evaluateStoredTest(
  sb: AdminClient,
  test: TestRow,
  serverHealthy: boolean,
): Promise<AdmsConnectionTestView> {
  const device = await loadDevice(sb, test.device_id);
  const events = await loadEvents(sb, test.id);
  const now = Date.now();
  const serial = device?.serial_number ?? test.serial_number;
  const issues = registrationIssues({
    exists: Boolean(device),
    serialNumber: serial,
    locationId: device?.location_id ?? test.location_id,
    active: device?.active,
  });
  const lastContactAt = device?.last_adms_at ?? test.last_contact_at;
  const contactClass = classifyAdmsContact(lastContactAt, now);
  const queuedMs = test.queued_at ? new Date(test.queued_at).getTime() : Number.NaN;
  const contactStamp = lastContactAt ? new Date(lastContactAt).getTime() : Number.NaN;
  const sawRequest = events.some((event) =>
    event.event_type === "adms_request" || event.event_type === "command_delivered" || event.event_type === "command_acknowledged",
  );
  const contactedDuringTest =
    sawRequest || (Number.isFinite(queuedMs) && Number.isFinite(contactStamp) && contactStamp >= queuedMs - 1_000);
  const polledGetRequestDuringTest =
    Boolean(test.delivered_at) ||
    events.some((event) => event.endpoint === "getrequest" && (event.event_type === "adms_request" || event.event_type === "command_delivered"));
  const lastRequest = events.find((event) => event.event_type === "adms_request" && event.endpoint);
  const lastEndpoint = lastRequest?.endpoint ?? device?.last_adms_endpoint ?? test.last_endpoint;
  const lastSourceIp = device?.last_adms_source_ip ?? test.last_source_ip;
  const pushver = device?.last_adms_pushver ?? test.pushver;
  let mismatch = false;
  if (!test.acknowledged_at && lastSourceIp && serial) {
    const hits = await loadUnknownHits(sb, lastSourceIp);
    mismatch = serialMismatchEvidence({
      configuredSerial: serial,
      deviceSourceIp: lastSourceIp,
      unknownHits: hits,
      now,
    }).mismatch;
  }
  const terminal = test.status === "passed" || test.status === "failed" || test.status === "timed_out";
  const pinnedContact =
    terminal && (test.contact_class === "online" || test.contact_class === "stale" || test.contact_class === "never_connected")
      ? test.contact_class
      : contactClass;
  const registrationList =
    terminal && test.diagnosis === "REGISTRATION_FAILED" && issues.length === 0
      ? (["missing_device"] as RegistrationIssue[])
      : issues;
  const priorCommand = await loadPriorCommandEvidence(sb, test.device_id, test.id);
  const facts: AdmsConnectionTestFacts = {
    now: terminal && test.completed_at ? new Date(test.completed_at).getTime() : now,
    timeoutMs: test.timeout_ms ?? ADMS_CONNECTION_TEST_TIMEOUT_MS,
    queuedAt: test.queued_at,
    deliveredAt: test.delivered_at,
    acknowledgedAt: test.acknowledged_at,
    registrationOk: terminal && test.diagnosis === "REGISTRATION_FAILED" ? false : registrationList.length === 0,
    registrationIssues: registrationList,
    serverHealthy: terminal && test.diagnosis === "SERVER_ERROR" ? false : serverHealthy,
    contactClass: pinnedContact,
    contactedDuringTest,
    polledGetRequestDuringTest,
    lastEndpoint,
    serialMismatch: terminal ? test.diagnosis === "SERIAL_MISMATCH" : mismatch,
    priorCommandDelivered: priorCommand.delivered,
    priorCommandAcknowledged: priorCommand.acknowledged,
  };
  const evaluation = evaluateAdmsConnectionTest(facts);
  const open = test.status === "queued" || test.status === "running";
  const becameTerminal =
    open && (evaluation.status === "passed" || evaluation.status === "failed" || evaluation.status === "timed_out");
  if (becameTerminal) {
    const completedAt = new Date(now).toISOString();
    const { data: updated, error } = await sb
      .from("attendance_adms_connection_tests")
      .update({
        status: evaluation.status,
        diagnosis: evaluation.diagnosis?.code ?? null,
        error: evaluation.diagnosis?.provisional ? null : evaluation.diagnosis?.message ?? null,
        stages: evaluation.stages,
        completed_at: completedAt,
        round_trip_ms: evaluation.roundTripMs,
        contact_class: contactClass,
        last_contact_at: lastContactAt,
        last_endpoint: lastEndpoint,
        last_source_ip: lastSourceIp,
        pushver,
      })
      .eq("id", test.id)
      .in("status", ["queued", "running"])
      .select("id")
      .maybeSingle();
    if (error && !schemaNotReady(error)) console.error("adms connection test finalize failed:", error.message);
    if (updated) {
      await logEvent(sb, {
        deviceId: test.device_id,
        locationId: test.location_id,
        serialNumber: serial,
        testId: test.id,
        eventType: evaluation.status === "passed" ? "test_completed" : "test_timed_out",
        endpoint: lastEndpoint,
        commandId: test.command_id,
        result: evaluation.diagnosis?.code ?? evaluation.status,
        error: evaluation.status === "passed" ? null : evaluation.diagnosis?.message ?? null,
        metadata: { roundTripMs: evaluation.roundTripMs, contactClass },
      });
    }
  }
  return toView({
    test,
    device,
    events,
    evaluation,
    registration: issues,
    contactClass,
    lastContactAt,
    lastEndpoint,
    lastSourceIp,
    pushver,
  });
}

async function loadTest(sb: AdminClient, testId: string): Promise<TestRow | null> {
  const { data, error } = await sb.from("attendance_adms_connection_tests").select("*").eq("id", testId).maybeSingle();
  if (error) {
    if (schemaNotReady(error)) throw migrationError();
    throw error;
  }
  return asTest(data);
}

export async function readAdmsConnectionTest(
  sb: AdminClient,
  testId: string,
  serverHealthy = true,
): Promise<AdmsConnectionTestView | null> {
  const test = await loadTest(sb, testId);
  if (!test) return null;
  return evaluateStoredTest(sb, test, serverHealthy);
}

async function findActiveTest(sb: AdminClient, deviceId: string): Promise<TestRow | null> {
  const { data, error } = await sb
    .from("attendance_adms_connection_tests")
    .select("*")
    .eq("device_id", deviceId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (schemaNotReady(error)) throw migrationError();
    throw error;
  }
  return asTest(data);
}

async function latestCompletedAt(sb: AdminClient, deviceId: string): Promise<string | null> {
  const { data, error } = await sb
    .from("attendance_adms_connection_tests")
    .select("completed_at")
    .eq("device_id", deviceId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (schemaNotReady(error)) throw migrationError();
    throw error;
  }
  const completed = (data as { completed_at?: string | null } | null)?.completed_at;
  return completed ? String(completed) : null;
}

async function allocateDiagnosticCommandId(sb: AdminClient, deviceId: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await sb.from("attendance_devices").select("adms_diag_cmd_id").eq("id", deviceId).maybeSingle();
    if (error) {
      if (schemaNotReady(error)) throw migrationError();
      throw error;
    }
    const current = Number((data as { adms_diag_cmd_id?: number | null } | null)?.adms_diag_cmd_id ?? 0);
    const next = nextDiagnosticCommandId(current);
    let update = sb.from("attendance_devices").update({ adms_diag_cmd_id: next }).eq("id", deviceId);
    if (Number.isFinite(current) && current > 0) update = update.eq("adms_diag_cmd_id", current);
    const { data: updated, error: upErr } = await update.select("adms_diag_cmd_id").maybeSingle();
    if (upErr) {
      if (schemaNotReady(upErr)) throw migrationError();
      throw upErr;
    }
    if (Number((updated as { adms_diag_cmd_id?: number } | null)?.adms_diag_cmd_id) === next) return next;
  }
  throw new Error("Could not allocate a diagnostic command id.");
}

export async function startAdmsConnectionTest(
  sb: AdminClient,
  input: {
    deviceId: string;
    actorId: string;
    serverHealthy: boolean;
    serverDetail: string | null;
  },
): Promise<AdmsConnectionTestView> {
  const device = await loadDevice(sb, input.deviceId);
  if (!device) throw new Error("Device not found");
  if (!device.location_id) throw new Error("Device is not assigned to a site.");
  const active = await findActiveTest(sb, input.deviceId);
  if (active) {
    const current = await evaluateStoredTest(sb, active, input.serverHealthy);
    if (current.status === "queued" || current.status === "running") {
      return { ...current, reused: true };
    }
  } else {
    const completedAt = await latestCompletedAt(sb, input.deviceId);
    if (completedAt && Date.now() - new Date(completedAt).getTime() < ADMS_CONNECTION_TEST_COOLDOWN_MS) {
      throw new Error("Wait a few seconds before testing this device again.");
    }
  }

  const issues = registrationIssues({
    exists: true,
    serialNumber: device.serial_number,
    locationId: device.location_id,
    active: device.active,
  });
  const nowIso = new Date().toISOString();
  const contactClass = classifyAdmsContact(device.last_adms_at);
  const failedEarly = issues.length > 0 || !input.serverHealthy;
  const commandId = failedEarly ? null : await allocateDiagnosticCommandId(sb, device.id);
  const inserted = await sb
    .from("attendance_adms_connection_tests")
    .insert({
      device_id: device.id,
      location_id: device.location_id,
      serial_number: device.serial_number?.trim() || null,
      status: failedEarly ? "failed" : "queued",
      diagnosis: !input.serverHealthy && issues.length === 0 ? "SERVER_ERROR" : issues.length ? "REGISTRATION_FAILED" : null,
      command_id: commandId,
      command_body: commandId ? ADMS_DIAGNOSTIC_COMMAND : null,
      queued_at: failedEarly ? null : nowIso,
      timeout_ms: ADMS_CONNECTION_TEST_TIMEOUT_MS,
      last_contact_at: device.last_adms_at,
      last_endpoint: device.last_adms_endpoint,
      last_source_ip: device.last_adms_source_ip,
      pushver: device.last_adms_pushver,
      contact_class: contactClass,
      error: !input.serverHealthy ? input.serverDetail : null,
      created_by: input.actorId,
      completed_at: failedEarly ? nowIso : null,
    })
    .select("*")
    .single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await findActiveTest(sb, input.deviceId);
      if (raced) {
        const current = await evaluateStoredTest(sb, raced, input.serverHealthy);
        return { ...current, reused: true };
      }
    }
    if (schemaNotReady(inserted.error)) throw migrationError();
    throw inserted.error;
  }
  const test = asTest(inserted.data);
  if (!test) throw new Error("Connection test was not saved.");
  await logEvent(sb, {
    deviceId: device.id,
    locationId: device.location_id,
    serialNumber: device.serial_number,
    testId: test.id,
    eventType: "test_started",
    endpoint: device.last_adms_endpoint,
    commandId,
    result: failedEarly ? "failed" : "queued",
    error: input.serverDetail,
    metadata: { contactClass, registrationIssues: issues },
  });
  if (commandId) {
    await logEvent(sb, {
      deviceId: device.id,
      locationId: device.location_id,
      serialNumber: device.serial_number,
      testId: test.id,
      eventType: "command_queued",
      endpoint: "getrequest",
      commandId,
      result: "queued",
      metadata: { command: ADMS_DIAGNOSTIC_COMMAND },
    });
  }
  const view = await evaluateStoredTest(sb, test, input.serverHealthy);
  return view;
}

export async function noteAdmsDeviceRequest(
  sb: AdminClient,
  input: {
    deviceId: string;
    serialNumber: string | null;
    locationId: string | null;
    endpoint: string;
    sourceIp: string | null;
    pushver: string | null;
  },
): Promise<void> {
  if (diagnosticTablesReady === false) return;
  try {
    const { data, error } = await sb
      .from("attendance_adms_connection_tests")
      .select("id, location_id, serial_number")
      .eq("device_id", input.deviceId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      rememberSchema(error);
      return;
    }
    rememberSchema(null);
    if (!data) return;
    const row = data as Record<string, unknown>;
    await logEvent(sb, {
      deviceId: input.deviceId,
      locationId: input.locationId ?? (row.location_id == null ? null : String(row.location_id)),
      serialNumber: input.serialNumber,
      testId: String(row.id),
      eventType: "adms_request",
      endpoint: input.endpoint,
      result: "seen",
      metadata: sanitizeDiagnosticMetadata({
        sourceIp: input.sourceIp,
        pushver: input.pushver,
      }),
    });
  } catch (e) {
    console.error("adms diagnostic request note failed:", e instanceof Error ? e.message : e);
  }
}

/** Hand the queued CHECK to this serial on /iclock/getrequest without clearing a punch fetch. */
export async function claimAdmsDiagnosticDelivery(
  sb: AdminClient,
  deviceId: string,
): Promise<{ commandId: number; line: string } | null> {
  if (diagnosticTablesReady === false) return null;
  try {
    const { data, error } = await sb
      .from("attendance_adms_connection_tests")
      .select("id, command_id, serial_number, location_id")
      .eq("device_id", deviceId)
      .in("status", ["queued", "running"])
      .is("delivered_at", null)
      .not("command_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      rememberSchema(error);
      return null;
    }
    rememberSchema(null);
    if (!data) return null;
    const src = data as Record<string, unknown>;
    const commandId = Number(src.command_id);
    if (!Number.isInteger(commandId)) return null;
    const line = buildDiagnosticGetRequestLine(commandId);
    const { data: updated, error: upErr } = await sb
      .from("attendance_adms_connection_tests")
      .update({ delivered_at: new Date().toISOString(), status: "running" })
      .eq("id", String(src.id))
      .is("delivered_at", null)
      .select("id")
      .maybeSingle();
    if (upErr || !updated) return null;
    await logEvent(sb, {
      deviceId,
      locationId: src.location_id == null ? null : String(src.location_id),
      serialNumber: src.serial_number == null ? null : String(src.serial_number),
      testId: String(src.id),
      eventType: "command_delivered",
      endpoint: "getrequest",
      commandId,
      result: "delivered",
      metadata: { command: ADMS_DIAGNOSTIC_COMMAND },
    });
    return { commandId, line };
  } catch (e) {
    console.error("adms diagnostic delivery failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function acknowledgeAdmsDiagnosticCommand(
  sb: AdminClient,
  input: { deviceId: string; serialNumber: string; commandId: number; returnCode: number },
): Promise<boolean> {
  if (diagnosticTablesReady === false) return false;
  try {
    const { data, error } = await sb
      .from("attendance_adms_connection_tests")
      .select("id, command_id, serial_number, location_id, queued_at")
      .eq("device_id", input.deviceId)
      .eq("command_id", input.commandId)
      .is("acknowledged_at", null)
      .in("status", ["queued", "running"])
      .maybeSingle();
    if (error) {
      rememberSchema(error);
      return false;
    }
    rememberSchema(null);
    if (!data) return false;
    const src = data as Record<string, unknown>;
    const expectedSerial = src.serial_number == null ? "" : String(src.serial_number);
    const correlation = correlateDiagnosticCommand({
      expectedCommandId: Number(src.command_id),
      expectedSerial,
      ackCommandId: input.commandId,
      ackSerial: input.serialNumber,
    });
    if (!correlation.matched) return false;
    const acknowledgedAt = new Date().toISOString();
    const queuedAt = src.queued_at == null ? null : String(src.queued_at);
    const { data: updated, error: upErr } = await sb
      .from("attendance_adms_connection_tests")
      .update({
        acknowledged_at: acknowledgedAt,
        round_trip_ms: roundTripMs(queuedAt, acknowledgedAt),
        result_code: input.returnCode,
      })
      .eq("id", String(src.id))
      .is("acknowledged_at", null)
      .select("id")
      .maybeSingle();
    if (upErr || !updated) return false;
    await logEvent(sb, {
      deviceId: input.deviceId,
      locationId: src.location_id == null ? null : String(src.location_id),
      serialNumber: expectedSerial,
      testId: String(src.id),
      eventType: "command_acknowledged",
      endpoint: "devicecmd",
      commandId: input.commandId,
      result: `Return=${input.returnCode}`,
      metadata: { returnCode: input.returnCode },
    });
    return true;
  } catch (e) {
    console.error("adms diagnostic ack failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function recordUnknownAdmsSerial(
  sb: AdminClient,
  input: { serialNumber: string; sourceIp: string | null; endpoint: string },
): Promise<void> {
  const serial = input.serialNumber.trim();
  if (!serial || diagnosticTablesReady === false) return;
  try {
    const since = new Date(Date.now() - 60_000).toISOString();
    const recent = await sb
      .from("attendance_adms_unknown_serials")
      .select("id")
      .eq("serial_number", serial)
      .gte("seen_at", since)
      .limit(1);
    if (recent.error) {
      rememberSchema(recent.error);
      return;
    }
    rememberSchema(null);
    if ((recent.data ?? []).length > 0) return;
    await sb.from("attendance_adms_unknown_serials").insert({
      serial_number: serial,
      source_ip: input.sourceIp,
      endpoint: input.endpoint,
    });
    await sb
      .from("attendance_adms_unknown_serials")
      .delete()
      .lt("seen_at", new Date(Date.now() - 2 * 24 * 3600_000).toISOString());
  } catch (e) {
    console.error("adms unknown serial log failed:", e instanceof Error ? e.message : e);
  }
}
