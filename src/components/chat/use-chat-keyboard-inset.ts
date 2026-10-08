"use client";

import { useEffect, type RefObject } from "react";

/**
 * Caps the chat column to the visible viewport when the on-screen keyboard
 * opens. The closed-keyboard layout stays in CSS (above the bottom nav).
 * Desktop widths clear the cap so the existing column height is unchanged.
 */
export function useChatKeyboardInset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const viewport = window.visualViewport;
    if (!el || !viewport) return;

    const update = () => {
      if (window.innerWidth >= 768) {
        el.style.removeProperty("max-height");
        return;
      }
      const overlap = window.innerHeight - viewport.offsetTop - viewport.height;
      if (overlap < 48) {
        el.style.removeProperty("max-height");
        return;
      }
      const top = Math.max(0, el.getBoundingClientRect().top);
      const nav = document.querySelector("[data-mobile-nav]");
      let reserve = 0;
      if (nav instanceof HTMLElement) {
        const navRect = nav.getBoundingClientRect();
        reserve = Math.max(0, Math.min(navRect.bottom, viewport.height) - Math.max(navRect.top, 0));
      }
      const next = Math.max(200, Math.round(viewport.height - top - reserve));
      el.style.maxHeight = `${next}px`;
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    el.addEventListener("focusin", update);
    el.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      el.removeEventListener("focusin", update);
      el.removeEventListener("focusout", update);
      el.style.removeProperty("max-height");
    };
  }, [ref]);
}
