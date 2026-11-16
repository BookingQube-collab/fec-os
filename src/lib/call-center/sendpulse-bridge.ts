import "server-only";

import {
  upsertPhoneContactFromSendPulse,
  upsertSendpulseTicket,
  upsertWhatsappInboundMessage,
} from "./db";
import {
  buildSendPulseDedupeKey,
  classifySendPulseEvent,
  getSendPulseWhatsappBridgePolicy,
  parseSendPulseWebhookBody,
  type SendPulseBridgeEvent,
  type SendPulseWhatsappBridgePolicy,
} from "./sendpulse";
import type { CallCenterPhoneContact, CallCenterSendpulseTicket } from "./types";

export type SendPulseBridgeResultItem = {
  title: string;
  action: "ignore" | "contact_only" | "ticket";
  duplicate: boolean;
  contactId: string | null;
  ticketId: string | null;
  whatsappConversationId: string | null;
  skipped?: string;
};

async function maybeMirrorWhatsappInbox(
  event: SendPulseBridgeEvent,
  policy: SendPulseWhatsappBridgePolicy,
): Promise<{ conversationId: string | null; skipped?: string }> {
  if (event.service.trim().toLowerCase() !== "whatsapp") {
    return { conversationId: null };
  }
  if (!policy.shouldMirrorInbox) {
    return {
      conversationId: null,
      skipped: "whatsapp_mirror_disabled_separate_numbers",
    };
  }

  const waId =
    event.contactId ||
    event.phone.replace(/\D/g, "") ||
    event.email ||
    "";
  if (!waId) return { conversationId: null, skipped: "missing_wa_identity" };

  const body =
    event.lastMessage.trim() ||
    `[SendPulse ${event.title}] handoff`;
  const messageId =
    event.messageId ||
    (event.title === "open_chat" && event.contactId
      ? `sp-open-chat-${event.contactId}`
      : `sp-${buildSendPulseDedupeKey(event)}`);

  const result = await upsertWhatsappInboundMessage({
    waId: `sp:${waId}`,
    customerE164: event.phone,
    customerName: event.contactName,
    body: body.slice(0, 2000),
    waMessageId: messageId.slice(0, 200),
    rawPayload: {
      source: "sendpulse",
      whatsappMode: policy.mode,
      ...event.raw,
    },
  });
  return { conversationId: result.conversation.id };
}

export async function processSendPulseWebhookBody(body: unknown): Promise<{
  results: SendPulseBridgeResultItem[];
  processed: number;
  whatsappPolicy: SendPulseWhatsappBridgePolicy;
}> {
  const events = parseSendPulseWebhookBody(body);
  const results: SendPulseBridgeResultItem[] = [];
  const whatsappPolicy = getSendPulseWhatsappBridgePolicy();

  for (const event of events) {
    const action = classifySendPulseEvent(event.title);
    if (action === "ignore") {
      results.push({
        title: event.title,
        action,
        duplicate: false,
        contactId: null,
        ticketId: null,
        whatsappConversationId: null,
        skipped: "event_ignored",
      });
      continue;
    }

    let contact: CallCenterPhoneContact | null = null;
    try {
      contact = await upsertPhoneContactFromSendPulse({
        displayName: event.contactName,
        e164: event.phone,
        email: event.email,
        notes:
          event.lastMessage
            ? `SendPulse ${event.title}: ${event.lastMessage.slice(0, 400)}`
            : `SendPulse ${event.title}`,
        tags: ["sendpulse", ...(event.tags ?? [])],
        sendpulseContactId: event.contactId,
      });
    } catch {
      contact = null;
    }

    if (action === "contact_only") {
      results.push({
        title: event.title,
        action,
        duplicate: false,
        contactId: contact?.id ?? null,
        ticketId: null,
        whatsappConversationId: null,
      });
      continue;
    }

    if (!event.phone && !event.email && !event.contactId) {
      results.push({
        title: event.title,
        action,
        duplicate: false,
        contactId: null,
        ticketId: null,
        whatsappConversationId: null,
        skipped: "missing_identity",
      });
      continue;
    }

    let whatsappConversationId: string | null = null;
    let mirrorSkipped: string | undefined;
    try {
      const mirrored = await maybeMirrorWhatsappInbox(event, whatsappPolicy);
      whatsappConversationId = mirrored.conversationId;
      mirrorSkipped = mirrored.skipped;
    } catch {
      whatsappConversationId = null;
      mirrorSkipped = "whatsapp_mirror_failed";
    }

    const dedupeKey = buildSendPulseDedupeKey(event);
    const summary =
      event.title === "open_chat"
        ? `Live chat handoff via SendPulse (${event.service || "chat"})`
        : `SendPulse ${event.title}${event.service ? ` / ${event.service}` : ""}`;

    let ticket: CallCenterSendpulseTicket | null = null;
    let duplicate = false;
    try {
      const saved = await upsertSendpulseTicket({
        dedupeKey,
        eventTitle: event.title,
        service: event.service,
        contactId: contact?.id ?? null,
        sendpulseContactId: event.contactId,
        sendpulseBotId: event.botId,
        customerName: event.contactName,
        customerE164: event.phone,
        customerEmail: event.email,
        summary,
        lastMessage: event.lastMessage,
        whatsappConversationId,
        metadata: {
          source: "sendpulse",
          botName: event.botName,
          date: event.date,
          messageId: event.messageId,
          whatsappMode: whatsappPolicy.mode,
          whatsappMirror: whatsappPolicy.shouldMirrorInbox,
          raw: event.raw,
        },
        status: "open",
      });
      ticket = saved.ticket;
      duplicate = saved.duplicate;
    } catch (err) {
      results.push({
        title: event.title,
        action,
        duplicate: false,
        contactId: contact?.id ?? null,
        ticketId: null,
        whatsappConversationId,
        skipped: err instanceof Error ? err.message : "ticket_failed",
      });
      continue;
    }

    results.push({
      title: event.title,
      action,
      duplicate,
      contactId: contact?.id ?? null,
      ticketId: ticket.id,
      whatsappConversationId,
      skipped: whatsappConversationId ? undefined : mirrorSkipped,
    });
  }

  return { results, processed: results.length, whatsappPolicy };
}
