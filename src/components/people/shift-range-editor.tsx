"use client";

import { useTranslation } from "react-i18next";

import { formatEnglishTime, joinHm12, splitHm12 } from "@/lib/hr-assist/time";
import { cn } from "@/lib/utils";

type ShiftRangeEditorProps = {
  start: string | null;
  end: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  onStartChange?: (value: string | null) => void;
  onEndChange?: (value: string | null) => void;
};

const HOUR12_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const PERIOD_OPTIONS = ["AM", "PM"] as const;

export function ShiftRangeEditor({
  start,
  end,
  disabled,
  readOnly,
  onStartChange,
  onEndChange,
}: ShiftRangeEditorProps) {
  const { t } = useTranslation();

  // readOnly must win over disabled — List view passes both and still needs times visible.
  if (readOnly) {
    const text = [start ? formatEnglishTime(start) : null, end ? formatEnglishTime(end) : null]
      .filter(Boolean)
      .join(` ${t("people.roster.shiftTo")} `);
    return <span className="whitespace-nowrap tabular-nums">{text || "—"}</span>;
  }

  if (disabled) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div
      dir="ltr"
      lang="en-US"
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-background p-0.5"
    >
      <ShiftTimeInput
        value={start ?? ""}
        placeholder={t("people.roster.shiftStart")}
        ariaLabel={t("people.roster.shiftStart")}
        onChange={onStartChange}
      />
      <span className="shrink-0 px-0.5 text-[11px] font-medium text-muted-foreground">
        {t("people.roster.shiftTo")}
      </span>
      <ShiftTimeInput
        value={end ?? ""}
        placeholder={t("people.roster.shiftEnd")}
        ariaLabel={t("people.roster.shiftEnd")}
        onChange={onEndChange}
      />
    </div>
  );
}

function ShiftTimeInput({
  value,
  placeholder,
  ariaLabel,
  onChange,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  onChange?: (value: string | null) => void;
}) {
  const parts = splitHm12(value);
  const hour12 = parts?.hour12 ?? "";
  const minute = parts ? String(parts.minute).padStart(2, "0") : "";
  const period = parts?.period ?? "";

  function emit(next: { hour12: number; minute: number; period: "AM" | "PM" }) {
    onChange?.(joinHm12(next.hour12, next.minute, next.period));
  }

  function ensureParts(): { hour12: number; minute: number; period: "AM" | "PM" } {
    return parts ?? { hour12: 8, minute: 0, period: "AM" };
  }

  return (
    <div
      className={cn(
        "inline-flex h-8 items-center gap-0.5 rounded-md border border-input bg-card px-1",
        "shadow-none scheme-light",
      )}
      aria-label={ariaLabel}
      title={parts ? formatEnglishTime(value) : placeholder}
    >
      <select
        aria-label={`${ariaLabel} hour`}
        value={hour12 === "" ? "" : String(hour12)}
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) {
            onChange?.(null);
            return;
          }
          const current = ensureParts();
          emit({ ...current, hour12: Number(raw) });
        }}
        className="h-7 max-w-[3.1rem] rounded border-0 bg-transparent px-0.5 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <option value="">{placeholder}</option>
        {HOUR12_OPTIONS.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground" aria-hidden>
        :
      </span>
      <select
        aria-label={`${ariaLabel} minute`}
        value={minute}
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) {
            onChange?.(null);
            return;
          }
          const current = ensureParts();
          emit({ ...current, minute: Number(raw) });
        }}
        className="h-7 max-w-[3.25rem] rounded border-0 bg-transparent px-0.5 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <option value="">--</option>
        {MINUTE_OPTIONS.map((min) => {
          const label = String(min).padStart(2, "0");
          return (
            <option key={min} value={label}>
              {label}
            </option>
          );
        })}
      </select>
      <select
        aria-label={`${ariaLabel} AM or PM`}
        value={period}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw !== "AM" && raw !== "PM") {
            onChange?.(null);
            return;
          }
          const current = ensureParts();
          emit({ ...current, period: raw });
        }}
        className="h-7 max-w-[3.4rem] rounded border-0 bg-transparent px-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <option value="">--</option>
        {PERIOD_OPTIONS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}
