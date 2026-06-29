type LogLevel = "debug" | "info" | "warn" | "error";

type LogCategory = "api" | "auth" | "audit" | "security" | "perf" | "db" | "app";

function emit(level: LogLevel, category: LogCategory, message: string, meta?: unknown): void {
  const prefix = `[${category}]`;
  const payload = meta !== undefined ? [prefix, message, meta] : [prefix, message];

  switch (level) {
    case "debug":
      if (process.env.NODE_ENV === "development" || process.env.PERF_LOG === "1") {
        console.debug(...payload);
      }
      break;
    case "info":
      console.info(...payload);
      break;
    case "warn":
      console.warn(...payload);
      break;
    case "error":
      console.error(...payload);
      break;
  }
}

/** Structured server-side logging. Prefer over raw `console.*` in API routes and services. */
export const logger = {
  debug: (category: LogCategory, message: string, meta?: unknown) =>
    emit("debug", category, message, meta),
  info: (category: LogCategory, message: string, meta?: unknown) =>
    emit("info", category, message, meta),
  warn: (category: LogCategory, message: string, meta?: unknown) =>
    emit("warn", category, message, meta),
  error: (category: LogCategory, message: string, meta?: unknown) =>
    emit("error", category, message, meta),
};
