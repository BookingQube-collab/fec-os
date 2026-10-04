import { ADMS_ONLINE_WINDOW_MS, isAdmsDeviceOnline } from "./constants";
import { formatAdmsGetRequestCommand } from "./parse-adms";

/** Browser poll budget. The status API finalizes the row; the request itself does not wait. */
export const ADMS_CONNECTION_TEST_TIMEOUT_MS = 30_000;
/** One finished test must settle before the next one is queued for the same device. */
export const ADMS_CONNECTION_TEST_COOLDOWN_MS = 15_000;
/**
 * Legacy probe command. The connection test no longer queues it.
 * Never reboot, clear, delete, shell, or rewrite users.
 */
export const ADMS_DIAGNOSTIC_COMMAND = "CHECK";
/** Kept far above operational adms_cmd_id values so an ACK cannot clear a punch fetch. */
export const ADMS_DIAGNOSTIC_CMD_ID_FLOOR = 1_000_000_000;
export const ADMS_DIAGNOSTIC_CMD_ID_CEILING = 2_000_000_000;
/** Unknown-serial hits older than this cannot prove a serial mismatch. */
export const ADMS_UNKNOWN_SERIAL_WINDOW_MS = 15 * 60_000;

export type AdmsContactClass = "online" | "stale" | "never_connected";

export type AdmsDiagnosisCode =
  | "CONNECTED"
  | "NO_RECENT_CONTACT"
  | "NEVER_CONNECTED"
  | "COMMAND_NOT_COLLECTED"
  | "COMMAND_NOT_ACKNOWLEDGED"
  | "SERIAL_MISMATCH"
  | "SERVER_ERROR"
  | "DEVICE_STALE"
  | "REGISTRATION_FAILED";

export const ADMS_DIAGNOSIS_MESSAGES: Record<AdmsDiagnosisCode, string> = {
  CONNECTED: "Device is online. The server heard from it within the last 5 minutes.",
  NO_RECENT_CONTACT: "Server has not received an ADMS request from this device recently.",
  NEVER_CONNECTED: "This serial number has never contacted FEC-OS.",
  COMMAND_NOT_COLLECTED:
    "Device previously contacted the server, but did not poll /iclock/getrequest during this test.",
  COMMAND_NOT_ACKNOWLEDGED: "Command was delivered to the terminal but no acknowledgement was received.",
  SERIAL_MISMATCH: "Requests are arriving from a serial number different from the serial configured for this device.",
  SERVER_ERROR: "FEC-OS ADMS endpoint returned an error.",
  DEVICE_STALE: "Device was previously online but communication has stopped.",
  REGISTRATION_FAILED: "Device registration is incomplete.",
};

export type RegistrationIssue = "missing_device" | "missing_serial" | "missing_site" | "disabled";

export const REGISTRATION_ISSUE_MESSAGES: Record<RegistrationIssue, string> = {
  missing_device: "Device was not found.",
  missing_serial: "Serial number is missing.",
  missing_site: "Device is not assigned to a site.",
  disabled: "Device is disabled.",
};

export type AdmsTestStageId =
  | "device_registered"
  | "adms_server_healthy"
  | "device_contacted_server"
  | "device_polled_getrequest"
  | "command_delivered"
  | "command_acknowledged";

export type AdmsTestStageState = "pass" | "fail" | "warn" | "pending";

export type AdmsTestStage = {
  id: AdmsTestStageId;
  state: AdmsTestStageState;
};

export type AdmsTestStatus = "queued" | "running" | "passed" | "failed" | "timed_out";

