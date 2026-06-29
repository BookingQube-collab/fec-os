"use client";

import Link from "next/link";
import { AlertOctagon, AlertTriangle, MessageSquare, Wrench } from "lucide-react";

import type { ExceptionItem } from "@/lib/queries/occ.core";
import { useExceptionsFeed } from "@/hooks/queries/useOcc";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  ticket: AlertTriangle,
  incident: AlertOctagon,
  work_order: Wrench,
  complaint: MessageSquare,
} as const;

const SEV_TONE: Record<string, string> = {
  urgent: "bg-rose-500/10 text-rose-300 border-rose-500/40",
  critical: "bg-rose-500/10 text-rose-300 border-rose-500/40",
  overdue: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  high: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  medium: "bg-sky-500/10 text-sky-300 border-sky-500/40",
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-muted text-muted-foreground border-border",
};

function ExceptionsPage() {
    const { data, isLoading, error } = useExceptionsFeed({ refetchInterval: 30_000 });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Prioritised feed across the estate — urgent tickets, open incidents, overdue work orders, unresolved complaints.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md border border-border bg-surface" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-300">
          {(error as Error).message}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          All clear. No exceptions across visible branches.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {data.map((item) => (
            <ExceptionRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ExceptionRow({ item }: { item: ExceptionItem }) {
  const Icon = KIND_ICON[item.kind];
  const sevClass = SEV_TONE[item.severity] ?? SEV_TONE.medium;
  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sidebar-accent/40">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider", sevClass)}>
            {item.severity}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.kind.replace("_", " ")}</span>
        </div>
        <div className="mt-1 truncate text-sm font-medium text-foreground">{item.title}</div>
      </div>
      <Link href={`/occ/branch/${item.location_id}`}
        className="shrink-0 text-xs text-primary hover:underline"
      >
        View branch
      </Link>
      <div className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground sm:block">
        {new Date(item.created_at).toLocaleString()}
      </div>
    </li>
  );
}

export default ExceptionsPage;
