/** Browser TTS preview for IVR inspector / Test path (no Telnyx required). */

export type IvrPreviewLang = "en" | "ar";

export function stopIvrVoicePreview(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
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

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
  utterance.rate = 1;

  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) =>
      lang === "ar"
        ? v.lang.toLowerCase().startsWith("ar")
        : v.lang.toLowerCase().startsWith("en"),
    ) ?? null;
  if (preferred) utterance.voice = preferred;

  window.speechSynthesis.speak(utterance);
  return { ok: true };
}

/** Speak several prompts in sequence (Test path Listen). */
export function playIvrVoicePreviewSequence(
  parts: Array<{ text: string; lang: IvrPreviewLang }>,
): { ok: true } | { ok: false; error: string } {
  const usable = parts.filter((p) => p.text.trim());
  if (usable.length === 0) {
    return { ok: false, error: "No spoken script on this path." };
  }
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return { ok: false, error: "This browser does not support speechSynthesis." };
  }

  window.speechSynthesis.cancel();
  let index = 0;

  const speakNext = () => {
    if (index >= usable.length) return;
    const part = usable[index]!;
    index += 1;
    const utterance = new SpeechSynthesisUtterance(part.text.trim());
    utterance.lang = part.lang === "ar" ? "ar-SA" : "en-US";
    utterance.onend = () => speakNext();
    utterance.onerror = () => speakNext();
    window.speechSynthesis.speak(utterance);
  };

  speakNext();
  return { ok: true };
}
