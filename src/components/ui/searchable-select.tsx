"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
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
import { matchesSearchQuery, scrollTopForIndex } from "@/lib/searchable-select";
import { virtualWindowRange } from "@/lib/staff-roster/virtual-window";
import { cn } from "@/lib/utils";

/** max-h-64. ponytail: fixed row box; labels truncate so they don't wrap. Measure rows if that changes. */
const OPTION_LIST_PX = 256;
const OPTION_ROW_PX = 36;
const OPTION_ROW_WITH_DESCRIPTION_PX = 52;

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
  "h-11 w-full rounded-lg border border-input bg-card ps-10 pe-4 text-sm text-foreground shadow-elevated-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30";

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

type SearchableSelectBaseProps = {
  options: SearchableSelectOption[];
  emptyOption?: SearchableSelectEmptyOption;
  placeholder?: string;
  searchPlaceholder?: string;
  /** When the menu opens, seed the search box (e.g. device name on mapping). */
  openSearchSeed?: string | null;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  onOpenChange?: (open: boolean) => void;
  /** Shown when multiple values are selected (e.g. "{{count}} selected"). */
  selectedCountLabel?: (count: number) => ReactNode;
};

type SearchableSelectSingleProps = SearchableSelectBaseProps & {
  multiple?: false;
  value: string;
  onValueChange: (value: string) => void;
  values?: never;
  onValuesChange?: never;
};

type SearchableSelectMultipleProps = SearchableSelectBaseProps & {
  multiple: true;
  values: string[];
  onValuesChange: (values: string[]) => void;
  value?: never;
  onValueChange?: never;
};

