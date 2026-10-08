import { describe, expect, it } from "vitest";

import {
  CHAT_SEARCH_LIMIT_MAX,
  CHAT_SEARCH_QUERY_MAX,
  CHAT_SEARCH_SNIPPET_MAX,
  chatSearchDateBound,
  chatSearchIlikeValue,
  chatSearchLikePattern,
  chatSearchMessageTypes,
  chatSearchMimeOrFilter,
  chatSearchMimePrefixes,
  chatSearchQueryIssue,
  chatSearchSnippet,
  searchChatSchema,
} from "./search-rules";

describe("chat search query length", () => {
  it("accepts 2 to 80 characters and rejects shorter, longer, and unsafe leftovers", () => {
    expect(chatSearchQueryIssue("  ab  ")).toBeNull();
    expect(chatSearchQueryIssue("a")).toBe("short");
    expect(chatSearchQueryIssue("")).toBe("short");
    expect(chatSearchQueryIssue("a".repeat(CHAT_SEARCH_QUERY_MAX))).toBeNull();
    expect(chatSearchQueryIssue("a".repeat(CHAT_SEARCH_QUERY_MAX + 1))).toBe("long");
    expect(searchChatSchema.safeParse({ query: "a" }).success).toBe(false);
    expect(searchChatSchema.safeParse({ query: "" }).success).toBe(false);
    expect(searchChatSchema.safeParse({ query: " " }).success).toBe(false);
    expect(searchChatSchema.safeParse({ query: "  Phase  " }).success).toBe(true);
    expect(searchChatSchema.safeParse({ query: "Phase", limit: CHAT_SEARCH_LIMIT_MAX + 1 }).success).toBe(false);
    expect(searchChatSchema.safeParse({ query: "Phase" }).data?.limit).toBe(20);
    expect(chatSearchLikePattern("Phase")).toBe('"*Phase*"');
    expect(chatSearchIlikeValue("  Phase  ")).toBe("%Phase%");
    expect(chatSearchLikePattern("!!")).toBeNull();
    expect(chatSearchIlikeValue("<b>")).toBeNull();
  });
});

describe("chat search snippet", () => {
  it("strips tags and cuts on code points without keeping markup", () => {
    expect(chatSearchSnippet("  hello   world  ")).toBe("hello world");
    expect(chatSearchSnippet("see <b>Phase</b> now")).toBe("see Phase now");
    expect(chatSearchSnippet("<script>alert(1)</script>")).toBe("alert(1)");
    const forged = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<svg onload=alert(1)>click</svg>",
      "\"><script>alert(1)</script>",
      "<iframe src=\"javascript:alert(1)\"></iframe>",
    ];
    for (const html of forged) {
      const snippet = chatSearchSnippet(html);
      expect(snippet).not.toMatch(/<[^>]*>/);
      expect(snippet.includes("<")).toBe(false);
      expect(snippet.includes(">")).toBe(false);
    }
    expect(chatSearchSnippet("3 < 4")).toBe("3 4");
    const long = `Phase ${"ن".repeat(200)}`;
    const clipped = chatSearchSnippet(long);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.includes("<")).toBe(false);
    expect(Array.from(clipped).length).toBe(CHAT_SEARCH_SNIPPET_MAX + 1);
    expect(chatSearchSnippet("Phase")).not.toContain("…");
  });
});

describe("chat search file type", () => {
  it("maps each file type to a message type and a mime prefix", () => {
    expect(chatSearchMessageTypes("image")).toEqual(["IMAGE"]);
    expect(chatSearchMimePrefixes("image")).toEqual(["image/"]);
    expect(chatSearchMessageTypes("video")).toEqual(["VIDEO"]);
    expect(chatSearchMimePrefixes("video")).toEqual(["video/"]);
    expect(chatSearchMessageTypes("audio")).toEqual(["AUDIO"]);
    expect(chatSearchMimePrefixes("audio")).toEqual(["audio/"]);
    expect(chatSearchMessageTypes("voice")).toEqual(["VOICE_NOTE"]);
    expect(chatSearchMimePrefixes("voice")).toEqual(["audio/"]);
    expect(chatSearchMessageTypes("document")).toEqual(["DOCUMENT"]);
    expect(chatSearchMimePrefixes("document")).toEqual(["application/", "text/"]);
    expect(chatSearchMimeOrFilter("document")).toBe(
      'mime_type.ilike."application/*",mime_type.ilike."text/*"',
    );
    expect(chatSearchMimeOrFilter("image")).not.toContain("offset");
  });
});

describe("chat search dates", () => {
  it("expands a date-only bound to the UTC day", () => {
    expect(chatSearchDateBound("2026-10-02", "from")).toBe("2026-10-02T00:00:00.000Z");
    expect(chatSearchDateBound("2026-10-02", "to")).toBe("2026-10-02T23:59:59.999Z");
    expect(chatSearchDateBound("2026-10-02T15:04:05.000Z", "from")).toBe("2026-10-02T15:04:05.000Z");
  });
});
