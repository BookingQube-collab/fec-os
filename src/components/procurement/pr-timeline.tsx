"use client";

import { Check, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export type TimelineNode = {
  id: string;
  title: string;
  state: "done" | "current" | "upcoming" | "rejected";
  meta: string;
  date?: string;
};

export function PrTimeline({ nodes }: { nodes: TimelineNode[] }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
      <h2 className="mb-5 text-base font-semibold">{t("procurement.detail.timeline")}</h2>
      <ol className="space-y-0">
        {nodes.map((node, idx) => {
          const last = idx === nodes.length - 1;
          return (
            <li key={node.id} className="relative flex gap-3 pb-6 last:pb-0">
              {!last ? (
                <span
                  className={cn(
                    "absolute start-[13px] top-7 bottom-0 w-px",
                    node.state === "done" ? "bg-emerald-400" : "bg-border",
                  )}
                  aria-hidden
                />
              ) : null}
              <Dot state={node.state} />
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold">{node.title}</p>
                {node.meta ? (
                  <p
                    className={cn(
                      "mt-0.5 text-xs",
                      node.state === "current" ? "font-semibold text-primary" : "text-muted-foreground",
                      node.state === "rejected" && "text-destructive",
                    )}
                  >
                    {node.meta}
                  </p>
                ) : null}
                {node.date ? <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{node.date}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Dot({ state }: { state: TimelineNode["state"] }) {
  if (state === "done") {
    return (
      <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-elevated-xs">
        <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
      </span>
    );
  }
  if (state === "current") {
    return <span className="relative z-10 mt-0.5 h-7 w-7 shrink-0 rounded-full bg-primary shadow-elevated-xs" />;
  }
  if (state === "rejected") {
    return (
      <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground">
        <Circle className="h-3 w-3 fill-current" />
      </span>
    );
  }
  return <span className="relative z-10 mt-0.5 h-7 w-7 shrink-0 rounded-full border-2 border-border bg-card" />;
}
