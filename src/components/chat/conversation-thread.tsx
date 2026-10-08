"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal, Phone, Search, Star, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CallOverlay } from "@/components/chat/call-overlay";
import { ConversationAvatar, conversationDisplayName } from "@/components/chat/conversation-item";
import { directPeerRoleLine, rosterDisplayName } from "@/lib/chat/display-rules";
import { CHAT_TYPING_IDLE_MS, chatTypingLabel } from "@/lib/chat/typing-rules";
import { ConversationInfo } from "@/components/chat/conversation-info";
import { IncomingCall } from "@/components/chat/incoming-call";
import { useConversationCalls } from "@/components/chat/use-conversation-calls";
import { CreateFromMessageDialog, type CreateFromMessageInput } from "@/components/chat/create-from-message-dialog";
import { MessageComposer, type ComposerReply } from "@/components/chat/message-composer";
import type { PollDraft } from "@/components/chat/poll-dialog";
import { type MessageBubbleModel, type MessageReplyModel } from "@/components/chat/message-bubble";
import { MessageList } from "@/components/chat/message-list";
import { SearchPanel } from "@/components/chat/search-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useChatMembers,
  useChatMessages,
  useChatPins,
  useChatPresence,
  useChatRealtime,
  useConversationReceipt,
  useMarkConversationRead,
  useSavedMessages,
} from "@/hooks/queries/useChat";
import type { PickedAttachment } from "@/components/chat/attachment-picker";
import type { AttachmentCardModel } from "@/components/chat/attachment-card";
import {
  acknowledgeAnnouncement,
  addReaction,
  cancelCall,
  castVote,
  endCall,
  createActionFromMessage,
  createPoll,
  issueCallToken,
  pinMessage,
  prepareChatAttachment,
  removeReaction,
  respondCall,
  saveMessage,
  sendAttachmentMessage,
  sendTextMessage,
  shareEntityInChat,
  startCall,
  unpinMessage,
  unsaveMessage,
  type ChatCallHistoryItem,
  type ChatConversationSummary,
  type ChatDirectoryPerson,
  type ChatJumpTarget,
  type ChatMessagePage,
  type ChatReactionGroup,
  type ChatSearchFile,
  type ChatSearchMessage,
  type ChatTextMessage,
} from "@/lib/chat.functions";
import { chatCallDisabledReason, type ChatCallKind } from "@/lib/chat/call-rules";
import { chatMentionCandidates, composerMentionIdsFromUnknown } from "@/lib/chat/mention-rules";
import type { ChatActionKind } from "@/lib/chat/action-rules";
import type { ChatMessageCursor } from "@/lib/chat/message-rules";
import { usePermission } from "@/hooks/use-permission";
import { encodeChatBytesBase64 } from "@/lib/chat/attachment-rules";
import { chatCanAttach, type ChatFilePolicy, type ChatMemberRole, type ChatPostingPolicy } from "@/lib/chat/authorization";
import { chatCallerCanPost, chatReadCoversMessage, chatResolveClientMessageId, type ChatDeliveryStatus } from "@/lib/chat/message-rules";
import { queryKeys } from "@/lib/query-keys";

type OutboxFile = {
  clientAttachmentId: string;
  attachmentId: string | null;
  filename: string;
  mimeType: string;
  byteSize: number;
  objectUrl: string | null;
};

type OutboxItem = {
  clientMessageId: string;
  body: string;
  createdAt: string;
  status: ChatDeliveryStatus;
  replyToMessageId: string | null;
  replySenderName: string | null;
  replyBody: string | null;
  replyHidden: boolean;
  attachments: OutboxFile[];
  voiceNote: boolean;
  requireAcknowledgement?: boolean;
  mentionUserIds: string[];
};

function parseOutboxFiles(value: unknown): OutboxFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<OutboxFile>;
    if (!row.clientAttachmentId || !row.filename || !row.mimeType || typeof row.byteSize !== "number") return [];
    return [
      {
        clientAttachmentId: row.clientAttachmentId,
        attachmentId: row.attachmentId ?? null,
        filename: row.filename,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        objectUrl: null,
      },
    ];
  });
}

const OUTBOX_PREFIX = "fec-chat-outbox:";

function readOutbox(conversationId: string): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(OUTBOX_PREFIX + conversationId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Partial<OutboxItem>;
      const attachments = parseOutboxFiles(row.attachments);
      if (!row.clientMessageId || !row.createdAt) return [];
      if ((!row.body || typeof row.body !== "string") && attachments.length === 0) return [];
      const status: ChatDeliveryStatus = row.status === "sent" ? "sent" : "failed";
      return [
        {
          clientMessageId: row.clientMessageId,
          body: typeof row.body === "string" ? row.body : "",
          createdAt: row.createdAt,
          status,
          replyToMessageId: row.replyToMessageId ?? null,
          replySenderName: row.replySenderName ?? null,
          replyBody: row.replyBody ?? null,
          replyHidden: row.replyHidden === true,
          attachments,
          voiceNote: row.voiceNote === true,
          requireAcknowledgement: row.requireAcknowledgement === true,
          mentionUserIds: composerMentionIdsFromUnknown(row.mentionUserIds),
        },
      ];
    });
  } catch {
    return [];
  }
}

