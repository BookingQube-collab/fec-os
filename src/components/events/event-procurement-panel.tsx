"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { PrRowActions, usePrActions, type PrActionTarget } from "@/components/procurement/pr-row-actions";
import { PrStatusPill } from "@/components/procurement/pr-status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtQar } from "@/lib/currency";
import { APPROVED_PR_STATUSES, PENDING_PR_STATUSES, REJECTED_PR_STATUSES } from "@/lib/events/constants";
import type { EventLinkedPrRow } from "@/lib/events/types";
import { cn } from "@/lib/utils";

function toTarget(pr: EventLinkedPrRow): PrActionTarget {
  return {
    id: pr.id,
    prNumber: pr.pr_number ?? "",
    title: pr.title || pr.pr_number || "",
    amount: pr.total_amount,
    requester: pr.requester_name ?? "",
    department: "",
    canAct: Boolean(pr.canAct),
    canReissue: Boolean(pr.canReissue),
    isOwner: Boolean(pr.isOwner),
  };
}

export function EventProcurementPanel({
  eventId,
  prs,
  canCreate,
  variant = "full",
  limit = 8,
}: {
  eventId: string;
  prs: EventLinkedPrRow[];
  canCreate?: boolean;
  variant?: "full" | "compact";
  limit?: number;
}) {
  const { t } = useTranslation();
  const actions = usePrActions();
  const pending = prs.filter((pr) => PENDING_PR_STATUSES.has(pr.status));
  const approved = prs.filter((pr) => APPROVED_PR_STATUSES.has(pr.status));
  const rejected = prs.filter((pr) => REJECTED_PR_STATUSES.has(pr.status));
  const overdue = prs.filter((pr) => pr.overdue);
  const blocked = pending.length > 0;
  const compact = variant === "compact";
  const shown = prs.slice(0, compact ? Math.min(limit, 3) : limit);

  return (
    <section className={cn("min-w-0 space-y-3", !compact && "space-y-4 rounded-2xl border border-border/40 bg-card p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {!compact ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("events.stage.critical")}
            </p>
          ) : null}
          {!compact ? <h2 className="text-sm font-semibold">{t("events.proc.title")}</h2> : null}
          <p className="text-xs text-muted-foreground">
            {blocked
              ? t("events.proc.blockedCounts", { pending: pending.length, approved: approved.length })
              : t("events.proc.clearHint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/procurement/requisitions?eventId=${eventId}`}>{t("events.proc.openAll")}</Link>
          </Button>
          {canCreate ? (
            <Button size="sm" variant={compact ? "outline" : "default"} asChild>
              <Link href={`/procurement/requisitions/new?eventId=${eventId}`}>{t("events.proc.newPr")}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {!compact ? (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label={t("events.proc.total")} value={prs.length} />
        <Count label={t("events.proc.pending")} value={pending.length} tone={pending.length ? "warn" : undefined} />
        <Count label={t("events.proc.approved")} value={approved.length} tone="ok" />
        <Count
          label={t("events.proc.awaiting")}
          value={overdue.length || rejected.length}
          hint={overdue.length ? t("events.proc.overdueN", { n: overdue.length }) : rejected.length ? t("events.proc.rejectedN", { n: rejected.length }) : undefined}
          tone={overdue.length || rejected.length ? "danger" : undefined}
        />
      </div>
      ) : null}

      {prs.length === 0 ? (
        <p className={cn("text-sm text-muted-foreground", !compact && "rounded-xl border border-dashed border-border/60 px-3 py-6 text-center")}>
          {t("events.proc.empty")}
        </p>
      ) : (
        <ul className="min-w-0 space-y-2 overflow-hidden">
          {shown.map((pr) => (
            <li
              key={pr.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/procurement/requisitions/${pr.id}`}
                  className="block truncate font-medium underline-offset-2 hover:underline"
                >
                  {pr.pr_number ?? t("procurement.list.draftNumber")}
                  {pr.title ? ` · ${pr.title}` : ""}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {fmtQar(pr.total_amount)}
                  {pr.current_step_role
                    ? ` · ${t("events.proc.waitingOn", { role: t(`procurement.steps.${pr.current_step_role}`, { defaultValue: pr.current_step_role }) })}`
                    : ""}
                  {pr.requester_name ? ` · ${pr.requester_name}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {pr.overdue ? <Badge variant="destructive">{t("events.home.overdue")}</Badge> : null}
                <PrStatusPill status={pr.status} />
                <PrRowActions
                  href={`/procurement/requisitions/${pr.id}`}
                  canAct={pr.canAct}
                  canReissue={pr.canReissue}
                  pending={actions.pending}
                  compact
                  onApprove={() => actions.open("approve", toTarget(pr))}
                  onReject={() => actions.open("reject", toTarget(pr))}
                  onReturn={() => actions.open("return", toTarget(pr))}
                  onReissue={() => actions.reissue(toTarget(pr))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {actions.dialogs}
    </section>
  );
}

function Count({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "ok" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          tone === "danger" && "text-rag-red",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
