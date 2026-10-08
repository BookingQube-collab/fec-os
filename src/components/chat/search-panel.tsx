"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChatDepartments, useChatSearch } from "@/hooks/queries/useChat";
import { useSites } from "@/hooks/queries/useSites";
import type { ChatDirectoryPerson, ChatSearchFile, ChatSearchMessage } from "@/lib/chat.functions";
import { CHAT_SEARCH_FILE_TYPES, type ChatSearchFileType } from "@/lib/chat/search-rules";

const fieldClass = "min-h-11 rounded-md border border-border bg-background px-2 text-sm";

export function SearchPanel({
  conversationId,
  canFilterDepartments,
  locked = false,
  onOpenConversation,
  onOpenMessage,
  onOpenPerson,
  onOpenFile,
}: {
  conversationId: string | null;
  canFilterDepartments: boolean;
  /** Keep results inside the open conversation. */
  locked?: boolean;
  onOpenConversation: (id: string) => void;
  onOpenMessage: (message: ChatSearchMessage) => void;
  onOpenPerson: (person: ChatDirectoryPerson) => void;
  onOpenFile: (file: ChatSearchFile) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [thisRoom, setThisRoom] = useState(locked);
  const [fileType, setFileType] = useState<ChatSearchFileType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const sites = useSites();
  const departments = useChatDepartments({ enabled: canFilterDepartments });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const roomOnly = (locked || thisRoom) && Boolean(conversationId);
  const filters =
    debounced.length >= 2
      ? {
          query: debounced,
          ...(roomOnly && conversationId ? { conversationId } : {}),
          ...(!roomOnly && locationId ? { locationId } : {}),
          ...(!roomOnly && departmentId ? { departmentId } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(fileType ? { fileType } : {}),
        }
      : null;
  const search = useChatSearch(filters);
  const result = search.data;

  return (
    <div className={locked ? "bg-card p-3" : "mb-3 rounded-lg border border-border bg-card p-3"}>
      <div className="space-y-2">
        <Label htmlFor="chat-search-query">{locked ? t("chat.searchInThread") : t("chat.searchOpen")}</Label>
        <Input
          id="chat-search-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={locked ? t("chat.searchInThread") : t("chat.searchPlaceholder")}
          autoComplete="off"
          maxLength={80}
        />
        <p className="text-xs text-muted-foreground">{t("chat.searchHint")}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        {conversationId && !locked ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={thisRoom}
              onChange={(event) => setThisRoom(event.target.checked)}
            />
            {t("chat.searchThisRoom")}
          </label>
        ) : null}
        <label className="space-y-1 text-xs">
          <span className="block text-muted-foreground">{t("chat.searchFileType")}</span>
          <select
            className={fieldClass}
            value={fileType}
            aria-label={t("chat.searchFileType")}
            onChange={(event) => setFileType(event.target.value as ChatSearchFileType | "")}
          >
            <option value="">{t("chat.searchFileAny")}</option>
            {CHAT_SEARCH_FILE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`chat.fileType.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="block text-muted-foreground">{t("chat.searchFrom")}</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label={t("chat.searchFrom")} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="block text-muted-foreground">{t("chat.searchTo")}</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label={t("chat.searchTo")} />
        </label>
        {!locked && sites.data && sites.data.length > 0 ? (
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">{t("chat.location")}</span>
            <select
              className={fieldClass}
              value={locationId}
              aria-label={t("chat.location")}
              disabled={roomOnly}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">{t("chat.searchAny")}</option>
              {sites.data.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!locked && canFilterDepartments && departments.data && departments.data.length > 0 ? (
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">{t("chat.department")}</span>
            <select
              className={fieldClass}
              value={departmentId}
              aria-label={t("chat.department")}
              disabled={roomOnly}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">{t("chat.searchAny")}</option>
              {departments.data.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {debounced.length >= 2 && search.isFetching ? <p className="mt-3 text-sm text-muted-foreground">{t("chat.searching")}</p> : null}
      {search.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {search.error instanceof Error ? search.error.message : t("chat.loadFailed")}
        </p>
      ) : null}
      {result ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <ResultGroup title={t("chat.searchConversations")}>
            {result.conversations.map((row) => (
              <li key={row.id}>
                <button type="button" className="min-h-11 w-full truncate rounded-md px-2 py-2 text-start text-sm hover:bg-muted/70" onClick={() => onOpenConversation(row.id)}>
                  {row.title || t(`chat.kinds.${row.kind}`, { defaultValue: row.kind })}
                </button>
              </li>
            ))}
          </ResultGroup>
          <ResultGroup title={t("chat.searchMessages")}>
            {result.messages.map((row) => (
              <li key={row.id}>
                <button type="button" className="min-h-11 w-full truncate rounded-md px-2 py-2 text-start text-sm hover:bg-muted/70" onClick={() => onOpenMessage(row)}>
                  {row.snippet}
                </button>
              </li>
            ))}
          </ResultGroup>
          <ResultGroup title={t("chat.searchPeople")}>
            {result.people.map((person) => (
              <li key={person.id}>
                <button type="button" className="min-h-11 w-full truncate rounded-md px-2 py-2 text-start text-sm hover:bg-muted/70" onClick={() => onOpenPerson(person)}>
                  {person.fullName.trim() || t("chat.unnamedPerson")}
                </button>
              </li>
            ))}
          </ResultGroup>
          <ResultGroup title={t("chat.searchFiles")}>
            {result.files.map((file) => (
              <li key={file.id}>
                <button type="button" className="min-h-11 w-full truncate rounded-md px-2 py-2 text-start text-sm hover:bg-muted/70" onClick={() => onOpenFile(file)}>
                  {file.filename}
                </button>
              </li>
            ))}
          </ResultGroup>
        </div>
      ) : null}
      {result &&
      result.conversations.length === 0 &&
      result.messages.length === 0 &&
      result.people.length === 0 &&
      result.files.length === 0 &&
      !search.isFetching ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("chat.searchNoResults")}</p>
      ) : null}
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      <ul className="mt-1 max-h-[min(40dvh,24rem)] space-y-1 overflow-y-auto md:max-h-36">{children}</ul>
    </section>
  );
}
