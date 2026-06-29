"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { MasterDepartmentRow } from "@/lib/staff-departments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function DepartmentMultiSelect({
  value,
  onChange,
  departments,
  disabled,
  placeholder = "Select departments…",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  departments: MasterDepartmentRow[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const activeDepartments = useMemo(
    () => departments.filter((d) => d.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [departments],
  );

  const selected = useMemo(
    () => activeDepartments.filter((d) => value.includes(d.id)),
    [activeDepartments, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeDepartments;
    return activeDepartments.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.code?.toLowerCase().includes(q) ?? false),
    );
  }, [activeDepartments, query]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-auto min-h-9 w-full justify-between px-2 py-1.5 font-normal"
          >
            <div className="flex flex-1 flex-wrap gap-1 text-left">
              {selected.length ? (
                selected.map((d) => (
                  <Badge key={d.id} variant="secondary" className="text-[10px] font-normal">
                    {d.name}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="mb-2 h-8"
          />
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {filtered.length ? (
              filtered.map((d) => {
                const checked = value.includes(d.id);
                return (
                  <label
                    key={d.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60",
                      checked && "bg-muted/40",
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(d.id)} />
                    <span className="flex-1">{d.name}</span>
                    {checked ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  </label>
                );
              })
            ) : (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No departments match.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((d) => (
            <Badge key={d.id} variant="outline" className="gap-1 pr-1 text-[10px]">
              {d.name}
              <button
                type="button"
                className="rounded-sm hover:bg-muted"
                onClick={() => toggle(d.id)}
                disabled={disabled}
                aria-label={`Remove ${d.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
