"use client";

import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  FecDropdown as DropdownMenu,
  FecDropdownCheckboxItem as DropdownMenuCheckboxItem,
  FecDropdownContent as DropdownMenuContent,
  FecDropdownTrigger as DropdownMenuTrigger,
} from "@/components/fec";
import {
  ORG_FOCUS_DEPARTMENTS,
  type OrgDepartmentChecks,
  type OrgFocusDepartment,
} from "@/lib/exclude-org-departments";
import { cn } from "@/lib/utils";

/** Per-department show-only control. All three start checked (no restriction). */
export function OrgDepartmentsFilter({
  checks,
  onChange,
  disabled,
  className,
}: {
  checks: OrgDepartmentChecks;
  onChange: (next: OrgDepartmentChecks) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const unchecked = ORG_FOCUS_DEPARTMENTS.filter((key) => !checks[key]);
  const showing = !disabled && unchecked.length > 0;
  const departments = unchecked.map((key) => t(`common.orgDepartment.${key}`)).join(", ");
  const menuLabel = t("common.orgDepartmentsMenu");
  const triggerLabel = showing ? t("common.showingOrgDepartments", { departments }) : menuLabel;

  function toggle(key: OrgFocusDepartment, checked: boolean) {
    onChange({ ...checks, [key]: checked });
  }

  return (
    <DropdownMenu>
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
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[12rem] max-w-[calc(100vw-1.5rem)]"
      >
        {ORG_FOCUS_DEPARTMENTS.map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={checks[key]}
            disabled={disabled}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(value) => toggle(key, value === true)}
          >
            {t(`common.orgDepartment.${key}`)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
