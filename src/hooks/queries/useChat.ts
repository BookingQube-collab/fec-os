"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  listChatDepartments,
  listConversationMembers,
  listConversationReceipt,
  getGlobalChatNotification,
  listDirectory,
  listMessages,
  listMyConversations,
  listPins,
  listSaved,
  markConversationRead,
  searchChat,
  searchChatEntities,
} from "@/lib/chat.functions";
import type { ChatSearchFileType } from "@/lib/chat/search-rules";
import { CHAT_SHAREABLE_ENTITY_TYPES, type ChatShareableEntityType } from "@/lib/chat/entity-rules";
import type { ChatMessageCursor } from "@/lib/chat/message-rules";
import {
  CHAT_MESSAGE_PAGE_DEFAULT,
  chatRealtimeStatusFromChannel,
  chatStripRealtimeContent,
  type ChatRealtimeStatus,
} from "@/lib/chat/message-rules";
import {
  applyChatTypingSignal,
  chatTypingSignalFromUnknown,
  expireChatTypingPeers,
  nextTypingEmit,
  type ChatTypingPeer,
} from "@/lib/chat/typing-rules";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

async function unwrap<T>(result: Promise<{ ok: true; data: T } | { ok: false; error: string }>): Promise<T> {
  const resolved = await result;
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.data;
}

export function useGlobalChatNotification() {
  return useQuery({
    queryKey: queryKeys.chat.notificationSettings(),
    queryFn: () => unwrap(getGlobalChatNotification({})),
    staleTime: STALE.chat,
  });
}

export function useMyConversations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.list(),
    queryFn: () => unwrap(listMyConversations({})),
    staleTime: STALE.chat,
    enabled: options?.enabled ?? true,
  });
}

export function useChatMembers(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.chat.members(conversationId),
    queryFn: () => unwrap(listConversationMembers({ conversationId: conversationId ?? "" })),
    staleTime: STALE.chat,
    enabled: Boolean(conversationId),
  });
}

export type ChatSearchFilters = {
  query: string;
  conversationId?: string;
  locationId?: string;
  departmentId?: string;
  from?: string;
  to?: string;
  fileType?: ChatSearchFileType;
};

function chatSearchKey(filters: ChatSearchFilters): string {
  return [
    filters.query.trim(),
    filters.conversationId ?? "",
    filters.locationId ?? "",
    filters.departmentId ?? "",
    filters.from ?? "",
    filters.to ?? "",
    filters.fileType ?? "",
  ].join("\n");
}

export function useChatSearch(filters: ChatSearchFilters | null) {
  const key = filters ? chatSearchKey(filters) : "";
  return useQuery({
    queryKey: queryKeys.chat.search(key),
    queryFn: () =>
      unwrap(
        searchChat({
          query: filters?.query.trim() ?? "",
          ...(filters?.conversationId ? { conversationId: filters.conversationId } : {}),
          ...(filters?.locationId ? { locationId: filters.locationId } : {}),
          ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
          ...(filters?.from ? { from: filters.from } : {}),
          ...(filters?.to ? { to: filters.to } : {}),
          ...(filters?.fileType ? { fileType: filters.fileType } : {}),
        }),
      ),
    staleTime: STALE.chat,
    enabled: Boolean(filters && filters.query.trim().length >= 2),
  });
}

export function useChatPins(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.chat.pins(conversationId),
    queryFn: () => unwrap(listPins({ conversationId: conversationId ?? "" })),
    staleTime: STALE.chat,
    enabled: Boolean(conversationId),
  });
}

export function useSavedMessages(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.saved(),
    queryFn: () => unwrap(listSaved({})),
    staleTime: STALE.chat,
    enabled: options?.enabled ?? true,
  });
}

export function useChatDirectory(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.directory(""),
    queryFn: () => unwrap(listDirectory({ query: "" })),
    staleTime: STALE.people,
    enabled: options?.enabled ?? true,
  });
}

export function useChatEntitySearch(query: string, entityType: string | null, enabled = true) {
  const term = query.trim();
  const type = (CHAT_SHAREABLE_ENTITY_TYPES as readonly string[]).includes(entityType ?? "")
    ? (entityType as ChatShareableEntityType)
    : undefined;
  return useQuery({
    queryKey: queryKeys.chat.entitySearch(term, type ?? null),
    queryFn: () => unwrap(searchChatEntities(type ? { query: term, entityType: type } : { query: term })),
    staleTime: STALE.chat,
    enabled: enabled && term.length >= 2,
  });
}

