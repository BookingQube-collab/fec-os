const DB_NAME = "fec-hr-field";
const STORE = "pending-checkins";
const VERSION = 1;

export type QueuedFieldCheckIn = {
  clientEventId: string;
  queuedAt: string;
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
    eventType: "check_in" | "check_out" | "ping";
    locationId?: string | null;
    faceLivenessPassed?: boolean | null;
    photoBase64?: string | null;
    recordedAt?: string | null;
  };
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientEventId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      tx.oncomplete = () => resolve(req && "result" in req ? (req.result as T) : undefined);
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB tx failed"));
      if (req && "onsuccess" in req) {
        req.onsuccess = () => {
          /* result read on complete */
        };
        req.onerror = () => reject(req.error);
      }
    });
  } finally {
    db.close();
  }
}

export async function enqueueFieldCheckIn(item: QueuedFieldCheckIn): Promise<void> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline queue needs a browser");
  }
  await withStore("readwrite", (store) => {
    store.put(item);
  });
}

export async function listFieldCheckInQueue(): Promise<QueuedFieldCheckIn[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as QueuedFieldCheckIn[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function removeFieldCheckIn(clientEventId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore("readwrite", (store) => {
    store.delete(clientEventId);
  });
}

export async function clearFieldCheckInQueue(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore("readwrite", (store) => {
    store.clear();
  });
}
