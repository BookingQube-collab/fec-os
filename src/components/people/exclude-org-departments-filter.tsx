"use client";

import { useTranslation } from "react-i18next";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Extra filter beside an existing department control. Default off. */
export function ExcludeOrgDepartmentsFilter({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t("common.excludeOpsMaintenanceFb");
  const active = !disabled && checked;

  return (
    <label
      className={cn(
        "flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal leading-snug",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <Checkbox
        checked={active}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        aria-label={label}
      />
      <span className="min-w-0 whitespace-normal">{label}</span>
    </label>
  );
}
