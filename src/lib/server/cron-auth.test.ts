import { afterEach, describe, expect, it } from "vitest";

import { validateCronRequest } from "./cron-auth";

const ORIGINAL = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

function request(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/public/escalation-sweep", { headers });
}

describe("validateCronRequest", () => {
  it("rejects when CRON_SECRET is unset, even if the anon key is presented", () => {
    delete process.env.CRON_SECRET;
    const res = validateCronRequest(
      request({ apikey: "public-anon-key", authorization: "Bearer public-anon-key" }),
    );
    expect(res?.status).toBe(401);
  });

  it("rejects when CRON_SECRET is empty", () => {
    process.env.CRON_SECRET = "   ";
    const res = validateCronRequest(request({ authorization: "Bearer secret" }));
    expect(res?.status).toBe(401);
  });

  it("accepts a matching bearer or x-cron-secret and rejects a mismatch", () => {
    process.env.CRON_SECRET = "cron-secret-value";
    expect(validateCronRequest(request({ authorization: "Bearer cron-secret-value" }))).toBeNull();
    expect(validateCronRequest(request({ "x-cron-secret": "cron-secret-value" }))).toBeNull();
    expect(validateCronRequest(request({ authorization: "Bearer wrong" }))?.status).toBe(401);
    expect(validateCronRequest(request({ apikey: "cron-secret-value" }))?.status).toBe(401);
  });
});
