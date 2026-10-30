import { describe, expect, it } from "vitest";

import { RISK_SEVERITIES, RISK_STATUSES } from "@/lib/events/constants";
import { eventOpsUrls } from "@/lib/events/ops-link";

describe("event pm phase 1", () => {
  it("keeps risk enums usable for CRUD UI", () => {
    expect(RISK_SEVERITIES).toContain("critical");
    expect(RISK_STATUSES).toEqual(expect.arrayContaining(["open", "mitigating", "closed"]));
  });

  it("builds ops deep-links with eventId for consumers", () => {
    const urls = eventOpsUrls("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222");
    expect(urls.maintenance).toContain("eventId=11111111-1111-1111-1111-111111111111");
    expect(urls.newMaintenance).toContain("tab=new");
    expect(urls.people).toContain("eventId=11111111-1111-1111-1111-111111111111");
    expect(urls.people).toContain("tab=staff");
    expect(urls.roster).toContain("eventId=11111111-1111-1111-1111-111111111111");
  });
});
