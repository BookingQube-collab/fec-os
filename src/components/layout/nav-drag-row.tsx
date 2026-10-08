"use client";

import { GripVertical } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { navItemOrderKey } from "@/lib/nav-order";
import { cn } from "@/lib/utils";

const ItemDragContext = createContext<{
  enabled: boolean;
  label: string;
  onMove: (bucket: string, activeKey: string, overKey: string) => void;
} | null>(null);

const ItemBucketContext = createContext<string | null>(null);

export function ItemDragScope({
  enabled,
  label,
  onMove,
  children,
}: {
  enabled: boolean;
  label: string;
  onMove: (bucket: string, activeKey: string, overKey: string) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ enabled, label, onMove }), [enabled, label, onMove]);
  return <ItemDragContext.Provider value={value}>{children}</ItemDragContext.Provider>;
}

export function ItemDragBucket({ bucket, children }: { bucket: string; children: ReactNode }) {
  return <ItemBucketContext.Provider value={bucket}>{children}</ItemBucketContext.Provider>;
}

function itemDragId(bucket: string, key: string) {
  return `nav-item:${encodeURIComponent(bucket)}:${encodeURIComponent(key)}`;
}

function parseItemDragId(id: string): { bucket: string; key: string } | null {
  if (!id.startsWith("nav-item:")) return null;
  const rest = id.slice("nav-item:".length);
  const splitAt = rest.indexOf(":");
  if (splitAt < 0) return null;
  try {
    return {
      bucket: decodeURIComponent(rest.slice(0, splitAt)),
      key: decodeURIComponent(rest.slice(splitAt + 1)),
    };
  } catch {
    return null;
  }
}

export function ItemDragRow({
  item,
  children,
}: {
  item: { labelKey: string; href: string };
  children: ReactNode;
}) {
  const drag = useContext(ItemDragContext);
  const bucket = useContext(ItemBucketContext);
  if (!drag?.enabled || !bucket) return children;
  const key = navItemOrderKey(item);
  return (
    <NavDragRow
      id={itemDragId(bucket, key)}
      enabled
      label={drag.label}
      onMove={(activeId, overId) => {
        const active = parseItemDragId(activeId);
        const over = parseItemDragId(overId);
        if (!active || !over || active.bucket !== bucket || over.bucket !== bucket) return;
        drag.onMove(bucket, active.key, over.key);
      }}
    >
      {children}
    </NavDragRow>
  );
}

export function NavDragRow({
  id,
  enabled,
  label,
  onMove,
  children,
  className,
}: {
  id: string;
  enabled: boolean;
  label: string;
  onMove: (activeId: string, overId: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-start gap-0.5",
        over && enabled && "rounded-2xl bg-sidebar-accent/70",
        className,
      )}
      onDragOver={(event) => {
        if (!enabled) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!enabled) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const activeId = event.dataTransfer.getData("text/plain");
        if (!activeId || activeId === id) return;
        onMove(activeId, id);
      }}
    >
      {enabled ? (
        <button
          type="button"
          draggable
          aria-label={label}
          title={label}
          className="mt-0.5 inline-flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-xl text-muted-foreground touch-manipulation hover:bg-secondary/80 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.setData("text/plain", id);
            event.dataTransfer.effectAllowed = "move";
          }}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
