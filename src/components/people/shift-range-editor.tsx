"use client";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type ShiftRangeEditorProps = {
  start: string | null;
  end: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  onStartChange?: (value: string | null) => void;
  onEndChange?: (value: string | null) => void;
};

export function ShiftRangeEditor({
  start,
  end,
  disabled,
  readOnly,
  onStartChange,
  onEndChange,
}: ShiftRangeEditorProps) {
  const { t } = useTranslation();

  if (disabled) {
    return <span className="text-xs text-muted-foreground">{t("people.roster.dutyOff")}</span>;
  }

  if (readOnly) {
    const text = [start, end].filter(Boolean).join(` ${t("people.roster.shiftTo")} `);
    return <span className="whitespace-nowrap tabular-nums">{text || "—"}</span>;
  }

  return (
    <div
      dir="ltr"
      className="inline-flex max-w-full items-center gap-1 rounded-lg border border-input bg-background p-0.5"
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
  return (
    <label className="relative inline-flex h-8 w-[7rem] shrink-0 items-center">
      <input
        type="time"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange?.(event.target.value || null)}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-card px-2 text-xs leading-5 tabular-nums",
          "shadow-none scheme-light transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0",
          "[&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full",
          "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
          !value && "caret-transparent text-transparent",
        )}
      />
      {!value ? (
        <span className="pointer-events-none absolute inset-0 flex items-center px-2 text-xs text-muted-foreground">
          {placeholder}
        </span>
      ) : null}
    </label>
  );
}
