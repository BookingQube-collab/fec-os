import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import { toRouteResponse } from "@/lib/server/route-response";

describe("toRouteResponse", () => {
  it("passes through NextResponse with binary body instead of JSON {}", async () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    const file = new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="attendance.xlsx"',
      },
    });
    const out = toRouteResponse(file);
    expect(out).toBe(file);
    expect(out.headers.get("Content-Type")).toContain("spreadsheetml");
    const bytes = new Uint8Array(await out.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4]);
  });

  it("JSON-wraps plain objects", async () => {
    const out = toRouteResponse({ ok: true });
    expect(out.headers.get("Content-Type")).toContain("application/json");
    expect(await out.json()).toEqual({ ok: true });
  });
});
