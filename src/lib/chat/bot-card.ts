/** Structured Slack-ish card fields stored on bot webhook metadata. */

export type ChatBotCardField = {
  label: string;
  value: string;
};

export type ChatBotCard = {
  title: string | null;
  text: string | null;
  fields: ChatBotCardField[];
  footer: string | null;
  color: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Parse Slack attachment / Block Kit-ish payloads into a compact card model. */
export function parseBotCardFromMetadata(metadata: unknown): ChatBotCard | null {
  const meta = asRecord(metadata);
  if (!meta) return null;
  if (meta.bot !== true && meta.source !== "slack_webhook") return null;

  const direct = asRecord(meta.card);
  if (direct) {
    const fieldsRaw = Array.isArray(direct.fields) ? direct.fields : [];
    const fields = fieldsRaw.flatMap((row) => {
      const item = asRecord(row);
      if (!item) return [];
      const label = text(item.label) ?? text(item.title);
      const value = text(item.value);
      if (!label || !value) return [];
      return [{ label, value }];
    });
    const title = text(direct.title);
    const cardText = text(direct.text);
    const footer = text(direct.footer);
    if (!title && !cardText && fields.length === 0) return null;
    return {
      title,
      text: cardText,
      fields,
      footer,
      color: text(direct.color),
    };
  }

  const attachments = Array.isArray(meta.attachments) ? meta.attachments : [];
  const first = asRecord(attachments[0]);
  if (!first) return null;
  const fieldsRaw = Array.isArray(first.fields) ? first.fields : [];
  const fields = fieldsRaw.flatMap((row) => {
    const item = asRecord(row);
    if (!item) return [];
    const label = text(item.title) ?? text(item.label);
    const value = text(item.value);
    if (!label || !value) return [];
    return [{ label, value }];
  });
  const title = text(first.title) ?? text(first.fallback);
  const cardText = text(first.text) ?? text(first.pretext);
  const footer = text(first.footer);
  if (!title && !cardText && fields.length === 0) return null;
  return {
    title,
    text: cardText,
    fields,
    footer,
    color: text(first.color),
  };
}
