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

/**
 * Update an in-progress TeXML call.
 * Telnyx expects Twilio-style `application/x-www-form-urlencoded` + CamelCase keys.
 * JSON bodies can return 200 while Status=completed is ignored (call stays in-progress).
 */
export async function updateTexmlCall(input: {
  apiKey: string;
  accountSid: string;
  callSid: string;
  texml?: string;
  url?: string;
  method?: "GET" | "POST";
  /** Set to `completed` to end the TeXML leg (needed before LiveKit outbound redial). */
  status?: "completed";
}): Promise<{ ok: boolean; detail: string; status?: string }> {
  const accountSid = input.accountSid.trim();
  const callSid = input.callSid.trim();
  if (!accountSid || !callSid) {
    return { ok: false, detail: "missing accountSid or callSid" };
  }
  const form = new URLSearchParams();
  if (input.status) form.set("Status", input.status);
  if (input.texml?.trim()) form.set("Texml", input.texml.trim());
  if (input.url?.trim()) {
    form.set("Url", input.url.trim());
    form.set("Method", input.method ?? "POST");
  }
  if (![...form.keys()].length) {
    return { ok: false, detail: "need Texml, Url, or Status" };
  }
  try {
    const response = await fetch(
      `https://api.telnyx.com/v2/texml/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(callSid)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
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
    let status = "";
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      status = extractTexmlCallStatus(json);
    } catch {
      // ignore
    }
    return { ok: true, detail: status ? `updated:${status}` : "updated", status };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "update failed" };
  }
}

const TEXML_ENDED = new Set(["completed", "busy", "failed", "no-answer", "canceled", "cancelled"]);

function extractTexmlCallStatus(json: Record<string, unknown> | null): string {
  if (!json) return "";
  const nested =
    json.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : null;
  const raw = json.status ?? json.Status ?? nested?.status ?? nested?.Status ?? "";
  return String(raw).toLowerCase();
}

/** Poll TeXML REST until the PSTN leg is fully cleared (avoids 486 on connect-back dial). */
export async function waitForTexmlCallEnded(input: {
  apiKey: string;
  accountSid: string;
  callSid: string;
  timeoutMs?: number;
}): Promise<{ ended: boolean; status: string }> {
  const accountSid = input.accountSid.trim();
  const callSid = input.callSid.trim();
  if (!accountSid || !callSid) return { ended: false, status: "" };
  const deadline = Date.now() + (input.timeoutMs ?? 12_000);
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `https://api.telnyx.com/v2/texml/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(callSid)}`,
        {
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      last = extractTexmlCallStatus(json);
      if (TEXML_ENDED.has(last)) return { ended: true, status: last };
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return { ended: false, status: last };
}

/** Best-effort: end TeXML leg via Status=completed, Hangup TeXML, and Call Control hangup. */
export async function forceReleaseTexmlLeg(input: {
  apiKey: string;
  accountSid: string;
  callSid: string;
  callControlId?: string;
}): Promise<{ ended: boolean; detail: string; status: string }> {
  const steps: string[] = [];

  // 1) Status=completed first — do NOT queue a Speak that keeps the leg "in-progress".
  const completed = await updateTexmlCall({
    apiKey: input.apiKey,
    accountSid: input.accountSid,
    callSid: input.callSid,
    status: "completed",
  });
  steps.push(`status=${completed.ok ? completed.status || "ok" : completed.detail}`);
  if (completed.status && TEXML_ENDED.has(completed.status)) {
    return { ended: true, detail: steps.join(";"), status: completed.status };
  }

  // 2) Immediate Hangup verb (no Say).
  const hangupOnly = await updateTexmlCall({
    apiKey: input.apiKey,
    accountSid: input.accountSid,
    callSid: input.callSid,
    texml: '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
  });
  steps.push(`hangup_xml=${hangupOnly.ok ? hangupOnly.status || "ok" : hangupOnly.detail}`);

  // 3) Call Control hangup — TeXML legs also expose call_control_id.
  const ccid = input.callControlId?.trim() || "";
  if (ccid) {
    try {
      const response = await fetch(
        `https://api.telnyx.com/v2/calls/${encodeURIComponent(ccid)}/actions/hangup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
          },
          body: "{}",
          cache: "no-store",
        },
      );
      steps.push(`cc_hangup=${response.status}`);
    } catch (e) {
      steps.push(`cc_hangup=${e instanceof Error ? e.message : "fail"}`);
    }
  }

  const waited = await waitForTexmlCallEnded({
    apiKey: input.apiKey,
    accountSid: input.accountSid,
    callSid: input.callSid,
    timeoutMs: 10_000,
  });
  steps.push(`poll=${waited.status || "unknown"}`);
  if (waited.ended) return { ended: true, detail: steps.join(";"), status: waited.status };

  // Final Status=completed nudge after Hangup/CC.
  const again = await updateTexmlCall({
    apiKey: input.apiKey,
    accountSid: input.accountSid,
    callSid: input.callSid,
    status: "completed",
  });
  steps.push(`status2=${again.ok ? again.status || "ok" : again.detail}`);
  const waited2 = await waitForTexmlCallEnded({
    apiKey: input.apiKey,
    accountSid: input.accountSid,
    callSid: input.callSid,
    timeoutMs: 6_000,
  });
  steps.push(`poll2=${waited2.status || "unknown"}`);
  return {
    ended: waited2.ended,
    detail: steps.join(";"),
    status: waited2.status || again.status || waited.status || "",
  };
}

export function publicTexmlUrl(path: string, requestUrl: string): string {
  const base = new URL(requestUrl);
  const secret = base.searchParams.get("secret");
  const url = new URL(path, `${base.protocol}//${base.host}`);
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}
