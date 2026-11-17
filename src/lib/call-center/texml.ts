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
  /** Shorter pause so Answer→Dial picks up faster on the Redirect loop. */
  pauseSeconds?: number;
}): string {
  const voice = input.voice?.trim() || "Polly.Joanna";
  const hold = input.holdMusicUrl?.trim() ?? "";
  const pause = Math.max(1, Math.min(12, Math.floor(input.pauseSeconds ?? 3)));
  if (hold) {
    return texmlResponse(
      `<Play loop="1">${escapeTexml(hold)}</Play>` +
        `<Redirect method="POST">${escapeTexml(input.redirectUrl)}</Redirect>`,
    );
  }
  return texmlResponse(
    `<Say voice="${escapeTexml(voice)}">Please hold while we connect you.</Say>` +
      `<Pause length="${pause}"/>` +
      `<Redirect method="POST">${escapeTexml(input.redirectUrl)}</Redirect>`,
  );
}

/**
 * Bridge the live TeXML PSTN leg into LiveKit via SIP (no hangup + redial).
 * `sipUri` must be `sip:<room-user>@<livekit-sip-host>` for a callee dispatch rule.
 */
export function texmlDialSip(input: {
  sipUri: string;
  callerId?: string;
  voice?: string;
  timeoutSeconds?: number;
  /** After Dial fails / ends, redirect here (hold or hangup). */
  failureRedirectUrl?: string;
}): string {
  const voice = input.voice?.trim() || "Polly.Joanna";
  const timeout = Math.max(10, Math.min(60, Math.floor(input.timeoutSeconds ?? 30)));
  const callerId = input.callerId?.trim() ?? "";
  const dialAttrs = [
    `timeout="${timeout}"`,
    callerId ? `callerId="${escapeTexml(callerId)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const afterFail = input.failureRedirectUrl?.trim()
    ? `<Say voice="${escapeTexml(voice)}">We could not connect you just now. Please hold.</Say>` +
      `<Redirect method="POST">${escapeTexml(input.failureRedirectUrl.trim())}</Redirect>`
    : `<Say voice="${escapeTexml(voice)}">We could not connect you. Goodbye.</Say><Hangup/>`;
  return texmlResponse(
    `<Say voice="${escapeTexml(voice)}">Connecting you now.</Say>` +
      `<Dial ${dialAttrs}><Sip>${escapeTexml(input.sipUri.trim())}</Sip></Dial>` +
      afterFail,
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
  accountSid: string;
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
    accountSid:
      form.AccountSid?.trim() ||
      form.account_sid?.trim() ||
      process.env.TELNYX_ACCOUNT_SID?.trim() ||
      "",
    from: form.From?.trim() || form.from?.trim() || "",
    to: form.To?.trim() || form.to?.trim() || "",
    digits: (form.Digits ?? form.digits ?? "").trim(),
    callStatus: (form.CallStatus ?? form.call_status ?? form.Status ?? "").trim().toLowerCase(),
  };
}

/** Update an in-progress TeXML call with new instructions (interrupts Pause/Play). */
export async function updateTexmlCall(input: {
  apiKey: string;
  accountSid: string;
  callSid: string;
  texml?: string;
  url?: string;
  method?: "GET" | "POST";
}): Promise<{ ok: boolean; detail: string }> {
  const accountSid = input.accountSid.trim();
  const callSid = input.callSid.trim();
  if (!accountSid || !callSid) {
    return { ok: false, detail: "missing accountSid or callSid" };
  }
  const body: Record<string, string> = {};
  if (input.texml?.trim()) body.Texml = input.texml.trim();
  if (input.url?.trim()) {
    body.Url = input.url.trim();
    body.Method = input.method ?? "POST";
  }
  if (!body.Texml && !body.Url) {
    return { ok: false, detail: "need Texml or Url" };
  }
  try {
    const response = await fetch(
      `https://api.telnyx.com/v2/texml/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(callSid)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        ok: false,
        detail: `HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }
    return { ok: true, detail: "updated" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "update failed" };
  }
}

export function publicTexmlUrl(path: string, requestUrl: string): string {
  const base = new URL(requestUrl);
  const secret = base.searchParams.get("secret");
  const url = new URL(path, `${base.protocol}//${base.host}`);
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}
