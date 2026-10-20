import { describe, expect, it } from "vitest";

import { userFacingActionError } from "./user-facing-action-error";

describe("userFacingActionError", () => {
  const fallback = "Could not load your team. Try again.";

  it("replaces React #441 / production digests", () => {
    expect(
      userFacingActionError(
        new Error(
          "Minified React error #441; visit https://react.dev/errors/441 for the full message",
        ),
        fallback,
      ),
    ).toBe(fallback);
    expect(
      userFacingActionError(
        new Error(
          "An error occurred in the Server Components render. The specific message is omitted in production builds.",
        ),
        fallback,
      ),
    ).toBe(fallback);
  });

  it("keeps short plain English messages", () => {
    expect(userFacingActionError(new Error("You can only request OT for people on your team."), fallback)).toBe(
      "You can only request OT for people on your team.",
    );
  });

  it("hides auth and PostgREST noise", () => {
    expect(userFacingActionError(new Error("Forbidden: insufficient permissions"), fallback)).toBe(fallback);
    expect(
      userFacingActionError(new Error("column staff_profile_ext.contract_working_days does not exist"), fallback),
    ).toBe(fallback);
  });
});
