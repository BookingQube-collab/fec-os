import { describe, expect, it } from "vitest";

import {
  CHAT_ENTITY_SOURCES,
  chatEmployeeCardFields,
  chatEntityCardFromRow,
  chatEntityPreviewAccess,
  chatEntityShareIssue,
} from "./entity-rules";

const staffId = "22222222-2222-4222-8222-222222222222";

describe("chat entity share", () => {
  it("rejects unsupported types", () => {
    expect(chatEntityShareIssue("ROSTER")).toBe("unsupported");
    expect(chatEntityShareIssue("TASK")).toBe("unsupported");
    expect(chatEntityShareIssue("ATTENDANCE_ISSUE")).toBe("unsupported");
    expect(chatEntityShareIssue("INVENTORY_REQUEST")).toBe("unsupported");
    expect(chatEntityShareIssue("BIRTHDAY_BOOKING")).toBe("unsupported");
    expect(chatEntityShareIssue("APPROVAL")).toBe("unsupported");
    expect(chatEntityShareIssue("NOT_A_TYPE")).toBe("unsupported");
    expect(chatEntityCardFromRow("ROSTER", { id: staffId, title: "Shift" }, null)).toBeNull();
    expect(chatEntityShareIssue("MAINTENANCE_TICKET")).toBeNull();
    expect(chatEntityShareIssue("EMPLOYEE")).toBeNull();
    expect(chatEntityShareIssue("TRAINING_COURSE")).toBeNull();
    expect(chatEntityShareIssue("TRAINING_CERTIFICATE")).toBeNull();
    expect(chatEntityShareIssue("TRAINING_SESSION")).toBeNull();
  });

  it("builds a training card without a score or verification token", () => {
    const courseId = "33333333-3333-4333-8333-333333333333";
    const certificateId = "44444444-4444-4444-8444-444444444444";
    const sessionId = "55555555-5555-4555-8555-555555555555";
    expect(CHAT_ENTITY_SOURCES.TRAINING_CERTIFICATE.columns).not.toMatch(/public_token|score|holder_name|qid/);
    expect(chatEntityCardFromRow("TRAINING_COURSE", {
      id: courseId,
      code: "SAFE-1",
      title: "Machine safety",
      status: "PUBLISHED",
      passing_score: 80,
    }, "Doha")).toEqual({
      code: "SAFE-1",
      title: "Machine safety",
      jobTitle: null,
      locationName: "Doha",
      status: "PUBLISHED",
      priority: null,
      href: `/training/${courseId}`,
    });
    const certificate = chatEntityCardFromRow("TRAINING_CERTIFICATE", {
      id: certificateId,
      course_title: "Machine safety",
      status: "VALID",
      public_token: "ab".repeat(32),
      score: 99,
    }, null);
    expect(certificate?.title).toBe("Machine safety");
    expect(certificate?.href).toBeNull();
    expect(JSON.stringify(certificate)).not.toMatch(/public_token|score|99/);
    expect(chatEntityCardFromRow("TRAINING_SESSION", {
      id: sessionId,
      course_code: "SAFE-1",
      course_title: "Machine safety",
      status: "SCHEDULED",
      starts_at: "2026-10-03T06:00:00+03:00",
    }, "Doha")?.href).toBe(`/training/sessions/${sessionId}`);
  });

  it("keeps only name, code, and job title on an employee card", () => {
    const row = {
      id: staffId,
      full_name: "Ada Lovelace",
      employee_code: "E-1",
      job_title: "Engineer",
      status: "active",
      location_name: "From the staff row",
      salary: 9000,
      passport: "P123",
      visa: "V99",
      iban: "QA00BANK",
      pin: "1234",
      qid: "28412345678",
      phone: "555",
      email: "ada@example.com",
    };
    expect(chatEmployeeCardFields(row)).toEqual({
      fullName: "Ada Lovelace",
      employeeCode: "E-1",
      jobTitle: "Engineer",
    });
    expect(Object.keys(chatEmployeeCardFields(row) ?? {}).sort()).toEqual([
      "employeeCode",
      "fullName",
      "jobTitle",
    ]);
    expect(CHAT_ENTITY_SOURCES.EMPLOYEE.table).toBe("staff");
    expect(CHAT_ENTITY_SOURCES.EMPLOYEE.table).not.toBe("staff_profile_ext");
    const employeeColumns = CHAT_ENTITY_SOURCES.EMPLOYEE.columns.split(",").map((column) => column.trim());
    expect(employeeColumns).toEqual(["id", "full_name", "employee_code", "job_title", "location_id"]);
    const forbidden = ["salary", "passport", "iban", "pin", "visa", "qid", "phone", "email", "compensation", "staff_profile_ext"];
    for (const key of forbidden) {
      expect(employeeColumns).not.toContain(key);
    }

    const card = chatEntityCardFromRow("EMPLOYEE", row, "Doha");
    expect(card).toEqual({
      code: "E-1",
      title: "Ada Lovelace",
      jobTitle: "Engineer",
      locationName: "Doha",
      status: null,
      priority: null,
      href: `/people/staff/${staffId}`,
    });
    expect(JSON.stringify(card)).not.toMatch(/salary|passport|iban|visa|pin|qid|555|ada@example/i);
  });

  it("is no access when the preview is null", () => {
    expect(chatEmployeeCardFields(null)).toBeNull();
    expect(chatEntityCardFromRow("EMPLOYEE", null, "Doha")).toBeNull();
    expect(chatEntityCardFromRow("MAINTENANCE_TICKET", null, "Doha")).toBeNull();
    expect(chatEntityPreviewAccess(null)).toEqual({ access: false });
  });
});
