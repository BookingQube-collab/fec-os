import { describe, expect, it } from "vitest";

import { ADMS_ONLINE_WINDOW_MS } from "./constants";
import {
  ADMS_CONNECTION_TEST_TIMEOUT_MS,
  ADMS_DIAGNOSIS_MESSAGES,
  ADMS_DIAGNOSTIC_CMD_ID_FLOOR,
  ADMS_DIAGNOSTIC_COMMAND,
  ADMS_UNKNOWN_SERIAL_WINDOW_MS,
  assessAdmsHandlerHealth,
  buildDiagnosticGetRequestLine,
  classifyAdmsContact,
  connectionTestStartBlock,
  correlateDiagnosticCommand,
  evaluateAdmsConnectionTest,
  isSafeDiagnosticCommand,
  nextDiagnosticCommandId,
  registrationFailureMessage,
  registrationIssues,
  sanitizeDiagnosticMetadata,
  serialMismatchEvidence,
  type AdmsConnectionTestFacts,
} from "./adms-connection-test";

const NOW = Date.parse("2026-09-28T12:00:00.000Z");

function facts(overrides: Partial<AdmsConnectionTestFacts> = {}): AdmsConnectionTestFacts {
  return {
    now: NOW,
    timeoutMs: ADMS_CONNECTION_TEST_TIMEOUT_MS,
    queuedAt: new Date(NOW - ADMS_CONNECTION_TEST_TIMEOUT_MS).toISOString(),
    deliveredAt: null,
    acknowledgedAt: null,
    registrationOk: true,
    registrationIssues: [],
    serverHealthy: true,
    contactClass: "online",
    contactedDuringTest: false,
    polledGetRequestDuringTest: false,
    lastEndpoint: null,
    serialMismatch: false,
    ...overrides,
  };
}

describe("classifyAdmsContact", () => {
  it("keeps the 5 minute online window and separates stale from never connected", () => {
    expect(ADMS_ONLINE_WINDOW_MS).toBe(300_000);
    expect(classifyAdmsContact(null, NOW)).toBe("never_connected");
    expect(classifyAdmsContact("", NOW)).toBe("never_connected");
    expect(classifyAdmsContact("not-a-date", NOW)).toBe("never_connected");
    expect(classifyAdmsContact(new Date(NOW - 60_000).toISOString(), NOW)).toBe("online");
    expect(classifyAdmsContact(new Date(NOW - ADMS_ONLINE_WINDOW_MS).toISOString(), NOW)).toBe("online");
    expect(classifyAdmsContact(new Date(NOW - ADMS_ONLINE_WINDOW_MS - 1).toISOString(), NOW)).toBe("stale");
  });
});

describe("diagnostic command", () => {
  it("queues only CHECK and rejects destructive command text", () => {
    expect(ADMS_DIAGNOSTIC_COMMAND).toBe("CHECK");
    expect(isSafeDiagnosticCommand("CHECK")).toBe(true);
    expect(isSafeDiagnosticCommand("INFO")).toBe(false);
    expect(isSafeDiagnosticCommand("REBOOT")).toBe(false);
    expect(isSafeDiagnosticCommand("CLEAR DATA")).toBe(false);
    expect(isSafeDiagnosticCommand("SHELL")).toBe(false);
    const line = buildDiagnosticGetRequestLine(ADMS_DIAGNOSTIC_CMD_ID_FLOOR + 1);
    expect(line).toBe(`C:${ADMS_DIAGNOSTIC_CMD_ID_FLOOR + 1}:CHECK`);
    expect(line).not.toMatch(/REBOOT|CLEAR|SHELL|DELETE/i);
    expect(nextDiagnosticCommandId(null)).toBe(ADMS_DIAGNOSTIC_CMD_ID_FLOOR + 1);
    expect(nextDiagnosticCommandId(ADMS_DIAGNOSTIC_CMD_ID_FLOOR + 4)).toBe(ADMS_DIAGNOSTIC_CMD_ID_FLOOR + 5);
    expect(nextDiagnosticCommandId(12)).toBe(ADMS_DIAGNOSTIC_CMD_ID_FLOOR + 1);
  });
});

