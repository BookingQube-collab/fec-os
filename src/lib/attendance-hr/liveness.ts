/** Client-side anti-spoof heuristic — not an identity match. */

export const LIVENESS_MIN_VARIANCE = 12;
export const LIVENESS_MIN_SAMPLES = 2;

/** Mean absolute difference of luma across consecutive frames (0–255 scale). */
export function lumaFrameDelta(a: Uint8ClampedArray | number[], b: Uint8ClampedArray | number[]): number {
  const len = Math.min(a.length, b.length);
  if (len < 4) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 3 < len; i += 16) {
    const lumaA = 0.299 * Number(a[i]) + 0.587 * Number(a[i + 1]) + 0.114 * Number(a[i + 2]);
    const lumaB = 0.299 * Number(b[i]) + 0.587 * Number(b[i + 1]) + 0.114 * Number(b[i + 2]);
    sum += Math.abs(lumaA - lumaB);
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

export function livenessPassed(deltas: number[], minVariance = LIVENESS_MIN_VARIANCE): boolean {
  if (deltas.length < LIVENESS_MIN_SAMPLES - 1) return false;
  const mean = deltas.reduce((acc, n) => acc + n, 0) / deltas.length;
  return mean >= minVariance;
}

export type FaceCheckStatus = "not_required" | "captured" | "liveness_failed" | "enrolled";

export function faceCheckLabel(status: FaceCheckStatus): string {
  switch (status) {
    case "enrolled":
      return "Face enrolled";
    case "captured":
      return "Selfie captured (liveness only — not an identity match)";
    case "liveness_failed":
      return "Liveness check failed";
    default:
      return "Face check not required";
  }
}