export function useChatDepartments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.departments(),
    queryFn: () => unwrap(listChatDepartments({})),
    staleTime: STALE.people,
    enabled: options?.enabled ?? true,
  });
}

export function useChatMessages(conversationId: string | null, through?: ChatMessageCursor | null) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.chat.messages(conversationId), through?.id ?? "head"],
    queryFn: ({ pageParam }) =>
      unwrap(
        listMessages({
          conversationId: conversationId ?? "",
          ...(pageParam ? { cursor: pageParam } : through ? { through } : {}),
          limit: CHAT_MESSAGE_PAGE_DEFAULT,
        }),
      ),
    initialPageParam: undefined as ChatMessageCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: STALE.chat,
    enabled: Boolean(conversationId),
  });
}

const CONVERSATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One channel for the open conversation. The payload is an invalidation signal.
 * Message text is loaded from chat_messages_visible by the messages query.
 */
export function useChatRealtime(conversationId: string | null) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ChatRealtimeStatus>("closed");

  useEffect(() => {
    if (!conversationId || !CONVERSATION_UUID.test(conversationId)) {
      setStatus("closed");
      return;
    }

    setStatus("reconnecting");
    const channel = supabase
      .channel(`chat-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        } as never,
        (payload: unknown) => {
          chatStripRealtimeContent(payload);
          void queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(conversationId) });
        },
      )
      .subscribe((next) => {
        const socketState = supabase.realtime.connectionState();
        setStatus(chatRealtimeStatusFromChannel(next, socketState));
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return status;
}

/**
 * chat_read_states is not in supabase_realtime (phase 5 publishes chat_messages
 * only). This refetches the open conversation's cursors on focus and on a slow
 * timer while the tab is visible. It does not open a postgres_changes channel.
 */
export function useConversationReceipt(conversationId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.chat.receipt(conversationId),
    queryFn: () => unwrap(listConversationReceipt({ conversationId: conversationId ?? "" })),
    staleTime: STALE.chat,
    enabled: Boolean(conversationId),
  });

  useEffect(() => {
    if (!conversationId) return;
    function refreshReceipt() {
      if (document.visibilityState === "hidden") return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.receipt(conversationId) });
    }
    function refreshAll() {
      refreshReceipt();
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.list() });
    }
    function onVisibility() {
      if (document.visibilityState === "visible") refreshAll();
    }
    window.addEventListener("focus", refreshAll);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refreshReceipt, 15_000);
    return () => {
      window.removeEventListener("focus", refreshAll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [conversationId, queryClient]);

  return query;
}

/** Debounced conversation cursor. Skips a hidden tab and does not run per scroll pixel. */
export function useMarkConversationRead(
  conversationId: string | null,
  latestMessageId: string | null,
  latestOnScreen: boolean,
) {
  const queryClient = useQueryClient();
  const markedRef = useRef<string | null>(null);
  const [visibleTick, setVisibleTick] = useState(0);

  useEffect(() => {
    markedRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    function onShow() {
      if (document.visibilityState === "visible") setVisibleTick((value) => value + 1);
    }
    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  useEffect(() => {
    if (!conversationId || !latestMessageId || !latestOnScreen) return;
    if (markedRef.current === latestMessageId) return;
    if (document.visibilityState === "hidden") return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      markedRef.current = latestMessageId;
      void markConversationRead({ conversationId, lastReadMessageId: latestMessageId }).then((result) => {
        if (!result.ok) {
          if (markedRef.current === latestMessageId) markedRef.current = null;
          return;
        }
        if (!result.data.advanced) return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.receipt(conversationId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.list() });
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [conversationId, latestMessageId, latestOnScreen, queryClient, visibleTick]);
}

export type ChatPresencePeer = {
  userId: string;
};

const PRESENCE_TOPIC_PREFIX = "realtime:chat-presence:";

function presenceTopic(conversationId: string) {
  return `chat-presence:${conversationId}`;
}

async function retirePresenceChannels(conversationId: string) {
  const topic = `${PRESENCE_TOPIC_PREFIX}${conversationId}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stale = supabase.getChannels().filter((channel) => channel.topic === topic);
    if (stale.length === 0) return;
    await Promise.all(stale.map((channel) => supabase.removeChannel(channel)));
  }
}

function publishTyping(channel: ReturnType<typeof supabase.channel>, userId: string, typing: boolean) {
  void channel
    .send({
      type: "broadcast",
      event: "typing",
      payload: { userId, typing },
    })
    .catch(() => undefined);
}

/**
 * Ephemeral presence for the open conversation. Nothing is written to Postgres.
 * Typing is a broadcast on this same channel: presence track updates do not
 * reliably deliver later keystrokes, and a reused React channel never rejoins.
 * Sensitive rooms pass enabled=false and do not join the channel.
 */
export function useChatPresence(conversationId: string | null, userId: string | null, enabled: boolean) {
  const [others, setOthers] = useState<ChatPresencePeer[]>([]);
  const [typingPeers, setTypingPeers] = useState<ChatTypingPeer[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const readyRef = useRef(false);
  const desiredTyping = useRef(false);
  const lastTrueAt = useRef(0);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const setTyping = useCallback((typing: boolean) => {
    if (!typing && !desiredTyping.current) return;
    const decision = nextTypingEmit(typing, Date.now(), lastTrueAt.current);
    desiredTyping.current = typing;
    if (!decision.emit) return;
    lastTrueAt.current = decision.lastTrueAt;
    const channel = channelRef.current;
    const selfId = userIdRef.current;
    if (!channel || !readyRef.current || !selfId) return;
    publishTyping(channel, selfId, typing);
  }, []);

  useEffect(() => {
    if (!enabled || !conversationId || !userId || !CONVERSATION_UUID.test(conversationId)) {
      setOthers([]);
      setTypingPeers([]);
      return;
    }

    let disposed = false;
    readyRef.current = false;
    desiredTyping.current = false;
    lastTrueAt.current = 0;
    const topic = presenceTopic(conversationId);

    const applyOnline = (channel: ReturnType<typeof supabase.channel>) => {
      const state = channel.presenceState() as Record<string, Array<{ userId?: string }>>;
      const peers: ChatPresencePeer[] = [];
      for (const [key, metas] of Object.entries(state)) {
        const meta = metas[metas.length - 1];
        const peerId = typeof meta?.userId === "string" && meta.userId ? meta.userId : key;
        if (!peerId || peerId === userId) continue;
        peers.push({ userId: peerId });
      }
      peers.sort((left, right) => left.userId.localeCompare(right.userId));
      setOthers((current) => {
        if (current.length === peers.length && current.every((peer, index) => peer.userId === peers[index]?.userId)) {
          return current;
        }
        return peers;
      });
    };

    void (async () => {
      await retirePresenceChannels(conversationId);
      if (disposed) return;

      const channel = supabase.channel(topic, {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: userId, enabled: true },
        },
      });
      channelRef.current = channel;

      channel.on("broadcast", { event: "typing" }, (payload) => {
        const signal = chatTypingSignalFromUnknown(payload);
        if (!signal) return;
        const now = Date.now();
        setTypingPeers((current) => applyChatTypingSignal(current, signal, userIdRef.current, now));
      });
      channel.on("presence", { event: "sync" }, () => {
        if (!disposed) applyOnline(channel);
      });
      channel.subscribe((status) => {
        if (disposed || status !== "SUBSCRIBED") return;
        readyRef.current = true;
        applyOnline(channel);
        const selfId = userIdRef.current;
        if (selfId) void channel.track({ userId: selfId });
        if (desiredTyping.current && selfId) {
          lastTrueAt.current = Date.now();
          publishTyping(channel, selfId, true);
        }
      });
    })();

    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingPeers((current) => expireChatTypingPeers(current, now));
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      const channel = channelRef.current;
      const selfId = userIdRef.current;
      const wasTyping = desiredTyping.current;
      readyRef.current = false;
      desiredTyping.current = false;
      lastTrueAt.current = 0;
      channelRef.current = null;
      if (channel && wasTyping && selfId) publishTyping(channel, selfId, false);
      if (channel) {
        void channel.untrack();
        void supabase.removeChannel(channel);
      }
      setOthers([]);
      setTypingPeers([]);
    };
  }, [conversationId, enabled, userId]);

  return { others, typingPeers, setTyping };
}
