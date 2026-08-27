"use client";

import { useEffect } from "react";

import {
  listFieldCheckInQueue,
  removeFieldCheckIn,
  type QueuedFieldCheckIn,
} from "@/lib/attendance-hr/offline-queue";
import { submitFieldCheckIn } from "@/lib/attendance-hr-field.functions";

async function flushQueue(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const pending = await listFieldCheckInQueue();
  let flushed = 0;
  for (const item of pending) {
    try {
      await submitFieldCheckIn({
        ...item.payload,
        clientEventId: item.clientEventId,
        queuedOffline: true,
        recordedAt: item.payload.recordedAt ?? item.queuedAt,
      });
      await removeFieldCheckIn(item.clientEventId);
      flushed += 1;
    } catch {
      /* keep in queue until a later pass */
    }
  }
  return flushed;
}

export function HrFieldSync() {
  useEffect(() => {
    const run = () => {
      void flushQueue();
    };
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
  return null;
}

export async function queueOrSubmitFieldCheckIn(
  payload: QueuedFieldCheckIn["payload"] & { clientEventId?: string },
): Promise<{ queued: boolean }> {
  const clientEventId = payload.clientEventId ?? crypto.randomUUID();
  const body = { ...payload, clientEventId };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const { enqueueFieldCheckIn } = await import("@/lib/attendance-hr/offline-queue");
    await enqueueFieldCheckIn({
      clientEventId,
      queuedAt: new Date().toISOString(),
      payload: body,
    });
    return { queued: true };
  }
  try {
    await submitFieldCheckIn(body);
    return { queued: false };
  } catch (error) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const { enqueueFieldCheckIn } = await import("@/lib/attendance-hr/offline-queue");
      await enqueueFieldCheckIn({
        clientEventId,
        queuedAt: new Date().toISOString(),
        payload: body,
      });
      return { queued: true };
    }
    throw error;
  }
}
