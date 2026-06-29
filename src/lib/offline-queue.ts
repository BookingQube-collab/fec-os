// Tiny offline action queue (localStorage-backed) for Task Management.
// Actions are JSON-serializable {kind, payload, id, retries}.
// Replays sequentially when navigator.onLine becomes true or on app mount.

import { completeTaskItem, uploadTaskPhoto } from "@/lib/tasks.functions";

type CompletePayload = {
  instance_id: string;
  item_id: string;
  checked: boolean;
  photo_path?: string;
  note?: string;
};

type QueuedAction =
  | { id: string; kind: "complete"; payload: CompletePayload; retries: number }
  | { id: string; kind: "upload-and-complete"; payload: {
      instance_id: string; item_id: string; filename: string; data_base64: string; content_type: string;
      note?: string;
    }; retries: number };

const KEY = "fec.task-queue.v1";

function read(): QueuedAction[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(q: QueuedAction[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(q));
  window.dispatchEvent(new CustomEvent("fec-queue-changed"));
}

export function queueSize(): number { return read().length; }

export function enqueue(action: Omit<QueuedAction, "id" | "retries">) {
  const q = read();
  q.push({ ...action, id: crypto.randomUUID(), retries: 0 } as QueuedAction);
  write(q);
}

let flushing = false;
export async function flushQueue(): Promise<{ done: number; remaining: number; failed: number }> {
  if (flushing) return { done: 0, remaining: read().length, failed: 0 };
  flushing = true;
  let done = 0, failed = 0;
  try {
    while (true) {
      const q = read();
      if (q.length === 0) break;
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      const head = q[0];
      try {
        if (head.kind === "complete") {
          await completeTaskItem(head.payload);
        } else if (head.kind === "upload-and-complete") {
          const { path } = await uploadTaskPhoto({
            instance_id: head.payload.instance_id,
            item_id: head.payload.item_id,
            filename: head.payload.filename,
            data_base64: head.payload.data_base64,
            content_type: head.payload.content_type,
          });
          await completeTaskItem({
            instance_id: head.payload.instance_id,
            item_id: head.payload.item_id,
            checked: true,
            photo_path: path,
            note: head.payload.note,
          });
        }
        write(q.slice(1));
        done++;
      } catch (e) {
        head.retries += 1;
        if (head.retries >= 5) {
          // drop after 5 attempts; surface via console for diagnostics
          console.error("[offline-queue] dropping action", head, e);
          write(q.slice(1));
          failed++;
        } else {
          write([head, ...q.slice(1)]);
          break; // stop on first error, retry later
        }
      }
    }
  } finally {
    flushing = false;
  }
  return { done, remaining: read().length, failed };
}

export function installAutoFlush() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => { void flushQueue(); });
  window.addEventListener("focus", () => { void flushQueue(); });
}