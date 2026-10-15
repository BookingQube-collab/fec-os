import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Aggregated ADMS timings. Every figure is elapsed wall-clock time from
 * performance.now(), including database wait. None of them are CPU time.
 * Idle polls update in-memory counters only. One line is written at most
 * every five minutes per isolate, with no serials, tokens, or punch data.
 */

export type AdmsPerfCategory = "idle_poll" | "attlog" | "user_sync" | "command_ack" | "other";

export const ADMS_PERF_FLUSH_MS = 5 * 60_000;
/** Requests at or above this wall time increment slowRequests. They are still not logged one by one. */
export const ADMS_PERF_SLOW_WALL_MS = 200;

const CATEGORIES: readonly AdmsPerfCategory[] = ["idle_poll", "attlog", "user_sync", "command_ack", "other"];

export type AdmsPerfBucket = {
  requests: number;
  wallMs: number;
  maxWallMs: number;
  dbRegions: number;
  dbWallMs: number;
  recalcWallMs: number;
  insertedStaffCount: number;
  unmappedInserts: number;
  punches: number;
  duplicates: number;
  slowRequests: number;
};

type Trace = {
  category: AdmsPerfCategory;
  dbRegions: number;
  dbWallMs: number;
  recalcWallMs: number;
  insertedStaffCount: number;
  unmappedInserts: number;
  punches: number;
  duplicates: number;
};

const storage = new AsyncLocalStorage<Trace>();

function emptyBucket(): AdmsPerfBucket {
  return {
    requests: 0,
    wallMs: 0,
    maxWallMs: 0,
    dbRegions: 0,
    dbWallMs: 0,
    recalcWallMs: 0,
    insertedStaffCount: 0,
    unmappedInserts: 0,
    punches: 0,
    duplicates: 0,
    slowRequests: 0,
  };
}

const buckets = new Map<AdmsPerfCategory, AdmsPerfBucket>();
let windowStartedAt = Date.now();
let lastFlushAt = windowStartedAt;
let isolateId = createIsolateId();

function createIsolateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

type PerfSink = (line: AdmsPerfLog) => void;
let sink: PerfSink = (line) => {
  // warn survives the production build, which strips console.info.
  console.warn(JSON.stringify(line));
};

export type AdmsPerfLog = {
  event: "adms_perf";
  clock: "wall";
  isolate: string;
  windowMs: number;
  dbOpsExcludesRecalc: true;
  buckets: Partial<Record<AdmsPerfCategory, AdmsPerfBucket>>;
};

function currentTrace(): Trace | undefined {
  return storage.getStore();
}

export function setAdmsPerfCategory(category: AdmsPerfCategory): void {
  const trace = currentTrace();
  if (trace) trace.category = category;
}

/**
 * Times one database region. Nested recalculation must use noteAdmsRecalc instead.
 * Accepts a Supabase builder, which is thenable but not a full Promise.
 */
export async function timeAdmsDb<T>(work: () => PromiseLike<T>): Promise<T> {
  const trace = currentTrace();
  const started = performance.now();
  try {
    return await work();
  } finally {
    if (trace) {
      trace.dbRegions += 1;
      trace.dbWallMs += performance.now() - started;
    }
  }
}

export function noteAdmsIngestCounts(input: {
  punches: number;
  duplicates: number;
  insertedStaffCount: number;
  unmappedInserts: number;
}): void {
  const trace = currentTrace();
  if (!trace) return;
  trace.punches += input.punches;
  trace.duplicates += input.duplicates;
  trace.insertedStaffCount += input.insertedStaffCount;
  trace.unmappedInserts += input.unmappedInserts;
}

/** Wall time spent inside recalculateAttendanceRange, including its own queries. */
export function noteAdmsRecalc(wallMs: number): void {
  const trace = currentTrace();
  if (!trace || !Number.isFinite(wallMs) || wallMs < 0) return;
  trace.recalcWallMs += wallMs;
}

function absorb(trace: Trace, wallMs: number): void {
  const bucket = buckets.get(trace.category) ?? emptyBucket();
  bucket.requests += 1;
  bucket.wallMs += wallMs;
  if (wallMs > bucket.maxWallMs) bucket.maxWallMs = wallMs;
  if (wallMs >= ADMS_PERF_SLOW_WALL_MS) bucket.slowRequests += 1;
  bucket.dbRegions += trace.dbRegions;
  bucket.dbWallMs += trace.dbWallMs;
  bucket.recalcWallMs += trace.recalcWallMs;
  bucket.insertedStaffCount += trace.insertedStaffCount;
  bucket.unmappedInserts += trace.unmappedInserts;
  bucket.punches += trace.punches;
  bucket.duplicates += trace.duplicates;
  buckets.set(trace.category, bucket);
}

export function buildAdmsPerfLog(now = Date.now()): AdmsPerfLog | null {
  if (buckets.size === 0) return null;
  const published: AdmsPerfLog["buckets"] = {};
  for (const category of CATEGORIES) {
    const bucket = buckets.get(category);
    if (!bucket || bucket.requests === 0) continue;
    published[category] = { ...bucket };
  }
  if (Object.keys(published).length === 0) return null;
  return {
    event: "adms_perf",
    clock: "wall",
    isolate: isolateId,
    windowMs: Math.max(0, now - windowStartedAt),
    dbOpsExcludesRecalc: true,
    buckets: published,
  };
}

export function flushAdmsPerf(now = Date.now(), force = false): AdmsPerfLog | null {
  if (!force && now - lastFlushAt < ADMS_PERF_FLUSH_MS) return null;
  const line = buildAdmsPerfLog(now);
  buckets.clear();
  windowStartedAt = now;
  lastFlushAt = now;
  if (line) sink(line);
  return line;
}

function maybeFlush(now = Date.now()): void {
  flushAdmsPerf(now, false);
}

export async function runWithAdmsPerf<T>(category: AdmsPerfCategory, fn: () => Promise<T>): Promise<T> {
  const trace: Trace = {
    category,
    dbRegions: 0,
    dbWallMs: 0,
    recalcWallMs: 0,
    insertedStaffCount: 0,
    unmappedInserts: 0,
    punches: 0,
    duplicates: 0,
  };
  const started = performance.now();
  try {
    return await storage.run(trace, fn);
  } finally {
    absorb(trace, performance.now() - started);
    maybeFlush();
  }
}

export function resetAdmsPerfForTests(options?: { now?: number; sink?: PerfSink | null }): void {
  buckets.clear();
  const now = options?.now ?? Date.now();
  windowStartedAt = now;
  lastFlushAt = now;
  isolateId = "test";
  sink = options?.sink ?? (() => {});
}

export function readAdmsPerfBuckets(): Partial<Record<AdmsPerfCategory, AdmsPerfBucket>> {
  return Object.fromEntries([...buckets.entries()].map(([key, value]) => [key, { ...value }]));
}
