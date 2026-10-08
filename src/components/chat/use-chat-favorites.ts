"use client";

import { useCallback, useEffect, useState } from "react";

const PREFIX = "fec-chat-favorites:";

function readFavorites(userId: string): string[] {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** Per-user favorites stored on this device. There is no server favorite field. */
export function useChatFavorites(userId: string | null) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) {
      setIds([]);
      return;
    }
    setIds(readFavorites(userId));
  }, [userId]);

  const toggle = useCallback(
    (conversationId: string) => {
      if (!userId) return;
      setIds((current) => {
        const next = current.includes(conversationId)
          ? current.filter((id) => id !== conversationId)
          : [...current, conversationId];
        localStorage.setItem(PREFIX + userId, JSON.stringify(next));
        return next;
      });
    },
    [userId],
  );

  return { ids, toggle };
}
