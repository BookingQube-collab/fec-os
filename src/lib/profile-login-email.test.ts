import { describe, expect, it } from "vitest";

import {
  isDuplicateAuthEmailError,
  planSelfServeLoginEmailChange,
  selfServeLoginEmailErrorMessage,
} from "@/lib/profile-login-email";

describe("planSelfServeLoginEmailChange", () => {
  it("blocks when the one-time change was already used", () => {
    expect(
      planSelfServeLoginEmailChange({
        currentEmail: "old@fec.qa",
        nextEmailRaw: "new@fec.qa",
        alreadyUsedAt: "2026-10-27T12:00:00Z",
      }),
    ).toEqual({ ok: false, reason: "already_used" });
  });

  it("rejects invalid addresses", () => {
    expect(
      planSelfServeLoginEmailChange({
        currentEmail: "old@fec.qa",
        nextEmailRaw: "not-an-email",
        alreadyUsedAt: null,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects unchanged emails", () => {
    expect(
      planSelfServeLoginEmailChange({
        currentEmail: "Same@FEC.qa",
        nextEmailRaw: "  same@fec.qa ",
        alreadyUsedAt: null,
      }),
    ).toEqual({ ok: false, reason: "unchanged" });
  });

  it("accepts a new valid email when unused", () => {
    expect(
      planSelfServeLoginEmailChange({
        currentEmail: "old@fec.qa",
        nextEmailRaw: " New.Person@Example.com ",
        alreadyUsedAt: null,
      }),
    ).toEqual({ ok: true, email: "new.person@example.com" });
  });
});

describe("selfServeLoginEmailErrorMessage", () => {
  it("maps duplicate auth emails", () => {
    expect(selfServeLoginEmailErrorMessage({ code: "email_exists", message: "x" })).toBe(
      "A login with this email already exists.",
    );
    expect(isDuplicateAuthEmailError({ message: "User already registered" })).toBe(true);
  });

  it("falls back safely", () => {
    expect(selfServeLoginEmailErrorMessage(null)).toBe("Could not update the sign-in email.");
  });
});
