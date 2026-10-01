import { describe, expect, it } from "vitest";

import { distinctJobTitles, matchJobTitleSuggestions } from "./staff-job-titles";

describe("staff job title suggestions", () => {
  const saved = ["Crew / Attendant", "crew / attendant", "Branch Manager", "Senior Crew Lead", "Technician"];

  it("keeps one spelling per title", () => {
    expect(distinctJobTitles(saved)).toEqual([
      "Branch Manager",
      "Crew / Attendant",
      "Senior Crew Lead",
      "Technician",
    ]);
  });

  it("matches prefix before contains, case-insensitively", () => {
    expect(matchJobTitleSuggestions(saved, "crew")).toEqual(["Crew / Attendant", "Senior Crew Lead"]);
    expect(matchJobTitleSuggestions(saved, "tech")).toEqual(["Technician"]);
    expect(matchJobTitleSuggestions(saved, "man")).toEqual(["Branch Manager"]);
    expect(matchJobTitleSuggestions(saved, "")).toEqual([]);
  });
});
