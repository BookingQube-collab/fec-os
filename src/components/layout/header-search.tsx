"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { useUserRoles } from "@/hooks/use-auth";
import { buildNavSearchIndex, searchNav } from "@/lib/nav-search";
import { cn } from "@/lib/utils";

export function HeaderSearch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const roles = useUserRoles();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const index = useMemo(() => buildNavSearchIndex(roles), [roles]);
  const results = useMemo(() => searchNav(query, index, t), [query, index, t]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setActive((i) => (i - 1 + results.length) % results.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[active] ?? results[0];
      if (hit) go(hit.href);
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className={cn("relative min-w-[200px] flex-1 lg:max-w-sm", className)}>
      <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 stroke-[1.5] text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-full border border-border/70 bg-card ps-10 pe-4 text-sm text-foreground shadow-elevated-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        placeholder={t("common.searchHere")}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${results[active].href}` : undefined}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[110] mt-2 max-h-80 w-full overflow-y-auto rounded-[1.25rem] border border-border bg-card p-1.5 shadow-elevated-md"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">{t("layout.searchNoResults")}</li>
          ) : (
            results.map((item, i) => (
              <li key={item.href} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${item.href}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item.href)}
                  className={cn(
                    "flex w-full items-center rounded-full px-3 py-2 text-start text-sm",
                    i === active ? "bg-secondary font-medium text-foreground" : "text-foreground hover:bg-secondary/70",
                  )}
                >
                  {t(item.labelKey)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
