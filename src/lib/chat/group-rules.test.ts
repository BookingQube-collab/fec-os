import { describe, expect, it } from "vitest";

import { chatDmPairOrder } from "@/lib/chat/authorization";

import {
  CHAT_CREATE_HOURLY_LIMIT,
  CHAT_DIRECTORY_RESULT_CAP,
  chatAssignableMemberRole,
  chatCanMarkSensitive,
  chatCreateFieldError,
  chatDirectoryLikeTerm,
  chatRetentionShape,
  createConversationSchema,
  mapChatError,
} from "./group-rules";

describe("chat group kind rules", () => {
  it("requires a department for DEPARTMENT and a location for SITE", () => {
    expect(chatCreateFieldError({ kind: "DEPARTMENT", departmentId: null })).toBe("department");
    expect(chatCreateFieldError({ kind: "DEPARTMENT", departmentId: "8b6d5c4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d" })).toBeNull();
    expect(chatCreateFieldError({ kind: "SITE", locationId: null })).toBe("location");
    expect(chatCreateFieldError({ kind: "SITE", locationId: "8b6d5c4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d" })).toBeNull();
    expect(chatCreateFieldError({ kind: "PROJECT" })).toBeNull();
  });

  it("rejects direct and system kinds", () => {
    expect(chatCreateFieldError({ kind: "DIRECT" })).toBe("kind");
    expect(chatCreateFieldError({ kind: "SYSTEM" })).toBe("kind");
    expect(createConversationSchema.safeParse({ title: "Ops", kind: "DIRECT" }).success).toBe(false);
  });
});

describe("chat sensitive roles", () => {
  it("allows hr, ceo, and coo only", () => {
    expect(chatCanMarkSensitive(["hr"])).toBe(true);
    expect(chatCanMarkSensitive(["ceo"])).toBe(true);
    expect(chatCanMarkSensitive(["coo", "branch_gm"])).toBe(true);
    expect(chatCanMarkSensitive(["cfo"])).toBe(false);
    expect(chatCanMarkSensitive(["branch_gm"])).toBe(false);
    expect(chatCanMarkSensitive([])).toBe(false);
    expect(chatCreateFieldError({ kind: "PRIVATE", sensitive: true, roles: ["cfo"] })).toBe("sensitive");
    expect(chatCreateFieldError({ kind: "PRIVATE", sensitive: true, roles: ["hr"] })).toBeNull();
  });
});

describe("chat DM pair and membership rules", () => {
  it("orders the pair by uuid text and refuses one user", () => {
    const low = "11111111-1111-4111-8111-111111111111";
    const high = "22222222-2222-4222-8222-222222222222";
    expect(chatDmPairOrder(high, low)).toEqual({ userLow: low, userHigh: high });
    expect(() => chatDmPairOrder(low, low)).toThrow(/two users/);
  });

  it("keeps owner off the assignable role list", () => {
    expect(chatAssignableMemberRole("MEMBER")).toBe(true);
    expect(chatAssignableMemberRole("ADMIN")).toBe(true);
    expect(chatAssignableMemberRole("OWNER")).toBe(false);
    expect(chatAssignableMemberRole("DEPARTMENT")).toBe(false);
  });
});

describe("chat retention and directory limits", () => {
  it("requires an end only for custom retention", () => {
    expect(chatRetentionShape("FOREVER", null)).toBe(true);
    expect(chatRetentionShape("CUSTOM", null)).toBe(false);
    expect(chatRetentionShape("CUSTOM", "2026-12-01T00:00:00.000Z")).toBe(true);
    expect(CHAT_CREATE_HOURLY_LIMIT).toBe(20);
    expect(CHAT_DIRECTORY_RESULT_CAP).toBe(50);
  });

  it("drops filter characters and requires two searchable characters", () => {
    expect(chatDirectoryLikeTerm("a")).toBeNull();
    expect(chatDirectoryLikeTerm("%%")).toBeNull();
    expect(chatDirectoryLikeTerm("ab,cd")).toBe("abcd");
    expect(chatDirectoryLikeTerm("  Noor  Ali ")).toBe("Noor Ali");
  });
});

describe("mapChatError", () => {
  it("hides SQL text and ids from the database", () => {
    const leaked = "11111111-1111-4111-8111-111111111111";
    const message = mapChatError({
      message: `duplicate key value violates unique constraint "chat_dm_pairs_pkey"`,
      details: `Key (user_low)=(${leaked}) already exists.`,
    });
    expect(message).toBe("Chat request failed.");
    expect(message).not.toContain(leaked);
    expect(message).not.toContain("chat_dm_pairs");
    expect(mapChatError({ message: "this direct conversation is closed" })).toBe(
      "This direct conversation is closed.",
    );
    expect(mapChatError({ message: "Could not find the function public.chat_create_conversation in the schema cache" })).toBe(
      "Chat is not available yet. Apply the chat database migrations, then try again.",
    );
    expect(mapChatError({ message: "cannot set left_at on the last active owner" })).toMatch(/last owner/);
    expect(mapChatError({ message: "cannot change left_at" })).toMatch(/Department and site/);
  });
});
