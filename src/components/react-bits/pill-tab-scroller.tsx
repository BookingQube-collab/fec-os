"use client";

/**
 * Shared horizontal pill-tab scroller.
 * React Bits in this app has no tab-scroller Micro component, so this matches
 * the existing pill track (soft secondary surface, rounded active pill) and
 * keeps overflow reachable without a native horizontal scrollbar.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import {
  pillScrollEdgesFromRects,
  pillScrollFrameClass,
  pillScrollMaskStyle,
  pillScrollportClass,
  pillScrollTrackClass,
  type PillScrollEdges,
} from "@/components/react-bits/pill-tab-scroll";

export {
  pillScrollEdgesFromRects,
  pillScrollMask,
  pillScrollMaskStyle,
  pillScrollportClass,
  pillTabItemClass,
  splitPillFrameClass,
  type PillScrollEdges,
} from "@/components/react-bits/pill-tab-scroll";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const signCache = new Map<string, boolean>();

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True when increasing scrollLeft moves content to the right (varies by browser in RTL). */
function contentMovesRightWhenScrollIncreases(el: HTMLElement): boolean {
  const dir = getComputedStyle(el).direction;
  const cached = signCache.get(dir);
  if (cached != null) return cached;
  const probe = document.createElement("div");
  probe.dir = dir;
  probe.style.cssText = "position:absolute;left:-9999px;top:0;width:80px;height:16px;overflow:auto;";
  const inner = document.createElement("div");
  inner.style.cssText = "width:240px;height:16px;";
  const mark = document.createElement("span");
  mark.textContent = ".";
  inner.appendChild(mark);
  probe.appendChild(inner);
  document.body.appendChild(probe);
  const before = mark.getBoundingClientRect().left;
  probe.scrollBy({ left: 40 });
  const after = mark.getBoundingClientRect().left;
  document.body.removeChild(probe);
  const movesRight = Math.abs(after - before) < 0.5 ? dir === "rtl" : after > before;
  signCache.set(dir, movesRight);
  return movesRight;
}

function scrollByVisual(el: HTMLElement, visualDx: number, behavior: ScrollBehavior) {
  if (Math.abs(visualDx) < 0.5) return;
  const movesRight = contentMovesRightWhenScrollIncreases(el);
  el.scrollBy({ left: movesRight ? visualDx : -visualDx, behavior });
}

function visibleTabs(el: HTMLElement): HTMLElement[] {
  return [...el.children].filter((node): node is HTMLElement => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.hasAttribute("data-pill-scroll-btn")) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.position === "absolute" || style.position === "fixed") return false;
    return true;
  });
}

function readEdges(el: HTMLElement): PillScrollEdges {
  const kids = visibleTabs(el);
  if (kids.length === 0) return { start: false, end: false };
  const view = el.getBoundingClientRect();
  const rtl = getComputedStyle(el).direction === "rtl";
  return pillScrollEdgesFromRects(
    view,
    kids[0].getBoundingClientRect(),
    kids[kids.length - 1].getBoundingClientRect(),
    rtl,
  );
}

function revealChild(el: HTMLElement, child: HTMLElement) {
  const view = el.getBoundingClientRect();
  const box = child.getBoundingClientRect();
  const pad = 12;
  const rtl = getComputedStyle(el).direction === "rtl";
  let visualDx = 0;
  if (!rtl) {
    if (box.left < view.left + pad) visualDx = view.left + pad - box.left;
    else if (box.right > view.right - pad) visualDx = view.right - pad - box.right;
  } else if (box.right > view.right - pad) {
    visualDx = view.right - pad - box.right;
  } else if (box.left < view.left + pad) {
    visualDx = view.left + pad - box.left;
  }
  scrollByVisual(el, visualDx, prefersReducedMotion() ? "auto" : "smooth");
}

function tabItems(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>("a, button")].filter(
    (item) => !item.hasAttribute("data-pill-scroll-btn") && !item.hasAttribute("disabled"),
  );
}

