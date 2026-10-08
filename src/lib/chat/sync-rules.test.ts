import { describe, expect, it } from "vitest";

import { diffChatSyncMembers, type ChatSyncMember } from "./sync-rules";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const manual = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const deptMember = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const returning = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const departing = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const newbie = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const admin = "11111111-1111-4111-8111-111111111111";
const roleKept = "22222222-2222-4222-8222-222222222222";

function row(
  userId: string,
  source: ChatSyncMember["source"],
  role: ChatSyncMember["role"],
  left = false,
): ChatSyncMember {
  return { userId, source, role, left };
}

describe("diffChatSyncMembers", () => {
  const members: ChatSyncMember[] = [
    row(owner, "MANUAL", "OWNER"),
    row(manual, "MANUAL", "MEMBER"),
    row(admin, "DEPARTMENT", "ADMIN"),
    row(roleKept, "ROLE", "MEMBER"),
    row(deptMember, "DEPARTMENT", "MEMBER"),
    row(returning, "DEPARTMENT", "MEMBER", true),
    row(departing, "DEPARTMENT", "MEMBER"),
  ];

  const diff = diffChatSyncMembers("DEPARTMENT", [owner, manual, admin, deptMember, returning, newbie], members);

  it("adds a desired user who has no row", () => {
    expect(diff.add).toEqual([newbie]);
  });

  it("rejoins the same DEPARTMENT row when the person is assigned again", () => {
    expect(diff.rejoin).toEqual([returning]);
  });

  it("sets left on a DEPARTMENT member who is no longer assigned", () => {
    expect(diff.leave).toEqual([departing]);
  });

  it("leaves OWNER, MANUAL, ADMIN, and ROLE rows untouched", () => {
    expect(diff.untouched).toEqual([admin, deptMember, manual, owner, roleKept].sort());
    expect(diff.leave).not.toContain(owner);
    expect(diff.leave).not.toContain(manual);
    expect(diff.leave).not.toContain(admin);
    expect(diff.leave).not.toContain(roleKept);
    expect(diff.add).not.toContain(owner);
  });

  it("does not add someone who is absent from the desired assignment set", () => {
    const highRoleOnly = "99999999-9999-4999-8999-999999999999";
    const empty = diffChatSyncMembers("DEPARTMENT", [], [row(owner, "MANUAL", "OWNER")]);
    expect(empty.add).toEqual([]);
    expect(empty.leave).toEqual([]);
    expect(empty.untouched).toEqual([owner]);
    expect(diff.add).not.toContain(highRoleOnly);
  });

  it("does not let a SITE sync rewrite a DEPARTMENT row", () => {
    const site = diffChatSyncMembers("SITE", [], [row(deptMember, "DEPARTMENT", "MEMBER")]);
    expect(site.leave).toEqual([]);
    expect(site.untouched).toEqual([deptMember]);
  });

  it("sets left on a SITE member who lost every current site assignment", () => {
    const site = diffChatSyncMembers("SITE", [], [row(departing, "SITE", "MEMBER", false)]);
    expect(site.leave).toEqual([departing]);
  });

  it("clears left on the same SITE row when any current assignment returns", () => {
    const site = diffChatSyncMembers("SITE", [returning], [row(returning, "SITE", "READ_ONLY", true)]);
    expect(site.rejoin).toEqual([returning]);
    expect(site.add).toEqual([]);
  });

  it("keeps a SYSTEM row when a department sync runs", () => {
    const system = diffChatSyncMembers("DEPARTMENT", [], [row(roleKept, "SYSTEM", "MODERATOR")]);
    expect(system.leave).toEqual([]);
    expect(system.untouched).toEqual([roleKept]);
  });
});
