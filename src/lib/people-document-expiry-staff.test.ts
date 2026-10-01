import { describe, expect, it } from "vitest";

import {
  DOCUMENT_EXPIRY_DEFAULT_STAFF_STATUS,
  staffIncludedInDocumentExpiry,
} from "./people-document-expiry-staff";

type Person = { name: string; status: string | null; employment_type: string | null };

const roster: Person[] = [
  { name: "Active", status: "active", employment_type: "permanent" },
  { name: "Probation", status: "probation", employment_type: null },
  { name: "Blank", status: "", employment_type: null },
  { name: "Secondment", status: "secondment", employment_type: "secondment" },
  { name: "Remote", status: "remote", employment_type: "permanent" },
  { name: "Terminated", status: "terminated", employment_type: "permanent" },
  { name: "Resigned", status: "resigned", employment_type: null },
  { name: "Released", status: "released", employment_type: null },
  { name: "Inactive", status: "inactive", employment_type: null },
  { name: "On leave", status: "on_leave", employment_type: "permanent" },
  { name: "Notice", status: "serving_notice", employment_type: "permanent" },
  { name: "Joker type", status: "active", employment_type: "joker" },
  { name: "Joker status", status: "joker", employment_type: "permanent" },
];

function namesFor(statusFilter: string): string[] {
  return roster.filter((s) => staffIncludedInDocumentExpiry(s, statusFilter)).map((s) => s.name);
}

describe("document expiry staff filter", () => {
  it("excludes terminated staff from the default active document set", () => {
    expect(DOCUMENT_EXPIRY_DEFAULT_STAFF_STATUS).toBe("active");
    expect(namesFor(DOCUMENT_EXPIRY_DEFAULT_STAFF_STATUS)).toEqual([
      "Active",
      "Probation",
      "Blank",
      "Secondment",
      "Remote",
    ]);
  });

  it("shows left staff when all statuses or that status is chosen", () => {
    expect(namesFor("")).toEqual(roster.map((s) => s.name));
    expect(namesFor("terminated")).toEqual(["Terminated"]);
    expect(namesFor("resigned")).toEqual(["Resigned"]);
    expect(namesFor("released")).toEqual(["Released"]);
    expect(namesFor("joker")).toEqual(["Joker type", "Joker status"]);
  });
});
