"use client";

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCATION_SHORT_NAME } from "@/lib/weekly-review/constants";
import { cn } from "@/lib/utils";

export const cellInputClass = "min-h-9 rounded-xl px-2.5 text-sm";

export function CellInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} className={cn(cellInputClass, props.className)} />;
}

export function CellSelect({
  value,
  onValueChange,
  placeholder,
  options,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className={cn(cellInputClass, "h-9 min-h-9 px-2.5")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type SiteOption = { id: string; code: string; name: string };

export function siteLabel(site: SiteOption): string {
  return LOCATION_SHORT_NAME[site.code] ?? site.name;
}

export function venueOptions(sites: SiteOption[], codes?: readonly string[]) {
  const filtered = codes ? sites.filter((s) => (codes as readonly string[]).includes(s.code)) : sites;
  return [
    { value: "_none", label: "-" },
    ...filtered.map((s) => ({ value: s.id, label: siteLabel(s) })),
  ];
}
