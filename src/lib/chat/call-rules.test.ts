import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { mapChatError } from "./group-rules";
import {
  chatCallCloseValues,
  chatCallDisabledReason,
  chatCallInsertValues,
  chatCallParticipantValues,
  chatUserMaySetCallStatus,
  participantOutcomeForResponse,
} from "./call-rules";

const conversationId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000011";

describe("call write payloads", () => {
  it("never sends the recording flag", () => {
    const inserted = chatCallInsertValues(conversationId, "VIDEO", userId);
    const joined = chatCallParticipantValues(conversationId, userId, "JOINED");
    const accepted = chatCallParticipantValues(conversationId, userId, "ACCEPTED");
    const rejected = chatCallParticipantValues(conversationId, userId, "REJECTED");
    const cancelled = chatCallCloseValues("CANCELLED");
    const ended = chatCallCloseValues("ENDED", "2026-10-02T00:00:00.000Z");
    for (const payload of [inserted, joined, accepted, rejected, cancelled, ended]) {
      expect(payload).not.toHaveProperty("recording_enabled");
      expect(JSON.stringify(payload)).not.toMatch(/recording_enabled"\s*:\s*true/);
    }
    expect(inserted.provider).toBe("NONE");
    expect(inserted).not.toHaveProperty("room_name");
    expect(cancelled.provider).toBe("NONE");
    expect(ended.provider).toBe("NONE");
    expect(ended.status).toBe("ENDED");
  });

  it("does not send recording_enabled from the call actions or provider", () => {
    const files = [
      "../chat.functions.ts",
      "./call-provider.ts",
      "./call-rules.ts",
      "../../components/chat/call-overlay.tsx",
      "../../components/chat/call-controls.tsx",
      "../../components/chat/incoming-call.tsx",
      "../../components/chat/call-history.tsx",
      "../../components/chat/use-conversation-calls.ts",
    ];
    for (const file of files) {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/recording_enabled\s*:/);
      expect(source).not.toMatch(/getUserMedia/);
      expect(source).not.toMatch(/mediaDevices/);
    }
  });

  it("keeps callee rejection off the call status column", () => {
    expect(participantOutcomeForResponse("ACCEPT")).toBe("ACCEPTED");
    expect(participantOutcomeForResponse("REJECT")).toBe("REJECTED");
    expect(chatUserMaySetCallStatus("REJECTED")).toBe(false);
    expect(chatUserMaySetCallStatus("MISSED")).toBe(false);
    expect(chatUserMaySetCallStatus("ACTIVE")).toBe(false);
    expect(chatUserMaySetCallStatus("CANCELLED")).toBe(true);
    expect(chatUserMaySetCallStatus("ENDED")).toBe(true);
  });
});

describe("call button access", () => {
  it("names why a member cannot start a call", () => {
    expect(chatCallDisabledReason("MEMBERS", "MEMBER", false)).toBe("send");
    expect(chatCallDisabledReason("MEMBERS", "READ_ONLY", true)).toBe("role");
    expect(chatCallDisabledReason("DISABLED", "MEMBER", true)).toBe("policy");
    expect(chatCallDisabledReason("ADMINS_ONLY", "MEMBER", true)).toBe("admins");
    expect(chatCallDisabledReason("ADMINS_ONLY", "ADMIN", true)).toBeNull();
    expect(chatCallDisabledReason("MEMBERS", "MEMBER", true)).toBeNull();
  });
});

describe("call database errors", () => {
  it("maps call failures to short text and drops token-like details", () => {
    const leaked = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";
    const message = mapChatError({
      message: "call provider must be NONE",
      details: leaked,
    });
    expect(message).toBe("That call could not be saved.");
    expect(message).not.toContain(leaked);
    expect(mapChatError({ message: "call recording is disabled in this phase" })).toBe(
      "Call recording is not available.",
    );
    expect(mapChatError({ message: "status can only move to CANCELLED or ENDED" })).toBe(
      "That call can no longer be changed.",
    );
    expect(mapChatError({ message: "call is already closed" })).toBe("That call has already ended.");
  });
});
