"use client";

/**
 * Official React Bits FadeContent-TS-TW (https://reactbits.dev/r/FadeContent-TS-TW.json).
 * GSAP + ScrollTrigger. Reduced motion renders static content and never hides it.
 */
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export interface FadeContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  container?: Element | string | null;
  blur?: boolean;
  duration?: number;
  ease?: string;
  delay?: number;
  threshold?: number;
  initialOpacity?: number;
  disappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  onComplete?: () => void;
  onDisappearanceComplete?: () => void;
}

function toSeconds(val: number) {
  return val > 10 ? val / 1000 : val;
}

export default function FadeContent({
  children,
  container,
  blur = false,
  duration = 1000,
  ease = "power2.out",
  delay = 0,
  threshold = 0.1,
  initialOpacity = 0,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = "power2.in",
  onComplete,
  onDisappearanceComplete,
  className = "",
  ...props
}: FadeContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return;

    let alive = true;
    let cleanup = () => {};
    const failSafe = window.setTimeout(() => {
      if (!el.isConnected) return;
      el.style.opacity = "1";
      el.style.filter = "none";
    }, 1600);

    void (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (!alive || !ref.current) return;

      gsap.registerPlugin(ScrollTrigger);

      let scrollerTarget: Element | string | null =
        container || document.getElementById("snap-main-container") || null;

      if (typeof scrollerTarget === "string") {
        scrollerTarget = document.querySelector(scrollerTarget);
      }

      const startPct = (1 - threshold) * 100;

      gsap.set(el, {
        autoAlpha: initialOpacity,
        filter: blur ? "blur(10px)" : "blur(0px)",
        willChange: "opacity, filter, transform",
      });

      const tl = gsap.timeline({
        paused: true,
        delay: toSeconds(delay),
        onComplete: () => {
          if (onComplete) onComplete();
          if (disappearAfter > 0) {
            gsap.to(el, {
              autoAlpha: initialOpacity,
              filter: blur ? "blur(10px)" : "blur(0px)",
              delay: toSeconds(disappearAfter),
              duration: toSeconds(disappearDuration),
              ease: disappearEase,
              onComplete: () => onDisappearanceComplete?.(),
            });
          }
        },
      });

      tl.to(el, {
        autoAlpha: 1,
        filter: "blur(0px)",
        duration: toSeconds(duration),
        ease,
      });

      const st = ScrollTrigger.create({
        trigger: el,
        scroller: scrollerTarget || window,
        start: `top ${startPct}%`,
        once: true,
        onEnter: () => tl.play(),
      });

      const kick = window.requestAnimationFrame(() => {
        if (!alive || tl.progress() > 0) return;
        const rect = el.getBoundingClientRect();
        const viewH = window.innerHeight || 1;
        if (rect.top <= (startPct / 100) * viewH && rect.bottom >= 0) tl.play();
      });

      cleanup = () => {
        window.cancelAnimationFrame(kick);
        st.kill();
        tl.kill();
        gsap.killTweensOf(el);
      };
    })();

    return () => {
      alive = false;
      window.clearTimeout(failSafe);
      cleanup();
    };
  }, [
    reducedMotion,
    container,
    blur,
    duration,
    ease,
    delay,
    threshold,
    initialOpacity,
    disappearAfter,
    disappearDuration,
    disappearEase,
    onComplete,
    onDisappearanceComplete,
  ]);

  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
}
