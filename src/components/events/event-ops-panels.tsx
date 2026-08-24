"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtQar } from "@/lib/currency";
import {
  ASSET_MOVE_STATUSES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  PAYABLE_KINDS,
  PAYABLE_STATUSES,
} from "@/lib/events/constants";
import type { EventOverview } from "@/lib/events/types";
import {
  deleteEventAsset,
  deleteEventIssue,
  deleteEventPayable,
  upsertEventAsset,
  upsertEventIssue,
  upsertEventPayable,
} from "@/lib/events.functions";
import { EventDocumentsPanel } from "@/components/events/event-documents-panel";

export { EventDocumentsPanel };

function deptBadge(status: string) {
  if (status === "blocked") return "destructive" as const;
  if (status === "delayed") return "warning" as const;
  if (status === "on_track") return "success" as const;
  return "outline" as const;
}

export function EventDepartmentStatus({
  workstreams,
  ar,
}: {
  workstreams: EventOverview["workstreams"];
  ar: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("events.overview.departments")}</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {workstreams.map((ws) => (
          <div key={ws.code} className="flex items-center justify-between gap-2 rounded-xl border border-border/40 px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{ar ? ws.title_ar : ws.title_en}</p>
              <p className="text-xs text-muted-foreground">
                {ws.taskCount} · {Math.round(ws.pct)}%
              </p>
            </div>
            <Badge variant={deptBadge(ws.status)}>{t(`events.deptStatus.${ws.status}`)}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EventApprovalsPanel({
  gates,
  goLive,
  canApprove,
  pending,
  onGoLive,
  ar,
}: {
  gates: EventOverview["gates"];
  goLive: { approved: boolean; at: string | null };
  canApprove: boolean;
  pending?: boolean;
  onGoLive: (approved: boolean) => void;
  ar: boolean;
}) {
  const { t } = useTranslation();
  const pendingGates = gates.filter((g) => !g.satisfied);
  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("events.overview.requiredApprovals")}</h2>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 px-3 py-2">
        <div>
          <p className="text-sm font-medium">{t("events.overview.goLive")}</p>
          <p className="text-xs text-muted-foreground">
            {goLive.approved
              ? t("events.overview.goLiveApproved", { date: goLive.at?.slice(0, 10) ?? "—" })
              : t("events.overview.goLivePending")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={goLive.approved ? "success" : "warning"}>
            {goLive.approved ? t("events.overview.met") : t("events.overview.missing")}
          </Badge>
          {canApprove ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onGoLive(!goLive.approved)}>
              {goLive.approved ? t("events.overview.clearGoLive") : t("events.overview.approveGoLive")}
            </Button>
          ) : null}
        </div>
      </div>
      {pendingGates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("events.overview.noPendingApprovals")}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {pendingGates.map((gate) => (
            <li key={gate.requirementId} className="flex items-center justify-between gap-2">
              <span>{ar ? gate.labelAr : gate.labelEn}</span>
              <Badge variant="warning">{t("events.overview.missing")}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


export function EventIssuesPanel({
  eventId,
  issues,
  overdueActions,
  canEdit,
  onChanged,
}: {
  eventId: string;
  issues: EventOverview["issues"];
  overdueActions: EventOverview["overdueActions"];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<(typeof ISSUE_SEVERITIES)[number]>("medium");
  const [snag, setSnag] = useState(false);
  const [safety, setSafety] = useState(false);
  const [due, setDue] = useState("");

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("events.overview.openIssues")}</h2>
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("events.overview.noIssues")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {issues.map((issue) => (
            <li key={issue.id} className="flex items-center justify-between gap-2">
              <span>
                {issue.title}
                {issue.is_snag ? <Badge variant="outline" className="ms-1">{t("events.overview.snag")}</Badge> : null}
                {issue.overdue ? <Badge variant="destructive" className="ms-1">{t("events.ops.overdue")}</Badge> : null}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={issue.severity === "critical" || issue.severity === "high" ? "destructive" : "outline"}>
                  {t(`events.risk.${issue.severity}`)} · {t(`events.issueStatus.${issue.status}`)}
                </Badge>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        if (issue.status === "open" || issue.status === "in_progress" || issue.status === "blocked") {
                          await upsertEventIssue({
                            id: issue.id,
                            eventId,
                            title: issue.title,
                            status: "resolved",
                            severity: issue.severity,
                          });
                        } else {
                          await deleteEventIssue({ id: issue.id });
                        }
                        onChanged();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    {issue.status === "resolved" || issue.status === "closed" ? t("common.delete") : t("events.overview.resolve")}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {overdueActions.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("events.overview.overdueActions")}</p>
          <ul className="space-y-1 text-sm">
            {overdueActions.map((task) => (
              <li key={task.id} className="flex justify-between gap-2">
                <span>{task.task_number ? `${task.task_number} · ` : ""}{task.title}</span>
                <span className="tabular-nums text-rag-amber">{task.due_date}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canEdit ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("events.overview.issueTitle")} />
          <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ISSUE_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{t(`events.risk.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={snag} onChange={(e) => setSnag(e.target.checked)} />
              {t("events.overview.snag")}
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} />
              {t("events.overview.safetyIssue")}
            </label>
            <Button
              size="sm"
              disabled={!title.trim()}
              onClick={async () => {
                try {
                  await upsertEventIssue({
                    eventId,
                    title,
                    severity,
                    status: ISSUE_STATUSES[0],
                    due_date: due || null,
                    is_snag: snag,
                    is_safety: safety,
                  });
                  setTitle("");
                  setDue("");
                  setSnag(false);
                  setSafety(false);
                  onChanged();
                  toast.success(t("events.toasts.issueSaved"));
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {t("events.overview.addIssue")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function EventPayablesPanel({
  eventId,
  payables,
  canEdit,
  onChanged,
}: {
  eventId: string;
  payables: EventOverview["payables"];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof PAYABLE_KINDS)[number]>("payment");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<(typeof PAYABLE_STATUSES)[number]>("pending");
  const [due, setDue] = useState("");

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("events.overview.payables")}</h2>
      {payables.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("events.overview.noPayables")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {payables.map((row) => (
            <li key={`${row.source}-${row.id}`} className="flex items-center justify-between gap-2">
              <span>
                {row.title}
                <span className="ms-2 text-xs text-muted-foreground">{t(`events.payableKind.${row.kind}`)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{fmtQar(row.amount)}</span>
                <Badge variant={row.status === "overdue" ? "destructive" : "outline"}>{t(`events.payableStatus.${row.status}`)}</Badge>
                {canEdit && row.source === "payable" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await deleteEventPayable({ id: row.id });
                        onChanged();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("events.overview.payableTitle")} />
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYABLE_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`events.payableKind.${k}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("events.budget.amount")} />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYABLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`events.payableStatus.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <Button
            size="sm"
            disabled={!title.trim() || !amount}
            onClick={async () => {
              try {
                await upsertEventPayable({
                  eventId,
                  title,
                  kind,
                  amount: Number(amount),
                  status,
                  due_date: due || null,
                });
                setTitle("");
                setAmount("");
                setDue("");
                onChanged();
                toast.success(t("events.toasts.payableSaved"));
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            {t("events.overview.addPayable")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function EventAssetsPanel({
  eventId,
  assets,
  canEdit,
  onChanged,
}: {
  eventId: string;
  assets: EventOverview["assets"];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [status, setStatus] = useState<(typeof ASSET_MOVE_STATUSES)[number]>("planned");

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("events.overview.assets")}</h2>
      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("events.overview.noAssets")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {assets.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2">
              <span>
                {row.item_name} <span className="text-xs text-muted-foreground">× {row.qty}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={row.status === "missing" ? "destructive" : "outline"}>{t(`events.assetStatus.${row.status}`)}</Badge>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await deleteEventAsset({ id: row.id });
                        onChanged();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("events.overview.assetName")} />
          <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSET_MOVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`events.assetStatus.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={async () => {
              try {
                await upsertEventAsset({ eventId, item_name: name, qty: Number(qty || 1), status });
                setName("");
                setQty("1");
                onChanged();
                toast.success(t("events.toasts.assetSaved"));
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            {t("events.overview.addAsset")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
