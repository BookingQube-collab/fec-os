const PLACEHOLDER_HOSTS = ["recordings.example", "example.com", "localhost"];

/** Join a public storage/CDN base with the LiveKit egress filepath. */
export function buildCallRecordingPublicUrl(
  baseUrl: string | null | undefined,
  callId: string,
): string {
  const path = `call-center/${callId}.mp4`;
  const base = normalizeRecordingStorageBaseUrl(baseUrl) ?? "";
  if (base) return `${base}/${path}`;
  // Placeholder is intentionally non-playable (see isUsableRecordingUrl).
  // Real URLs come from egress fileResults.location or a configured storage base.
  return `https://recordings.example/fec/cc/${callId}.mp4`;
}

/**
 * Trim + strip trailing slash. Returns null for empty input.
 * Does not reject private API hosts — use assertPublicRecordingStorageBaseUrl when saving settings.
 */
export function normalizeRecordingStorageBaseUrl(
  baseUrl: string | null | undefined,
): string | null {
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "");
  return base || null;
}

/** R2/S3 API endpoints are not browser-playable (auth required; XML errors). */
export function isPrivateObjectStoreApiUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (host.endsWith(".r2.cloudflarestorage.com") || host === "r2.cloudflarestorage.com") {
      return true;
    }
    // Path-style / virtual-hosted S3 API hosts (not CloudFront / custom CDN).
    if (host === "s3.amazonaws.com" || /^s3[.-]/.test(host) || host.endsWith(".amazonaws.com")) {
      if (host.includes("s3") && !host.includes("cloudfront")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract `call-center/{uuid}.mp4` (or trailing filename) from a recording URL path.
 */
export function extractCallCenterRecordingObjectKey(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const pathname = new URL(trimmed).pathname;
    const match = pathname.match(/call-center\/[0-9a-f-]{36}\.mp4$/i);
    if (match) return match[0].replace(/^\//, "");
    const tail = pathname.split("/").filter(Boolean).pop();
    if (tail && /\.mp4$/i.test(tail)) return `call-center/${tail}`;
    return null;
  } catch {
    return null;
  }
}

/**
 * When CDR stored a private R2/S3 API URL but Settings has a public CDN/r2.dev base,
 * rewrite to `{publicBase}/call-center/{id}.mp4`.
 */
export function rewriteRecordingUrlToPublicBase(
  recordingUrl: string,
  publicBaseUrl: string | null | undefined,
  callId?: string,
): string {
  const trimmed = recordingUrl.trim();
  if (!trimmed || !isPrivateObjectStoreApiUrl(trimmed)) return trimmed;
  const base = normalizeRecordingStorageBaseUrl(publicBaseUrl);
  if (!base || isPrivateObjectStoreApiUrl(base)) return trimmed;
  const key =
    extractCallCenterRecordingObjectKey(trimmed) ||
    (callId ? `call-center/${callId}.mp4` : null);
  if (!key) return trimmed;
  return `${base}/${key}`;
}

/**
 * Choose the best HTTPS URL for playback/STT: prefer a real public location, else
 * storage base prediction, never a private object-store API host when a public base exists.
 */
export function preferPlayableRecordingUrl(opts: {
  location?: string | null;
  storageBaseUrl?: string | null;
  callId: string;
  existingUrl?: string | null;
}): string {
  const storageBase = normalizeRecordingStorageBaseUrl(opts.storageBaseUrl);
  const predicted = storageBase ? buildCallRecordingPublicUrl(storageBase, opts.callId) : "";

  const candidates = [opts.location, opts.existingUrl].map((u) => (u ?? "").trim()).filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.startsWith("s3://")) continue;
    if (!candidate.startsWith("https://") && !candidate.startsWith("http://")) continue;
    if (isPrivateObjectStoreApiUrl(candidate)) {
      if (predicted) return predicted;
      continue;
    }
    if (isUsableRecordingUrl(candidate)) return candidate;
  }

  if (predicted) return predicted;
  const existing = (opts.existingUrl ?? "").trim();
  if (existing) return existing;
  return buildCallRecordingPublicUrl(storageBase, opts.callId);
}

/** Reject R2/S3 API endpoints when saving Recording storage base URL. */
export function assertPublicRecordingStorageBaseUrl(baseUrl: string): string {
  const base = normalizeRecordingStorageBaseUrl(baseUrl) ?? "";
  if (!base) return "";
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("Recording storage base URL must be a valid https:// origin.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Recording storage base URL must start with https://");
  }
  if (isPrivateObjectStoreApiUrl(base)) {
    throw new Error(
      "Recording storage base URL must be the public CDN / r2.dev origin (e.g. https://pub-….r2.dev), not the r2.cloudflarestorage.com API endpoint used in LIVEKIT_EGRESS_S3_ENDPOINT.",
    );
  }
  return base;
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
  // Private S3/R2 API hosts return XML auth errors — not playable in <audio> or Whisper fetch.
  if (isPrivateObjectStoreApiUrl(trimmed)) return false;
  return true;
}

/**
 * True when CDR metadata indicates LiveKit egress finished writing a file.
 * Predicted `{base}/call-center/{id}.mp4` URLs are set at egress *start* and are not
 * safe to treat as playable until this (or an explicit file location) is present.
 */
export function hasFinishedRecordingEgress(metadata: Record<string, unknown> | null | undefined): boolean {
  const meta = metadata ?? {};
  if (typeof meta.egressFinishedAt === "string" && meta.egressFinishedAt.trim()) return true;
  if (typeof meta.egressFileLocation === "string" && meta.egressFileLocation.trim()) return true;
  // Legacy: private→public rewrite after a real object-store location was stored.
  if (typeof meta.recordingUrlRewrittenAt === "string" && meta.recordingUrlRewrittenAt.trim()) {
    return true;
  }
  return false;
}

/**
 * Browser `<audio>` should only mount when the URL is public HTTPS *and* egress has
 * finished (or the URL is not merely our storage-base prediction).
 */
export function isCallRecordingPlaybackReady(opts: {
  recordingUrl: string | null | undefined;
  callId: string;
  metadata?: Record<string, unknown> | null;
  storageBaseUrl?: string | null;
}): boolean {
  const rewritten = rewriteRecordingUrlToPublicBase(
    opts.recordingUrl ?? "",
    opts.storageBaseUrl,
    opts.callId,
  );
  if (!isUsableRecordingUrl(rewritten)) return false;
  if (hasFinishedRecordingEgress(opts.metadata)) return true;
  const predicted = opts.storageBaseUrl
    ? buildCallRecordingPublicUrl(opts.storageBaseUrl, opts.callId)
    : "";
  // Predicted path written at egress start — file may not exist yet (common on inbound
  // PSTN bridge before egress_ended, or when egress was aborted after a failed bridge).
  if (predicted && rewritten === predicted) return false;
  return true;
}
