"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchesSearchQuery } from "@/lib/searchable-select";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  suffix?: ReactNode;
  keywords?: string;
  disabled?: boolean;
};

export type SearchableSelectEmptyOption = {
  value: string;
  label: ReactNode;
};

export function collectNodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectNodeText).join(" ");
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return collectNodeText(props?.children);
  }
  return "";
}

export const searchableSelectInputClassName =
  "h-10 w-full rounded-full border border-border/70 bg-card ps-10 pe-4 text-sm text-foreground shadow-elevated-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30";

export function SearchableSelectSearchInput({
  value,
  onChange,
  onKeyDown,
  inputRef,
  placeholder,
  listId,
  expanded,
  activeId,
  id,
  role = "combobox",
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  placeholder: string;
  listId?: string;
  expanded?: boolean;
  activeId?: string;
  id?: string;
  role?: "combobox" | "searchbox";
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 stroke-[1.5] text-muted-foreground" />
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        className={searchableSelectInputClassName}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role={role}
        aria-label={placeholder}
        aria-expanded={role === "combobox" ? expanded : undefined}
        aria-controls={listId}
        aria-autocomplete={role === "combobox" ? "list" : undefined}
        aria-activedescendant={role === "combobox" ? activeId : undefined}
      />
    </div>
  );
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  emptyOption,
  placeholder,
  searchPlaceholder,
  disabled,
  className,
  triggerClassName,
  id,
  name,
  "aria-label": ariaLabel,
  onOpenChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  emptyOption?: SearchableSelectEmptyOption;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    const rows: SearchableSelectOption[] = emptyOption
      ? [{ value: emptyOption.value, label: emptyOption.label }, ...options]
      : options;
    return rows;
  }, [emptyOption, options]);

  const filtered = useMemo(() => {
    return items.filter((item) =>
      matchesSearchQuery(query, collectNodeText(item.label), collectNodeText(item.description), item.keywords, item.value),
    );
  }, [items, query]);

  const selected = items.find((item) => item.value === value);
  const selectedLabel = selected?.label;
  const searchPh = searchPlaceholder ?? t("common.searchHere");
  const emptyLabel = t("common.searchNoMatches");

  const setOpenState = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
      if (!next) {
        setQuery("");
        setActive(0);
      }
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!open) {
      setActive(0);
      return;
    }
    if (query.trim()) {
      setActive(0);
      return;
    }
    const selectedIndex = filtered.findIndex((item) => item.value === value);
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, query, filtered, value]);

  const choose = useCallback(
    (next: string) => {
      onValueChange(next);
      setOpenState(false);
    },
    [onValueChange, setOpenState],
  );

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpenState(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActive((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActive((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActive(filtered.length - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = filtered[active] ?? filtered[0];
      if (hit && !hit.disabled) choose(hit.value);
    }
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpenState(true);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setQuery(e.key);
      setOpenState(true);
    }
  };

  const activeItem = filtered[active];
  const activeId = open && activeItem ? `${listId}-${active}` : undefined;

  return (
    <div className={cn("min-w-0", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover modal open={open} onOpenChange={setOpenState}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            onKeyDown={onTriggerKeyDown}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-11 w-full justify-between gap-2 px-3.5 py-2.5 font-semibold leading-5 [&>span]:line-clamp-1 [&_svg]:size-[1.125rem]",
              !selected && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <span className="min-w-0 flex-1 truncate text-start">{selectedLabel ?? placeholder}</span>
            <ChevronsUpDown className="shrink-0 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] p-1.5"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <SearchableSelectSearchInput
            inputRef={inputRef}
            value={query}
            onChange={setQuery}
            onKeyDown={onSearchKeyDown}
            placeholder={searchPh}
            listId={listId}
            expanded={open}
            activeId={activeId}
          />
          <ul id={listId} role="listbox" className="mt-1.5 max-h-64 overflow-y-auto p-0">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</li>
            ) : (
              filtered.map((item, i) => {
                const isActive = i === active;
                const isSelected = item.value === value;
                return (
                  <li key={`${item.value}-${i}`} role="presentation">
                    <button
                      type="button"
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={isSelected}
                      disabled={item.disabled}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(item.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-full px-3 py-2 text-start text-sm",
                        isActive ? "bg-secondary font-medium text-foreground" : "text-foreground hover:bg-secondary/70",
                        item.disabled && "pointer-events-none opacity-50",
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.label}</span>
                        {item.description ? (
                          <span className="block truncate text-xs font-normal text-muted-foreground">{item.description}</span>
                        ) : null}
                      </span>
                      {item.suffix}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
