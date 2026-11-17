const PLACEHOLDER_HOSTS = ["recordings.example", "example.com", "localhost"];

/** Join a public storage/CDN base with the LiveKit egress filepath. */
export function buildCallRecordingPublicUrl(
  baseUrl: string | null | undefined,
  callId: string,
): string {
  const path = `call-center/${callId}.mp4`;
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "");
  if (base) return `${base}/${path}`;
  // Placeholder is intentionally non-playable (see isUsableRecordingUrl).
  // Real URLs come from egress fileResults.location or a configured storage base.
  return `https://recordings.example/fec/cc/${callId}.mp4`;
}

/** True when a LiveKit Cloud host `/recordings/...` path was guessed (not a real file). */
export function isGuessedLiveKitRecordingUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith(".livekit.cloud") && host !== "livekit.cloud") return false;
    return parsed.pathname.includes("/recordings/");
  } catch {
    return false;
  }
}

/** True when the URL looks like a real media file we can fetch for playback / STT. */
export function isUsableRecordingUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  if (PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  if (isGuessedLiveKitRecordingUrl(trimmed)) return false;
  return true;
}
