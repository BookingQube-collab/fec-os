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
  it("rejects when ADMS_COMM_KEY is unset and logs only that the key is missing", () => {
    delete process.env.ADMS_COMM_KEY;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = validateAdmsCommKey(request({ "x-adms-key": "device-key" }), null);
    expect(result).toMatchObject({ status: 403, body: "AUTH_ERROR" });
    expect(error).toHaveBeenCalledTimes(1);
    const logged = String(error.mock.calls[0]?.[0] ?? "");
    expect(logged).toMatch(/ADMS_COMM_KEY is not configured/);
    expect(logged).not.toMatch(/device-key/);
  });

  it("rejects an empty key and accepts a matching key via header, bearer, or query", () => {
    process.env.ADMS_COMM_KEY = "   ";
    expect(validateAdmsCommKey(request(), "device-key")?.body).toBe("AUTH_ERROR");

    process.env.ADMS_COMM_KEY = "device-key";
    expect(validateAdmsCommKey(request({ "x-adms-key": "device-key" }), null)).toBeNull();
    expect(validateAdmsCommKey(request({ authorization: "Bearer device-key" }), null)).toBeNull();
    expect(validateAdmsCommKey(request(), "device-key")).toBeNull();
    expect(validateAdmsCommKey(request({ "x-adms-key": "other" }), null)?.reason).toBe("bad_comm_key");
    expect(validateAdmsCommKey(request({ "x-adms-key": "device-key-extra" }), null)?.reason).toBe(
      "bad_comm_key",
    );
  });

  it("names the rejection without including the key", () => {
    expect(admsAuthFailureMessage("missing_comm_key")).toMatch(/ADMS_COMM_KEY is not set/);
    expect(admsAuthFailureMessage("bad_comm_key")).toMatch(/comm key was rejected/);
    expect(admsAuthFailureMessage("ip_not_allowed")).toMatch(/ADMS_IP_ALLOWLIST/);
    expect(admsAuthFailureMessage("missing_comm_key")).not.toMatch(/secret|password/i);
  });

  it("keeps the IP allowlist optional when unset", () => {
    delete process.env.ADMS_IP_ALLOWLIST;
    expect(validateAdmsIp(request())).toBeNull();
  });
});