export type AdmsConnectionTestFacts = {
  now: number;
  timeoutMs: number;
  queuedAt: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  registrationOk: boolean;
  registrationIssues: RegistrationIssue[];
  serverHealthy: boolean;
  contactClass: AdmsContactClass;
  contactedDuringTest: boolean;
  polledGetRequestDuringTest: boolean;
  /** Last ADMS endpoint this serial hit, including a stale poll outside this test. */
  lastEndpoint: string | null;
  serialMismatch: boolean;
  /**
   * An earlier connection test for this device recorded delivered_at.
   * Operational fetches do not keep a delivery timestamp, so this stays false without that row.
   */
  priorCommandDelivered?: boolean;
  /** An earlier connection test for this device recorded acknowledged_at. */
  priorCommandAcknowledged?: boolean;
};

export type AdmsDiagnosis = {
  code: AdmsDiagnosisCode;
  message: string;
  provisional: boolean;
};

export type AdmsConnectionEvaluation = {
  status: AdmsTestStatus;
  diagnosis: AdmsDiagnosis | null;
  stages: AdmsTestStage[];
  timedOut: boolean;
  roundTripMs: number | null;
};

const DESTRUCTIVE_COMMAND =
  /\b(REBOOT|CLEAR\s+LOG|CLEAR\s+DATA|SHELL|DATA\s+DELETE|DATA\s+UPDATE|DATA\s+USER|AC_UNLOCK|UNINSTALL)\b/i;

export function classifyAdmsContact(
  lastAdmsAt: string | Date | null | undefined,
  now: Date | number = Date.now(),
): AdmsContactClass {
  if (lastAdmsAt == null || lastAdmsAt === "") return "never_connected";
  const t = lastAdmsAt instanceof Date ? lastAdmsAt.getTime() : new Date(lastAdmsAt).getTime();
  if (!Number.isFinite(t)) return "never_connected";
  if (isAdmsDeviceOnline(lastAdmsAt, now)) return "online";
  return "stale";
}

export function registrationIssues(input: {
  exists: boolean;
  serialNumber?: string | null;
  locationId?: string | null;
  active?: boolean | null;
}): RegistrationIssue[] {
  const issues: RegistrationIssue[] = [];
  if (!input.exists) issues.push("missing_device");
  if (!input.serialNumber?.trim()) issues.push("missing_serial");
  if (!input.locationId) issues.push("missing_site");
  if (input.active === false) issues.push("disabled");
  return issues;
}

export function registrationFailureMessage(issues: RegistrationIssue[]): string {
  if (!issues.length) return ADMS_DIAGNOSIS_MESSAGES.REGISTRATION_FAILED;
  return issues.map((issue) => REGISTRATION_ISSUE_MESSAGES[issue]).join(" ");
}

export function assessAdmsHandlerHealth(resolved: {
  cdata: string;
  getrequest: string;
  devicecmd: string;
  registry: string;
}): { ok: boolean; missing: string[] } {
  const expected: Array<[keyof typeof resolved, string]> = [
    ["cdata", "cdata"],
    ["getrequest", "getrequest"],
    ["devicecmd", "devicecmd"],
    ["registry", "registry"],
  ];
  const missing = expected.filter(([key, want]) => resolved[key] !== want).map(([key]) => `/iclock/${key}`);
  return { ok: missing.length === 0, missing };
}

export function isSafeDiagnosticCommand(command: string): boolean {
  return command === ADMS_DIAGNOSTIC_COMMAND && !DESTRUCTIVE_COMMAND.test(command);
}

export function nextDiagnosticCommandId(current: number | null | undefined): number {
  const n = Number(current);
  if (!Number.isFinite(n) || n < ADMS_DIAGNOSTIC_CMD_ID_FLOOR || n >= ADMS_DIAGNOSTIC_CMD_ID_CEILING) {
    return ADMS_DIAGNOSTIC_CMD_ID_FLOOR + 1;
  }
  return n + 1;
}

