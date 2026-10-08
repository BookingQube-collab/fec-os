"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listCallHistory, type ChatCallHistoryItem } from "@/lib/chat.functions";

const CALL_POLL_MS = 3000;

export function useConversationCalls(conversationId: string, enabled: boolean) {
  const [items, setItems] = useState<ChatCallHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const ticket = generation.current + 1;
    generation.current = ticket;
    const result = await listCallHistory({ conversationId });
    if (!alive.current || generation.current !== ticket) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setItems(result.data);
  }, [conversationId]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, CALL_POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  return { items, error, refresh };
}