export function usePillTabScroll<T extends HTMLElement>(forwardedRef?: Ref<T>) {
  const nodeRef = useRef<T | null>(null);
  const forwarded = useRef(forwardedRef);
  forwarded.current = forwardedRef;
  const [node, setNode] = useState<T | null>(null);
  const [edges, setEdges] = useState<PillScrollEdges>({ start: false, end: false });
  const [rtl, setRtl] = useState(false);
  const activeRef = useRef<Element | null>(null);

  const ref = useCallback((el: T | null) => {
    nodeRef.current = el;
    setNode(el);
    const outer = forwarded.current;
    if (typeof outer === "function") outer(el);
    else if (outer) outer.current = el;
  }, []);

  const scroll = useCallback((direction: "start" | "end") => {
    const current = nodeRef.current;
    if (!current) return;
    const amount = Math.max(160, Math.round(current.clientWidth * 0.72));
    const isRtl = getComputedStyle(current).direction === "rtl";
    const visualDx = direction === "end" ? (isRtl ? amount : -amount) : isRtl ? -amount : amount;
    scrollByVisual(current, visualDx, prefersReducedMotion() ? "auto" : "smooth");
  }, []);

  useIsoLayoutEffect(() => {
    const current = node;
    if (!current) return;

    const measure = () => {
      const next = readEdges(current);
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
      setRtl(getComputedStyle(current).direction === "rtl");
      const active = current.querySelector<HTMLElement>(
        '[data-state="active"], [aria-current="page"], [aria-pressed="true"]',
      );
      if (active && active !== activeRef.current) {
        activeRef.current = active;
        revealChild(current, active);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(current);
    for (const child of current.children) ro.observe(child);
    current.addEventListener("scroll", measure, { passive: true });
    const mo = new MutationObserver(() => {
      for (const child of current.children) ro.observe(child);
      measure();
    });
    mo.observe(current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-current", "class"],
    });
    const dirObserver = new MutationObserver(measure);
    dirObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });

    const drag = { x: 0, moved: false, active: false, pointerId: -1 };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      drag.active = true;
      drag.moved = false;
      drag.x = event.clientX;
      drag.pointerId = event.pointerId;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 6) return;
        drag.moved = true;
        current.setPointerCapture(event.pointerId);
      }
      scrollByVisual(current, dx, "auto");
      drag.x = event.clientX;
    };
    const endDrag = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const moved = drag.moved;
      drag.active = false;
      if (!moved) return;
      const stopClick = (click: Event) => {
        click.preventDefault();
        click.stopPropagation();
      };
      current.addEventListener("click", stopClick, { capture: true, once: true });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (current.getAttribute("role") === "tablist") return;
      const items = tabItems(current);
      if (items.length === 0) return;
      const isRtl = getComputedStyle(current).direction === "rtl";
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const target = event.key === "Home" ? items[0] : items[items.length - 1];
        target?.focus();
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (index === -1) return;
      event.preventDefault();
      const forward = event.key === "ArrowRight" ? !isRtl : isRtl;
      items[index + (forward ? 1 : -1)]?.focus();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target === current || !current.contains(target)) return;
      revealChild(current, target);
    };

    current.addEventListener("pointerdown", onPointerDown);
    current.addEventListener("pointermove", onPointerMove);
    current.addEventListener("pointerup", endDrag);
    current.addEventListener("pointercancel", endDrag);
    current.addEventListener("keydown", onKeyDown);
    current.addEventListener("focusin", onFocusIn);

    return () => {
      ro.disconnect();
      mo.disconnect();
      dirObserver.disconnect();
      current.removeEventListener("scroll", measure);
      current.removeEventListener("pointerdown", onPointerDown);
      current.removeEventListener("pointermove", onPointerMove);
      current.removeEventListener("pointerup", endDrag);
      current.removeEventListener("pointercancel", endDrag);
      current.removeEventListener("keydown", onKeyDown);
      current.removeEventListener("focusin", onFocusIn);
    };
  }, [node]);

  return { ref, edges, rtl, scroll };
}

function PillScrollButton({
  direction,
  label,
  onClick,
}: {
  direction: "start" | "end";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-pill-scroll-btn=""
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-border/50 bg-card/95 text-foreground shadow-elevated-xs backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 print:hidden",
        direction === "start" ? "start-1" : "end-1",
      )}
    >
      <ChevronLeft
        className={cn("size-4", direction === "start" ? "rtl:-scale-x-100" : "-scale-x-100 rtl:scale-x-100")}
        aria-hidden
      />
    </button>
  );
}

export function PillTabScrollButtons({
  edges,
  onScroll,
}: {
  edges: PillScrollEdges;
  onScroll: (direction: "start" | "end") => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {edges.start ? (
        <PillScrollButton direction="start" label={t("common.prev")} onClick={() => onScroll("start")} />
      ) : null}
      {edges.end ? (
        <PillScrollButton direction="end" label={t("common.next")} onClick={() => onScroll("end")} />
      ) : null}
    </>
  );
}

export function PillTabScroller({
  children,
  label,
  className,
  trackClassName,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  trackClassName?: string;
}) {
  const scroll = usePillTabScroll<HTMLElement>();
  return (
    <div className={cn(pillScrollFrameClass, className)}>
      <div className={pillScrollTrackClass(trackClassName)}>
        {scroll.edges.start ? (
          <PillTabScrollButtons edges={{ start: true, end: false }} onScroll={scroll.scroll} />
        ) : null}
        <nav
          ref={scroll.ref}
          aria-label={label}
          style={pillScrollMaskStyle(scroll.edges, scroll.rtl)}
          className={cn(pillScrollportClass, trackClassName)}
        >
          {children}
        </nav>
        {scroll.edges.end ? (
          <PillTabScrollButtons edges={{ start: false, end: true }} onScroll={scroll.scroll} />
        ) : null}
      </div>
    </div>
  );
}
