"use client";

import { BellOff, Megaphone, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ChatConversationSummary } from "@/lib/chat.functions";
import { conversationDisplayName, directPeerRoleLine } from "@/lib/chat/display-rules";
import { chatUnreadBadgeLabel } from "@/lib/chat/message-rules";
import { cn } from "@/lib/utils";

export { conversationDisplayName };

export function conversationInitials(title: string): string {
  const parts = title.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "C";
}

export function ConversationAvatar({
  name,
  kind,
  className,
}: {
  name: string;
  kind: string;
  className?: string;
}) {
  const direct = kind === "DIRECT";
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary",
        className,
      )}
    >
      {direct ? (
        conversationInitials(name)
      ) : kind === "ANNOUNCEMENT" ? (
        <Megaphone className="h-4 w-4" />
      ) : (
        <Users className="h-4 w-4" />
      )}
    </span>
  );
}

function formatListDate(value: string, locale: string, yesterdayLabel: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

export function conversationPreview(conversation: ChatConversationSummary, label: (key: string) => string): string {
  if (conversation.preview) return conversation.preview;
  if (conversation.previewType) {
    const named = label(`chat.previewType.${conversation.previewType}`);
    if (named && named !== `chat.previewType.${conversation.previewType}`) return named;
  }
  return "";
}

export function ConversationItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: ChatConversationSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const name = conversationDisplayName(conversation, (key, options) => t(key, options));
  const unreadLabel = chatUnreadBadgeLabel(conversation.unreadCount);
  const preview = conversationPreview(conversation, (key) => t(key));
  const when = formatListDate(conversation.updatedAt, i18n.language, t("chat.yesterday"));
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={selected ? "true" : undefined}
      aria-label={
        [
          unreadLabel
            ? t("chat.selectConversationUnread", { name, count: unreadLabel })
            : t("chat.selectConversation", { name }),
          conversation.notificationLevel === "MUTED" ? t("chat.muted") : null,
        ]
          .filter(Boolean)
          .join(", ")
      }
      className={cn(
        "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-start transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
        selected ? "bg-primary/10" : "hover:bg-muted/70",
      )}
    >
      <ConversationAvatar name={name} kind={conversation.kind} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            {conversation.notificationLevel === "MUTED" ? (
              <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </span>
          <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={conversation.updatedAt}>
            {when}
          </time>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {preview || t("chat.previewEmpty")}
          </span>
          {unreadLabel ? (
            <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
              {unreadLabel}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