function toBubble(
  message: ChatTextMessage,
  mine: boolean,
  senderName: string,
  delivery: MessageBubbleModel["delivery"],
  replyName: string,
  memberNames: ReadonlyMap<string, string>,
): MessageBubbleModel {
  const reply: MessageReplyModel | null = message.reply
    ? {
        senderName: replyName,
        body: message.reply.body,
        contentHidden: message.reply.contentHidden,
        file: message.reply.file,
      }
    : null;
  const attachments: AttachmentCardModel[] = (message.attachments ?? []).map((attachment) => ({
    ...attachment,
    refreshable: true,
  }));
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
    delivery,
    senderName,
    reactions: message.reactions,
    reply,
    attachments,
    entity: message.entity,
    requireAcknowledgement: message.requireAcknowledgement,
    acknowledged: message.acknowledged,
    acknowledgementCount: message.acknowledgementCount,
    poll: message.poll
      ? {
          id: message.poll.id,
          allowMultiple: message.poll.allowMultiple,
          anonymous: message.poll.anonymous,
          expiresAt: message.poll.expiresAt,
          options: message.poll.options.map((option) => ({
            id: option.id,
            label: option.label,
            count: option.count,
            selected: option.selected,
            voterNames: message.poll?.anonymous
              ? []
              : option.voterIds.flatMap((userId) => {
                  const name = memberNames.get(userId);
                  return name ? [name] : [];
                }),
          })),
        }
      : null,
  };
}

function toggleReactionGroups(groups: ChatReactionGroup[], emoji: string, remove: boolean): ChatReactionGroup[] {
  const next = groups.map((group) => ({ ...group }));
  const index = next.findIndex((group) => group.emoji === emoji);
  if (remove) {
    const current = next[index];
    if (index < 0 || !current?.mine) return groups;
    const count = current.count - 1;
    if (count <= 0) next.splice(index, 1);
    else next[index] = { ...current, count, mine: false };
    return next;
  }
  if (index < 0) return [...next, { emoji, count: 1, mine: true }];
  const current = next[index];
  if (!current || current.mine) return groups;
  next[index] = { ...current, count: current.count + 1, mine: true };
  return next;
}

function callReasonKey(blocked: ReturnType<typeof chatCallDisabledReason>): string | null {
  if (blocked === "send") return "chat.callBlockedSend";
  if (blocked === "role") return "chat.callBlockedRole";
  if (blocked === "policy") return "chat.callBlockedPolicy";
  if (blocked === "admins") return "chat.callBlockedAdmins";
  return null;
}

