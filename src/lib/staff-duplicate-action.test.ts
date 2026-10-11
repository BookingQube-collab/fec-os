import { describe, expect, it } from "vitest";

import {
  bothStaffHavePunches,
  duplicateDeleteDecision,
  fieldsCopiedOnMerge,
  suggestDuplicateKeepId,
} from "./staff-duplicate-action";

const keptFurkan = {
  employee_code: "INF-CC-STF19",
  full_name: "MUHAMMAD FURKAN",
  job_title: "Dishwasher/Cook",
  department: "F&B Cafe",
  qid: null,
  hire_date: null,
  phone: "55551212",
  email: "  ",
  nationality: null,
  passport_number: "",
  gender: null,
  date_of_birth: null,
  sponsorship_info: null,
  ticket_eligibility: null,
  user_id: null,
};

const droppedChoudhry = {
  employee_code: "82",
  full_name: "Muhammad Furqan Choudhry",
  job_title: "Chef",
  department: "F&B",
  qid: "28512345678",
  hire_date: "2024-03-01",
  phone: null,
  email: "chef@example.com",
  nationality: "Pakistani",
  passport_number: "AB1234567",
  gender: "Male",
  date_of_birth: "1994-08-12",
  sponsorship_info: "Company",
  ticket_eligibility: true,
  user_id: "login-1",
};

describe("fieldsCopiedOnMerge", () => {
  it("copies identity fields only into empty values on the kept row", () => {
    expect(fieldsCopiedOnMerge(keptFurkan, droppedChoudhry)).toEqual([
      "qid",
      "hire_date",
      "email",
      "user_id",
      "nationality",
      "passport_number",
      "gender",
      "sponsorship_info",
      "date_of_birth",
      "ticket_eligibility",
    ]);
  });

  it("does not replace a filled department, job title, phone, or name", () => {
    const copied = fieldsCopiedOnMerge(keptFurkan, droppedChoudhry);
    expect(copied).not.toContain("department");
    expect(copied).not.toContain("job_title");
    expect(copied).not.toContain("phone");
    expect(copied).not.toContain("full_name");
    expect(copied).not.toContain("employee_code");
  });

  it("leaves a different non-empty QID and a false ticket flag untouched", () => {
    const copied = fieldsCopiedOnMerge(
      {
        qid: "111",
        ticket_eligibility: false,
        nationality: "Indian",
      },
      {
        qid: "222",
        ticket_eligibility: true,
        nationality: "Pakistani",
        passport_number: "ZZ9",
      },
    );
    expect(copied).toEqual(["passport_number"]);
  });
});

describe("duplicateDeleteDecision", () => {
  it("allows delete only when the punch count is zero and the user confirmed zero", () => {
    expect(duplicateDeleteDecision({ punchCount: 0, confirmedPunchCount: 0 })).toEqual({ allow: true });
  });

  it("blocks delete when the record has punches, even if the count is confirmed", () => {
    expect(duplicateDeleteDecision({ punchCount: 125, confirmedPunchCount: 125 })).toEqual({
      allow: false,
      code: "has_punches",
    });
  });

  it("rejects a confirmation that does not match the live zero count", () => {
    expect(duplicateDeleteDecision({ punchCount: 0, confirmedPunchCount: 3 })).toEqual({
      allow: false,
      code: "punch_count_mismatch",
    });
  });
});

describe("suggestDuplicateKeepId", () => {
  it("keeps the person who has the punches", () => {
    expect(
      suggestDuplicateKeepId(
        { id: "empty", employeeCode: "82", punchCount: 0 },
        { id: "worked", employeeCode: "INF-CC-STF19", punchCount: 125 },
      ),
    ).toBe("worked");
  });

  it("keeps a real code over a generated stub when punch counts match", () => {
    expect(
      suggestDuplicateKeepId(
        { id: "stub", employeeCode: "INF-CC-STF19", punchCount: 0 },
        { id: "real", employeeCode: "82", punchCount: 0 },
      ),
    ).toBe("real");
  });

  it("prefers merge when both rows have punches", () => {
    expect(bothStaffHavePunches(4, 125)).toBe(true);
    expect(bothStaffHavePunches(0, 125)).toBe(false);
  });
});
