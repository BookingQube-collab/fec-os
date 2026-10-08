"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, Search, SquarePen } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  ConversationAvatar,
  ConversationItem,
  conversationDisplayName,
  conversationPreview,
} from "@/components/chat/conversation-item";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ChatConversationSummary, ChatDirectoryPerson } from "@/lib/chat.functions";
import { visibleChatList, type ChatListFilter } from "@/lib/chat/list-rules";
import { cn } from "@/lib/utils";

export type { ChatListFilter };

const FILTERS: ChatListFilter[] = ["all", "unread", "favorites", "mentions"];

function personLabel(person: ChatDirectoryPerson, unnamed: string): string {
  return person.fullName.trim() || unnamed;
}

function personDetail(person: ChatDirectoryPerson, empty: string): string {
  const line = [person.employeeCode, person.jobTitle].filter(Boolean).join(" · ");
  return line || empty;
}

export function ConversationList({
  conversations,
  people = [],
  selectedId,
  selectedStaffId,
  openingUserId,
  loading,
  error,
  favoriteIds,
  canCreate,
  canCompose,
  onSelect,
  onOpenPerson,
  onNewMessage,
  onNewGroup,
  onOpenSaved,
  onOpenNotifications,
  onOpenSearch,
}: {
  conversations: ChatConversationSummary[];
  people?: ChatDirectoryPerson[];
  selectedId: string | null;
  selectedStaffId?: string | null;
  openingUserId?: string | null;
  loading: boolean;
  error: string | null;
  favoriteIds: readonly string[];
  canCreate: boolean;
  canCompose: boolean;
  onSelect: (id: string) => void;
  onOpenPerson?: (person: ChatDirectoryPerson) => void;
  onNewMessage: () => void;
  onNewGroup: () => void;
  onOpenSaved: () => void;
  onOpenNotifications: () => void;
  onOpenSearch: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatListFilter>("all");
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const unnamed = t("chat.unnamedPerson");

  const visible = useMemo(() => {
    return visibleChatList({
      conversations,
      people,
      filter,
      favoriteIds: favorites,
      query,
      conversationName: (conversation) => conversationDisplayName(conversation, (key, options) => t(key, options)),
      conversationPreview: (conversation) => conversationPreview(conversation, (key) => t(key)),
    });
  }, [conversations, favorites, filter, people, query, t]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h2 className="min-w-0 flex-1 text-base font-semibold">{t("chat.listTitle")}</h2>
        {canCompose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground"
            aria-label={t("chat.newMessage")}
            onClick={onNewMessage}
          >
            <SquarePen className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={t("chat.listMenu")}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canCreate ? <DropdownMenuItem onSelect={onNewGroup}>{t("chat.newGroup")}</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={onOpenSearch}>{t("chat.searchMessages")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenSaved}>{t("chat.savedOpen")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenNotifications}>{t("chat.notifyOpen")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("chat.searchChats")}
            aria-label={t("chat.searchChats")}
            autoComplete="off"
            className="h-10 rounded-full ps-9"
          />
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-4 pb-3" role="toolbar" aria-label={t("chat.listTitle")}>
        {FILTERS.map((key) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={cn(
                "min-h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80",
              )}
            >
              {t(`chat.filter.${key}`)}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <p className="px-4 py-6 text-sm text-muted-foreground">{t("chat.loadingMessages")}</p> : null}
        {error ? (
          <div role="alert" className="m-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-4 text-sm">
            <p className="font-medium">{t("chat.loadFailed")}</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        ) : null}
        {!loading && !error && conversations.length === 0 && people.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t("chat.emptyHint")}</p>
        ) : null}
        {!loading && !error && (conversations.length > 0 || people.length > 0) && visible.conversations.length === 0 && visible.people.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t("chat.filterEmpty")}</p>
        ) : null}
        <ul className="flex flex-col gap-0.5 px-2 pb-3">
          {visible.conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationItem conversation={conversation} selected={conversation.id === selectedId} onSelect={onSelect} />
            </li>
          ))}
          {visible.people.map((person) => {
            const name = personLabel(person, unnamed);
            const pending = Boolean(person.userId && person.userId === openingUserId);
            const selected = person.id === selectedStaffId || pending;
            const detail = personDetail(person, person.userId ? t("chat.previewEmpty") : t("chat.noLoginTitle"));
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => onOpenPerson?.(person)}
                  disabled={!onOpenPerson || pending}
                  aria-pressed={selected}
                  aria-label={person.userId ? t("chat.openDirect", { name }) : t("chat.noLoginSelect", { name })}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-start transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                    "disabled:cursor-default",
                    selected ? "bg-primary/10" : "hover:bg-muted/70",
                  )}
                >
                  <ConversationAvatar name={name} kind="DIRECT" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
