/**
 * Telnyx TeXML helpers for inbound IVR.
 * Used when Call Control `Answer` returns 10007 — TeXML answers automatically and plays <Say>/<Gather>.
 */

import {
  DEFAULT_TTS_VOICE,
  buildSpeakPayload,
  isAzureTtsVoice,
  pickSpeakVoice,
  texmlAzureSayAttrs,
} from "./ivr-tts-voice";
import { refreshStaleE3ArabicPrompt } from "./e3-ivr-prompt";

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

/** Build `<Say>` with voice (+ language when useful for Azure/alice; Polly ignores language). */
function texmlSay(voice: string, text: string, language?: string): string {
  const spoken = refreshStaleE3ArabicPrompt(text).trim();
  if (!spoken) return "";
  const picked = pickSpeakVoice(spoken, voice);
  const lang = language?.trim() || picked.language;
  const langAttr = lang ? ` language="${escapeTexml(lang)}"` : "";
  const azureAttrs = texmlAzureSayAttrs(picked.voice);
  const body = isAzureTtsVoice(picked.voice)
    ? buildSpeakPayload(spoken, picked.voice).payload
    : escapeTexml(spoken);
  return `<Say voice="${escapeTexml(picked.voice)}"${langAttr}${azureAttrs}>${body}</Say>`;
}

