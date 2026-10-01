import { describe, expect, it } from "vitest";

import { employeeProfileGaps, PROFILE_GAP_KEYS } from "@/lib/hr-profile-completeness";
import { redactAuditPayload } from "@/lib/hr-sensitive-audit";
import { HR_WORKSPACE_MODULES } from "@/lib/hr-workspace";

describe("employee profile gaps", () => {
  it("lists only empty operational fields", () => {
    expect(
      employeeProfileGaps({
        emergencyContact: false,
        manager: true,
        hireDate: true,
        contract: false,
        photo: true,
        qidOnFile: true,
        skills: false,
        educationVisible: true,
        educationCount: 0,
      }),
    ).toEqual(["emergency_contact", "contract", "skills", "education"]);
  });

  it("does not treat hidden education access as a missing record", () => {
    expect(
      employeeProfileGaps({
        emergencyContact: true,
        manager: true,
        hireDate: true,
        contract: true,
        photo: true,
        qidOnFile: true,
        skills: true,
        educationVisible: false,
        educationCount: 0,
      }),
    ).toEqual([]);
  });

  it("never uses protected characteristics as gap keys", () => {
    const forbidden = ["gender", "nationality", "date_of_birth", "age", "religion", "marital_status"];
    for (const key of PROFILE_GAP_KEYS) expect(forbidden).not.toContain(key);
  });
});

describe("sensitive audit redaction", () => {
  it("keeps ordinary fields and redacts identity, bank, and notes", () => {
    const result = redactAuditPayload({
      full_name: "Noor",
      qid: "12345678901",
      notes: "private",
      iban: "",
    });
    expect(result.payload.full_name).toBe("Noor");
    expect(result.payload.qid).toBe("[redacted]");
    expect(result.payload.notes).toBe("[redacted]");
    expect(result.payload.iban).toBeNull();
    expect(result.fields).toEqual(["qid", "notes", "iban"]);
  });
});

describe("HR workspace map", () => {
  it("links only modules that already exist and leaves later phases unrouted", () => {
    expect(HR_WORKSPACE_MODULES).toHaveLength(21);
    for (const mod of HR_WORKSPACE_MODULES) {
      if (mod.status === "later") expect(mod.href).toBeNull();
      else expect(mod.href?.startsWith("/")).toBe(true);
    }
    expect(HR_WORKSPACE_MODULES.find((mod) => mod.id === "19")?.status).toBe("later");
    expect(HR_WORKSPACE_MODULES.find((mod) => mod.id === "ac")?.href).toBeNull();
  });
});
