import { qatarTodayYmd } from "@/lib/hr-expiry-bands";

/** Destination of a dated temporary move. Not a dedicated work site and not a punch. */
export type TemporarySiteMoveRef = {
  to_location_id: string;
  to_location_code: string | null;
  to_location_name: string | null;
  starts_on: string;
  ends_on: string;
};

export type TemporaryMovePhase = "active" | "scheduled" | "ended";

export type TemporarySiteMoveListRow = {
  id: string;
  staff_id: string;
  staff_name: string;
  employee_code: string;
  home_location_id: string | null;
  home_label: string;
  to_location_id: string;
  to_label: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
  phase: TemporaryMovePhase;
};

export function shiftYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.slice(0, 10).split("-").map(Number);
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/** Inclusive: today is inside starts_on..ends_on. */
export function temporaryMoveCoversDate(
  move: { starts_on: string; ends_on: string },
  today: string,
): boolean {
  const day = today.slice(0, 10);
  return move.starts_on.slice(0, 10) <= day && day <= move.ends_on.slice(0, 10);
}

export function temporaryMovePhase(
  move: { starts_on: string; ends_on: string },
  today = qatarTodayYmd(),
): TemporaryMovePhase {
  const day = today.slice(0, 10);
  if (move.ends_on.slice(0, 10) < day) return "ended";
  if (move.starts_on.slice(0, 10) > day) return "scheduled";
  return "active";
}

/** Location codes of moves that cover `today`. Ended and future moves are omitted. */
export function activeTemporaryLocationCodes(
  moves:
    | readonly {
        to_location_code?: string | null;
        starts_on: string;
        ends_on: string;
      }[]
    | null
    | undefined,
  today = qatarTodayYmd(),
): string[] {
  const codes = new Set<string>();
  for (const move of moves ?? []) {
    const code = move.to_location_code?.trim();
    if (code && temporaryMoveCoversDate(move, today)) codes.add(code);
  }
  return [...codes];
}

/**
 * Close a move so today is no longer inside the window.
 * A move that has not started, or that starts today, is removed.
 */
export function closeTemporaryMove(
  move: { starts_on: string; ends_on: string },
  today = qatarTodayYmd(),
): { action: "noop" } | { action: "update"; ends_on: string } | { action: "delete" } {
  if (temporaryMovePhase(move, today) === "ended") return { action: "noop" };
  const yesterday = shiftYmd(today, -1);
  if (move.starts_on.slice(0, 10) <= yesterday) return { action: "update", ends_on: yesterday };
  return { action: "delete" };
}
