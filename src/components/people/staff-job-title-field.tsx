"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { StaffDirectoryListPayload, StaffRow } from "@/lib/queries/module-queries.core";
import { distinctJobTitles, matchJobTitleSuggestions } from "@/lib/staff-job-titles";
import { cn } from "@/lib/utils";

function titlesFromPeopleCache(qc: QueryClient): string[] {
  const titles: string[] = [];
  const directories = qc.getQueriesData<StaffDirectoryListPayload>({
    queryKey: [...queryKeys.people.all, "staff-directory"],
  });
  for (const [, payload] of directories) {
    if (!payload) continue;
    titles.push(...(payload.facets?.positions ?? []));
    for (const row of payload.data ?? []) titles.push(row.job_title ?? "");
  }
  const lists = qc.getQueriesData<StaffRow[]>({
    queryKey: [...queryKeys.people.all, "staff"],
  });
  for (const [, rows] of lists) {
    for (const row of rows ?? []) titles.push(row.job_title ?? "");
  }
  return distinctJobTitles(titles);
}

export function StaffJobTitleField({
  value,
  onChange,
  onListOpenChange,
  disabled,
  enabled = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onListOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  /** Fetch saved titles while the staff dialog is open. */
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listId = useId().replace(/:/g, "");
  const onListOpenChangeRef = useRef(onListOpenChange);
  onListOpenChangeRef.current = onListOpenChange;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const cachedTitles = useMemo(() => (enabled ? titlesFromPeopleCache(qc) : []), [qc, enabled]);
  const titlesQuery = useQuery({
    queryKey: queryKeys.people.jobTitles(),
    queryFn: async () => {
      const res = await apiGet<{ titles: string[] }>("/api/people", { view: "job-titles" });
      return distinctJobTitles([...(res.titles ?? []), ...titlesFromPeopleCache(qc)]);
    },
    enabled,
    staleTime: STALE.people,
    placeholderData: () => {
      const cached = titlesFromPeopleCache(qc);
      return cached.length ? cached : undefined;
    },
  });

  const titles = titlesQuery.data?.length ? titlesQuery.data : cachedTitles;
  const matches = useMemo(() => matchJobTitleSuggestions(titles, value), [titles, value]);
  const showList = open && matches.length > 0;
  const active = Math.min(highlight, Math.max(matches.length - 1, 0));

  useEffect(() => {
    onListOpenChangeRef.current?.(showList);
  }, [showList]);

  const setListOpen = (next: boolean) => {
    setOpen(next);
    onListOpenChange?.(next && matchJobTitleSuggestions(titles, value).length > 0);
  };

  const choose = (title: string) => {
    onChange(title);
    setHighlight(0);
    setListOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div>
      <Label htmlFor={`${listId}-input`}>{t("people.staff.title")}</Label>
      <Input
        id={`${listId}-input`}
        ref={inputRef}
        value={value}
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          setHighlight(0);
          const willShow = matchJobTitleSuggestions(titles, next).length > 0;
          setOpen(true);
          onListOpenChange?.(willShow);
        }}
        onFocus={() => {
          const willShow = matches.length > 0;
          setOpen(true);
          onListOpenChange?.(willShow);
        }}
        onBlur={() => {
          setListOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && showList) {
            e.preventDefault();
            e.stopPropagation();
            setListOpen(false);
            return;
          }
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = matches[active];
            if (picked) choose(picked);
          } else if (e.key === "Tab") {
            setListOpen(false);
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("people.staff.titleSuggest")}
          className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-input bg-card py-1 shadow-elevated-xs"
        >
          {matches.map((title, index) => (
            <li
              key={title}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                "cursor-pointer px-3.5 py-2 text-sm leading-5",
                index === active ? "bg-muted text-foreground" : "text-foreground",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(title);
              }}
              ref={(node) => {
                if (index === active) node?.scrollIntoView({ block: "nearest" });
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              {title}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
