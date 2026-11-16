/**
 * SendPulse chatbot → FEC bridge helpers (parse + auth + event classification).
 * Chatbot flows stay in SendPulse; FEC only receives webhook handoffs into contacts/tickets.
 *
 * Docs: https://sendpulse.com/integrations/api/chatbot/webhooks
 */

import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Local E.164-ish normalize so this module stays free of server-only DB imports (tests). */
export function normalizeSendPulsePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1).replace(/\D/g, "")}`;
  return `+${digits.replace(/\D/g, "")}`;
}

export type SendPulseBridgeEventTitle =
  | "new_subscriber"
  | "incoming_message"
  | "outgoing_message"
  | "failed_delivery"
  | "open_chat"
  | "run_custom_flow"
  | "link_click"
  | "unsubscribe"
  | "bot_block"
  | string;

export type SendPulseBridgeEvent = {
  title: string;
  service: string;
  date: number | null;
  botId: string;
  botName: string;
  contactId: string;
  contactName: string;
  phone: string;
  email: string;
  lastMessage: string;
  tags: string[];
  messageId: string;
  raw: Record<string, unknown>;
};

export type SendPulseBridgeAction = "ignore" | "contact_only" | "ticket";

const CONTACT_ONLY = new Set([
  "new_subscriber",
  "run_custom_flow",
  "link_click",
]);

const IGNORE = new Set(["outgoing_message", "failed_delivery", "unsubscribe", "bot_block"]);

const TICKET = new Set(["open_chat", "incoming_message"]);

export function classifySendPulseEvent(title: string): SendPulseBridgeAction {
  const key = title.trim().toLowerCase();
  if (!key) return "ticket";
  if (IGNORE.has(key)) return "ignore";
  if (CONTACT_ONLY.has(key)) return "contact_only";
  if (TICKET.has(key)) return "ticket";
  // Custom Action → "Send webhook" titles: treat as handoff tickets.
  return "ticket";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function pickPhone(...candidates: unknown[]): string {
  for (const c of candidates) {
    const raw = asString(c);
    if (!raw) continue;
    const normalized = normalizeSendPulsePhone(raw);
    if (normalized.replace(/\D/g, "").length >= 7) return normalized;
  }
  return "";
}

function pickEmail(...candidates: unknown[]): string {
  for (const c of candidates) {
    const raw = asString(c);
    if (raw.includes("@")) return raw.toLowerCase();
  }
  return "";
}

function extractMessageId(info: unknown): string {
  const root = asRecord(info);
  if (!root) return "";
  const message = asRecord(root.message);
  if (!message) return asString(root.message_id) || asString(root.id);
  const channel = asRecord(message.channel_data);
  const channelMessage = asRecord(channel?.message);
  return (
    asString(channel?.message_id) ||
    asString(channelMessage?.id) ||
    asString(message.id) ||
    asString(root.id)
  );
}

function parseOneEvent(item: unknown): SendPulseBridgeEvent | null {
  const root = asRecord(item);
  if (!root) return null;

  // Flat demo / custom CRM-style body
  if (!root.contact && (root.phone || root.email || root.event || root.title)) {
    const title = asString(root.event) || asString(root.title) || "handoff";
    const phone = pickPhone(root.phone, root.e164, root.from);
    const email = pickEmail(root.email);
    const contactId = asString(root.sendpulseContactId) || asString(root.contactId);
    const name = asString(root.name) || asString(root.customerName) || phone || email || "SendPulse contact";
    const lastMessage = asString(root.summary) || asString(root.last_message) || asString(root.message) || "";
    return {
      title,
      service: asString(root.service) || asString(root.channel) || "sendpulse",
      date: typeof root.date === "number" ? root.date : null,
      botId: asString(root.botId),
      botName: asString(root.botName),
      contactId,
      contactName: name,
      phone,
      email,
      lastMessage,
      tags: Array.isArray(root.tags) ? root.tags.map(String) : [],
      messageId: asString(root.messageId) || asString(root.id),
      raw: root,
    };
  }

  const contact = asRecord(root.contact);
  if (!contact && !asString(root.title)) return null;

  const variables = asRecord(contact?.variables) ?? {};
  const bot = asRecord(root.bot);
  const phone = pickPhone(
    contact?.phone,
    variables.Phone,
    variables.phone,
    variables.phone_number,
  );
  const email = pickEmail(contact?.email, variables.Email, variables.email);
  const name =
    asString(contact?.name) ||
    asString(variables.name) ||
    asString(contact?.username) ||
    phone ||
    email ||
    "SendPulse contact";

  return {
    title: asString(root.title) || "incoming_message",
    service: asString(root.service) || "sendpulse",
    date: typeof root.date === "number" ? root.date : null,
    botId: asString(bot?.id),
    botName: asString(bot?.name),
    contactId: asString(contact?.id),
    contactName: name,
    phone,
    email,
    lastMessage: asString(contact?.last_message),
    tags: Array.isArray(contact?.tags) ? contact!.tags.map(String) : [],
    messageId: extractMessageId(root.info),
    raw: root,
  };
}

/** SendPulse posts a JSON array; also accept a single object or `{ events: [...] }`. */
export function parseSendPulseWebhookBody(body: unknown): SendPulseBridgeEvent[] {
  if (Array.isArray(body)) {
    return body.map(parseOneEvent).filter((e): e is SendPulseBridgeEvent => Boolean(e));
  }
  const root = asRecord(body);
  if (!root) return [];
  if (Array.isArray(root.events)) {
    return root.events.map(parseOneEvent).filter((e): e is SendPulseBridgeEvent => Boolean(e));
  }
  const one = parseOneEvent(root);
  return one ? [one] : [];
}

export function buildSendPulseDedupeKey(event: SendPulseBridgeEvent): string {
  const title = event.title.trim().toLowerCase() || "event";
  if (event.messageId) return `sp:${title}:msg:${event.messageId}`;
  if (event.contactId && title === "open_chat") return `sp:open_chat:contact:${event.contactId}`;
  if (event.contactId && event.date != null) return `sp:${title}:contact:${event.contactId}:d:${event.date}`;
  if (event.contactId) return `sp:${title}:contact:${event.contactId}:${event.lastMessage.slice(0, 64)}`;
  const identity = event.phone || event.email || "anon";
  return `sp:${title}:${identity}:${event.date ?? "na"}:${event.lastMessage.slice(0, 48)}`;
}

/**
 * Auth for SendPulse inbound webhooks.
 * Effective secret: admin settings → SENDPULSE_WEBHOOK_SECRET → shared webhook secret / env.
 * SendPulse global webhooks typically cannot set custom headers — put `?secret=` on the URL.
 */
export function assertSendPulseWebhookAuth(
  request: Request,
  options: { expectedSecret: string } = { expectedSecret: "" },
): Response | null {
  const url = new URL(request.url);
  const isDemo = url.searchParams.get("demo") === "1";
  const expected =
    options.expectedSecret.trim() ||
    process.env.SENDPULSE_WEBHOOK_SECRET?.trim() ||
    process.env.CALL_CENTER_WEBHOOK_SECRET?.trim() ||
    "";

  if (!expected) {
    if (isDemo || process.env.NODE_ENV !== "production") return null;
    return Response.json(
      {
        ok: false,
        error:
          "SendPulse webhook secret not configured. Save it in Call Center Settings → SendPulse, or set SENDPULSE_WEBHOOK_SECRET.",
      },
      { status: 503 },
    );
  }

  if (isDemo) return null;

  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerSecret =
    request.headers.get("x-sendpulse-secret")?.trim() ||
    request.headers.get("x-call-center-secret")?.trim() ||
    url.searchParams.get("secret")?.trim() ||
    "";

  if ((bearer && safeEqual(bearer, expected)) || (headerSecret && safeEqual(headerSecret, expected))) {
    return null;
  }

  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export type ResolveSendPulseSecretInput = {
  /** Decrypted admin SendPulse webhook secret (preferred). */
  sendpulseWebhookSecret?: string | null;
  /** Legacy shared call-center webhook secret fallback. */
  webhookSharedSecret?: string | null;
};

/**
 * Resolve effective SendPulse webhook secret.
 * Order: admin SendPulse secret → SENDPULSE_WEBHOOK_SECRET → admin shared secret → CALL_CENTER_WEBHOOK_SECRET.
 */
export function resolveSendPulseWebhookSecret(
  input?: string | null | ResolveSendPulseSecretInput,
): string {
  if (typeof input === "string" || input == null) {
    // Backward-compatible: treat a bare string as admin SendPulse secret (or legacy shared).
    return (
      input?.trim() ||
      process.env.SENDPULSE_WEBHOOK_SECRET?.trim() ||
      process.env.CALL_CENTER_WEBHOOK_SECRET?.trim() ||
      ""
    );
  }
  return (
    input.sendpulseWebhookSecret?.trim() ||
    process.env.SENDPULSE_WEBHOOK_SECRET?.trim() ||
    input.webhookSharedSecret?.trim() ||
    process.env.CALL_CENTER_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

/** Digits-only compare so +974… and 974… match. */
export function sendPulsePhoneDigitsEqual(a: string, b: string): boolean {
  const left = normalizeSendPulsePhone(a).replace(/\D/g, "");
  const right = normalizeSendPulsePhone(b).replace(/\D/g, "");
  return left.length >= 7 && right.length >= 7 && left === right;
}

/** SendPulse chatbot WhatsApp business number (E.164). Must differ from FEC inbox number. */
export function resolveSendPulseWhatsappNumber(adminNumber?: string | null): string {
  return normalizeSendPulsePhone(
    adminNumber?.trim() ||
      process.env.SENDPULSE_WHATSAPP_NUMBER?.trim() ||
      process.env.SENDPULSE_WHATSAPP_E164?.trim() ||
      "",
  );
}

/**
 * FEC call-center WhatsApp display number (E.164).
 * Prefer CALL_CENTER_WHATSAPP_NUMBER; WHATSAPP_E164 is an alias.
 * (Meta phone_number_id is not an E.164 — set this explicitly for collision checks.)
 */
export function resolveCallCenterWhatsappNumber(): string {
  return normalizeSendPulsePhone(
    process.env.CALL_CENTER_WHATSAPP_NUMBER?.trim() ||
      process.env.WHATSAPP_E164?.trim() ||
      "",
  );
}

export type SendPulseWhatsappBridgePolicy = {
  /** Default separate: chatbot WA ≠ FEC inbox WA. */
  mode: "separate" | "shared";
  sendpulseNumber: string;
  callCenterNumber: string;
  numbersCollide: boolean;
  /** Only true when shared mode is explicitly enabled and numbers are not configured as different. */
  shouldMirrorInbox: boolean;
  warnings: string[];
};

/** Safe status for Call Center Settings (no secret values). */
export type SendPulseBridgePublicStatus = {
  secretConfigured: boolean;
  /** True when the effective secret comes from admin settings (not only env). */
  usesSavedSecret: boolean;
  sendpulseNumber: string;
  callCenterNumber: string;
  mode: "separate" | "shared";
  shouldMirrorInbox: boolean;
  warnings: string[];
  /** Copy-safe path — never embeds the real secret. */
  webhookPath: string;
};

export type SendPulseBridgeStatusInput = {
  sendpulseWebhookSecret?: string | null;
  webhookSharedSecret?: string | null;
  sendpulseWhatsappNumber?: string | null;
};

export function getSendPulseBridgePublicStatus(
  input?: string | null | SendPulseBridgeStatusInput,
  env: NodeJS.ProcessEnv = process.env,
): SendPulseBridgePublicStatus {
  const opts: SendPulseBridgeStatusInput =
    typeof input === "string" || input == null
      ? { sendpulseWebhookSecret: input }
      : input;
  const policy = getSendPulseWhatsappBridgePolicy(env, {
    sendpulseWhatsappNumber: opts.sendpulseWhatsappNumber,
  });
  const adminSecret = opts.sendpulseWebhookSecret?.trim() || "";
  const secretConfigured = Boolean(
    resolveSendPulseWebhookSecret({
      sendpulseWebhookSecret: adminSecret,
      webhookSharedSecret: opts.webhookSharedSecret,
    }),
  );
  const usesSavedSecret = Boolean(adminSecret);
  return {
    secretConfigured,
    usesSavedSecret,
    sendpulseNumber: policy.sendpulseNumber,
    callCenterNumber: policy.callCenterNumber,
    mode: policy.mode,
    shouldMirrorInbox: policy.shouldMirrorInbox,
    warnings: policy.warnings,
    // Never leak the real secret into the copy URL — placeholder always.
    webhookPath: usesSavedSecret
      ? "/api/public/call-center/sendpulse?secret=<saved-secret>"
      : "/api/public/call-center/sendpulse?secret=<SENDPULSE_WEBHOOK_SECRET>",
  };
}

/**
 * Default: separate WhatsApp numbers → contact/ticket only (no FEC inbox mirror).
 * Opt-in shared/same-number mirror: SENDPULSE_MIRROR_WHATSAPP_INBOX=true
 */
export function getSendPulseWhatsappBridgePolicy(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    sendpulseWhatsappNumber?: string | null;
    callCenterWhatsappNumber?: string | null;
  },
): SendPulseWhatsappBridgePolicy {
  const mirrorFlag = (env.SENDPULSE_MIRROR_WHATSAPP_INBOX ?? "").trim().toLowerCase();
  const sharedRequested = mirrorFlag === "1" || mirrorFlag === "true" || mirrorFlag === "yes";
  const sendpulseNumber = normalizeSendPulsePhone(
    options?.sendpulseWhatsappNumber?.trim() ||
      env.SENDPULSE_WHATSAPP_NUMBER?.trim() ||
      env.SENDPULSE_WHATSAPP_E164?.trim() ||
      "",
  );
  const callCenterNumber = normalizeSendPulsePhone(
    options?.callCenterWhatsappNumber?.trim() ||
      env.CALL_CENTER_WHATSAPP_NUMBER?.trim() ||
      env.WHATSAPP_E164?.trim() ||
      "",
  );
  const bothSet = Boolean(sendpulseNumber && callCenterNumber);
  const numbersCollide = bothSet && sendPulsePhoneDigitsEqual(sendpulseNumber, callCenterNumber);
  const numbersDiffer = bothSet && !numbersCollide;
  const warnings: string[] = [];

  if (!sharedRequested && numbersCollide) {
    warnings.push(
      "SendPulse and FEC WhatsApp numbers match, but separate-number mode is active. Use two different numbers (or set SENDPULSE_MIRROR_WHATSAPP_INBOX=true only if you intentionally share one number).",
    );
  }
  if (sharedRequested && numbersDiffer) {
    warnings.push(
      "SENDPULSE_MIRROR_WHATSAPP_INBOX is enabled but SENDPULSE_WHATSAPP_NUMBER and CALL_CENTER_WHATSAPP_NUMBER differ — inbox mirror skipped. Use separate numbers without mirror, or set both to the same number for shared mode.",
    );
  }

  const mode: "separate" | "shared" = sharedRequested && !numbersDiffer ? "shared" : "separate";
  const shouldMirrorInbox = mode === "shared";

  return {
    mode,
    sendpulseNumber,
    callCenterNumber,
    numbersCollide,
    shouldMirrorInbox,
    warnings,
  };
}
