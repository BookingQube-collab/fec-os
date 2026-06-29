"use client";

import { useEffect, useState } from "react";

/** Gate secondary queries until after Load + optional delay (default 2s). */
export function useDeferredQuery(enabled = true, delayMs = 2000) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }

    let cancelled = false;
    const activate = () => {
      if (!cancelled) setReady(true);
    };

    const schedule = () => {
      if (delayMs <= 0) {
        activate();
        return;
      }
      const id = window.setTimeout(activate, delayMs);
      return () => window.clearTimeout(id);
    };

    if (document.readyState === "complete") {
      const cleanup = schedule();
      return () => {
        cancelled = true;
        cleanup?.();
      };
    }

    const onLoad = () => {
      const cleanup = schedule();
      if (cleanup) {
        window.addEventListener("beforeunload", cleanup, { once: true });
      }
    };
    window.addEventListener("load", onLoad, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
    };
  }, [enabled, delayMs]);

  return ready;
}
