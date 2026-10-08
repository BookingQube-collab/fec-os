import { describe, expect, it } from "vitest";

import { canUserDo } from "@/lib/rbac";

import {
  chatCanAttach,
  chatCanCall,
  chatCanManageMembers,
  chatCanModerate,
  chatCanPost,
  chatCanSeePollVote,
  chatDmPairOrder,
  chatVisibleMessageContent,
  stripChatAuditMetadata,
  type ChatCallPolicy,
  type ChatFilePolicy,
  type ChatMemberRole,
  type ChatPostingPolicy,
} from "./authorization";

const ROLES: Array<ChatMemberRole | null> = ["OWNER", "ADMIN", "MODERATOR", "MEMBER", "READ_ONLY", null];

describe("chat posting policy", () => {
  it("matches the SQL decision table", () => {
    const cases: Array<[ChatPostingPolicy, ChatMemberRole | null, boolean]> = [];
    for (const role of ROLES) {
      const active = role != null && role !== "READ_ONLY";
      cases.push(["MEMBERS", role, active]);
      cases.push(["ADMINS_ONLY", role, role === "OWNER" || role === "ADMIN"]);
      cases.push(["READ_ONLY", role, false]);
    }
    for (const [policy, role, expected] of cases) {
      expect(chatCanPost(policy, role), `${policy} ${role}`).toBe(expected);
    }
  });
});

describe("chat file policy", () => {
  it("requires post permission and then the file policy", () => {
    const posting: ChatPostingPolicy[] = ["MEMBERS", "ADMINS_ONLY", "READ_ONLY"];
    const files: ChatFilePolicy[] = ["MEMBERS", "ADMINS_ONLY", "DISABLED"];
    for (const post of posting) {
      for (const file of files) {
        for (const role of ROLES) {
          const expected =
            chatCanPost(post, role) &&
            role != null &&
            file !== "DISABLED" &&
            (file === "MEMBERS" || role === "OWNER" || role === "ADMIN");
          expect(chatCanAttach(file, role, post), `${file} ${post} ${role}`).toBe(expected);
        }
      }
    }
  });
});

describe("chat call policy", () => {
  it("does not consult posting policy", () => {
    const calls: ChatCallPolicy[] = ["MEMBERS", "ADMINS_ONLY", "DISABLED"];
    for (const policy of calls) {
      for (const role of ROLES) {
        const expected =
          role != null &&
          role !== "READ_ONLY" &&
          policy !== "DISABLED" &&
          (policy === "MEMBERS" || role === "OWNER" || role === "ADMIN");
        expect(chatCanCall(policy, role), `${policy} ${role}`).toBe(expected);
      }
    }
    expect(chatCanCall("MEMBERS", "MEMBER")).toBe(true);
    expect(chatCanCall("ADMINS_ONLY", "MODERATOR")).toBe(false);
    expect(chatCanCall("DISABLED", "OWNER")).toBe(false);
  });
});

describe("chat role gates", () => {
  it("limits manage and moderate", () => {
    expect(chatCanManageMembers("OWNER")).toBe(true);
    expect(chatCanManageMembers("ADMIN")).toBe(true);
    expect(chatCanManageMembers("MODERATOR")).toBe(false);
    expect(chatCanModerate("MODERATOR")).toBe(true);
    expect(chatCanModerate("MEMBER")).toBe(false);
    expect(chatCanModerate(null)).toBe(false);
  });
});

describe("anonymous poll visibility", () => {
  const viewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

  it("hides other voters when anonymous, including from a member", () => {
    expect(
      chatCanSeePollVote({ anonymous: true, voteUserId: other, viewerUserId: viewer, isActiveMember: true }),
    ).toBe(false);
    expect(
      chatCanSeePollVote({ anonymous: true, voteUserId: viewer, viewerUserId: viewer, isActiveMember: true }),
    ).toBe(true);
    expect(
      chatCanSeePollVote({ anonymous: false, voteUserId: other, viewerUserId: viewer, isActiveMember: true }),
    ).toBe(true);
    expect(
      chatCanSeePollVote({ anonymous: false, voteUserId: other, viewerUserId: viewer, isActiveMember: false }),
    ).toBe(false);
  });
});

describe("DM pair ordering", () => {
  it("sorts user_low < user_high", () => {
    const low = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const high = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
    expect(chatDmPairOrder(high, low)).toEqual({ userLow: low, userHigh: high });
    expect(chatDmPairOrder(low.toUpperCase(), high)).toEqual({ userLow: low, userHigh: high });
    expect(() => chatDmPairOrder(low, low)).toThrow(/two users/);
  });
});

describe("deletion masking", () => {
  const body = "secret";
  const metadata = { body: "nested", keep: 1 };
  const deleter = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

  it("nulls EVERYONE content for every viewer and SELF content only for the deleter", () => {
    expect(
      chatVisibleMessageContent({
        body,
        metadata,
        contentHidden: true,
        deletionScope: "EVERYONE",
        deletedBy: other,
        viewerUserId: deleter,
      }),
    ).toEqual({ body: null, metadata: {} });

    expect(
      chatVisibleMessageContent({
        body,
        metadata,
        contentHidden: false,
        deletionScope: "SELF",
        deletedBy: deleter,
        viewerUserId: deleter,
      }),
    ).toEqual({ body: null, metadata: {} });

    expect(
      chatVisibleMessageContent({
        body,
        metadata,
        contentHidden: false,
        deletionScope: "SELF",
        deletedBy: deleter,
        viewerUserId: other,
      }),
    ).toEqual({ body, metadata });

    expect(
      chatVisibleMessageContent({
        body,
        metadata,
        contentHidden: false,
        deletionScope: null,
        deletedBy: null,
        viewerUserId: other,
      }),
    ).toEqual({ body, metadata });
  });
});

describe("audit metadata", () => {
  it("drops body and actor keys", () => {
    expect(stripChatAuditMetadata({ body: "nope", actor: "x", actor_id: "y", kind: "leave" })).toEqual({
      kind: "leave",
    });
    expect(stripChatAuditMetadata(undefined)).toEqual({});
  });
});

describe("chat capability defaults", () => {
  it("lets floor roles send and keeps group admin at branch_gm and hr", () => {
    expect(canUserDo(["technician"], "chat.view")).toBe(true);
    expect(canUserDo(["technician"], "chat.send")).toBe(true);
    expect(canUserDo(["cashier_host"], "chat.send")).toBe(true);
    expect(canUserDo(["duty_manager"], "chat.send")).toBe(true);
    expect(canUserDo(["customer_service"], "chat.send")).toBe(true);
    expect(canUserDo(["technician"], "chat.create_group")).toBe(false);
    expect(canUserDo(["duty_manager"], "chat.manage_members")).toBe(false);
    expect(canUserDo(["branch_gm"], "chat.create_group")).toBe(true);
    expect(canUserDo(["hr"], "chat.manage_members")).toBe(true);
    expect(canUserDo(["cfo"], "chat.create_group")).toBe(true);
  });
});