export function buildDiagnosticGetRequestLine(commandId: number): string {
  if (!Number.isInteger(commandId) || commandId <= ADMS_DIAGNOSTIC_CMD_ID_FLOOR || commandId >= ADMS_DIAGNOSTIC_CMD_ID_CEILING) {
    throw new Error("Invalid diagnostic command id.");
  }
  if (!isSafeDiagnosticCommand(ADMS_DIAGNOSTIC_COMMAND)) {
    throw new Error("Diagnostic command is not allowed.");
  }
  return formatAdmsGetRequestCommand(commandId, ADMS_DIAGNOSTIC_COMMAND);
}

export function correlateDiagnosticCommand(input: {
  expectedCommandId: number;
  expectedSerial: string;
  ackCommandId: number;
  ackSerial: string;
}): { matched: boolean } {
  const expectedSerial = input.expectedSerial.trim().toLowerCase();
  const ackSerial = input.ackSerial.trim().toLowerCase();
  if (!expectedSerial || !ackSerial || expectedSerial !== ackSerial) return { matched: false };
  if (!Number.isInteger(input.expectedCommandId) || !Number.isInteger(input.ackCommandId)) return { matched: false };
  if (input.expectedCommandId <= 0 || input.ackCommandId <= 0) return { matched: false };
  return { matched: input.expectedCommandId === input.ackCommandId };
}

export function roundTripMs(queuedAt: string | null | undefined, acknowledgedAt: string | null | undefined): number | null {
  if (!queuedAt || !acknowledgedAt) return null;
  const queued = new Date(queuedAt).getTime();
  const acked = new Date(acknowledgedAt).getTime();
  if (!Number.isFinite(queued) || !Number.isFinite(acked) || acked < queued) return null;
  return acked - queued;
}

export function serialMismatchEvidence(input: {
  configuredSerial: string;
  deviceSourceIp: string | null | undefined;
  unknownHits: Array<{ serial: string; sourceIp: string | null; seenAt: string }>;
  now?: number;
  windowMs?: number;
}): { mismatch: boolean; serial: string | null } {
  const configured = input.configuredSerial.trim().toLowerCase();
  const ip = input.deviceSourceIp?.trim() || "";
  if (!configured || !ip) return { mismatch: false, serial: null };
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? ADMS_UNKNOWN_SERIAL_WINDOW_MS;
  for (const hit of input.unknownHits) {
    const serial = hit.serial.trim().toLowerCase();
    const hitIp = hit.sourceIp?.trim() || "";
    if (!serial || serial === configured || hitIp !== ip) continue;
    const seen = new Date(hit.seenAt).getTime();
    if (!Number.isFinite(seen) || now - seen > windowMs || seen > now + 5_000) continue;
    return { mismatch: true, serial: hit.serial.trim() };
  }
  return { mismatch: false, serial: null };
}

const SENSITIVE_METADATA_KEY = /comm.?key|password|secret|authorization|token|credential|cookie/i;

