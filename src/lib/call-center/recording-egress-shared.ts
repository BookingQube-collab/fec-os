export type EgressFileLike = {
  location?: string;
};

export type EgressInfoLike = {
  egressId?: string;
  roomName?: string;
  status?: number | string;
  error?: string;
  fileResults?: EgressFileLike[];
};

export type EgressS3Config = {
  accessKey: string;
  secret: string;
  bucket: string;
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
};

/** Optional S3/R2/Supabase-S3 destination for LiveKit EncodedFileOutput. */
export function resolveEgressS3FromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EgressS3Config | null {
  const accessKey =
    env.LIVEKIT_EGRESS_S3_ACCESS_KEY?.trim() || env.CALL_CENTER_RECORDING_S3_ACCESS_KEY?.trim() || "";
  const secret =
    env.LIVEKIT_EGRESS_S3_SECRET?.trim() || env.CALL_CENTER_RECORDING_S3_SECRET?.trim() || "";
  const bucket =
    env.LIVEKIT_EGRESS_S3_BUCKET?.trim() || env.CALL_CENTER_RECORDING_S3_BUCKET?.trim() || "";
  if (!accessKey || !secret || !bucket) return null;
  const region =
    env.LIVEKIT_EGRESS_S3_REGION?.trim() ||
    env.CALL_CENTER_RECORDING_S3_REGION?.trim() ||
    "auto";
  const endpoint =
    env.LIVEKIT_EGRESS_S3_ENDPOINT?.trim() || env.CALL_CENTER_RECORDING_S3_ENDPOINT?.trim() || "";
  const forceRaw =
    env.LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE?.trim() ||
    env.CALL_CENTER_RECORDING_S3_FORCE_PATH_STYLE?.trim() ||
    "";
  const forcePathStyle =
    forceRaw === ""
      ? Boolean(endpoint) // path-style is typical for R2 / MinIO / Supabase S3
      : !/^(0|false|no)$/i.test(forceRaw);
  return { accessKey, secret, bucket, region, endpoint, forcePathStyle };
}

export function egressStatusFailed(status: number | string | undefined): boolean {
  if (status == null) return false;
  if (typeof status === "number") return status === 4 || status === 5 || status === 6;
  const s = String(status).toUpperCase();
  return (
    s.includes("FAILED") ||
    s.includes("ABORTED") ||
    s.includes("LIMIT_REACHED") ||
    s === "EGRESS_FAILED" ||
    s === "EGRESS_ABORTED" ||
    s === "EGRESS_LIMIT_REACHED"
  );
}

export function egressStatusComplete(status: number | string | undefined): boolean {
  if (status == null) return false;
  if (typeof status === "number") return status === 3;
  const s = String(status).toUpperCase();
  return s.includes("COMPLETE") || s === "EGRESS_COMPLETE";
}

/** Prefer https locations from LiveKit fileResults. */
export function extractEgressRecordingLocation(egress: EgressInfoLike): string | null {
  const results = Array.isArray(egress.fileResults) ? egress.fileResults : [];
  for (const file of results) {
    const location = typeof file?.location === "string" ? file.location.trim() : "";
    if (!location) continue;
    if (location.startsWith("https://") || location.startsWith("http://")) return location;
  }
  for (const file of results) {
    const location = typeof file?.location === "string" ? file.location.trim() : "";
    if (location.startsWith("s3://")) return location;
  }
  return null;
}
