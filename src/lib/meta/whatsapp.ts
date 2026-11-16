import { metaGraphBaseUrl, whatsappAccessToken, whatsappPhoneNumberId } from "./config";

export type WhatsappSendResult =
  | { ok: true; waMessageId: string }
  | { ok: false; error: string };

/** Send a WhatsApp Cloud API text message (official Graph API). */
export async function sendWhatsappText(input: {
  to: string;
  body: string;
  phoneNumberId?: string;
  accessToken?: string;
}): Promise<WhatsappSendResult> {
  const phoneNumberId = (input.phoneNumberId ?? whatsappPhoneNumberId()).trim();
  const accessToken = (input.accessToken ?? whatsappAccessToken()).trim();
  const to = input.to.replace(/\D/g, "");
  const body = input.body.trim();

  if (!phoneNumberId || !accessToken || !to || !body) {
    return {
      ok: false,
      error: "WhatsApp send missing phone number ID, access token, recipient, or body.",
    };
  }
  if (body.length > 4096) {
    return { ok: false, error: "WhatsApp text body exceeds 4096 characters." };
  }

  try {
    const response = await fetch(`${metaGraphBaseUrl()}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, error: payload.error?.message || `Meta Graph HTTP ${response.status}` };
    }
    return { ok: true, waMessageId: String(payload.messages?.[0]?.id ?? "") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "WhatsApp send failed" };
  }
}
