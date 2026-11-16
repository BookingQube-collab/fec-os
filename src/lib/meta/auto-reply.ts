import { metaAutoReplyEnabled, metaAutoReplyText } from "./config";
import { sendInstagramText } from "./instagram";
import { sendWhatsappText } from "./whatsapp";

const recentMids = new Map<string, number>();
const MID_TTL_MS = 10 * 60 * 1000;
const MID_MAX = 2000;

function rememberMid(mid: string): boolean {
  const key = mid.trim();
  if (!key) return false;
  const now = Date.now();
  for (const [k, ts] of recentMids) {
    if (now - ts > MID_TTL_MS) recentMids.delete(k);
  }
  if (recentMids.has(key)) return true;
  recentMids.set(key, now);
  if (recentMids.size > MID_MAX) {
    const oldest = recentMids.keys().next().value;
    if (oldest) recentMids.delete(oldest);
  }
  return false;
}

export function isMetaAutoReplyEnabled(): boolean {
  return metaAutoReplyEnabled();
}

export function getMetaAutoReplyText(): string {
  return metaAutoReplyText();
}

export async function maybeAutoReplyWhatsapp(input: {
  toDigits: string;
  mid?: string;
  enabled?: boolean;
  text?: string;
}): Promise<{ attempted: boolean; sent: boolean; skipped?: string; error?: string }> {
  const enabled = input.enabled ?? isMetaAutoReplyEnabled();
  if (!enabled) return { attempted: false, sent: false, skipped: "disabled" };
  if (input.mid && rememberMid(`wa:${input.mid}`)) {
    return { attempted: false, sent: false, skipped: "duplicate" };
  }
  const text = (input.text ?? getMetaAutoReplyText()).trim();
  if (!text) return { attempted: false, sent: false, skipped: "empty_text" };

  const result = await sendWhatsappText({ to: input.toDigits, body: text });
  if (!result.ok) return { attempted: true, sent: false, error: result.error };
  return { attempted: true, sent: true };
}

export async function maybeAutoReplyInstagram(input: {
  recipientId: string;
  mid?: string;
  isEcho?: boolean;
  enabled?: boolean;
  text?: string;
  accessToken?: string;
  pageId?: string;
}): Promise<{ attempted: boolean; sent: boolean; skipped?: string; error?: string }> {
  const enabled = input.enabled ?? isMetaAutoReplyEnabled();
  if (!enabled) return { attempted: false, sent: false, skipped: "disabled" };
  if (input.isEcho) return { attempted: false, sent: false, skipped: "echo" };
  if (input.mid && rememberMid(`ig:${input.mid}`)) {
    return { attempted: false, sent: false, skipped: "duplicate" };
  }
  const text = (input.text ?? getMetaAutoReplyText()).trim();
  if (!text) return { attempted: false, sent: false, skipped: "empty_text" };

  const result = await sendInstagramText({
    recipientId: input.recipientId,
    body: text,
    accessToken: input.accessToken,
    pageId: input.pageId,
  });
  if (!result.ok) return { attempted: true, sent: false, error: result.error };
  return { attempted: true, sent: true };
}