export function SearchableSelect(props: SearchableSelectSingleProps | SearchableSelectMultipleProps) {
  const {
    options,
    emptyOption,
    placeholder,
    searchPlaceholder,
    openSearchSeed,
    disabled,
    className,
    triggerClassName,
    id,
    name,
    "aria-label": ariaLabel,
    onOpenChange,
    selectedCountLabel,
  } = props;
  const multiple = props.multiple === true;
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [listOn, setListOn] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const deferredQuery = useDeferredValue(query);
  // Clearing the field must show every option immediately. A deferred empty string
  // would keep the previous filter for a frame after the menu reopens.
  const filterQuery = query === "" ? "" : deferredQuery;

  const selectedValues = multiple
    ? props.values
    : props.value
      ? [props.value]
      : emptyOption && props.value === emptyOption.value
        ? [emptyOption.value]
        : [];
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const items = useMemo(() => {
    const rows: SearchableSelectOption[] = emptyOption
      ? [{ value: emptyOption.value, label: emptyOption.label }, ...options]
      : options;
    return rows;
  }, [emptyOption, options]);

  const filtered = useMemo(() => {
    return items.filter((item) =>
      matchesSearchQuery(
        filterQuery,
        collectNodeText(item.label),
        collectNodeText(item.description),
        item.keywords,
        item.value,
      ),
    );
  }, [items, filterQuery]);

  const rowHeight = useMemo(
    () => (items.some((item) => item.description) ? OPTION_ROW_WITH_DESCRIPTION_PX : OPTION_ROW_PX),
    [items],
  );
  const windowed = useMemo(
    () => virtualWindowRange(filtered.length, scrollTop, rowHeight, OPTION_LIST_PX, 6),
    [filtered.length, scrollTop, rowHeight],
  );
  const visible = windowed.fullyInWindow ? filtered : filtered.slice(windowed.start, windowed.end);
  const visibleStart = windowed.fullyInWindow ? 0 : windowed.start;

  const selectedLabels = useMemo(
    () =>
      selectedValues
        .map((v) => items.find((item) => item.value === v)?.label)
        .filter((label): label is ReactNode => label != null),
    [items, selectedValues],
  );

  const triggerLabel = useMemo(() => {
    if (selectedLabels.length === 0) return null;
    if (selectedLabels.length === 1) return selectedLabels[0];
    if (selectedCountLabel) return selectedCountLabel(selectedLabels.length);
    return `${selectedLabels.length} selected`;
  }, [selectedLabels, selectedCountLabel, t]);

  const searchPh = searchPlaceholder ?? t("common.searchHere");
  const emptyLabel = t("common.searchNoMatches");

  const setOpenState = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
      if (next) {
        const seed = openSearchSeed?.trim() ?? "";
        setQuery(seed);
        // Paint the field first. The option list is the long task in the open click.
        startTransition(() => setListOn(true));
        return;
      }
      setListOn(false);
      setQuery("");
      setActive(0);
      setScrollTop(0);
    },
    [onOpenChange, openSearchSeed],
  );

  useEffect(() => {
    if (!open) {
      setActive(0);
      return;
    }
    if (filterQuery.trim()) {
      setActive((current) => (current === 0 ? current : 0));
      return;
    }
    const selectedIndex = filtered.findIndex((item) => selectedSet.has(item.value));
    const next = selectedIndex >= 0 ? selectedIndex : 0;
    setActive((current) => (current === next ? current : next));
  }, [open, filterQuery, filtered, selectedSet]);

  useLayoutEffect(() => {
    if (!listOn) return;
    const node = listRef.current;
    setScrollTop((current) => {
      const next = scrollTopForIndex(current, active, rowHeight, OPTION_LIST_PX);
      if (node && node.scrollTop !== next) node.scrollTop = next;
      return next === current ? current : next;
    });
  }, [active, rowHeight, listOn]);

  const chooseSingle = useCallback(
    (next: string) => {
      if (!multiple) {
        startTransition(() => {
          props.onValueChange(next);
        });
        setOpenState(false);
      }
    },
    [multiple, props, setOpenState],
  );

  const toggleMulti = useCallback(
    (next: string) => {
      if (!multiple) return;
      if (emptyOption && next === emptyOption.value) {
        props.onValuesChange([]);
        return;
      }
      const current = props.values;
      props.onValuesChange(current.includes(next) ? current.filter((v) => v !== next) : [...current, next]);
    },
    [emptyOption, multiple, props],
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
      if (!hit || hit.disabled) return;
      if (multiple) toggleMulti(hit.value);
      else chooseSingle(hit.value);
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
  const hiddenValue = multiple ? selectedValues.join(",") : (props.value ?? "");

  return (
    <div className={cn("min-w-0", className)}>
      {name ? <input type="hidden" name={name} value={hiddenValue} /> : null}
      <Popover open={open} onOpenChange={setOpenState}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-multiselectable={multiple || undefined}
            title={selectedLabels.map(collectNodeText).filter(Boolean).join(", ") || undefined}
            onKeyDown={onTriggerKeyDown}
            className={cn(
              buttonVariants({ variant: "outline" }),
              // Match Input: white field, warm border, soft rect — not cream pill.
              "min-h-11 w-full justify-between gap-2 rounded-lg px-3.5 py-2.5 font-normal leading-5 [&>span]:line-clamp-1 [&_svg]:size-[1.125rem]",
              !triggerLabel && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <span className="min-w-0 flex-1 truncate text-start">{triggerLabel ?? placeholder}</span>
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
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            className="mt-1.5 max-h-64 overflow-y-auto overscroll-contain p-0"
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop;
              setScrollTop((prev) => (prev === top ? prev : top));
            }}
          >
            {!listOn ? null : filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</li>
            ) : (
              <>
                {windowed.topPad > 0 ? <li aria-hidden style={{ height: windowed.topPad }} /> : null}
                {visible.map((item, offset) => {
                  const i = visibleStart + offset;
                  const isActive = i === active;
                  const isClear = Boolean(emptyOption && item.value === emptyOption.value);
                  const isSelected = isClear ? selectedValues.length === 0 : selectedSet.has(item.value);
                  return (
                    <li key={`${item.value}-${i}`} role="presentation" className="overflow-hidden" style={{ height: rowHeight }}>
                      <button
                        type="button"
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={isSelected}
                        disabled={item.disabled}
                        onClick={() => (multiple ? toggleMulti(item.value) : chooseSingle(item.value))}
                        className={cn(
                          "flex h-full w-full items-center gap-2 rounded-full px-3 py-2 text-start text-sm",
                          isActive ? "bg-secondary font-medium text-foreground" : "text-foreground hover:bg-secondary/70",
                          item.disabled && "pointer-events-none opacity-50",
                        )}
                      >
                        {multiple && !isClear ? (
                          <span
                            aria-hidden
                            className={cn(
                              "grid h-4 w-4 shrink-0 place-content-center rounded-sm border border-primary shadow",
                              isSelected && "bg-primary text-primary-foreground",
                            )}
                          >
                            <Check className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                          </span>
                        ) : (
                          <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                        )}
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
                })}
                {windowed.bottomPad > 0 ? <li aria-hidden style={{ height: windowed.bottomPad }} /> : null}
              </>
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
