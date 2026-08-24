import { describe, expect, it } from "vitest";

import { formatRosterFileSize, isAllowedRosterImportFilename, pickRosterImportFile } from "./select-import-file";

function fakeFile(name: string, size = 10): File {
  return new File(["x".repeat(size)], name, { type: "application/octet-stream" });
}

describe("pickRosterImportFile", () => {
  it("accepts xlsx csv xls html and prefers an Employee Roster name", () => {
    expect(isAllowedRosterImportFilename("staff.xlsx")).toBe(true);
    expect(isAllowedRosterImportFilename("notes.txt")).toBe(false);
    const { file, skipped } = pickRosterImportFile([
      fakeFile("notes.txt"),
      fakeFile("other.csv"),
      fakeFile("Employee Roster.xlsx"),
    ]);
    expect(file?.name).toBe("Employee Roster.xlsx");
    expect(skipped).toEqual(["notes.txt", "other.csv"]);
  });

  it("formats sizes", () => {
    expect(formatRosterFileSize(512)).toBe("512 B");
    expect(formatRosterFileSize(2048)).toBe("2.0 KB");
  });
});
