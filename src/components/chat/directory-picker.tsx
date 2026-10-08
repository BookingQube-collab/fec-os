"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChatDirectory } from "@/hooks/queries/useChat";
import type { ChatDirectoryPerson } from "@/lib/chat.functions";
import { orgPanelGroups, type OrgChartPerson, type OrgDepartment } from "@/lib/org-hierarchy";
import { cn } from "@/lib/utils";

function personLabel(person: ChatDirectoryPerson, unnamed: string): string {
  return person.fullName.trim() || unnamed;
}

function asChartPerson(person: ChatDirectoryPerson, unnamed: string): OrgChartPerson {
  return {
    staffId: person.id,
    fullName: personLabel(person, unnamed),
    reportingManagerStaffId: null,
    orgChartPlaced: false,
    employeeCode: person.employeeCode,
    jobTitle: person.jobTitle,
    departmentIds: person.departmentIds,
    departmentId: person.departmentId,
    departmentName: person.departmentName,
    hasPhoto: false,
    photoUpdatedAt: null,
  };
}

export function DirectoryPicker({
  onSelect,
  selectedUserId,
}: {
  onSelect: (person: ChatDirectoryPerson) => void;
  selectedUserId?: string | null;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const unnamed = t("chat.unnamedPerson");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const directory = useChatDirectory();
  const people = (directory.data?.people ?? []).filter((person) => person.userId);
  const departments = directory.data?.departments ?? [];

  const groups = useMemo(() => {
    const needle = debounced.toLowerCase();
    const filtered =
      needle.length < 2
        ? people
        : people.filter((person) =>
            [personLabel(person, unnamed), person.employeeCode, person.email, person.jobTitle, person.departmentName].some(
              (value) => value?.toLowerCase().includes(needle),
            ),
          );
    const byId = new Map(filtered.map((person) => [person.id, person]));
    const chartDepartments: OrgDepartment[] = departments.map((department) => ({
      id: department.id,
      name: department.name,
      parentId: department.parentId,
      sortOrder: department.sortOrder,
    }));
    return orgPanelGroups(chartDepartments, filtered.map((person) => asChartPerson(person, unnamed)))
      .map((group) => ({
        key: group.key,
        name: group.key === "__none__" ? t("chat.unassigned") : group.name,
        depth: group.depth,
        people: group.people.flatMap((person) => {
          const row = byId.get(person.staffId);
          return row ? [row] : [];
        }),
      }))
      .filter((group) => group.people.length > 0);
  }, [debounced, departments, people, t, unnamed]);

  const searching = debounced.length >= 2;

  return (
    <div className="space-y-2">
      <Label htmlFor="chat-directory-query">{t("chat.directoryLabel")}</Label>
      <Input
        id="chat-directory-query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("chat.directoryPlaceholder")}
        autoComplete="off"
        maxLength={80}
      />
      <p className="text-xs text-muted-foreground">{t("chat.directoryHint")}</p>
      {directory.isLoading ? <p className="text-sm text-muted-foreground">{t("chat.searching")}</p> : null}
      {directory.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {directory.error instanceof Error ? directory.error.message : t("chat.loadFailed")}
        </p>
      ) : null}
      {!directory.isLoading && !directory.isError && groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{searching ? t("chat.noMatches") : t("chat.directoryEmpty")}</p>
      ) : null}
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {groups.map((group) => (
          <section key={group.key}>
            <h3
              className="sticky top-0 bg-background px-3 py-1 text-xs font-semibold text-muted-foreground"
              style={{ paddingInlineStart: `${12 + group.depth * 12}px` }}
            >
              {group.name}
            </h3>
            <ul className="space-y-1">
              {group.people.map((person) => {
                const selected = person.userId === selectedUserId;
                const name = personLabel(person, unnamed);
                return (
                  <li key={`${group.key}:${person.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(person)}
                      aria-pressed={selected}
                      aria-label={t("chat.openDirect", { name })}
                      className={cn(
                        "flex w-full flex-col rounded-lg px-3 py-2 text-start text-sm",
                        selected ? "bg-primary/10" : "hover:bg-muted/70",
                      )}
                    >
                      <span className="font-medium">{name}</span>
                      <span className="text-xs text-muted-foreground">
                        {[person.employeeCode, person.jobTitle].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
