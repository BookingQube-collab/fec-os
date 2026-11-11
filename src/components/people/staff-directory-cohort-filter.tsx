"use client";

import { ChevronDown } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  FecDropdown as DropdownMenu,
  FecDropdownCheckboxItem as DropdownMenuCheckboxItem,
  FecDropdownContent as DropdownMenuContent,
  FecDropdownTrigger as DropdownMenuTrigger,
} from "@/components/fec";
import {
  activeShowOnlyStaffCohorts,
  type StaffDirectoryCohortOption,
} from "@/lib/staff-directory-cohorts";
import { cn } from "@/lib/utils";

/**
 * People → Staff “Showing” filter: Operations, Maintenance, F&B Cafe,
 * Head Office, and short event names. Unchecked = show-only (same as roster).
 */
export function StaffDirectoryCohortFilter({
  options,
  checks,
  onChange,
  disabled,
  className,
}: {
  options: readonly StaffDirectoryCohortOption[];
  checks: Readonly<Record<string, boolean>>;
  onChange: (next: Record<string, boolean>) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [localChecks, setLocalChecks] = useState<Record<string, boolean>>(() => ({ ...checks }));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLocalChecks({ ...checks });
  }, [checks]);

  const showOnly = useMemo(
    () => activeShowOnlyStaffCohorts(localChecks, options),
    [localChecks, options],
  );
  const showing = !disabled && showOnly.length > 0;
  const labelByKey = useMemo(
    () => new Map(options.map((option) => [option.key, option.label])),
    [options],
  );
  const departments = showOnly.map((key) => labelByKey.get(key) ?? key).join(", ");
  const menuLabel = t("common.staffCohortsMenu", "Ops, Maint, F&B, HO & Events");
  const triggerLabel = showing
    ? t("common.showingStaffCohorts", { cohorts: departments, defaultValue: `Showing: ${departments}` })
    : menuLabel;

  function toggle(key: string, checked: boolean) {
    const next = { ...localChecks, [key]: checked };
    setLocalChecks(next);
    startTransition(() => onChange(next));
  }

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          aria-label={menuLabel}
          className={cn(
            "flex h-10 min-h-10 w-full min-w-0 max-w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-start text-sm font-normal",
            disabled && "cursor-not-allowed opacity-60",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      {open ? (
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[12rem] max-w-[calc(100vw-1.5rem)]"
        >
          {options.length ? (
            options.map((option) => {
              const checked = localChecks[option.key] !== false;
              return (
                <DropdownMenuCheckboxItem
                  key={option.key}
                  checked={checked}
                  disabled={disabled}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(value) => toggle(option.key, value === true)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              );
            })
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {t("common.staffCohortsEmpty", "Operations, Maintenance, F&B Cafe, Head Office")}
            </p>
          )}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}
