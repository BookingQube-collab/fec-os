import { describe, expect, it } from "vitest";

import { eventDocumentObjectPath, eventDocumentPathEventId, sanitizeEventFileName } from "@/lib/events/documents";

const EVENT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DOC = "ffffffff-0000-4000-8000-111111111111";

describe("event document storage paths", () => {
  it("sanitizes file names without path traversal", () => {
    expect(sanitizeEventFileName("../weird name.pdf")).toBe("..-weird_name.pdf");
    expect(sanitizeEventFileName("a/b\\c.xlsx")).toBe("a-b-c.xlsx");
  });

  it("scopes object keys to event_id first segment", () => {
    const path = eventDocumentObjectPath(EVENT, DOC, "Layout Final.pdf", 99);
    expect(path.startsWith(`${EVENT}/`)).toBe(true);
    expect(path).toContain(`/${DOC}/`);
    expect(eventDocumentPathEventId(path)).toBe(EVENT);
    expect(eventDocumentPathEventId("events/EVT-2026-0001/x.pdf")).toBeNull();
  });
});
