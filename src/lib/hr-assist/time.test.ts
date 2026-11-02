import { describe, expect, it } from "vitest";

import { formatEnglishTime, joinHm12, splitHm12 } from "./time";

describe("12-hour roster time helpers", () => {
  it("splits and joins HH:mm through AM/PM parts", () => {
    expect(splitHm12("00:00")).toEqual({ hour12: 12, minute: 0, period: "AM" });
    expect(splitHm12("08:30")).toEqual({ hour12: 8, minute: 30, period: "AM" });
    expect(splitHm12("12:00")).toEqual({ hour12: 12, minute: 0, period: "PM" });
    expect(splitHm12("17:05")).toEqual({ hour12: 5, minute: 5, period: "PM" });

    expect(joinHm12(12, 0, "AM")).toBe("00:00");
    expect(joinHm12(8, 30, "AM")).toBe("08:30");
    expect(joinHm12(12, 0, "PM")).toBe("12:00");
    expect(joinHm12(5, 5, "PM")).toBe("17:05");
  });

  it("formats English AM/PM labels like HOO review copy", () => {
    expect(formatEnglishTime("08:00")).toBe("8:00 AM");
    expect(formatEnglishTime("17:00")).toBe("5:00 PM");
    expect(formatEnglishTime("12:15")).toBe("12:15 PM");
  });
});
