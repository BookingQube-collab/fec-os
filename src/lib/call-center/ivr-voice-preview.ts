/** Browser TTS preview for IVR inspector / Test path (no Telnyx required). */

export type IvrPreviewLang = "en" | "ar";

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT = /[A-Za-z]/;
const NO_ARABIC_VOICE =
  "Arabic audio failed to play. Check network, or install an Arabic voice in Windows Settings → Time & language → Speech.";

let voicesCache: SpeechSynthesisVoice[] = [];
let voicesHooked = false;
/** Bumped on cancel so delayed speak/audio callbacks from an old session are ignored. */
let speakSession = 0;
let activeAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let arabicFallbackToastShown = false;

function hookVoices(): void {
  if (typeof window === "undefined" || !window.speechSynthesis || voicesHooked) return;
  voicesHooked = true;
  const refresh = () => {
    voicesCache = window.speechSynthesis.getVoices();
  };
  refresh();
  window.speechSynthesis.addEventListener("voiceschanged", refresh);
}

function listVoices(): SpeechSynthesisVoice[] {
  hookVoices();
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const live = window.speechSynthesis.getVoices();
  if (live.length) {
    voicesCache = live;
    return live;
  }
  return voicesCache;
}

function isArabicVoice(v: SpeechSynthesisVoice): boolean {
  const code = v.lang.toLowerCase().replaceAll("_", "-");
  const name = v.name.toLowerCase();
  return (
    code.startsWith("ar") ||
    name.includes("arabic") ||
    name.includes("عربي") ||
    name.includes("naayf") ||
    name.includes("hoda") ||
    name.includes("salma")
  );
}

/** Prefer a real Arabic TTS voice; never fall back to an English local voice. */
export function findIvrVoice(lang: IvrPreviewLang): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (!voices.length) return null;

  if (lang === "ar") {
    const arabic = voices.filter(isArabicVoice);
    if (!arabic.length) return null;
    return (
      arabic.find((v) => v.localService) ??
      arabic.find((v) => v.lang.toLowerCase().replaceAll("_", "-") === "ar-sa") ??
      arabic[0] ??
      null
    );
  }

  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("en") && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

/**
 * Prefer the caller's menu language. Only force Arabic when the text is
 * predominantly Arabic (avoid bilingual EN greetings that include one Arabic phrase).
 */
export function resolveIvrPreviewLang(
  text: string,
  preferred: IvrPreviewLang = "en",
): IvrPreviewLang {
  const ar = (text.match(ARABIC_SCRIPT) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (ar === 0) return preferred;
  if (latin === 0) return "ar";
  if (ar >= latin * 2) return "ar";
  if (latin >= ar * 2) return preferred === "ar" ? "ar" : "en";
  return preferred;
}

/** Split mixed EN/AR prompts so each run can use the right voice / fallback. */
export function splitIvrSpeechSegments(
  text: string,
  preferred: IvrPreviewLang = "en",
): Array<{ text: string; lang: IvrPreviewLang }> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const raw: Array<{ text: string; lang: IvrPreviewLang }> = [];
  let buf = "";
  let lang: IvrPreviewLang | null = null;

  for (const ch of trimmed) {
    const next: IvrPreviewLang | null = ARABIC_SCRIPT.test(ch)
      ? "ar"
      : LATIN_SCRIPT.test(ch)
        ? "en"
        : null;

    if (next && lang && next !== lang) {
      if (buf.trim()) raw.push({ text: buf.trim(), lang });
      buf = ch;
      lang = next;
      continue;
    }

    if (next) lang = lang ?? next;
    buf += ch;
  }

  if (buf.trim()) {
    raw.push({ text: buf.trim(), lang: lang ?? resolveIvrPreviewLang(buf, preferred) });
  }

  return raw.filter((p) => p.text.length > 0);
}

/**
 * Call from click/key handlers so later async Arabic <audio> play() is allowed.
 * Browsers revoke the user-gesture token after awaits / setTimeout.
 */
export function unlockIvrAudio(): void {
  if (typeof window === "undefined" || audioUnlocked) return;
  try {
    const silent = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA",
    );
    silent.volume = 0.01;
    void silent
      .play()
      .then(() => {
        audioUnlocked = true;
        silent.pause();
      })
      .catch(() => {
        /* still try later plays */
      });
  } catch {
    /* ignore */
  }
  try {
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
      window.speechSynthesis.cancel();
    }
  } catch {
    /* ignore */
  }
}

export function stopIvrVoicePreview(): void {
  if (typeof window === "undefined") return;
  speakSession += 1;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio.load();
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
}

function emitVoiceError(error: string): void {
  window.dispatchEvent(new CustomEvent("ivr-voice-preview-error", { detail: { error } }));
}

function emitVoiceInfo(message: string): void {
  window.dispatchEvent(new CustomEvent("ivr-voice-preview-info", { detail: { message } }));
}

function chunkText(text: string, max = 180): string[] {
  const clean = text.trim();
  if (clean.length <= max) return [clean];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length) {
    if (rest.length <= max) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(" ", max);
    if (cut < Math.floor(max * 0.4)) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return chunks.filter(Boolean);
}

