export type DayHours = {
  open?: string;
  close?: string;
  closed?: boolean;
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function zonedParts(date: Date, timeZone: string): { dayKey: (typeof DAY_KEYS)[number]; minutes: number; ymd: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "Asia/Qatar",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    const weekday = String(parts.weekday ?? "Monday").toLowerCase() as (typeof DAY_KEYS)[number];
    const dayKey = DAY_KEYS.includes(weekday) ? weekday : "monday";
    const hour = Number(parts.hour === "24" ? "0" : parts.hour ?? "0");
    const minute = Number(parts.minute ?? "0");
    const ymd = `${parts.year}-${parts.month}-${parts.day}`;
    return { dayKey, minutes: hour * 60 + minute, ymd };
  } catch {
    const dayKey = DAY_KEYS[date.getDay()]!;
    return {
      dayKey,
      minutes: date.getHours() * 60 + date.getMinutes(),
      ymd: date.toISOString().slice(0, 10),
    };
  }
}

/** True when the contact center is open for inbound live agents. */
export function isWithinBusinessHours(input: {
  enabled: boolean;
  timezone: string;
  hoursJson: Record<string, unknown>;
  holidays?: Array<{ holidayDate: string; isClosed: boolean }>;
  now?: Date;
}): boolean {
  if (!input.enabled) return true;
  const now = input.now ?? new Date();
  const { dayKey, minutes, ymd } = zonedParts(now, input.timezone || "Asia/Qatar");

  const holiday = (input.holidays ?? []).find((h) => h.holidayDate.slice(0, 10) === ymd);
  if (holiday?.isClosed) return false;

  const raw = input.hoursJson?.[dayKey] as DayHours | undefined;
  if (!raw) return true;
  if (raw.closed) return false;
  const open = parseHm(raw.open ?? "09:00");
  const close = parseHm(raw.close ?? "18:00");
  if (open == null || close == null) return true;
  if (close <= open) {
    // overnight window e.g. 22:00–06:00
    return minutes >= open || minutes < close;
  }
  return minutes >= open && minutes < close;
}
