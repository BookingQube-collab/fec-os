import "server-only";
import { createHash } from "node:crypto";

export function staffUuid(employeeCode: string): string {
  const h = createHash("sha256").update(`fec-staff-v1:${employeeCode}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function shiftUuid(employeeCode: string, startsAt: string): string {
  const h = createHash("sha256").update(`fec-shift-v1:${employeeCode}:${startsAt}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
