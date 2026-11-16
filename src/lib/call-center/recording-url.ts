/** Join a public storage/CDN base with the LiveKit egress filepath. */
export function buildCallRecordingPublicUrl(
  baseUrl: string | null | undefined,
  callId: string,
  fallbackHost?: string,
): string {
  const path = `call-center/${callId}.mp4`;
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "");
  if (base) return `${base}/${path}`;
  const host = (fallbackHost ?? "").trim().replace(/\/+$/, "");
  if (host) return `${host}/recordings/${path}`;
  return `https://recordings.example/fec/cc/${callId}.mp4`;
}
