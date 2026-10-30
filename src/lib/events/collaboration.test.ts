import { describe, expect, it } from "vitest";

import {
  formatStaffMentionToken,
  meetingActionCanLinkTask,
  meetingActionTaskTitle,
  normalizeMeetingActionStatus,
  parseMentions,
  resolveMentionStaffIds,
  wikiSlugOrDefault,
} from "@/lib/events/collaboration";

const staff = [
  { id: "11111111-1111-4111-8111-111111111111", full_name: "Ada Lovelace" },
  { id: "22222222-2222-4222-8222-222222222222", full_name: "Ada" },
  { id: "33333333-3333-4333-8333-333333333333", full_name: "Grace Hopper" },
];

describe("event pm phase 6 collaboration", () => {
  it("parses explicit staff mention tokens", () => {
    const id = staff[0].id;
    const body = `Please review ${formatStaffMentionToken(id)} thanks`;
    const { staffIds, hits } = parseMentions(body, staff);
    expect(staffIds).toEqual([id]);
    expect(hits[0]?.kind).toBe("explicit");
    expect(hits[0]?.staffId).toBe(id);
  });

  it("parses @staff:uuid form", () => {
    const id = staff[2].id;
    const { staffIds } = parseMentions(`Ping @staff:${id}`, staff);
    expect(staffIds).toEqual([id]);
  });

  it("matches longest staff name for @Name mentions", () => {
    const { staffIds, hits } = parseMentions("Hi @Ada Lovelace and team", staff);
    expect(staffIds).toEqual([staff[0].id]);
    expect(hits[0]?.kind).toBe("name");
    // Should prefer "Ada Lovelace" over shorter "Ada"
    expect(hits[0]?.raw.toLowerCase()).toContain("ada lovelace");
  });

  it("matches short name when not subsumed", () => {
    const { staffIds } = parseMentions("Hey @Ada — quick question", staff);
    expect(staffIds).toEqual([staff[1].id]);
  });

  it("dedupes and merges extra ids via resolveMentionStaffIds", () => {
    const id = staff[0].id;
    const extra = staff[2].id;
    const ids = resolveMentionStaffIds(`cc ${formatStaffMentionToken(id)}`, staff, [extra, id, null]);
    expect(ids.sort()).toEqual([id, extra].sort());
  });

  it("gates meeting-action → task linking", () => {
    expect(meetingActionCanLinkTask({ status: "open", task_id: null })).toBe(true);
    expect(meetingActionCanLinkTask({ status: "open", task_id: "t1" })).toBe(false);
    expect(meetingActionCanLinkTask({ status: "done", task_id: null })).toBe(false);
    expect(normalizeMeetingActionStatus("weird")).toBe("open");
    expect(normalizeMeetingActionStatus("done")).toBe("done");
  });

  it("builds meeting action task titles", () => {
    expect(meetingActionTaskTitle("Kickoff", "Book venue")).toBe("Kickoff: Book venue");
    expect(meetingActionTaskTitle("", "")).toBe("Meeting: Action");
  });

  it("normalizes wiki slug", () => {
    expect(wikiSlugOrDefault(null)).toBe("notes");
    expect(wikiSlugOrDefault("Notes")).toBe("notes");
    expect(wikiSlugOrDefault("bad slug!!")).toBe("notes");
    expect(wikiSlugOrDefault("runbook")).toBe("runbook");
  });
});
