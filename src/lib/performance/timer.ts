export type PerfTimerEndMeta = {
  rowCount?: number;
  error?: string;
};

export type PerfLogEntry = {
  name: string;
  query?: string;
  start: number;
  end: number;
  durationMs: number;
  rowCount?: number;
  error?: string;
};

export function isPerfLogEnabled(): boolean {
  return process.env.PERF_LOG === "1" || process.env.NODE_ENV === "development";
}

export function createTimer(name: string, query?: string) {
  const start = performance.now();
  return {
    end(meta?: PerfTimerEndMeta): PerfLogEntry {
      const end = performance.now();
      const entry: PerfLogEntry = {
        name,
        query,
        start,
        end,
        durationMs: Math.round(end - start),
        rowCount: meta?.rowCount,
        error: meta?.error,
      };
      if (isPerfLogEnabled()) {
        const parts = [
          `[perf] ${entry.name}`,
          entry.query ? `query=${entry.query}` : null,
          `start=${Math.round(entry.start)}`,
          `end=${Math.round(entry.end)}`,
          `durationMs=${entry.durationMs}`,
          entry.rowCount != null ? `rows=${entry.rowCount}` : null,
          entry.error ? `error=${entry.error}` : null,
        ].filter(Boolean);
        console.log(parts.join(" "));
      }
      return entry;
    },
  };
}
