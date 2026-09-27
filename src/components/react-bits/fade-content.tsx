"use client";

/**
 * Official React Bits FadeContent-TS-TW (https://reactbits.dev/r/FadeContent-TS-TW.json).
 * GSAP + ScrollTrigger. Content stays visible until the tween actually starts,
 * and a failsafe restores opacity and visibility if GSAP never finishes.
 * Reduced motion renders static content and never hides it.
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

function reveal(el: HTMLElement) {
  el.style.opacity = "1";
  el.style.visibility = "visible";
  el.style.filter = "none";
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
    if (!el) return;
    if (reducedMotion) {
      reveal(el);
      return;
    }

    let alive = true;
    let played = false;
    let cleanup = () => {};
    const failSafe = window.setTimeout(() => {
      if (el.isConnected) reveal(el);
    }, 2800);

    const play = (tl: { progress: () => number; play: () => void }) => {
      if (!alive || played || tl.progress() > 0) return;
      played = true;
      tl.play();
    };

    void (async () => {
      try {
        const { gsap } = await import("gsap");
        const { ScrollTrigger } = await import("gsap/ScrollTrigger");
        if (!alive || !ref.current) return;

        gsap.registerPlugin(ScrollTrigger);

        let scroller: Element | Window = window;
        if (container) {
          const found = typeof container === "string" ? document.querySelector(container) : container;
          if (found) scroller = found;
        }

        const startPct = (1 - threshold) * 100;
        const fromFilter = blur ? "blur(18px)" : "blur(0px)";

        const tl = gsap.timeline({
          paused: true,
          delay: toSeconds(delay),
          onStart: () => {
            gsap.set(el, {
              autoAlpha: initialOpacity,
              filter: fromFilter,
              willChange: "opacity, filter",
            });
          },
          onComplete: () => {
            reveal(el);
            onComplete?.();
            if (disappearAfter > 0) {
              gsap.to(el, {
                autoAlpha: initialOpacity,
                filter: fromFilter,
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
          duration: Math.max(0.9, toSeconds(duration)),
          ease,
        });

        const inView = () => {
          const rect = el.getBoundingClientRect();
          const viewH = window.innerHeight || 1;
          return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top <= (startPct / 100) * viewH;
        };

        const tryPlay = () => {
          if (inView()) play(tl);
        };

        const st = ScrollTrigger.create({
          trigger: el,
          scroller,
          start: `top ${startPct}%`,
          once: true,
          onEnter: () => play(tl),
        });

        const io = new IntersectionObserver(
          ([entry]) => {
            if (entry?.isIntersecting) tryPlay();
          },
          { threshold: Math.min(0.25, Math.max(0.01, threshold)) },
        );
        io.observe(el);

        const kick = window.requestAnimationFrame(tryPlay);
        const kickLater = window.setTimeout(tryPlay, 80);
        const stuck = window.setInterval(() => {
          if (!played || tl.progress() > 0) return;
          reveal(el);
        }, 700);

        cleanup = () => {
          window.cancelAnimationFrame(kick);
          window.clearTimeout(kickLater);
          window.clearInterval(stuck);
          io.disconnect();
          st.kill();
          tl.kill();
          gsap.killTweensOf(el);
          if (el.isConnected) reveal(el);
        };
      } catch {
        if (el.isConnected) reveal(el);
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(failSafe);
      cleanup();
      if (ref.current) reveal(ref.current);
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