export function texmlGatherMenu(input: {
  actionUrl: string;
  /** Where to send the caller if gather times out (usually the inbound TeXML URL). */
  timeoutRedirectUrl: string;
  prompt: string;
  voice?: string;
  language?: string;
}): string {
  const promptRaw = refreshStaleE3ArabicPrompt(input.prompt.trim() || "Please choose an option.");
  const picked = pickSpeakVoice(promptRaw, input.voice);
  const voice = picked.voice;
  const lang = input.language?.trim() || picked.language;
  const langAttr = lang ? ` language="${escapeTexml(lang)}"` : "";
  const azureAttrs = texmlAzureSayAttrs(voice);
  const prompt = isAzureTtsVoice(voice)
    ? buildSpeakPayload(promptRaw, voice).payload
    : escapeTexml(promptRaw);
  // Timeout line is English — use human EN Azure Ava (not Arabic Fatima).
  const timeoutVoice = DEFAULT_TTS_VOICE;
  const timeoutBody = buildSpeakPayload("We did not receive any input.", timeoutVoice).payload;
  return texmlResponse(
    `<Gather numDigits="1" timeout="8" action="${escapeTexml(input.actionUrl)}" method="POST">` +
      `<Say voice="${escapeTexml(voice)}"${langAttr}${azureAttrs}>${prompt}</Say>` +
      `</Gather>` +
      `<Say voice="${escapeTexml(timeoutVoice)}" language="en-US"${texmlAzureSayAttrs(timeoutVoice)}>${timeoutBody}</Say>` +
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
  const hold = input.holdMusicUrl?.trim() ?? "";
  const pause = Math.max(1, Math.min(12, Math.floor(input.pauseSeconds ?? 3)));
  if (hold) {
    return texmlResponse(
      `<Play loop="1">${escapeTexml(hold)}</Play>` +
        `<Redirect method="POST">${escapeTexml(input.redirectUrl)}</Redirect>`,
    );
  }
  const holdPrompt = "Please hold while we connect you.";
  return texmlResponse(
    texmlSay(input.voice?.trim() || DEFAULT_TTS_VOICE, holdPrompt) +
      `<Pause length="${pause}"/>` +
      `<Redirect method="POST">${escapeTexml(input.redirectUrl)}</Redirect>`,
  );
}

/** Put the live TeXML PSTN leg into a named conference (same call — no customer redial). */
export function texmlConference(input: {
  name: string;
  voice?: string;
  beep?: boolean;
  startConferenceOnEnter?: boolean;
  endConferenceOnExit?: boolean;
  waitUrl?: string;
  muted?: boolean;
  maxParticipants?: number;
  participantLabel?: string;
  /** Optional TTS before Dial (e.g. Qatar recording disclosure). */
  preSay?: string;
}): string {
  const name = input.name.trim();
  const voice = input.voice?.trim() || DEFAULT_TTS_VOICE;
  if (!name) {
    // Silent hangup — never speak Telnyx/Twilio-style "application error" copy from our side.
    return texmlHangup("", voice);
  }
  const max = Math.max(2, Math.min(250, Math.floor(input.maxParticipants ?? 2)));
  const attrs = [
    `beep="${input.beep === true ? "true" : "false"}"`,
    `startConferenceOnEnter="${input.startConferenceOnEnter === false ? "false" : "true"}"`,
    `endConferenceOnExit="${input.endConferenceOnExit === true ? "true" : "false"}"`,
    `maxParticipants="${max}"`,
    input.muted === true ? 'muted="true"' : "",
    input.participantLabel?.trim()
      ? `participantLabel="${escapeTexml(input.participantLabel.trim())}"`
      : "",
    input.waitUrl?.trim() ? `waitUrl="${escapeTexml(input.waitUrl.trim())}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const preface = texmlSay(voice, input.preSay ?? "");
  return texmlResponse(
    `${preface}<Dial><Conference ${attrs}>${escapeTexml(name)}</Conference></Dial>`,
  );
}

/**
 * Bridge the live TeXML PSTN leg into LiveKit via SIP (no hangup + redial).
 * `sipUri` must be `sip:<room-user>@<livekit-sip-host>` for a callee dispatch rule.
 * Prefer {@link texmlConference} + LiveKit outbound join when Telnyx→LiveKit inbound SIP times out.
 */
export function texmlDialSip(input: {
  sipUri: string;
  callerId?: string;
  voice?: string;
  timeoutSeconds?: number;
  /** After Dial fails / ends, redirect here (hold or hangup). */
  failureRedirectUrl?: string;
  /** Optional SIP digest auth for LiveKit inbound trunks that require it. */
  username?: string;
  password?: string;
  statusCallbackUrl?: string;
}): string {
  const voice = input.voice?.trim() || DEFAULT_TTS_VOICE;
  const timeout = Math.max(10, Math.min(90, Math.floor(input.timeoutSeconds ?? 55)));
  const callerId = input.callerId?.trim() ?? "";
  const dialAttrs = [
    `timeout="${timeout}"`,
    callerId ? `callerId="${escapeTexml(callerId)}"` : "",
    'answerOnBridge="true"',
  ]
    .filter(Boolean)
    .join(" ");
  const sipAttrs = [
    input.username?.trim() ? `username="${escapeTexml(input.username.trim())}"` : "",
    input.password?.trim() ? `password="${escapeTexml(input.password.trim())}"` : "",
    input.statusCallbackUrl?.trim()
      ? `statusCallback="${escapeTexml(input.statusCallbackUrl.trim())}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST"`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const afterFail = input.failureRedirectUrl?.trim()
    ? texmlSay(voice, "We could not connect you just now. Please hold.") +
      `<Redirect method="POST">${escapeTexml(input.failureRedirectUrl.trim())}</Redirect>`
    : `${texmlSay(voice, "We could not connect you. Goodbye.")}<Hangup/>`;
  // No Speak before Dial — keeps the PSTN leg free to bridge immediately.
  const sipOpen = sipAttrs ? `<Sip ${sipAttrs}>` : "<Sip>";
  return texmlResponse(
    `<Dial ${dialAttrs}>${sipOpen}${escapeTexml(input.sipUri.trim())}</Sip></Dial>` + afterFail,
  );
}

export function texmlHangup(message?: string, voice = DEFAULT_TTS_VOICE): string {
  const say = message?.trim() ? texmlSay(voice, message) : "";
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

function publicTexmlHangupUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : "");
  const origin = (fromEnv || "https://e3fec.vercel.app").replace(/\/$/, "");
  const secret =
    process.env.CALL_CENTER_WEBHOOK_SECRET?.trim() ||
    process.env.TELNYX_WEBHOOK_SECRET?.trim() ||
    "";
  const url = new URL("/api/public/call-center/texml/hangup", origin);
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}

/**
 * Best-effort end TeXML leg (agent Hangup / decline). Production: Status=completed may
 * return `accepted` while the call stays `in-progress`; inline Hangup can 404; Call
 * Control hangup often 422 on TeXML-only legs. Prefer Url→Hangup, then Status=completed,
 * then a short poll. Answer bridge no longer uses this — it keeps the PSTN leg alive.
 */
export async function forceReleaseTexmlLeg(input: {
  apiKey: string;
  accountSid: string;
  callSid: string;
  callControlId?: string;
  hangupUrl?: string;
}): Promise<{ ended: boolean; detail: string; status: string }> {
  const steps: string[] = [];
  const hangupUrl = input.hangupUrl?.trim() || publicTexmlHangupUrl();

  // 1) Url → Hangup document (interrupts Pause/Play/Redirect hold loop).
  const viaUrl = await updateTexmlCall({
    apiKey: input.apiKey,
    accountSid: input.accountSid,
    callSid: input.callSid,
    url: hangupUrl,
    method: "POST",
  });
  steps.push(`url_hangup=${viaUrl.ok ? viaUrl.status || "ok" : viaUrl.detail}`);

  // 2) Status=completed (response `accepted` = command ack, not call ended).
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

  // 3) Inline Hangup (may 404 after Status=completed — ignore).
  const hangupOnly = await updateTexmlCall({
    apiKey: input.apiKey,
    accountSid: input.accountSid,
    callSid: input.callSid,
    texml: '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
  });
  steps.push(`hangup_xml=${hangupOnly.ok ? hangupOnly.status || "ok" : hangupOnly.detail}`);

  // 4) Call Control hangup — often 422 on pure TeXML legs; still try.
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

  // Short poll only — do not block hangup UX for 20s+ on stuck in-progress.
  const waited = await waitForTexmlCallEnded({
    apiKey: input.apiKey,
    accountSid: input.accountSid,
    callSid: input.callSid,
    timeoutMs: 4_000,
  });
  steps.push(`poll=${waited.status || "unknown"}`);
  return {
    ended: waited.ended,
    detail: steps.join(";"),
    status: waited.status || completed.status || "",
  };
}

export function publicTexmlUrl(path: string, requestUrl: string): string {
  const base = new URL(requestUrl);
  const secret = base.searchParams.get("secret");
  const url = new URL(path, `${base.protocol}//${base.host}`);
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}
