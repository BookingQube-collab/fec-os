"use client";

import { useEffect, useState } from "react";

function readReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True only for `(prefers-reduced-motion: reduce)`.
 * Motion's `useReducedMotion` matches the bare `(prefers-reduced-motion)` feature,
 * which stays true even when the user has no preference — that was skipping CountUp.
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(readReducedMotion);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return reduced;
}
