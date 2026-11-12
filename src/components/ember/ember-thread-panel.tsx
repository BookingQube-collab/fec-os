"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MessageBubble, type MessageBubbleModel } from "@/components/chat/message-bubble";
import { MessageComposer } from "@/components/chat/message-composer";
import { Button } from "@/components/ui/button";
import { useChatMembers, useChatMessages } from "@/hooks/queries/useChat";
import { emberChannelLabel } from "@/lib/chat/display-rules";
import { sendTextMessage, shareEntityInChat, type ChatConversationSummary } from "@/lib/chat.functions";
import { queryKeys } from "@/lib/query-keys";

export function EmberThreadPanel({
  conversation,
  rootMessageId,
  currentUserId,
  canSend,
  onClose,
}: {
  conversation: ChatConversationSummary;
  rootMessageId: string;
  currentUserId: string | null;
  canSend: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const members = useChatMembers(conversation.id);
  const messagesQuery = useChatMessages(conversation.id, null);
  const [pending, setPending] = useState(false);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members.data ?? []) {
      if (member.fullName) map.set(member.userId, member.fullName);
    }
    return map;
  }, [members.data]);

  const channel = emberChannelLabel(conversation, (key, options) => t(key, options));

  const { root, replies } = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    const all = [...pages].reverse().flatMap((page) => page.messages);
    const rootMessage = all.find((message) => message.id === rootMessageId) ?? null;
    const threadReplies = all.filter((message) => message.threadRootMessageId === rootMessageId);
    return { root: rootMessage, replies: threadReplies };
  }, [messagesQuery.data, rootMessageId]);

  function toBubble(message: NonNullable<typeof root>, mine: boolean): MessageBubbleModel {
    return {
      id: message.id,
      senderId: message.senderId,
      type: message.type,
      body: message.body,
      createdAt: message.createdAt,
      contentHidden: message.contentHidden,
      clientMessageId: message.clientMessageId,
      mine,
      grouped: false,
      delivery: null,
      senderName: message.botName
        ? `${message.botName} (bot)`
        : names.get(message.senderId) ?? t("chat.memberLabel"),
      threadRootMessageId: message.threadRootMessageId,
      botCard: message.botCard,
      reactions: message.reactions,
      reply: message.reply
        ? {
            senderName: names.get(message.reply.senderId) ?? t("chat.memberLabel"),
            body: message.reply.body,
            contentHidden: message.reply.contentHidden,
            file: message.reply.file,
          }
        : null,
      attachments: (message.attachments ?? []).map((attachment) => ({ ...attachment, refreshable: true })),
      entity: message.entity,
      poll: null,
    };
  }

  return (
    <aside className="ember-shell__thread flex min-h-0 w-full min-w-0 flex-col lg:w-[22rem] lg:max-w-[22rem] lg:shrink-0">
      <header className="flex items-center gap-2 border-b border-[color:var(--ember-border)] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t("ember.shell.threadTitle", { channel })}</p>
          <p className="truncate text-xs text-[color:var(--ember-muted)]">
            {t("ember.shell.threadCount", { count: replies.length })}
          </p>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={t("common.close")}>
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {root ? (
          <MessageBubble
            message={toBubble(root, root.senderId === currentUserId)}
            canReact={false}
            pinned={false}
            saved={false}
            bookmarkPending={false}
            onRetry={() => undefined}
            onReply={() => undefined}
            onToggleReaction={() => undefined}
            onPin={() => undefined}
            onSave={() => undefined}
          />
        ) : (
          <p className="text-sm text-[color:var(--ember-muted)]">{t("ember.shell.threadLoading")}</p>
        )}
        {replies.map((message) => (
          <MessageBubble
            key={message.id}
            message={toBubble(message, message.senderId === currentUserId)}
            canReact={false}
            pinned={false}
            saved={false}
            bookmarkPending={false}
            onRetry={() => undefined}
            onReply={() => undefined}
            onToggleReaction={() => undefined}
            onPin={() => undefined}
            onSave={() => undefined}
          />
        ))}
      </div>
      {canSend && root ? (
        <MessageComposer
          conversationId={conversation.id}
          canPost={!pending}
          canAttach={false}
          reply={{
            id: root.id,
            senderName: root.botName ? `${root.botName} (bot)` : names.get(root.senderId) ?? t("chat.memberLabel"),
            body: root.body,
            threadRootId: rootMessageId,
          }}
          mentionMembers={[]}
          mentionsReady
          onCancelReply={onClose}
          onActivity={() => undefined}
          onShare={async (input) => {
            const result = await shareEntityInChat({ conversationId: conversation.id, ...input });
            if (!result.ok) throw new Error(result.error);
            await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
          }}
          onSend={async ({ body, clientMessageId, replyToMessageId, threadRootMessageId }) => {
            setPending(true);
            const result = await sendTextMessage({
              conversationId: conversation.id,
              body,
              clientMessageId,
              ...(replyToMessageId ? { replyToMessageId } : {}),
              ...(threadRootMessageId ? { threadRootMessageId } : { threadRootMessageId: rootMessageId }),
            });
            setPending(false);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
          }}
        />
      ) : null}
    </aside>
  );
}