describe("correlateDiagnosticCommand", () => {
  const serial = "AF4C214460188";

  it("matches command id and serial together", () => {
    expect(
      correlateDiagnosticCommand({
        expectedCommandId: 1_000_000_004,
        expectedSerial: serial,
        ackCommandId: 1_000_000_004,
        ackSerial: "af4c214460188",
      }).matched,
    ).toBe(true);
  });

  it("does not match a different command, serial, or operational fetch id", () => {
    expect(
      correlateDiagnosticCommand({
        expectedCommandId: 1_000_000_004,
        expectedSerial: serial,
        ackCommandId: 1_000_000_005,
        ackSerial: serial,
      }).matched,
    ).toBe(false);
    expect(
      correlateDiagnosticCommand({
        expectedCommandId: 1_000_000_004,
        expectedSerial: serial,
        ackCommandId: 1_000_000_004,
        ackSerial: "OTHER123",
      }).matched,
    ).toBe(false);
    expect(
      correlateDiagnosticCommand({
        expectedCommandId: 1_000_000_004,
        expectedSerial: serial,
        ackCommandId: 8,
        ackSerial: serial,
      }).matched,
    ).toBe(false);
    expect(
      correlateDiagnosticCommand({
        expectedCommandId: 1_000_000_004,
        expectedSerial: "",
        ackCommandId: 1_000_000_004,
        ackSerial: serial,
      }).matched,
    ).toBe(false);
  });
});

describe("serialMismatchEvidence", () => {
  const now = NOW;

  it("requires the same source IP, a different serial, and a recent hit", () => {
    const hit = {
      serial: "ZZZ999",
      sourceIp: "10.1.1.8",
      seenAt: new Date(now - 60_000).toISOString(),
    };
    expect(
      serialMismatchEvidence({
        configuredSerial: "AF4C214460188",
        deviceSourceIp: "10.1.1.8",
        unknownHits: [hit],
        now,
      }),
    ).toEqual({ mismatch: true, serial: "ZZZ999" });
    expect(
      serialMismatchEvidence({
        configuredSerial: "AF4C214460188",
        deviceSourceIp: null,
        unknownHits: [hit],
        now,
      }).mismatch,
    ).toBe(false);
    expect(
      serialMismatchEvidence({
        configuredSerial: "AF4C214460188",
        deviceSourceIp: "10.1.1.9",
        unknownHits: [hit],
        now,
      }).mismatch,
    ).toBe(false);
    expect(
      serialMismatchEvidence({
        configuredSerial: "AF4C214460188",
        deviceSourceIp: "10.1.1.8",
        unknownHits: [{ ...hit, serial: "AF4C214460188" }],
        now,
      }).mismatch,
    ).toBe(false);
    expect(
      serialMismatchEvidence({
        configuredSerial: "AF4C214460188",
        deviceSourceIp: "10.1.1.8",
        unknownHits: [{ ...hit, seenAt: new Date(now - ADMS_UNKNOWN_SERIAL_WINDOW_MS - 1).toISOString() }],
        now,
      }).mismatch,
    ).toBe(false);
    expect(
      serialMismatchEvidence({
        configuredSerial: "AF4C214460188",
        deviceSourceIp: "10.1.1.8",
        unknownHits: [],
        now,
      }).mismatch,
    ).toBe(false);
  });
});

