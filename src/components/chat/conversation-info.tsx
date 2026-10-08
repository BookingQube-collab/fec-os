"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CallHistory } from "@/components/chat/call-history";
import { conversationDisplayName } from "@/components/chat/conversation-item";
import { ConversationNotificationControl } from "@/components/chat/chat-notification-controls";
import { MemberManager } from "@/components/chat/member-manager";
import { Button } from "@/components/ui/button";
import { useChatMembers } from "@/hooks/queries/useChat";
import { updateConversation } from "@/lib/chat.functions";
import type { ChatCallHistoryItem, ChatConversationSummary } from "@/lib/chat.functions";
import { queryKeys } from "@/lib/query-keys";

function PolicyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}

export function ConversationInfo({
  conversation,
  currentUserId,
  canManage,
  callHistory,
  callHistoryError,
}: {
  conversation: ChatConversationSummary;
  currentUserId: string | null;
  canManage: boolean;
  callHistory: ChatCallHistoryItem[];
  callHistoryError: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const members = useChatMembers(conversation.id);
  const name = conversationDisplayName(conversation, (key, options) => t(key, options));

  const archive = useMutation({
    mutationFn: updateConversation,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t(`chat.kinds.${conversation.kind}`, { defaultValue: conversation.kind })}
          {conversation.archivedAt ? ` · ${t("chat.archived")}` : ""}
          {conversation.sensitive ? ` · ${t("chat.sensitive")}` : ""}
        </p>
        <h2 className="text-xl font-semibold">{name}</h2>
        {conversation.description ? <p className="text-sm text-muted-foreground">{conversation.description}</p> : null}
        <p className="text-xs text-muted-foreground">{t("chat.infoNote")}</p>
      </header>

      <dl className="space-y-2 rounded-lg border border-border p-3">
        <PolicyLine
          label={t("chat.yourRole")}
          value={t(`chat.roles.${conversation.role ?? "MEMBER"}`, { defaultValue: conversation.role ?? "—" })}
        />
        <PolicyLine label={t("chat.posting")} value={t(`chat.policy.${conversation.postingPolicy}`, { defaultValue: conversation.postingPolicy })} />
        <PolicyLine label={t("chat.files")} value={t(`chat.policy.${conversation.filePolicy}`, { defaultValue: conversation.filePolicy })} />
        <PolicyLine label={t("chat.calls")} value={t(`chat.policy.${conversation.callPolicy}`, { defaultValue: conversation.callPolicy })} />
        <PolicyLine
          label={t("chat.retention")}
          value={t(`chat.policy.${conversation.retentionPolicy}`, { defaultValue: conversation.retentionPolicy })}
        />
        <PolicyLine label={t("chat.members")} value={t("chat.memberCount", { count: conversation.memberCount })} />
      </dl>

      <ConversationNotificationControl conversationId={conversation.id} level={conversation.notificationLevel} />

      <CallHistory items={callHistory} error={callHistoryError} currentUserId={currentUserId} />

      {canManage ? (
        <Button
          type="button"
          variant="outline"
          disabled={archive.isPending}
          onClick={() =>
            archive.mutate({
              conversationId: conversation.id,
              archivedAt: conversation.archivedAt ? null : new Date().toISOString(),
            })
          }
        >
          {conversation.archivedAt ? t("chat.restore") : t("chat.archive")}
        </Button>
      ) : null}

      {members.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {members.error instanceof Error ? members.error.message : t("chat.loadFailed")}
        </p>
      ) : (
        <MemberManager
          conversationId={conversation.id}
          members={members.data ?? []}
          currentUserId={currentUserId}
          canManage={canManage}
        />
      )}
    </div>
  );
}
