import { describe, expect, it } from "vitest";

import {
  assertIdsSameEvent,
  assertOptionalRefsSameEvent,
  buildEventDocumentStoragePath,
  CrossEventIntegrityError,
  eventDocumentPathMatchesEvent,
} from "@/lib/events/integrity";

const EVENT_A = "11111111-1111-4111-8111-111111111111";
const EVENT_B = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";

describe("same-event integrity helpers", () => {
  it("allows matching event ids and null refs", () => {
    expect(() => assertIdsSameEvent(EVENT_A, EVENT_A, "wbs_id")).not.toThrow();
    expect(() => assertIdsSameEvent(EVENT_A, null, "wbs_id")).not.toThrow();
    expect(() => assertIdsSameEvent(EVENT_A, undefined, "parent_task_id")).not.toThrow();
  });

  it("rejects cross-event references", () => {
    expect(() => assertIdsSameEvent(EVENT_A, EVENT_B, "predecessor_id")).toThrow(CrossEventIntegrityError);
    expect(() =>
      assertOptionalRefsSameEvent(EVENT_A, [
        { field: "wbs_id", eventId: EVENT_A },
        { field: "parent_task_id", eventId: EVENT_B },
      ]),
    ).toThrow(/parent_task_id/);
  });

  it("builds event-scoped storage paths", () => {
    const path = buildEventDocumentStoragePath(EVENT_A, DOC, "site.pdf", 1700000000000);
    expect(path).toBe(`${EVENT_A}/${DOC}/1700000000000-site.pdf`);
    expect(eventDocumentPathMatchesEvent(path, EVENT_A)).toBe(true);
    expect(eventDocumentPathMatchesEvent(path, EVENT_B)).toBe(false);
    expect(eventDocumentPathMatchesEvent("events/EVT-1/x.pdf", EVENT_A)).toBe(false);
  });
});