describe("evaluateAdmsConnectionTest", () => {
  it("returns each diagnosis from real stage facts", () => {
    const connected = evaluateAdmsConnectionTest(
      facts({
        queuedAt: new Date(NOW - 4_000).toISOString(),
        deliveredAt: new Date(NOW - 2_000).toISOString(),
        acknowledgedAt: new Date(NOW - 500).toISOString(),
        polledGetRequestDuringTest: true,
        contactedDuringTest: true,
      }),
    );
    expect(connected.status).toBe("passed");
    expect(connected.diagnosis).toMatchObject({
      code: "CONNECTED",
      message: ADMS_DIAGNOSIS_MESSAGES.CONNECTED,
      provisional: false,
    });
    expect(connected.roundTripMs).toBe(3_500);
    expect(connected.stages.map((s) => s.state)).toEqual(["pass", "pass", "pass", "pass", "pass", "pass"]);

    const waitingStale = evaluateAdmsConnectionTest(
      facts({
        queuedAt: new Date(NOW - 5_000).toISOString(),
        contactClass: "stale",
      }),
    );
    expect(waitingStale.status).toBe("queued");
    expect(waitingStale.diagnosis).toMatchObject({
      code: "NO_RECENT_CONTACT",
      message: ADMS_DIAGNOSIS_MESSAGES.NO_RECENT_CONTACT,
      provisional: true,
    });
    expect(waitingStale.stages.find((s) => s.id === "device_contacted_server")?.state).toBe("pass");
    expect(waitingStale.stages.find((s) => s.id === "device_polled_getrequest")?.state).toBe("pending");

    const never = evaluateAdmsConnectionTest(facts({ contactClass: "never_connected" }));
    expect(never.status).toBe("timed_out");
    expect(never.diagnosis?.code).toBe("NEVER_CONNECTED");
    expect(never.diagnosis?.message).toBe(ADMS_DIAGNOSIS_MESSAGES.NEVER_CONNECTED);
    expect(never.stages.find((s) => s.id === "device_contacted_server")?.state).toBe("fail");
    expect(never.stages.find((s) => s.id === "device_polled_getrequest")?.state).toBe("fail");

    const notCollected = evaluateAdmsConnectionTest(facts({ contactClass: "online" }));
    expect(notCollected.diagnosis).toMatchObject({
      code: "COMMAND_NOT_COLLECTED",
      message: ADMS_DIAGNOSIS_MESSAGES.COMMAND_NOT_COLLECTED,
    });

    const notAcked = evaluateAdmsConnectionTest(
      facts({
        deliveredAt: new Date(NOW - 1_000).toISOString(),
        polledGetRequestDuringTest: true,
        contactedDuringTest: true,
      }),
    );
    expect(notAcked.diagnosis).toMatchObject({
      code: "COMMAND_NOT_ACKNOWLEDGED",
      message: ADMS_DIAGNOSIS_MESSAGES.COMMAND_NOT_ACKNOWLEDGED,
    });
    expect(notAcked.status).toBe("timed_out");

    const mismatch = evaluateAdmsConnectionTest(
      facts({ contactClass: "stale", serialMismatch: true }),
    );
    expect(mismatch.diagnosis).toMatchObject({
      code: "SERIAL_MISMATCH",
      message: ADMS_DIAGNOSIS_MESSAGES.SERIAL_MISMATCH,
    });
    expect(mismatch.status).toBe("failed");

    const server = evaluateAdmsConnectionTest(facts({ serverHealthy: false, queuedAt: null }));
    expect(server.status).toBe("failed");
    expect(server.diagnosis?.code).toBe("SERVER_ERROR");
    expect(server.diagnosis?.message).toBe(ADMS_DIAGNOSIS_MESSAGES.SERVER_ERROR);

    const stale = evaluateAdmsConnectionTest(facts({ contactClass: "stale" }));
    expect(stale.diagnosis).toMatchObject({
      code: "DEVICE_STALE",
      message: ADMS_DIAGNOSIS_MESSAGES.DEVICE_STALE,
      provisional: false,
    });
    expect(stale.stages.map((stage) => [stage.id, stage.state])).toEqual([
      ["device_registered", "pass"],
      ["adms_server_healthy", "pass"],
      ["device_contacted_server", "pass"],
      ["device_polled_getrequest", "fail"],
      ["command_delivered", "fail"],
      ["command_acknowledged", "fail"],
    ]);

    const stalePolled = evaluateAdmsConnectionTest(
      facts({ contactClass: "stale", lastEndpoint: "getrequest" }),
    );
    expect(stalePolled.diagnosis).toMatchObject({
      code: "DEVICE_STALE",
      message: ADMS_DIAGNOSIS_MESSAGES.DEVICE_STALE,
      provisional: false,
    });
    expect(stalePolled.stages.map((stage) => [stage.id, stage.state])).toEqual([
      ["device_registered", "pass"],
      ["adms_server_healthy", "pass"],
      ["device_contacted_server", "pass"],
      ["device_polled_getrequest", "pass"],
      ["command_delivered", "fail"],
      ["command_acknowledged", "fail"],
    ]);

    const staleHandshakeOnly = evaluateAdmsConnectionTest(
      facts({ contactClass: "stale", lastEndpoint: "cdata" }),
    );
    expect(staleHandshakeOnly.stages.find((stage) => stage.id === "device_contacted_server")?.state).toBe("pass");
    expect(staleHandshakeOnly.stages.find((stage) => stage.id === "device_polled_getrequest")?.state).toBe("fail");
    expect(staleHandshakeOnly.stages.find((stage) => stage.id === "command_delivered")?.state).toBe("fail");
    expect(staleHandshakeOnly.stages.find((stage) => stage.id === "command_acknowledged")?.state).toBe("fail");

    const neverWithEndpoint = evaluateAdmsConnectionTest(
      facts({ contactClass: "never_connected", lastEndpoint: "getrequest" }),
    );
    expect(neverWithEndpoint.stages.find((stage) => stage.id === "device_contacted_server")?.state).toBe("fail");
    expect(neverWithEndpoint.stages.find((stage) => stage.id === "device_polled_getrequest")?.state).toBe("fail");

    const registration = evaluateAdmsConnectionTest(
      facts({
        registrationOk: false,
        registrationIssues: ["missing_serial"],
        queuedAt: null,
        contactClass: "never_connected",
      }),
    );
    expect(registration.status).toBe("failed");
    expect(registration.diagnosis?.code).toBe("REGISTRATION_FAILED");
    expect(registration.diagnosis?.message).toBe("Serial number is missing.");
    expect(registration.stages[0]).toEqual({ id: "device_registered", state: "fail" });
  });

  it("does not time out a test that is still inside the window", () => {
    const running = evaluateAdmsConnectionTest(
      facts({
        queuedAt: new Date(NOW - 1_000).toISOString(),
        deliveredAt: new Date(NOW - 200).toISOString(),
        polledGetRequestDuringTest: true,
        contactedDuringTest: true,
        contactClass: "online",
      }),
    );
    expect(running.timedOut).toBe(false);
    expect(running.status).toBe("running");
    expect(running.diagnosis).toBeNull();
    expect(running.stages.find((s) => s.id === "command_acknowledged")?.state).toBe("pending");
  });
});

