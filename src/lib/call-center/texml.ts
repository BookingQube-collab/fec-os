import "server-only";

/**
 * Telnyx TeXML helpers for inbound IVR.
 * Used when Call Control `Answer` returns 10007 — TeXML answers automatically and plays <Say>/<Gather>.
 */

export function escapeTexml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function texmlResponse(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

export function texmlGatherMenu(input: {
  actionUrl: string;
  /** Where to send the caller if gather times out (usually the inbound TeXML URL). */
  timeoutRedirectUrl: string;
  prompt: string;
  voice?: string;
}): string {
  const voice = input.voice?.trim() || "Polly.Joanna";
  const prompt = escapeTexml(input.prompt.trim() || "Please choose an option.");
  return texmlResponse(
    `<Gather numDigits="1" timeout="8" action="${escapeTexml(input.actionUrl)}" method="POST">` +
      `<Say voice="${escapeTexml(voice)}">${prompt}</Say>` +
      `</Gather>` +
      `<Say voice="${escapeTexml(voice)}">We did not receive any input.</Say>` +
      `<Redirect method="POST">${escapeTexml(input.timeoutRedirectUrl)}</Redirect>`,
  );
}

export function texmlQueueWait(input: {
  holdMusicUrl?: string;
  voice?: string;
  redirectUrl: string;
}): string {
  const voice = input.voice?.trim() || "Polly.Joanna";
  const hold = input.holdMusicUrl?.trim() ?? "";
  if (hold) {
    return texmlResponse(
      `<Play loop="3">${escapeTexml(hold)}</Play>` +
        `<Redirect method="POST">${escapeTexml(input.redirectUrl)}</Redirect>`,
    );
  }
  return texmlResponse(
    `<Say voice="${escapeTexml(voice)}">Please hold while we connect you.</Say>` +
      `<Pause length="8"/>` +
      `<Redirect method="POST">${escapeTexml(input.redirectUrl)}</Redirect>`,
  );
}

export function texmlHangup(message?: string, voice = "Polly.Joanna"): string {
  const say = message?.trim()
    ? `<Say voice="${escapeTexml(voice)}">${escapeTexml(message.trim())}</Say>`
    : "";
  return texmlResponse(`${say}<Hangup/>`);
}

/** Parse TeXML application/x-www-form-urlencoded or JSON webhook bodies. */
export function parseTexmlForm(rawBody: string, contentType: string | null): Record<string, string> {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const json = JSON.parse(rawBody) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(json)) {
        if (v == null) continue;
        out[k] = typeof v === "string" ? v : String(v);
      }
      return out;
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(rawBody);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export function texmlCallIds(form: Record<string, string>): {
  callControlId: string;
  callSid: string;
  from: string;
  to: string;
  digits: string;
  callStatus: string;
} {
  const callSid = form.CallSid?.trim() || form.call_sid?.trim() || "";
  const callControlId =
    form.CallControlId?.trim() || form.call_control_id?.trim() || callSid;
  return {
    callControlId,
    callSid: callSid || callControlId,
    from: form.From?.trim() || form.from?.trim() || "",
    to: form.To?.trim() || form.to?.trim() || "",
    digits: (form.Digits ?? form.digits ?? "").trim(),
    callStatus: (form.CallStatus ?? form.call_status ?? form.Status ?? "").trim().toLowerCase(),
  };
}

export function publicTexmlUrl(path: string, requestUrl: string): string {
  const base = new URL(requestUrl);
  const secret = base.searchParams.get("secret");
  const url = new URL(path, `${base.protocol}//${base.host}`);
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}