export function sanitizeDiagnosticMetadata(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_METADATA_KEY.test(key)) continue;
    if (typeof value === "string" && SENSITIVE_METADATA_KEY.test(value)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeDiagnosticMetadata(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function connectionTestStartBlock(input: {
  now: number;
  active: { queuedAt: string; timeoutMs: number } | null;
  lastCompletedAt?: string | null;
  cooldownMs?: number;
}): { allowed: true } | { allowed: false; reason: "active" | "cooldown" } {
  if (input.active) {
    const queued = new Date(input.active.queuedAt).getTime();
    const timeoutMs = input.active.timeoutMs > 0 ? input.active.timeoutMs : ADMS_CONNECTION_TEST_TIMEOUT_MS;
    if (Number.isFinite(queued) && input.now - queued < timeoutMs) return { allowed: false, reason: "active" };
  }
  if (input.lastCompletedAt) {
    const completed = new Date(input.lastCompletedAt).getTime();
    const cooldown = input.cooldownMs ?? ADMS_CONNECTION_TEST_COOLDOWN_MS;
    if (Number.isFinite(completed) && input.now - completed < cooldown) return { allowed: false, reason: "cooldown" };
  }
  return { allowed: true };
}

function diagnosisMessage(code: AdmsDiagnosisCode, issues: RegistrationIssue[]): string {
  if (code === "REGISTRATION_FAILED") return registrationFailureMessage(issues);
  return ADMS_DIAGNOSIS_MESSAGES[code];
}

/**
 * Open connection-test rows are the stuck CHECK waiter.
 * Punch fetches live on attendance_devices.adms_pending_cmd and are not these rows.
 */
export function isStuckAdmsConnectionTest(row: {
  status: string;
  acknowledgedAt?: string | null;
}): boolean {
  if (row.acknowledgedAt) return false;
  return row.status === "queued" || row.status === "running";
}

function resolveDiagnosis(facts: AdmsConnectionTestFacts): {
  status: AdmsTestStatus;
  diagnosis: AdmsDiagnosis | null;
} {
  const messageFor = (code: AdmsDiagnosisCode): AdmsDiagnosis => ({
    code,
    message: diagnosisMessage(code, facts.registrationIssues),
    provisional: false,
  });

  if (!facts.registrationOk) {
    return { status: "failed", diagnosis: messageFor("REGISTRATION_FAILED") };
  }
  if (!facts.serverHealthy) {
    return { status: "failed", diagnosis: messageFor("SERVER_ERROR") };
  }
  if (facts.serialMismatch && facts.contactClass !== "online") {
    return { status: "failed", diagnosis: messageFor("SERIAL_MISMATCH") };
  }
  if (facts.contactClass === "online") {
    return { status: "passed", diagnosis: messageFor("CONNECTED") };
  }
  if (facts.contactClass === "stale") {
    return { status: "failed", diagnosis: messageFor("DEVICE_STALE") };
  }
  return { status: "failed", diagnosis: messageFor("NEVER_CONNECTED") };
}

function stage(
  id: AdmsTestStageId,
  state: AdmsTestStageState,
): AdmsTestStage {
  return { id, state };
}

const COMMAND_POLL_ENDPOINTS = new Set(["getrequest", "devicecmd"]);

/** True when this endpoint is the ADMS command poll, not a handshake or punch upload. */
export function isAdmsCommandPollEndpoint(endpoint: string | null | undefined): boolean {
  const value = endpoint?.trim().toLowerCase() ?? "";
  return COMMAND_POLL_ENDPOINTS.has(value);
}

export function buildAdmsTestStages(facts: AdmsConnectionTestFacts): AdmsTestStage[] {
  const contacted =
    facts.contactClass === "online" || facts.contactClass === "stale" || facts.contactedDuringTest;
  // A prior getrequest/devicecmd poll of any age counts. This does not queue a new command.
  const polled =
    facts.polledGetRequestDuringTest ||
    (facts.contactClass !== "never_connected" && isAdmsCommandPollEndpoint(facts.lastEndpoint));
  const contactState: AdmsTestStageState = !facts.registrationOk || !facts.serverHealthy ? "fail" : contacted ? "pass" : "fail";
  const pollState: AdmsTestStageState =
    !facts.registrationOk || !facts.serverHealthy || !contacted ? "fail" : polled ? "pass" : "fail";
  return [
    stage("device_registered", facts.registrationOk ? "pass" : "fail"),
    stage("adms_server_healthy", facts.serverHealthy ? "pass" : "fail"),
    stage("device_contacted_server", contactState),
    stage("device_polled_getrequest", pollState),
  ];
}

export function evaluateAdmsConnectionTest(facts: AdmsConnectionTestFacts): AdmsConnectionEvaluation {
  const resolved = resolveDiagnosis(facts);
  return {
    status: resolved.status,
    diagnosis: resolved.diagnosis,
    stages: buildAdmsTestStages(facts),
    timedOut: false,
    roundTripMs: null,
  };
}

export function ageMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return now - t;
}

export { ADMS_ONLINE_WINDOW_MS };