describe("registration and server health", () => {
  it("flags incomplete device rows and the real iclock paths", () => {
    expect(
      registrationIssues({ exists: true, serialNumber: "  ", locationId: null, active: false }),
    ).toEqual(["missing_serial", "missing_site", "disabled"]);
    expect(registrationFailureMessage(["missing_site", "disabled"])).toBe(
      "Device is not assigned to a site. Device is disabled.",
    );
    expect(
      assessAdmsHandlerHealth({
        cdata: "cdata",
        getrequest: "getrequest",
        devicecmd: "devicecmd",
        registry: "registry",
      }).ok,
    ).toBe(true);
    expect(
      assessAdmsHandlerHealth({
        cdata: "cdata",
        getrequest: "getrequest",
        devicecmd: "other",
        registry: "registry",
      }).missing,
    ).toEqual(["/iclock/devicecmd"]);
  });
});

describe("connection test rate limit", () => {
  it("blocks a second active test and a short cooldown, then allows a new one", () => {
    expect(
      connectionTestStartBlock({
        now: NOW,
        active: { queuedAt: new Date(NOW - 5_000).toISOString(), timeoutMs: 30_000 },
      }),
    ).toEqual({ allowed: false, reason: "active" });
    expect(
      connectionTestStartBlock({
        now: NOW,
        active: null,
        lastCompletedAt: new Date(NOW - 5_000).toISOString(),
      }),
    ).toEqual({ allowed: false, reason: "cooldown" });
    expect(
      connectionTestStartBlock({
        now: NOW,
        active: { queuedAt: new Date(NOW - 31_000).toISOString(), timeoutMs: 30_000 },
        lastCompletedAt: new Date(NOW - 60_000).toISOString(),
      }).allowed,
    ).toBe(true);
  });
});

describe("sanitizeDiagnosticMetadata", () => {
  it("drops credentials and comm keys", () => {
    expect(
      sanitizeDiagnosticMetadata({
        endpoint: "getrequest",
        pushcommkey: "secret",
        nested: { authorization: "Bearer x", returnCode: 0 },
        note: "token=abc",
      }),
    ).toEqual({ endpoint: "getrequest", nested: { returnCode: 0 } });
  });
});
