import { afterEach, describe, expect, it, vi } from "vitest";

import { admsAuthFailureMessage, validateAdmsCommKey, validateAdmsIp } from "./adms-auth";

const ORIGINAL = process.env.ADMS_COMM_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMS_COMM_KEY;
  else process.env.ADMS_COMM_KEY = ORIGINAL;
  vi.restoreAllMocks();
});

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/iclock/cdata", { headers });
}

describe("validateAdmsCommKey", () => {
  it("accepts a terminal that sends no key when ADMS_COMM_KEY is unset", () => {
    delete process.env.ADMS_COMM_KEY;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(validateAdmsCommKey(request(), null)).toBeNull();
    expect(validateAdmsCommKey(request(), "   ")).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("accepts a sent key when ADMS_COMM_KEY is unset instead of demanding a server secret", () => {
    delete process.env.ADMS_COMM_KEY;
    expect(validateAdmsCommKey(request({ "x-adms-key": "device-key" }), null)).toBeNull();
    process.env.ADMS_COMM_KEY = "   ";
    expect(validateAdmsCommKey(request(), "device-key")).toBeNull();
  });

  it("accepts a registered-path request with no key when ADMS_COMM_KEY is set", () => {
    process.env.ADMS_COMM_KEY = "device-key";
    expect(validateAdmsCommKey(request(), null)).toBeNull();
    expect(validateAdmsCommKey(request({ authorization: "Bearer   " }), "  ")).toBeNull();
  });

  it("matches a sent key trimmed and case-sensitively via header, bearer, or query", () => {
    process.env.ADMS_COMM_KEY = "device-key";
    expect(validateAdmsCommKey(request({ "x-adms-key": "device-key" }), null)).toBeNull();
    expect(validateAdmsCommKey(request({ "x-api-key": "  device-key  " }), null)).toBeNull();
    expect(validateAdmsCommKey(request({ authorization: "Bearer device-key" }), null)).toBeNull();
    expect(validateAdmsCommKey(request(), "  device-key  ")).toBeNull();
    expect(validateAdmsCommKey(request({ "x-adms-key": "Device-Key" }), null)?.reason).toBe("bad_comm_key");
    expect(validateAdmsCommKey(request({ "x-adms-key": "other" }), null)?.reason).toBe("bad_comm_key");
    expect(validateAdmsCommKey(request({ "x-adms-key": "device-key-extra" }), null)?.reason).toBe(
      "bad_comm_key",
    );
  });

  it("names a bad key without saying an unset server key rejects punches", () => {
    expect(admsAuthFailureMessage("bad_comm_key")).toMatch(/comm key was rejected/);
    expect(admsAuthFailureMessage("ip_not_allowed")).toMatch(/ADMS_IP_ALLOWLIST/);
    expect(admsAuthFailureMessage("missing_comm_key")).not.toMatch(/ADMS_COMM_KEY is not set/);
    expect(admsAuthFailureMessage("missing_comm_key")).not.toMatch(/secret|password/i);
    expect(admsAuthFailureMessage("bad_comm_key")).not.toMatch(/secret|password/i);
  });

  it("keeps the IP allowlist optional when unset", () => {
    delete process.env.ADMS_IP_ALLOWLIST;
    expect(validateAdmsIp(request())).toBeNull();
  });
});
