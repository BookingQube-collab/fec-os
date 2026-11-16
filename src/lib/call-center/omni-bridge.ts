import "server-only";

import {
  insertOmniMessage,
  upsertOmniTicket,
  upsertPhoneContactFromOmni,
} from "./db";
import type { CallCenterOmniSource } from "./omni";
import type { CallCenterOmniMessage, CallCenterOmniTicket } from "./types";

export type OmniInboundHandoffInput = {
  source: CallCenterOmniSource;
  channel: string;
  /** Stable thread key — one ticket per thread (not per message). */
  externalThreadId: string;
  externalMessageId?: string;
  eventTitle?: string;
  customerName?: string;
  customerE164?: string;
  customerEmail?: string;
  customerExternalId?: string;
  summary?: string;
  lastMessage?: string;
  subject?: string;
  metadata?: Record<string, unknown>;
};

function threadDedupeKey(source: CallCenterOmniSource, threadId: string): string {
  return `${source}:thread:${threadId.trim()}`;
}

export async function ingestOmniInboundHandoff(
  input: OmniInboundHandoffInput,
): Promise<{
  contactId: string | null;
  ticket: CallCenterOmniTicket;
  message: CallCenterOmniMessage | null;
  duplicate: boolean;
  messageDuplicate: boolean;
}> {
  const threadId =
    input.externalThreadId.trim() ||
    input.customerExternalId?.trim() ||
    input.customerEmail?.trim() ||
    input.externalMessageId?.trim() ||
    "";
  if (!threadId) throw new Error("Omni inbound requires a thread identity.");

  let contactId: string | null = null;
  try {
    const contact = await upsertPhoneContactFromOmni({
      displayName: input.customerName ?? "",
      e164: input.customerE164,
      email: input.customerEmail,
      notes: input.lastMessage
        ? `${input.source}: ${input.lastMessage.slice(0, 400)}`
        : `${input.source} handoff`,
      tags: [input.source, input.channel].filter(Boolean),
      externalId: input.customerExternalId,
      sourceTag: input.source,
    });
    contactId = contact?.id ?? null;
  } catch {
    contactId = null;
  }

  const saved = await upsertOmniTicket({
    dedupeKey: threadDedupeKey(input.source, threadId),
    source: input.source,
    channel: input.channel,
    eventTitle: input.eventTitle ?? "inbound",
    contactId,
    externalThreadId: threadId,
    externalMessageId: input.externalMessageId,
    customerName: input.customerName,
    customerE164: input.customerE164,
    customerEmail: input.customerEmail,
    customerExternalId: input.customerExternalId,
    summary:
      input.summary ||
      input.subject ||
      `${input.source} inbound${input.channel ? ` / ${input.channel}` : ""}`,
    lastMessage: input.lastMessage,
    metadata: input.metadata,
    status: "open",
  });

  let message: CallCenterOmniMessage | null = null;
  let messageDuplicate = false;
  const body = (input.lastMessage ?? "").trim();
  if (body || input.externalMessageId) {
    try {
      const inserted = await insertOmniMessage({
        ticketId: saved.ticket.id,
        direction: "inbound",
        body: body || "[empty message]",
        subject: input.subject,
        externalMessageId: input.externalMessageId,
        status: "received",
        rawPayload: input.metadata ?? {},
      });
      message = inserted.message;
      messageDuplicate = inserted.duplicate;
    } catch {
      message = null;
    }
  }

  return {
    contactId,
    ticket: saved.ticket,
    message,
    duplicate: saved.duplicate,
    messageDuplicate,
  };
}