export function ConversationThread({
  conversation,
  currentUserId,
  canSend,
  canManage,
  canFilterDepartments,
  focus,
  favorite,
  onToggleFavorite,
  onBack,
  onOpenConversation,
  onOpenMessage,
  onOpenPerson,
  onOpenFile,
}: {
  conversation: ChatConversationSummary;
  currentUserId: string | null;
  canSend: boolean;
  canManage: boolean;
  canFilterDepartments: boolean;
  focus: ChatJumpTarget | null;
  favorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onOpenConversation: (id: string) => void;
  onOpenMessage: (message: ChatSearchMessage) => void;
  onOpenPerson: (person: ChatDirectoryPerson) => void;
  onOpenFile: (file: ChatSearchFile) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canCreateTicket = usePermission("issues.create");
  const canCreateIncident = usePermission("daily_ops.manage");
  const canCreatePurchase = usePermission("procurement.create");
  const canCreateTask = usePermission("facility.manage");
  const members = useChatMembers(conversation.id);
  const [anchor, setAnchor] = useState<ChatMessageCursor | null>(null);
  const [localFocus, setLocalFocus] = useState<ChatJumpTarget | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [bookmarkPendingId, setBookmarkPendingId] = useState<string | null>(null);
  const [ackPendingId, setAckPendingId] = useState<string | null>(null);
  const [votePendingId, setVotePendingId] = useState<string | null>(null);
  const messagesQuery = useChatMessages(conversation.id, anchor);
  const pinsQuery = useChatPins(conversation.id);
  const savedQuery = useSavedMessages();
  const receipt = useConversationReceipt(conversation.id);
  const connection = useChatRealtime(conversation.id);
  const presence = useChatPresence(conversation.id, currentUserId, !conversation.sensitive);
  const [showInfo, setShowInfo] = useState(false);
  const [threadSearch, setThreadSearch] = useState(false);
  const [localCall, setLocalCall] = useState<{
    id: string;
    kind: ChatCallKind;
    phase: "ringing" | "unconfigured" | "live";
    startedByMe: boolean;
    session: { token: string; serverUrl: string } | null;
  } | null>(null);
  const [callPending, setCallPending] = useState(false);
  const calls = useConversationCalls(conversation.id, canSend);
  const callBlocked = chatCallDisabledReason(conversation.callPolicy, conversation.role, canSend);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const filesRef = useRef(new Map<string, File>());
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [followToken, setFollowToken] = useState(0);
  const [latestOnScreen, setLatestOnScreen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ComposerReply | null>(null);
  const [createTarget, setCreateTarget] = useState<{ messageId: string; body: string; action: ChatActionKind } | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const createActions = useMemo(() => {
    const actions: ChatActionKind[] = [];
    if (canCreateTicket) actions.push("MAINTENANCE_TICKET");
    if (canCreateIncident) actions.push("INCIDENT");
    if (canCreatePurchase) actions.push("PURCHASE_REQUEST");
    if (canCreateTask) actions.push("TASK");
    if (canCreateIncident) actions.push("HANDOVER");
    actions.push("REMINDER");
    return actions;
  }, [canCreateIncident, canCreatePurchase, canCreateTask, canCreateTicket]);
  const setTypingRef = useRef(presence.setTyping);
  setTypingRef.current = presence.setTyping;
  const idleRef = useRef<number | null>(null);
  const roomRef = useRef(conversation.id);
  roomRef.current = conversation.id;
  const ownedCallRef = useRef<string | null>(null);

  useEffect(() => {
    setShowInfo(false);
    setThreadSearch(false);
    setLocalCall(null);
    setReplyTarget(null);
    setOutbox(readOutbox(conversation.id));
    setHydratedId(conversation.id);
    if (idleRef.current != null) window.clearTimeout(idleRef.current);
    return () => {
      if (idleRef.current != null) window.clearTimeout(idleRef.current);
      const callId = ownedCallRef.current;
      ownedCallRef.current = null;
      if (callId) void cancelCall({ callId });
    };
  }, [conversation.id]);

  useEffect(() => {
    setLocalFocus(null);
    setAnchor(null);
    setFocusNonce((value) => value + 1);
  }, [conversation.id, focus?.messageId]);

  useEffect(() => {
    if (hydratedId !== conversation.id || typeof window === "undefined") return;
    const persisted = outbox.map((item) => ({
      ...item,
      attachments: item.attachments.map((file) => ({ ...file, objectUrl: null })),
    }));
    sessionStorage.setItem(OUTBOX_PREFIX + conversation.id, JSON.stringify(persisted));
  }, [conversation.id, hydratedId, outbox]);

  const serverMessages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    return [...pages].reverse().flatMap((page) => page.messages);
  }, [messagesQuery.data]);

  const serverClientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of serverMessages) {
      if (message.clientMessageId) ids.add(message.clientMessageId);
    }
    return ids;
  }, [serverMessages]);

  useEffect(() => {
    setOutbox((current) => {
      for (const item of current) {
        if (!serverClientIds.has(item.clientMessageId)) continue;
        for (const file of item.attachments) {
          if (file.objectUrl) URL.revokeObjectURL(file.objectUrl);
          filesRef.current.delete(file.clientAttachmentId);
        }
      }
      return current.filter((item) => !serverClientIds.has(item.clientMessageId));
    });
  }, [serverClientIds]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members.data ?? []) {
      if (member.fullName) map.set(member.userId, member.fullName);
    }
    if (conversation.kind === "DIRECT" && conversation.peerUserId) {
      const peer = rosterDisplayName(conversation.peerName);
      if (peer) map.set(conversation.peerUserId, peer);
    }
    return map;
  }, [conversation.kind, conversation.peerName, conversation.peerUserId, members.data]);

  const mentionMembers = useMemo(
    () => chatMentionCandidates(members.data ?? [], currentUserId),
    [currentUserId, members.data],
  );

  const roomAllowsPost = chatCallerCanPost({
    role: conversation.role,
    postingPolicy: conversation.postingPolicy,
    archivedAt: conversation.archivedAt,
  });
  const announcementRoom = conversation.kind === "ANNOUNCEMENT";
  const canPost =
    canSend && roomAllowsPost && (!announcementRoom || conversation.role === "OWNER" || conversation.role === "ADMIN");
  const filePolicy: ChatFilePolicy =
    conversation.filePolicy === "ADMINS_ONLY" || conversation.filePolicy === "DISABLED"
      ? conversation.filePolicy
      : "MEMBERS";
  const postingPolicy: ChatPostingPolicy =
    conversation.postingPolicy === "ADMINS_ONLY" || conversation.postingPolicy === "READ_ONLY"
      ? conversation.postingPolicy
      : "MEMBERS";
  const memberRole: ChatMemberRole | null =
    conversation.role === "OWNER" ||
    conversation.role === "ADMIN" ||
    conversation.role === "MODERATOR" ||
    conversation.role === "MEMBER" ||
    conversation.role === "READ_ONLY"
      ? conversation.role
      : null;
  const canAttach = canPost && chatCanAttach(filePolicy, memberRole, postingPolicy);
  const canReact =
    canSend && memberRole != null && memberRole !== "READ_ONLY" && !conversation.archivedAt && (announcementRoom || canPost);

  const name = conversationDisplayName(conversation, (key, options) => t(key, options));
  const latestOwnId = [...serverMessages].reverse().find((message) => message.senderId === currentUserId)?.id ?? null;
  const latestServerId = serverMessages[serverMessages.length - 1]?.id ?? null;
  const peerCursor =
    receipt.data?.peer?.lastReadMessageId && receipt.data.peer.createdAt
      ? { id: receipt.data.peer.lastReadMessageId, createdAt: receipt.data.peer.createdAt }
      : null;

  const onLatestVisible = useCallback((visible: boolean) => {
    setLatestOnScreen((current) => (current === visible ? current : visible));
  }, []);
  useMarkConversationRead(conversation.id, showInfo ? null : latestServerId, latestOnScreen && !showInfo);

  const onActivity = useCallback((active: boolean) => {
    if (conversation.sensitive) return;
    if (idleRef.current != null) window.clearTimeout(idleRef.current);
    idleRef.current = null;
    if (!active) {
      setTypingRef.current(false);
      return;
    }
    setTypingRef.current(true);
    idleRef.current = window.setTimeout(() => setTypingRef.current(false), CHAT_TYPING_IDLE_MS);
  }, [conversation.sensitive]);

  function ownDelivery(message: ChatTextMessage): MessageBubbleModel["delivery"] {
    if (message.senderId !== currentUserId) return null;
    if (message.contentHidden) return null;
    if (message.body == null && (message.attachments ?? []).length === 0) return null;
    if (conversation.kind !== "DIRECT") return message.id === latestOwnId ? "sent" : null;
    const covered = chatReadCoversMessage(peerCursor, { id: message.id, createdAt: message.createdAt });
    return covered ? "read" : "sent";
  }

  const bubbles: MessageBubbleModel[] = [
    ...serverMessages.map((message) =>
      toBubble(
        message,
        message.senderId === currentUserId,
        names.get(message.senderId) ?? t("chat.memberLabel"),
        ownDelivery(message),
        message.reply ? (names.get(message.reply.senderId) ?? t("chat.memberLabel")) : t("chat.memberLabel"),
        names,
      ),
    ),
    ...outbox
      .filter((item) => !serverClientIds.has(item.clientMessageId))
      .map((item): MessageBubbleModel => ({
        id: item.clientMessageId,
        senderId: currentUserId ?? item.clientMessageId,
        type: item.voiceNote ? "VOICE_NOTE" : item.attachments.length > 0 ? "DOCUMENT" : "TEXT",
        body: item.body.trim().length > 0 ? item.body : null,
        createdAt: item.createdAt,
        contentHidden: false,
        clientMessageId: item.clientMessageId,
        mine: true,
        grouped: false,
        delivery: item.status,
        senderName: names.get(currentUserId ?? "") ?? t("chat.memberLabel"),
        reactions: [],
        entity: null,
        requireAcknowledgement: false,
        acknowledged: false,
        acknowledgementCount: 0,
        poll: null,
        attachments: item.attachments.map((file) => ({
          id: file.attachmentId ?? file.clientAttachmentId,
          filename: file.filename,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          scanStatus: "LOCAL",
          url: file.objectUrl,
          refreshable: false,
        })),
        reply: item.replyToMessageId
          ? {
              senderName: item.replySenderName ?? t("chat.memberLabel"),
              body: item.replyHidden ? null : item.replyBody,
              contentHidden: item.replyHidden || item.replyBody == null,
              file: false,
            }
          : null,
      })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const typingState = conversation.sensitive
    ? { kind: "none" as const }
    : chatTypingLabel(presence.typingPeers, (userId) => names.get(userId), Date.now());
  const typingLabel =
    typingState.kind === "named"
      ? t("chat.typingNamed", { name: typingState.name })
      : typingState.kind === "many"
        ? t("chat.typingMany", { names: typingState.names })
        : typingState.kind === "someone"
          ? t("chat.typingSomeone")
          : "";
  const showOnline = conversation.kind === "DIRECT" && !conversation.sensitive && presence.others.length > 0;

  function holdAttachment(file: PickedAttachment): OutboxFile {
    filesRef.current.set(file.clientAttachmentId, file.file);
    return {
      clientAttachmentId: file.clientAttachmentId,
      attachmentId: null,
      filename: file.filename,
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      objectUrl: URL.createObjectURL(file.file),
    };
  }

  async function deliver(
    body: string,
    clientMessageId: string,
    reply: ComposerReply | null,
    requireAcknowledgement?: boolean,
    mentionUserIds: string[] = [],
  ) {
    setOutbox((current) => {
      const rest = current.filter((item) => item.clientMessageId !== clientMessageId);
      const previous = current.find((item) => item.clientMessageId === clientMessageId);
      return [
        ...rest,
        {
          clientMessageId,
          body,
          createdAt: previous?.createdAt ?? new Date().toISOString(),
          status: "sending",
          replyToMessageId: reply?.id ?? previous?.replyToMessageId ?? null,
          replySenderName: reply?.senderName ?? previous?.replySenderName ?? null,
          replyBody: reply ? reply.body : (previous?.replyBody ?? null),
          replyHidden: reply ? reply.body == null : (previous?.replyHidden ?? false),
          attachments: previous?.attachments ?? [],
          voiceNote: false,
          requireAcknowledgement: requireAcknowledgement ?? previous?.requireAcknowledgement,
          mentionUserIds,
        },
      ];
    });
    setFollowToken((value) => value + 1);
    const result = await sendTextMessage({
      conversationId: conversation.id,
      body,
      clientMessageId,
      ...(reply?.id ? { replyToMessageId: reply.id } : {}),
      ...(requireAcknowledgement != null ? { requireAcknowledgement } : {}),
      ...(mentionUserIds.length > 0 ? { mentionUserIds } : {}),
    });
    if (!result.ok) {
      setOutbox((current) =>
        current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: "failed" } : item)),
      );
      return;
    }
    setOutbox((current) =>
      current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: "sent" } : item)),
    );
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
  }

  function replyFrom(item: OutboxItem): ComposerReply | null {
    if (!item.replyToMessageId) return null;
    return {
      id: item.replyToMessageId,
      senderName: item.replySenderName ?? t("chat.memberLabel"),
      body: item.replyHidden ? null : item.replyBody,
    };
  }

  async function deliverFiles(input: {
    body: string;
    clientMessageId: string;
    reply: ComposerReply | null;
    attachments: OutboxFile[];
    voiceNote?: boolean;
    mentionUserIds?: string[];
  }) {
    const clientMessageId = chatResolveClientMessageId({
      status: "failed",
      clientMessageId: input.clientMessageId,
      nextId: input.clientMessageId,
    });
    setOutbox((current) => {
      const rest = current.filter((item) => item.clientMessageId !== clientMessageId);
      const previous = current.find((item) => item.clientMessageId === clientMessageId);
      return [
        ...rest,
        {
          clientMessageId,
          body: input.body,
          createdAt: previous?.createdAt ?? new Date().toISOString(),
          status: "uploading",
          replyToMessageId: input.reply?.id ?? previous?.replyToMessageId ?? null,
          replySenderName: input.reply?.senderName ?? previous?.replySenderName ?? null,
          replyBody: input.reply ? input.reply.body : (previous?.replyBody ?? null),
          replyHidden: input.reply ? input.reply.body == null : (previous?.replyHidden ?? false),
          attachments: input.attachments,
          voiceNote: input.voiceNote === true || previous?.voiceNote === true,
          mentionUserIds: input.mentionUserIds ?? previous?.mentionUserIds ?? [],
        },
      ];
    });
    setFollowToken((value) => value + 1);

    const attachmentIds: string[] = [];
    for (const file of input.attachments) {
      let attachmentId = file.attachmentId;
      if (!attachmentId) {
        const held = filesRef.current.get(file.clientAttachmentId);
        if (!held) {
          toast.error(input.voiceNote ? t("chat.recordAgain") : t("chat.chooseFileAgain"));
          setOutbox((current) =>
            current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: "failed" } : item)),
          );
          return;
        }
        const dataBase64 = encodeChatBytesBase64(new Uint8Array(await held.arrayBuffer()));
        const prepared = await prepareChatAttachment({
          conversationId: conversation.id,
          clientAttachmentId: file.clientAttachmentId,
          filename: file.filename,
          mimeType: file.mimeType,
          dataBase64,
        });
        if (!prepared.ok) {
          toast.error(prepared.error);
          setOutbox((current) =>
            current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: "failed" } : item)),
          );
          return;
        }
        attachmentId = prepared.data.id;
        file.attachmentId = attachmentId;
        setOutbox((current) =>
          current.map((item) =>
            item.clientMessageId === clientMessageId
              ? {
                  ...item,
                  attachments: item.attachments.map((row) =>
                    row.clientAttachmentId === file.clientAttachmentId ? { ...row, attachmentId } : row,
                  ),
                }
              : item,
          ),
        );
      }
      attachmentIds.push(attachmentId);
    }

    setOutbox((current) =>
      current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: "sending" } : item)),
    );
    const result = await sendAttachmentMessage({
      conversationId: conversation.id,
      clientMessageId,
      attachmentIds,
      ...(input.body.trim() ? { body: input.body.trim() } : {}),
      ...(input.reply?.id ? { replyToMessageId: input.reply.id } : {}),
      ...(input.voiceNote ? { voiceNote: true as const } : {}),
      ...(input.mentionUserIds && input.mentionUserIds.length > 0 ? { mentionUserIds: input.mentionUserIds } : {}),
    });
    if (!result.ok) {
      toast.error(result.error);
      setOutbox((current) =>
        current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: "failed" } : item)),
      );
      return;
    }
    setOutbox((current) =>
      current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: "sent" } : item)),
    );
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
  }

  function retry(clientMessageId: string) {
    const item = outbox.find((row) => row.clientMessageId === clientMessageId);
    if (!item) return;
    const id = chatResolveClientMessageId({
      status: "failed",
      clientMessageId: item.clientMessageId,
      nextId: item.clientMessageId,
    });
    if (item.attachments.length > 0) {
      const missing = item.attachments.some(
        (file) => !file.attachmentId && !filesRef.current.has(file.clientAttachmentId),
      );
      if (missing) {
        toast.error(item.voiceNote ? t("chat.recordAgain") : t("chat.chooseFileAgain"));
        return;
      }
      void deliverFiles({
        body: item.body,
        clientMessageId: id,
        reply: replyFrom(item),
        attachments: item.attachments,
        voiceNote: item.voiceNote,
        mentionUserIds: item.mentionUserIds,
      });
      return;
    }
    void deliver(item.body, id, replyFrom(item), item.requireAcknowledgement, item.mentionUserIds);
  }

  async function acknowledge(messageId: string) {
    setAckPendingId(messageId);
    const result = await acknowledgeAnnouncement({ messageId, conversationId: conversation.id });
    setAckPendingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
  }

  async function vote(pollId: string, optionIds: string[]) {
    setVotePendingId(pollId);
    const result = await castVote({ pollId, optionIds });
    setVotePendingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
  }

  async function publishPoll(input: PollDraft) {
    const result = await createPoll({ conversationId: conversation.id, ...input });
    if (!result.ok) throw new Error(result.error);
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.list() });
  }

  function toggleReaction(messageId: string, emoji: string, mine: boolean) {
    const key = queryKeys.chat.messages(conversation.id);
    const previous = queryClient.getQueryData(key);
    queryClient.setQueryData(key, (current: unknown) => {
      if (!current || typeof current !== "object" || !("pages" in current)) return current;
      const data = current as { pages: ChatMessagePage[]; pageParams: unknown[] };
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          messages: page.messages.map((message) =>
            message.id === messageId
              ? { ...message, reactions: toggleReactionGroups(message.reactions, emoji, mine) }
              : message,
          ),
        })),
      };
    });
    const request = mine ? removeReaction({ messageId, emoji }) : addReaction({ messageId, emoji });
    void request.then((result) => {
      if (!result.ok) {
        queryClient.setQueryData(key, previous);
        toast.error(result.error);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: key });
    });
  }

  const pinnedRows = pinsQuery.data ?? [];
  const pinnedIds = useMemo(() => new Set(pinnedRows.map((pin) => pin.messageId)), [pinnedRows]);
  const savedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of savedQuery.data ?? []) {
      if (row.conversationId === conversation.id) ids.add(row.messageId);
    }
    return ids;
  }, [conversation.id, savedQuery.data]);
  const activeFocus =
    localFocus && localFocus.conversationId === conversation.id
      ? localFocus
      : focus && focus.conversationId === conversation.id
        ? focus
        : null;
  const focusInPage = activeFocus != null && bubbles.some((row) => row.id === activeFocus.messageId);

  function focusMessage(target: ChatJumpTarget) {
    setAnchor(null);
    setLocalFocus(target);
    setFocusNonce((value) => value + 1);
  }

  function loadFocused() {
    if (!activeFocus) return;
    setAnchor({ id: activeFocus.messageId, createdAt: activeFocus.createdAt });
    setFocusNonce((value) => value + 1);
  }

  async function changePin(messageId: string, pinned: boolean) {
    setBookmarkPendingId(messageId);
    const result = pinned ? await unpinMessage({ messageId }) : await pinMessage({ messageId });
    setBookmarkPendingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.pins(conversation.id) });
  }

  async function changeSave(messageId: string, saved: boolean) {
    setBookmarkPendingId(messageId);
    const result = saved ? await unsaveMessage({ messageId }) : await saveMessage({ messageId });
    setBookmarkPendingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.saved() });
  }

  async function submitCreate(input: CreateFromMessageInput) {
    if (!createTarget) return;
    setCreatePending(true);
    const result = await createActionFromMessage({
      messageId: createTarget.messageId,
      conversationId: conversation.id,
      action: createTarget.action,
      locationId: input.locationId,
      incidentCategory: input.incidentCategory,
      incidentSeverity: input.incidentSeverity,
      taskCategory: input.taskCategory,
      taskDueDate: input.taskDueDate,
      handoverShift: input.handoverShift,
      reminderOn: input.reminderOn,
    });
    setCreatePending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const href = result.data.href;
    const text = t(`chat.actionCreated.${createTarget.action}`, { label: result.data.label });
    if (href) {
      toast.success(text, { action: { label: t("chat.entityOpen"), onClick: () => router.push(href) } });
    } else {
      toast.success(text);
    }
    setCreateTarget(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.list() });
  }

  useEffect(() => {
    if (!localCall) return;
    const row = calls.items.find((item) => item.id === localCall.id);
    if (row && row.status !== "RINGING" && row.status !== "ACTIVE") {
      if (ownedCallRef.current === localCall.id) ownedCallRef.current = null;
      setLocalCall(null);
    }
  }, [calls.items, localCall]);

  function showUnconfigured(callId: string) {
    if (roomRef.current !== conversation.id) return;
    setLocalCall((current) =>
      current && current.id === callId ? { ...current, phase: "unconfigured", session: null } : current,
    );
  }

  function applyIssuedToken(
    callId: string,
    issued: Awaited<ReturnType<typeof issueCallToken>>,
  ) {
    if (!issued.ok) {
      toast.error(issued.error);
      return;
    }
    if (
      issued.data.state === "issued" &&
      issued.data.session.provider === "livekit" &&
      issued.data.session.token &&
      issued.data.session.serverUrl
    ) {
      const session = { token: issued.data.session.token, serverUrl: issued.data.session.serverUrl };
      setLocalCall((current) => (current && current.id === callId ? { ...current, phase: "live", session } : current));
      return;
    }
    showUnconfigured(callId);
  }

  async function releaseOwnedCall(callId: string) {
    if (ownedCallRef.current === callId) ownedCallRef.current = null;
    await cancelCall({ callId });
  }

  async function beginCall(kind: ChatCallKind) {
    if (callBlocked || callPending) return;
    const roomId = conversation.id;
    setCallPending(true);
    const started = await startCall({ conversationId: roomId, kind });
    if (roomRef.current !== roomId) {
      setCallPending(false);
      if (started.ok) void cancelCall({ callId: started.data.id });
      return;
    }
    if (!started.ok) {
      toast.error(started.error);
      setCallPending(false);
      return;
    }
    ownedCallRef.current = started.data.id;
    setLocalCall({ id: started.data.id, kind: started.data.kind, phase: "ringing", startedByMe: true, session: null });
    const issued = await issueCallToken({ callId: started.data.id });
    if (roomRef.current !== roomId) {
      setCallPending(false);
      void releaseOwnedCall(started.data.id);
      return;
    }
    setCallPending(false);
    applyIssuedToken(started.data.id, issued);
    await calls.refresh();
  }

  async function acceptIncoming(call: ChatCallHistoryItem) {
    if (callPending) return;
    const roomId = conversation.id;
    setCallPending(true);
    const responded = await respondCall({ callId: call.id, response: "ACCEPT" });
    if (roomRef.current !== roomId) {
      setCallPending(false);
      return;
    }
    if (!responded.ok) {
      toast.error(responded.error);
      setCallPending(false);
      return;
    }
    setLocalCall({ id: call.id, kind: call.kind, phase: "ringing", startedByMe: false, session: null });
    const issued = await issueCallToken({ callId: call.id });
    if (roomRef.current !== roomId) {
      setCallPending(false);
      return;
    }
    setCallPending(false);
    applyIssuedToken(call.id, issued);
    await calls.refresh();
  }

  async function rejectIncoming(callId: string) {
    if (callPending) return;
    setCallPending(true);
    const responded = await respondCall({ callId, response: "REJECT" });
    setCallPending(false);
    if (!responded.ok) {
      toast.error(responded.error);
      return;
    }
    await calls.refresh();
  }

  async function cancelLocalCall() {
    if (!localCall || !localCall.startedByMe || callPending) return;
    const callId = localCall.id;
    ownedCallRef.current = null;
    setCallPending(true);
    const result = await cancelCall({ callId });
    setCallPending(false);
    if (!result.ok) {
      ownedCallRef.current = callId;
      toast.error(result.error);
      return;
    }
    setLocalCall(null);
    await calls.refresh();
  }

  async function endLocalCall() {
    if (!localCall || callPending) return;
    const callId = localCall.id;
    setCallPending(true);
    const result = await endCall({ callId });
    setCallPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (ownedCallRef.current === callId) ownedCallRef.current = null;
    setLocalCall(null);
    await calls.refresh();
  }

  const incoming = calls.items.find((item) => item.awaitingViewer && item.id !== localCall?.id) ?? null;

  const listError =
    messagesQuery.isError && !messagesQuery.data
      ? messagesQuery.error instanceof Error
        ? messagesQuery.error.message
        : t("chat.loadFailed")
      : null;

  const subtitle =
    conversation.kind === "DIRECT" ? t("chat.subtitleDirect") : t("chat.memberCount", { count: conversation.memberCount });
  const connectionLabel = connection === "subscribed" ? null : t(`chat.connection.${connection}`);
  const callReasonKeyName = callReasonKey(callBlocked);
  const callReason = callReasonKeyName ? t(callReasonKeyName) : null;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 min-w-11 shrink-0 px-2 md:hidden"
          aria-label={t("chat.back")}
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
        </Button>
        <ConversationAvatar name={name} kind={conversation.kind} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            <span>{subtitle}</span>
            {showOnline ? <span> · {t("chat.online")}</span> : null}
            {connectionLabel ? (
              <span role="status"> · {connectionLabel}</span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground"
          aria-pressed={threadSearch}
          aria-label={threadSearch ? t("chat.searchClose") : t("chat.searchInThread")}
          onClick={() => {
            setThreadSearch((open) => !open);
            setShowInfo(false);
          }}
        >
          <Search className="h-4 w-4" aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={t("chat.moreActions")}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={callReason != null || callPending} onSelect={() => void beginCall("VOICE")}>
              <Phone aria-hidden />
              {callReason ? `${t("chat.callVoice")} — ${callReason}` : t("chat.callVoice")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={callReason != null || callPending} onSelect={() => void beginCall("VIDEO")}>
              <Video aria-hidden />
              {callReason ? `${t("chat.callVideo")} — ${callReason}` : t("chat.callVideo")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setShowInfo((open) => !open);
                setThreadSearch(false);
              }}
            >
              {showInfo ? t("chat.hideInfo") : t("chat.showInfo")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleFavorite}>
              <Star aria-hidden />
              {favorite ? t("chat.favoriteRemove") : t("chat.favoriteAdd")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {threadSearch ? (
        <div className="max-h-72 shrink-0 overflow-y-auto border-b border-border">
          <SearchPanel
            conversationId={conversation.id}
            locked
            canFilterDepartments={canFilterDepartments}
            onOpenConversation={onOpenConversation}
            onOpenMessage={onOpenMessage}
            onOpenPerson={onOpenPerson}
            onOpenFile={onOpenFile}
          />
        </div>
      ) : null}

      {incoming ? (
        <div className="max-h-40 shrink-0 overflow-y-auto border-b border-border bg-card">
          <IncomingCall call={incoming} pending={callPending} onAccept={(call) => void acceptIncoming(call)} onReject={(callId) => void rejectIncoming(callId)} />
        </div>
      ) : null}
      {localCall ? (
        <div
          className={
            localCall.phase === "live"
              ? "shrink-0 border-b border-border bg-card"
              : "max-h-40 shrink-0 overflow-y-auto border-b border-border bg-card"
          }
        >
          <CallOverlay
            kind={localCall.kind}
            phase={localCall.phase}
            startedByMe={localCall.startedByMe}
            pending={callPending}
            session={localCall.session}
            onCancel={() => void cancelLocalCall()}
            onDismiss={() => setLocalCall(null)}
            onEnd={() => void endLocalCall()}
          />
        </div>
      ) : null}

      {showInfo ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-card p-4">
          <div className="mb-3 md:hidden">
            <Button type="button" variant="outline" className="min-h-11 px-3" onClick={() => setShowInfo(false)}>
              {t("chat.hideInfo")}
            </Button>
          </div>
          <ConversationInfo
            conversation={conversation}
            currentUserId={currentUserId}
            canManage={canManage}
            callHistory={calls.items}
            callHistoryError={calls.error}
          />
        </div>
      ) : (
        <>
          {pinnedRows.length > 0 ? (
            <div role="region" className="border-b border-border" aria-label={t("chat.pinnedLabel")}>
              {pinnedRows.map((pin) => (
                <button
                  key={pin.messageId}
                  type="button"
                  className="block w-full truncate px-3 py-1 text-start text-xs hover:bg-muted/70"
                  onClick={() =>
                    focusMessage({
                      messageId: pin.messageId,
                      conversationId: pin.conversationId,
                      createdAt: pin.createdAt,
                      snippet: pin.snippet ?? t("chat.deleted"),
                    })
                  }
                >
                  <span className="me-2 font-medium text-muted-foreground">{t("chat.pinnedLabel")}</span>
                  {pin.snippet ?? t("chat.deleted")}
                </button>
              ))}
            </div>
          ) : null}
          {activeFocus && !focusInPage ? (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{activeFocus.snippet}</p>
              <Button type="button" size="sm" variant="outline" onClick={loadFocused}>
                {t("chat.loadMessage")}
              </Button>
            </div>
          ) : null}
          <MessageList
            messages={bubbles}
            loading={messagesQuery.isLoading}
            error={listError}
            hasOlder={Boolean(messagesQuery.hasNextPage)}
            loadingOlder={messagesQuery.isFetchingNextPage}
            followToken={followToken}
            lastReadMessageId={receipt.data?.self?.lastReadMessageId ?? null}
            canReact={canReact}
            onAcknowledge={(messageId) => {
              void acknowledge(messageId);
            }}
            onVote={(pollId, optionIds) => {
              void vote(pollId, optionIds);
            }}
            ackPendingId={ackPendingId}
            votePendingId={votePendingId}
            scrollToId={focusInPage && activeFocus ? activeFocus.messageId : null}
            focusNonce={focusNonce}
            pinnedIds={pinnedIds}
            savedIds={savedIds}
            bookmarkPendingId={bookmarkPendingId}
            onLoadOlder={() => {
              void messagesQuery.fetchNextPage();
            }}
            onPin={(messageId, pinned) => {
              void changePin(messageId, pinned);
            }}
            onSave={(messageId, saved) => {
              void changeSave(messageId, saved);
            }}
            onRetry={retry}
            onReply={(message) => {
              const fileLabel =
                message.type === "VOICE_NOTE"
                  ? t("chat.voiceNote")
                  : message.attachments.length > 0
                    ? t("chat.attachment")
                    : null;
              setReplyTarget({
                id: message.id,
                senderName: message.senderName,
                body: message.contentHidden ? null : (message.body ?? fileLabel),
              });
            }}
            onToggleReaction={toggleReaction}
            onLatestVisible={onLatestVisible}
            createActions={createActions}
            onCreateAction={(message, action) => {
              if (!message.body) return;
              setCreateTarget({ messageId: message.id, body: message.body, action });
            }}
          />
          {conversation.sensitive ? null : (
            <p aria-live="polite" className="min-h-5 shrink-0 truncate px-3 text-xs text-muted-foreground">
              {typingLabel}
            </p>
          )}
          <MessageComposer
            conversationId={conversation.id}
            canPost={canPost}
            canAttach={canAttach}
            announcement={announcementRoom}
            reply={replyTarget}
            mentionMembers={mentionMembers}
            mentionsReady={members.isSuccess}
            onCancelReply={() => setReplyTarget(null)}
            onActivity={onActivity}
            onCreatePoll={canPost ? publishPoll : undefined}
            onShare={async (input) => {
              const result = await shareEntityInChat({ conversationId: conversation.id, ...input });
              if (!result.ok) throw new Error(result.error);
              await queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversation.id) });
              await queryClient.invalidateQueries({ queryKey: queryKeys.chat.list() });
            }}
            onSend={({ body, clientMessageId, replyToMessageId, attachments, voiceNote, requireAcknowledgement, mentionUserIds }) => {
              const reply = replyTarget && replyTarget.id === replyToMessageId ? replyTarget : null;
              setReplyTarget(null);
              if (attachments.length === 0) {
                void deliver(body, clientMessageId, reply, requireAcknowledgement, mentionUserIds);
                return;
              }
              const files = attachments.map((file) => holdAttachment(file));
              void deliverFiles({ body, clientMessageId, reply, attachments: files, voiceNote, mentionUserIds });
            }}
          />
          {createTarget ? (
            <CreateFromMessageDialog
              key={`${createTarget.messageId}:${createTarget.action}`}
              open
              action={createTarget.action}
              messageBody={createTarget.body}
              conversationLocationId={conversation.locationId}
              pending={createPending}
              onOpenChange={(open) => {
                if (!open && !createPending) setCreateTarget(null);
              }}
              onSubmit={(input) => {
                void submitCreate(input);
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
