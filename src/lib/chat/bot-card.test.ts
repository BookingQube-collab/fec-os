import { describe, expect, it } from "vitest";

import { parseBotCardFromMetadata } from "./bot-card";
import { emberChannelLabel } from "./display-rules";

describe("parseBotCardFromMetadata", () => {
  it("reads Slack attachment fields into a card", () => {
    const card = parseBotCardFromMetadata({
      bot: true,
      source: "slack_webhook",
      attachments: [
        {
          title: "Deployed web 1.8.0-rc.2 to staging",
          color: "#36a64f",
          fields: [
            { title: "Commit", value: "`8a1969f`" },
            { title: "Duration", value: "2m 14s" },
          ],
          footer: "Deploy Bot",
        },
      ],
    });
    expect(card).toMatchObject({
      title: "Deployed web 1.8.0-rc.2 to staging",
      fields: [
        { label: "Commit", value: "`8a1969f`" },
        { label: "Duration", value: "2m 14s" },
      ],
      footer: "Deploy Bot",
      color: "#36a64f",
    });
  });

  it("ignores non-bot metadata", () => {
    expect(parseBotCardFromMetadata({ attachments: [{ title: "x" }] })).toBeNull();
  });
});

describe("emberChannelLabel", () => {
  const label = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;

  it("prefixes rooms with #", () => {
    expect(emberChannelLabel({ kind: "GROUP", title: "Launch", peerName: null }, label)).toBe("#Launch");
  });

  it("leaves DMs unprefixed", () => {
    expect(emberChannelLabel({ kind: "DIRECT", title: null, peerName: "Sam Rivera" }, label)).toBe(
      "Sam Rivera",
    );
  });
});
