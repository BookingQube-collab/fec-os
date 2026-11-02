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

  it("handles 12:00 AM/PM and afternoon roster times without AM collapse", () => {
    expect(joinHm12(12, 0, "AM")).toBe("00:00");
    expect(joinHm12(12, 0, "PM")).toBe("12:00");
    expect(joinHm12(12, 30, "PM")).toBe("12:30");
    expect(joinHm12(1, 0, "PM")).toBe("13:00");
    expect(joinHm12(1, 0, "AM")).toBe("01:00");

    expect(splitHm12("00:00")).toEqual({ hour12: 12, minute: 0, period: "AM" });
    expect(splitHm12("12:00")).toEqual({ hour12: 12, minute: 0, period: "PM" });
    expect(splitHm12("12:30")).toEqual({ hour12: 12, minute: 30, period: "PM" });
    expect(splitHm12("13:00")).toEqual({ hour12: 1, minute: 0, period: "PM" });

    expect(splitHm12(joinHm12(12, 30, "PM"))).toEqual({ hour12: 12, minute: 30, period: "PM" });
    expect(splitHm12(joinHm12(1, 0, "PM"))).toEqual({ hour12: 1, minute: 0, period: "PM" });
    expect(joinHm12(12, 0, "PM")).not.toBe("00:00");
  });

  it("formats English AM/PM labels like HOO review copy", () => {
    expect(formatEnglishTime("08:00")).toBe("8:00 AM");
    expect(formatEnglishTime("17:00")).toBe("5:00 PM");
    expect(formatEnglishTime("12:15")).toBe("12:15 PM");
    expect(formatEnglishTime("00:30")).toBe("12:30 AM");
    expect(formatEnglishTime("12:30")).toBe("12:30 PM");
    expect(formatEnglishTime("13:00")).toBe("1:00 PM");
  });
});
