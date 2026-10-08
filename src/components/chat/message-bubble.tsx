"use client";

import { useState } from "react";
import { Bookmark, MoreHorizontal, Pin, Reply, SmilePlus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AttachmentCard, type AttachmentCardModel } from "@/components/chat/attachment-card";
import { EntityCard } from "@/components/chat/entity-card";
import { PollMessage, type PollView } from "@/components/chat/poll-message";
import { VoiceMessage } from "@/components/chat/voice-message";
import { CHAT_ENTITY_FALLBACK_BODY } from "@/lib/chat/entity-rules";
import type { ChatActionKind } from "@/lib/chat/action-rules";
import type { ChatSharedEntity } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHAT_QUICK_EMOJI } from "@/lib/chat/message-rules";
import { cn } from "@/lib/utils";

export type MessageReactionModel = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type MessageReplyModel = {
  senderName: string;
  body: string | null;
  contentHidden: boolean;
  file: boolean;
};

export type MessageBubbleModel = {
  id: string;
  senderId: string;
  type: string;
  body: string | null;
  createdAt: string;
  contentHidden: boolean;
  clientMessageId: string | null;
  mine: boolean;
  grouped: boolean;
  delivery: "uploading" | "sending" | "failed" | "sent" | "read" | null;
  senderName: string;
  reactions: MessageReactionModel[];
  reply: MessageReplyModel | null;
  attachments: AttachmentCardModel[];
  entity: ChatSharedEntity | null;
  requireAcknowledgement?: boolean;
  acknowledged?: boolean;
  acknowledgementCount?: number;
  poll?: PollView | null;
};

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function MessageBubble({
  message,
  canReact,
  pinned,
  saved,
  bookmarkPending,
  onRetry,
  onReply,
  onToggleReaction,
  onPin,
  onSave,
  createActions = [],
  onCreateAction,
  onAcknowledge,
  onVote,
  ackPending = false,
  votePending = false,
}: {
  message: MessageBubbleModel;
  canReact: boolean;
  pinned: boolean;
  saved: boolean;
  bookmarkPending: boolean;
  onRetry: (clientMessageId: string) => void;
  onReply: (message: MessageBubbleModel) => void;
  onToggleReaction: (messageId: string, emoji: string, mine: boolean) => void;
  onPin: (messageId: string, pinned: boolean) => void;
  onSave: (messageId: string, saved: boolean) => void;
  createActions?: readonly ChatActionKind[];
  onCreateAction?: (message: MessageBubbleModel, action: ChatActionKind) => void;
  onAcknowledge?: (messageId: string) => void;
  onVote?: (pollId: string, optionIds: string[]) => void;
  ackPending?: boolean;
  votePending?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const files = message.attachments ?? [];
  const hasFiles = files.length > 0;
  const audioFile = files.find((file) => file.mimeType.toLowerCase().startsWith("audio/")) ?? null;
  const voice = message.type === "VOICE_NOTE" || message.type === "AUDIO" || audioFile != null;
  const voiceFile = voice ? (audioFile ?? (message.type === "VOICE_NOTE" ? (files[0] ?? null) : null)) : null;
  const shared = message.type === "FEC_ENTITY";
  const poll = message.poll ?? null;
  const deleted = message.contentHidden || (message.body == null && !hasFiles && !shared && !poll && !voice);
  const replyText =
    message.reply == null
      ? ""
      : message.reply.contentHidden || (message.reply.body == null && !message.reply.file)
        ? t("chat.deleted")
        : (message.reply.body ?? t("chat.attachment"));
  const time = formatTime(message.createdAt, i18n.language);
  const pending = message.delivery === "sending" || message.delivery === "failed";
  const onServer = message.delivery == null || message.delivery === "sent" || message.delivery === "read";
  const interactive = canReact && !deleted && !pending;
  const canBookmark = !deleted && onServer;
  const canCreate = canBookmark && message.body != null && createActions.length > 0 && onCreateAction != null;

  return (
    <div className={cn("group relative flex max-w-[min(85%,32rem)] flex-col gap-1", message.mine ? "ms-auto items-end" : "me-auto items-start")}>
      {message.grouped || message.mine ? null : (
        <p className="px-1 text-xs font-medium text-foreground">{message.senderName}</p>
      )}
      <div
        className={cn(
          "rounded-2xl px-3 py-2 text-sm leading-5",
          message.mine ? "bg-primary/10 text-foreground" : "bg-muted text-foreground",
          deleted && "bg-muted text-muted-foreground italic",
          message.delivery === "failed" && "ring-1 ring-destructive/60",
        )}
      >
        {message.reply ? (
          <p className="mb-1 border-s-2 border-current/40 ps-2 text-xs opacity-90">
            <span className="block font-medium">{message.reply.senderName}</span>
            <span className="line-clamp-2 whitespace-pre-wrap break-words">{replyText}</span>
          </p>
        ) : null}
        {message.type === "ANNOUNCEMENT" && !deleted ? (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-80">{t("chat.announcementLabel")}</p>
        ) : null}
        {deleted ? <p>{t("chat.deleted")}</p> : null}
        {!deleted && poll ? (
          <PollMessage
            poll={poll}
            question={message.body}
            pending={votePending || !onVote}
            onVote={(optionIds) => onVote?.(poll.id, optionIds)}
          />
        ) : null}
        {!deleted && !poll && message.body != null && !(shared && message.body === CHAT_ENTITY_FALLBACK_BODY) && !(voice && message.body.trim().toLowerCase() === t("chat.voiceNote").trim().toLowerCase()) ? (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        ) : null}
        {!deleted && shared ? <EntityCard entity={message.entity} /> : null}
        {!deleted && voice && !voiceFile ? <p className="text-xs">{t("chat.attachmentUnavailable")}</p> : null}
        {!deleted && voiceFile ? (
          <>
            <VoiceMessage
              attachmentId={voiceFile.refreshable ? voiceFile.id : null}
              src={voiceFile.url}
              refreshable={voiceFile.refreshable && voiceFile.scanStatus !== "REJECTED"}
              mine={message.mine}
              unavailable={voiceFile.scanStatus === "REJECTED"}
            />
            {voiceFile.scanStatus === "PENDING" && message.mine ? (
              <p className="text-[11px] opacity-80">{t("chat.attachmentOnlyYou")}</p>
            ) : null}
          </>
        ) : null}
        {!deleted
          ? files
              .filter((attachment) => attachment !== voiceFile)
              .map((attachment) => (
                <AttachmentCard key={attachment.id} attachment={attachment} mine={message.mine} />
              ))
          : null}
      </div>
      {message.grouped ? null : (
        <time className="px-1 text-[11px] text-muted-foreground" dateTime={message.createdAt}>
          {time}
        </time>
      )}
      {message.reactions.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-1">
          {message.reactions.map((group) =>
            interactive ? (
              <Button
                key={group.emoji}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-7 px-2 py-0 text-xs"
                aria-pressed={group.mine}
                aria-label={
                  group.mine
                    ? t("chat.removeReaction", { emoji: group.emoji })
                    : t("chat.reactWith", { emoji: group.emoji })
                }
                onClick={() => onToggleReaction(message.id, group.emoji, group.mine)}
              >
                {group.emoji} {group.count}
              </Button>
            ) : (
              <span key={group.emoji} className="rounded-full border border-border px-2 py-0.5 text-xs">
                {group.emoji} {group.count}
              </span>
            ),
          )}
        </div>
      ) : null}
      {interactive || canBookmark || canCreate ? (
        <div className={cn("absolute -top-3 z-10", message.mine ? "end-1" : "start-1")}>
          <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-background opacity-0 shadow-sm group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                aria-label={t("chat.moreActions")}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={message.mine ? "end" : "start"}>
              {interactive ? (
                <DropdownMenuItem onSelect={() => onReply(message)}>
                  <Reply aria-hidden />
                  {t("chat.reply")}
                </DropdownMenuItem>
              ) : null}
              {interactive
                ? CHAT_QUICK_EMOJI.map((emoji) => {
                    const mine = message.reactions.some((group) => group.emoji === emoji && group.mine);
                    return (
                      <DropdownMenuItem
                        key={emoji}
                        onSelect={() => onToggleReaction(message.id, emoji, mine)}
                      >
                        <SmilePlus aria-hidden />
                        {mine ? t("chat.removeReaction", { emoji }) : t("chat.reactWith", { emoji })}
                      </DropdownMenuItem>
                    );
                  })
                : null}
              {canBookmark ? (
                <DropdownMenuItem disabled={bookmarkPending} onSelect={() => onPin(message.id, pinned)}>
                  <Pin aria-hidden />
                  {pinned ? t("chat.unpin") : t("chat.pin")}
                </DropdownMenuItem>
              ) : null}
              {canBookmark ? (
                <DropdownMenuItem disabled={bookmarkPending} onSelect={() => onSave(message.id, saved)}>
                  <Bookmark aria-hidden />
                  {saved ? t("chat.unsaveMessage") : t("chat.saveMessage")}
                </DropdownMenuItem>
              ) : null}
              {canCreate
                ? createActions.map((action) => (
                    <DropdownMenuItem key={action} onSelect={() => onCreateAction?.(message, action)}>
                      {t(`chat.createActions.${action}`)}
                    </DropdownMenuItem>
                  ))
                : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      {message.requireAcknowledgement ? (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {message.acknowledged ? (
            <p className="text-xs text-muted-foreground">{t("chat.acknowledged")}</p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-7 px-2 py-0 text-xs"
              disabled={ackPending || !onAcknowledge}
              onClick={() => onAcknowledge?.(message.id)}
            >
              {t("chat.acknowledge")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {t("chat.acknowledgementCount", { count: message.acknowledgementCount ?? 0 })}
          </p>
        </div>
      ) : null}
      {!deleted && message.delivery === "uploading" ? <p className="px-1 text-[11px] text-muted-foreground">{t("chat.uploading")}</p> : null}
      {!deleted && message.delivery === "sending" ? <p className="px-1 text-[11px] text-muted-foreground">{t("chat.sending")}</p> : null}
      {!deleted && message.delivery === "sent" ? <p className="px-1 text-[11px] text-muted-foreground">{t("chat.sent")}</p> : null}
      {!deleted && message.delivery === "read" ? <p className="px-1 text-[11px] text-muted-foreground">{t("chat.read")}</p> : null}
      {!deleted && message.delivery === "failed" && message.clientMessageId ? (
        <div className="flex items-center gap-2 px-1">
          <p className="text-[11px] text-destructive">{t("chat.failed")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => onRetry(message.clientMessageId ?? "")}>
            {t("chat.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