function speakBrowser(
  text: string,
  lang: IvrPreviewLang,
  session: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (session !== speakSession || !window.speechSynthesis) {
      resolve();
      return;
    }
    // Hard guard: never feed Arabic script to an English voice (silent).
    if (lang === "en" && hasArabicScript(text)) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
    utterance.rate = 1;
    const voice = findIvrVoice(lang);
    if (voice) {
      utterance.voice = voice;
      if (voice.lang) utterance.lang = voice.lang;
    }
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.setTimeout(() => {
      if (session !== speakSession) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
      window.speechSynthesis.speak(utterance);
    }, 40);
  });
}

/** Same-origin proxy — Google TTS cannot be played cross-origin from the browser. */
async function playViaProxy(
  text: string,
  lang: IvrPreviewLang,
  session: number,
): Promise<boolean> {
  if (session !== speakSession) return false;
  try {
    const url =
      "/api/call-center/ivr-tts?lang=" +
      encodeURIComponent(lang) +
      "&text=" +
      encodeURIComponent(text);
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    if (!blob.size) return false;
    if (session !== speakSession) return false;

    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    activeAudio = audio;

    return await new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => {
        URL.revokeObjectURL(objectUrl);
        if (activeAudio === audio) activeAudio = null;
        resolve(ok && session === speakSession);
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      void audio
        .play()
        .then(() => {
          audioUnlocked = true;
        })
        .catch(() => finish(false));
    });
  } catch {
    return false;
  }
}

async function speakSegment(
  text: string,
  lang: IvrPreviewLang,
  session: number,
): Promise<void> {
  if (session !== speakSession) return;

  // If the segment contains Arabic, treat it as Arabic regardless of caller lang.
  const effective: IvrPreviewLang =
    lang === "ar" || (hasArabicScript(text) && resolveIvrPreviewLang(text, lang) === "ar")
      ? "ar"
      : "en";

  if (effective === "en") {
    if (findIvrVoice("en") || listVoices().length > 0) {
      await speakBrowser(text, "en", session);
      return;
    }
    for (const chunk of chunkText(text)) {
      if (session !== speakSession) return;
      const ok = await playViaProxy(chunk, "en", session);
      if (!ok) return;
    }
    return;
  }

  // Arabic: only use a real Arabic system voice; otherwise same-origin online TTS.
  // (Previously localService alone made English David look like an "Arabic" voice.)
  const arabicVoice = findIvrVoice("ar");
  if (arabicVoice) {
    await speakBrowser(text, "ar", session);
    return;
  }

  if (!arabicFallbackToastShown) {
    arabicFallbackToastShown = true;
    emitVoiceInfo("Playing Arabic with online TTS (no Arabic voice installed on this PC).");
  }

  for (const chunk of chunkText(text)) {
    if (session !== speakSession) return;
    const ok = await playViaProxy(chunk, "ar", session);
    if (!ok) {
      emitVoiceError(NO_ARABIC_VOICE);
      return;
    }
  }
}

/** Voices are often empty until voiceschanged — wait briefly before speaking. */
function whenVoicesReady(session: number, run: () => void): void {
  hookVoices();
  if (listVoices().length > 0) {
    if (session === speakSession) run();
    return;
  }
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    window.speechSynthesis.removeEventListener("voiceschanged", onChange);
    if (session === speakSession) run();
  };
  const onChange = () => {
    if (listVoices().length > 0) finish();
  };
  const timer = window.setTimeout(finish, 700);
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  void window.speechSynthesis.getVoices();
}

function expandParts(
  parts: Array<{ text: string; lang: IvrPreviewLang }>,
): Array<{ text: string; lang: IvrPreviewLang }> {
  const out: Array<{ text: string; lang: IvrPreviewLang }> = [];
  for (const part of parts) {
    const text = part.text.trim();
    if (!text) continue;
    const segments = splitIvrSpeechSegments(text, part.lang);
    if (segments.length) out.push(...segments);
    else out.push({ text, lang: resolveIvrPreviewLang(text, part.lang) });
  }
  return out;
}

export function playIvrVoicePreview(
  text: string,
  lang: IvrPreviewLang = "en",
): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined") {
    return { ok: false, error: "Voice preview only works in the browser." };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Nothing to speak — add greeting text first." };
  }
  if (!window.speechSynthesis) {
    return { ok: false, error: "This browser does not support speechSynthesis." };
  }

  unlockIvrAudio();
  stopIvrVoicePreview();
  const session = speakSession;

  whenVoicesReady(session, () => {
    void (async () => {
      for (const segment of expandParts([{ text: trimmed, lang }])) {
        if (session !== speakSession) return;
        await speakSegment(segment.text, segment.lang, session);
      }
    })();
  });
  return { ok: true };
}

/** Speak several prompts in sequence (live Test / Listen). */
export function playIvrVoicePreviewSequence(
  parts: Array<{ text: string; lang: IvrPreviewLang }>,
): { ok: true } | { ok: false; error: string } {
  const usable = expandParts(
    parts.map((p) => ({ text: p.text.trim(), lang: p.lang })).filter((p) => p.text),
  );
  if (usable.length === 0) {
    return { ok: false, error: "No spoken script on this path." };
  }
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return { ok: false, error: "This browser does not support speechSynthesis." };
  }

  unlockIvrAudio();
  stopIvrVoicePreview();
  const session = speakSession;

  whenVoicesReady(session, () => {
    void (async () => {
      for (const part of usable) {
        if (session !== speakSession) return;
        await speakSegment(part.text, part.lang, session);
      }
    })();
  });

  return { ok: true };
}
