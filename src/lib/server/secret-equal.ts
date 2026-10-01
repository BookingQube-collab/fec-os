import { timingSafeEqual } from "node:crypto";

/** Constant-time compare for equal-length secrets. Length mismatches fail closed. */
export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
