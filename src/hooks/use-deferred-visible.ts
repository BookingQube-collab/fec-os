"use client";

import { useEffect, useRef, useState } from "react";

/** True once the ref element enters (or nears) the viewport — for lazy data fetches. */
export function useDeferredVisible(rootMargin = "0px 0px -15% 0px") {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return { ref, visible };
}

/**
 * True after the window `load` event (or when document is already complete).
 * Optional deferMs adds a short post-load delay before enabling deferred fetches.
 */
export function useAfterLoad(deferMs = 0) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const arm = () => {
      if (cancelled) return;
      if (deferMs > 0) {
        timer = window.setTimeout(() => {
          if (!cancelled) setReady(true);
        }, deferMs);
      } else {
        setReady(true);
      }
    };

    if (document.readyState === "complete") {
      arm();
    } else {
      window.addEventListener("load", arm, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", arm);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [deferMs]);

  return ready;
}

/**
 * Defers until the user scrolls meaningfully and the target row intersects the viewport.
 * Prevents below-fold sections from fetching on initial paint (large viewports).
 */
export function useScrollGatedVisible(minScrollDelta = 100) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const scrollStartY = useRef<number | null>(null);
  const scrolledEnough = useRef(false);

  useEffect(() => {
    if (visible) return;

    const tryReveal = () => {
      const el = ref.current;
      if (!el || !scrolledEnough.current) return;
      const rect = el.getBoundingClientRect();
      const inView = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
      if (inView) setVisible(true);
    };

    const onScroll = () => {
      if (scrollStartY.current === null) scrollStartY.current = window.scrollY;
      if (Math.abs(window.scrollY - scrollStartY.current) >= minScrollDelta) {
        scrolledEnough.current = true;
        tryReveal();
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visible, minScrollDelta]);

  return { ref, visible };
}
