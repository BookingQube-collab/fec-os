"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { MessageBubble, type MessageBubbleModel } from "@/components/chat/message-bubble";
import { Button } from "@/components/ui/button";
import type { ChatActionKind } from "@/lib/chat/action-rules";
import { chatGroupsWithPrevious } from "@/lib/chat/message-rules";

function dayLabel(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

export function MessageList({
  messages,
  loading,
  error,
  hasOlder,
  loadingOlder,
  followToken,
  lastReadMessageId,
  canReact,
  scrollToId,
  focusNonce,
  pinnedIds,
  savedIds,
  bookmarkPendingId,
  onLoadOlder,
  onRetry,
  onReply,
  onToggleReaction,
  onPin,
  onSave,
  onLatestVisible,
  createActions = [],
  onCreateAction,
  onAcknowledge,
  onVote,
  ackPendingId = null,
  votePendingId = null,
}: {
  messages: MessageBubbleModel[];
  loading: boolean;
  error: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  followToken: number;
  lastReadMessageId: string | null;
  canReact: boolean;
  scrollToId: string | null;
  focusNonce: number;
  pinnedIds: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  bookmarkPendingId: string | null;
  onLoadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  onReply: (message: MessageBubbleModel) => void;
  onToggleReaction: (messageId: string, emoji: string, mine: boolean) => void;
  onPin: (messageId: string, pinned: boolean) => void;
  onSave: (messageId: string, saved: boolean) => void;
  onLatestVisible: (visible: boolean) => void;
  createActions?: readonly ChatActionKind[];
  onCreateAction?: (message: MessageBubbleModel, action: ChatActionKind) => void;
  onAcknowledge?: (messageId: string) => void;
  onVote?: (pollId: string, optionIds: string[]) => void;
  ackPendingId?: string | null;
  votePendingId?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const prependHeightRef = useRef<number | null>(null);
  const firstIdRef = useRef<string | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const lengthRef = useRef(0);
  const followRef = useRef(followToken);
  const scrolledFocusRef = useRef<string | null>(null);
  const olderRequestedRef = useRef(false);
  const stickReportedRef = useRef<boolean | null>(null);
  const [showJump, setShowJump] = useState(false);

  function reportStick(next: boolean) {
    if (stickReportedRef.current === next) return;
    stickReportedRef.current = next;
    onLatestVisible(next);
  }

  useLayoutEffect(() => {
    olderRequestedRef.current = false;
  }, [messages.length, hasOlder]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const firstId = messages[0]?.id ?? null;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const prepended =
      prependHeightRef.current != null &&
      firstIdRef.current != null &&
      firstId !== firstIdRef.current &&
      messages.length > lengthRef.current;
    const follow = followToken !== followRef.current;
    const focusKey = scrollToId ? `${focusNonce}:${scrollToId}` : null;
    const focusNode =
      scrollToId != null
        ? el.querySelector<HTMLElement>(
            `[data-message-id="${typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(scrollToId) : scrollToId}"]`,
          )
        : null;
    const shouldFocus = Boolean(focusNode && focusKey && scrolledFocusRef.current !== focusKey);

    if (prepended && prependHeightRef.current != null && !shouldFocus) {
      el.scrollTop += el.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
    } else if (shouldFocus && focusNode) {
      focusNode.scrollIntoView({ block: "center" });
      stickRef.current = false;
      setShowJump(true);
      scrolledFocusRef.current = focusKey;
    } else if (follow || stickRef.current || lastIdRef.current == null) {
      el.scrollTop = el.scrollHeight;
      stickRef.current = true;
      setShowJump(false);
    } else if (lastId && lastId !== lastIdRef.current) {
      setShowJump(true);
    }

    firstIdRef.current = firstId;
    lastIdRef.current = lastId;
    lengthRef.current = messages.length;
    followRef.current = followToken;
    reportStick(stickRef.current);
  }, [messages, followToken, onLatestVisible, scrollToId, focusNonce]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distance < 64;
    reportStick(stickRef.current);
    if (stickRef.current) setShowJump(false);
    if (el.scrollTop < 48 && hasOlder && !loadingOlder && !olderRequestedRef.current) {
      olderRequestedRef.current = true;
      prependHeightRef.current = el.scrollHeight;
      onLoadOlder();
    }
  }

  function loadOlder() {
    if (olderRequestedRef.current || loadingOlder) return;
    olderRequestedRef.current = true;
    const el = scrollerRef.current;
    prependHeightRef.current = el ? el.scrollHeight : 0;
    onLoadOlder();
  }

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    reportStick(true);
    setShowJump(false);
  }

  const readIndex = lastReadMessageId ? messages.findIndex((row) => row.id === lastReadMessageId) : -1;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={loading}
        aria-label={t("chat.threadLabel")}
        className="absolute inset-0 flex flex-col overflow-y-auto"
      >
        <div className="mt-auto space-y-2 px-3 py-3">
        {hasOlder ? (
          <div className="flex justify-center">
            <Button type="button" variant="outline" size="sm" disabled={loadingOlder} onClick={loadOlder}>
              {loadingOlder ? t("chat.loadingMessages") : t("chat.loadOlder")}
            </Button>
          </div>
        ) : null}
        {loading ? <p className="py-8 text-center text-sm text-muted-foreground">{t("chat.loadingMessages")}</p> : null}
        {error ? (
          <p role="alert" className="py-4 text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {!loading && !error && messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("chat.emptyThread")}</p>
        ) : null}
        {messages.map((message, index) => {
          const previous = index > 0 ? messages[index - 1] : null;
          const day = dayLabel(message.createdAt, i18n.language);
          const previousDay = previous ? dayLabel(previous.createdAt, i18n.language) : null;
          const grouped = chatGroupsWithPrevious(
            previous
              ? {
                  senderId: previous.senderId,
                  type: previous.type,
                  createdAt: previous.createdAt,
                  contentHidden: previous.contentHidden,
                  body: previous.body,
                }
              : null,
            {
              senderId: message.senderId,
              type: message.type,
              createdAt: message.createdAt,
              contentHidden: message.contentHidden,
              body: message.body,
            },
          );
          const showUnread = readIndex >= 0 && index === readIndex + 1;
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={message.id === scrollToId ? "space-y-2 rounded-xl ring-1 ring-primary/40" : "space-y-2"}
            >
              {day && day !== previousDay ? (
                <p className="py-1 text-center text-[11px] font-medium text-muted-foreground">{day}</p>
              ) : null}
              {showUnread ? (
                <p className="py-1 text-center text-[11px] font-medium text-muted-foreground">{t("chat.unreadDivider")}</p>
              ) : null}
              <MessageBubble
                message={{ ...message, grouped }}
                canReact={canReact}
                pinned={pinnedIds.has(message.id)}
                saved={savedIds.has(message.id)}
                bookmarkPending={bookmarkPendingId === message.id}
                onRetry={onRetry}
                onReply={onReply}
                onToggleReaction={onToggleReaction}
                onPin={onPin}
                onSave={onSave}
                createActions={createActions}
                onCreateAction={onCreateAction}
                onAcknowledge={onAcknowledge}
                onVote={onVote}
                ackPending={ackPendingId === message.id}
                votePending={votePendingId === message.poll?.id}
              />
            </div>
          );
        })}
        </div>
      </div>
      {showJump ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button type="button" size="sm" className="pointer-events-auto" onClick={jumpToLatest}>
            {t("chat.jumpToLatest")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
