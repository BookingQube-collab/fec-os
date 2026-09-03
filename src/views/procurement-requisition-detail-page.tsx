"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  Mail,
  Pencil,
  Phone,
  Printer,
  RotateCcw,
  ShieldCheck,
  Tag,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PrReviewPanel } from "@/components/procurement/pr-review-panel";
import { usePrActions } from "@/components/procurement/pr-row-actions";
import { PrStatusPill } from "@/components/procurement/pr-status-pill";
import { PrTimeline, type TimelineNode } from "@/components/procurement/pr-timeline";
import { usePermission } from "@/hooks/use-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtNumber, fmtQar } from "@/lib/currency";
import {
  headerStatusChip,
  inferPaymentStructure,
  isFreightLine,
  latestPrReturnOrReject,
  prDisplayTitle,
  priorityKey,
  reviseRequisitionPath,
  splitJustification,
} from "@/lib/procurement/display";
import { vendorComplianceTone } from "@/lib/procurement/milestones";
import { getPurchaseRequisition, recordPrMilestone } from "@/lib/procurement.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ProcurementRequisitionDetailPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const qc = useQueryClient();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [clearId, setClearId] = useState<string | null>(null);
  const [clearAction, setClearAction] = useState<"clear" | "pay">("clear");
  const [evidence, setEvidence] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [reviewing, setReviewing] = useState(true);
  const universal = usePermission("procurement.configure");
  const actions = usePrActions({
    onReissued: (prId, isOwner) => {
      if (isOwner) router.push(reviseRequisitionPath(prId));
    },
  });

  const detail = useQuery({
    queryKey: queryKeys.procurement.detail(id),
    queryFn: () => getPurchaseRequisition({ id }),
    enabled: Boolean(id),
  });

  const d = detail.data;
  const h = d?.header;

  const parsed = useMemo(() => splitJustification(h?.justification), [h?.justification]);
  const title = h ? prDisplayTitle(h) || t("procurement.list.untitled") : "";
  const description = parsed.overview || parsed.title;
  const purpose =
    (h as { purpose_category?: string | null } | undefined)?.purpose_category?.trim() ||
    h?.project_name?.trim() ||
    h?.cost_center ||
    h?.location_name ||
    "—";
  const payment = inferPaymentStructure(
    h?.justification,
    (h as { payment_structure?: string | null } | undefined)?.payment_structure,
  );
  const milestoneMut = useMutation({
    mutationFn: recordPrMilestone,
    onSuccess: () => {
      toast.success(t("procurement.detail.milestoneRecorded"));
      setClearId(null);
      setEvidence("");
      void qc.invalidateQueries({ queryKey: queryKeys.procurement.detail(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dateLabel = formatLongDate(h?.requested_at ?? h?.created_at, i18n.language);

  const goodsLines = useMemo(
    () => (d?.lines ?? []).filter((line) => !isFreightLine(line.name)),
    [d?.lines],
  );
  const freight = useMemo(
    () =>
      (d?.lines ?? [])
        .filter((line) => isFreightLine(line.name))
        .reduce((sum, line) => sum + Number(line.line_total ?? 0), 0),
    [d?.lines],
  );
  const itemSubtotal = goodsLines.reduce((sum, line) => sum + Number(line.line_total ?? 0), 0);
  const total = Number(h?.total_amount ?? itemSubtotal + freight);
  const chip = h ? headerStatusChip(h.status) : "other";
  const prio = priorityKey(h?.priority);

  const nodes = useMemo(() => (d && h ? buildTimeline(d, t, i18n.language) : []), [d, h, t, i18n.language]);
  const returnNote = useMemo(() => (d ? latestPrReturnOrReject(d.history) : null), [d]);
  const stageOptions = useMemo(() => {
    if (!d) return [];
    const pending = d.steps.filter((s) => s.status === "pending");
    return pending.map((step) => ({
      id: step.id,
      label: t(`procurement.detail.timelineStep.${step.step_role}`, {
        defaultValue: t(`procurement.steps.${step.step_role}`),
      }),
    }));
  }, [d, t]);

  if (detail.isLoading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!d || !h) {
    return <p className="text-muted-foreground">{t("procurement.detail.notFound")}</p>;
  }

  const summary = {
    prNumber: h.pr_number ?? t("procurement.list.draftNumber"),
    title,
    amount: total,
    requester: h.requester_name,
    department: h.department_name,
  };
  const actionTarget = {
    id,
    prNumber: summary.prNumber,
    title,
    amount: total,
    requester: h.requester_name,
    department: h.department_name,
    canAct: d.canAct,
    canReissue: d.canReissue,
    isOwner: d.isOwner,
    overBudget: Boolean(h.over_budget || d.budget?.overBudget),
    excessAmount: Number(h.excess_amount || d.budget?.excessAmount || 0),
    budgetIncreasePending: Boolean(h.budget_increase_pending),
    currentStepRole: h.current_step_role as string | null,
  };

  const exportLines = () => {
    const header = ["Description", "Qty", "Unit", "Unit Price", "Total"];
    const body = goodsLines.map((line) =>
      [line.name, line.qty, line.unit, line.unit_price, line.line_total]
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    downloadCsv([header.join(","), ...body].join("\n"), `${summary.prNumber}-lines.csv`);
  };

  const exportSummary = () => {
    const rows = [
      ["PR #", summary.prNumber],
      ["Title", title],
      ["Status", h.status],
      ["Requester", h.requester_name],
      ["Department", h.department_name],
      ["Purpose", purpose],
      ["Amount", String(total)],
      ["Currency", h.currency ?? "QAR"],
    ];
    downloadCsv(rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), `${summary.prNumber}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" className="mt-0.5 h-10 w-10" asChild>
            <Link href="/procurement/requisitions" aria-label={t("procurement.wizard.back")}>
              <ArrowLeft className="rtl:rotate-180" />
            </Link>
          </Button>
          <div className="min-w-0 space-y-2">
            <span className="pr-number-pill max-w-full">
              {summary.prNumber}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title">{title}</h1>
              {chip === "pending" ? (
                <Badge variant="warning">{t("procurement.statusChip.pending")}</Badge>
              ) : (
                <PrStatusPill status={h.status} />
              )}
              {d.event ? (
                <Link
                  href={`/events/${d.event.id}`}
                  className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {d.event.name}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {t("procurement.detail.documentExport")}
                <ChevronDown className="opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportLines}>
                <FileSpreadsheet />
                {t("procurement.detail.exportCsv")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportSummary}>
                <Download />
                {t("procurement.detail.exportSummary")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer />
                {t("procurement.detail.print")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {d.canEdit ? (
            <Button variant="outline" asChild>
              <Link href={reviseRequisitionPath(id)}>
                <Pencil />
                {t("procurement.detail.edit")}
              </Link>
            </Button>
          ) : null}
          {d.canReissue ? (
            <Button variant="outline" disabled={actions.pending} onClick={() => actions.reissue(actionTarget)}>
              <RotateCcw />
              {t("procurement.detail.reissue")}
            </Button>
          ) : null}
          {d.canCancel ? (
            <Button
              variant="destructive"
              disabled={actions.pending}
              onClick={() => {
                if (window.confirm(t("procurement.detail.confirmDeleteBody"))) {
                  actions.cancel(actionTarget, t("procurement.detail.deleteReason"));
                }
              }}
            >
              <Trash2 />
              {t("procurement.detail.delete")}
            </Button>
          ) : null}
          {d.isLocked && !d.canAct ? (
            <Button variant="outline" disabled>
              <Lock />
              {t("procurement.detail.locked")}
            </Button>
          ) : null}
          {d.canAct ? (
            <Button variant={reviewing ? "outline" : "default"} onClick={() => setReviewing((v) => !v)}>
              <ShieldCheck />
              {reviewing ? t("procurement.detail.closeReview") : t("procurement.detail.reviewRequest")}
            </Button>
          ) : null}
        </div>
      </div>

      {h.over_budget || d.budget?.overBudget ? (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            {t("procurement.detail.overBudgetTitle")}
          </p>
          <p className="mt-1 text-sm text-amber-950 dark:text-amber-50">
            {t("procurement.detail.overBudgetBanner", {
              amount: fmtNumber(Number(h.excess_amount || d.budget?.excessAmount || 0)),
            })}
          </p>
          {d.budget?.remaining != null ? (
            <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
              {t("procurement.form.remainingBudget", { amount: fmtQar(d.budget.remaining) })}
            </p>
          ) : null}
          {h.budget_increase_pending ? (
            <p className="mt-2 text-xs font-medium text-amber-900 dark:text-amber-100">
              {t("procurement.detail.budgetIncreasePending")}
            </p>
          ) : null}
        </div>
      ) : d.budget?.remaining != null ? (
        <div className="rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm shadow-elevated-xs">
          {t("procurement.form.remainingBudget", { amount: fmtQar(d.budget.remaining) })}
          {d.budget.cap != null ? (
            <span className="ms-2 text-muted-foreground">
              {t("procurement.detail.budgetCap", { amount: fmtNumber(d.budget.cap) })}
            </span>
          ) : null}
        </div>
      ) : null}

      {returnNote?.comments?.trim() ? (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            {returnNote.action === "rejected"
              ? t("procurement.detail.rejectionReason")
              : t("procurement.detail.returnReason")}
          </p>
          <p className="mt-1 text-sm text-amber-950 dark:text-amber-50">{returnNote.comments}</p>
        </div>
      ) : null}

      {d.canAct && reviewing ? (
        <PrReviewPanel
          roleLabel={t(`procurement.detail.timelineStep.${h.current_step_role ?? "dept_head"}`, {
            defaultValue: t(`procurement.steps.${h.current_step_role ?? "dept_head"}`),
          })}
          stageOptions={stageOptions.length ? stageOptions : undefined}
          universal={universal}
          pending={actions.pending}
          onApprove={(comments) => {
            if (h.over_budget) {
              actions.open("approve", actionTarget);
              return;
            }
            actions.approve(actionTarget, comments);
          }}
          onReject={(comments) => {
            if (comments.length < 3) {
              actions.open("reject", actionTarget);
              return;
            }
            actions.reject(actionTarget, comments);
          }}
          onRequestChanges={(comments) => {
            if (comments.length < 3) {
              actions.open("return", actionTarget);
              return;
            }
            actions.requestChanges(actionTarget, comments);
          }}
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <section className="relative rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
            <Badge
              variant="outline"
              className={cn(
                "absolute end-5 top-5 uppercase",
                prio === "high" || prio === "emergency"
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                  : "border-orange-200 text-orange-600",
              )}
            >
              {t(`procurement.detail.priority.${prio}`)}
            </Badge>
            <h2 className="text-base font-semibold">{t("procurement.detail.requestDetails")}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{description || "—"}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Meta icon={UserRound} label={t("procurement.list.requester")} value={h.requester_name} />
              <Meta icon={Building2} label={t("procurement.list.dept")} value={h.department_name} />
              <Meta icon={Tag} label={t("procurement.list.purpose")} value={purpose} />
              <Meta icon={CalendarDays} label={t("procurement.form.date")} value={dateLabel} />
            </div>
            {d.vendor ? <VendorCard vendor={d.vendor} /> : null}
          </section>

          <section className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{t("procurement.detail.financial")}</h2>
              <Badge variant="secondary">{h.currency || "QAR"}</Badge>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Money label={t("procurement.detail.itemSubtotal")} value={itemSubtotal} />
              <Money label={t("procurement.detail.freightTax")} value={freight} />
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("procurement.detail.paymentCycle")}</p>
                <p className="mt-1 font-semibold">{t(`procurement.detail.cycle.${payment}`)}</p>
              </div>
            </div>
            <div className="mt-5 border-t border-border/40 pt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("procurement.detail.totalAuth")}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{fmtNumber(total)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{t("procurement.detail.milestones")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("procurement.detail.disbursed", {
                  paid: fmtNumber((d.milestones ?? []).reduce((s, m) => s + Number(m.paid_amount ?? 0), 0)),
                  total: fmtNumber(total),
                })}
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {(d.milestones ?? []).length === 0 ? (
                <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
                  <p className="font-semibold">{t(`procurement.detail.milestone.${payment}`)}</p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {t("procurement.statusChip.pending")}
                  </p>
                </div>
              ) : (
                (d.milestones ?? []).map((ms) => (
                  <div key={ms.id} className="rounded-xl border border-border/40 bg-muted/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{ms.title}</p>
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {t(`procurement.detail.milestoneStatus.${ms.status}`)}
                          {ms.due_date ? (
                            <>
                              <span className="mx-1">·</span>
                              {formatShortDate(ms.due_date, i18n.language)}
                            </>
                          ) : null}
                        </p>
                        {ms.conditions ? <p className="mt-1 text-xs text-muted-foreground">{ms.conditions}</p> : null}
                        {ms.evidence_note ? (
                          <p className="mt-1 text-xs text-muted-foreground">{ms.evidence_note}</p>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {fmtNumber(ms.amount)} {h.currency || "QAR"}
                      </p>
                    </div>
                    {d.canClearMilestones && ms.status === "pending" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setClearId(ms.id);
                            setClearAction("clear");
                            setPayAmount(String(ms.amount));
                          }}
                        >
                          {t("procurement.detail.clearMilestone")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setClearId(ms.id);
                            setClearAction("pay");
                            setPayAmount(String(ms.amount));
                          }}
                        >
                          {t("procurement.detail.recordPayment")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            {clearId ? (
              <div className="mt-4 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-semibold">
                  {clearAction === "pay" ? t("procurement.detail.recordPayment") : t("procurement.detail.clearMilestone")}
                </p>
                {clearAction === "pay" ? (
                  <div className="space-y-1.5">
                    <Label>{t("procurement.wizard.milestoneAmount")}</Label>
                    <Input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label>{t("procurement.detail.evidence")}</Label>
                  <Textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={milestoneMut.isPending || evidence.trim().length < 3}
                    onClick={() =>
                      milestoneMut.mutate({
                        id: clearId,
                        action: clearAction,
                        paid_amount: Number(payAmount) || undefined,
                        evidence_note: evidence.trim(),
                      })
                    }
                  >
                    {t("procurement.detail.confirmClearance")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setClearId(null)}>
                    {t("procurement.wizard.discard")}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{t("procurement.form.lines")}</h2>
              <Button variant="outline" size="sm" onClick={exportLines}>
                <FileSpreadsheet />
                {t("procurement.detail.exportCsv")}
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("procurement.form.description")}</TableHead>
                  <TableHead>{t("procurement.form.qty")}</TableHead>
                  <TableHead>{t("procurement.form.unitPrice")}</TableHead>
                  <TableHead className="text-end">{t("procurement.form.lineTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goodsLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {t("procurement.list.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  goodsLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p className="font-medium">{line.name}</p>
                        {line.description ? (
                          <p className="text-xs text-muted-foreground">{line.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{line.qty}</TableCell>
                      <TableCell className="tabular-nums">{fmtNumber(line.unit_price)}</TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">{fmtNumber(line.line_total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
              <h2 className="text-base font-semibold">{t("procurement.detail.attachments")}</h2>
              {d.attachments.length === 0 ? (
                <p className="mt-8 text-center text-sm text-muted-foreground">{t("procurement.detail.noAttachments")}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {d.attachments.map((file) => (
                    <li key={file.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl border border-border/40 px-3 py-2 text-start text-sm hover:bg-secondary",
                          previewId === file.id && "border-primary/40 bg-primary/5",
                        )}
                        onClick={() => setPreviewId(file.id)}
                      >
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
                        {(file as { doc_type?: string }).doc_type ? (
                          <Badge variant="muted" className="uppercase">
                            {t(`procurement.wizard.docType.${(file as { doc_type?: string }).doc_type ?? "other"}`)}
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
              <h2 className="text-base font-semibold">{t("procurement.detail.preview")}</h2>
              {(() => {
                const selected = d.attachments.find((f) => f.id === previewId) as
                  | { url?: string | null; file_name: string; file_mime?: string | null }
                  | undefined;
                if (!selected) {
                  return <p className="mt-8 text-center text-sm text-muted-foreground">{t("procurement.detail.selectPreview")}</p>;
                }
                if (!selected.url) {
                  return <p className="mt-8 text-center text-sm text-muted-foreground">{t("procurement.detail.previewLocal")}</p>;
                }
                if ((selected.file_mime ?? "").startsWith("image/")) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.url} alt={selected.file_name} className="mt-3 max-h-72 w-full rounded-xl object-contain" />
                  );
                }
                return (
                  <a href={selected.url} target="_blank" rel="noreferrer" className="mt-6 block text-center text-sm text-primary underline">
                    {t("procurement.detail.openAttachment")}
                  </a>
                );
              })()}
            </section>
          </div>
        </div>

        <PrTimeline nodes={nodes} />
      </div>

      {actions.dialogs}
    </div>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{fmtNumber(value)}</p>
    </div>
  );
}

function VendorCard({
  vendor,
}: {
  vendor: {
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    amc_status: string | null;
    payment_terms: string | null;
    notes: string | null;
  };
}) {
  const { t } = useTranslation();
  const tax = vendor.payment_terms || vendor.notes;
  const rawStatus =
    (vendor as { compliance_status?: string | null }).compliance_status || vendor.amc_status || "unassessed";
  const status = rawStatus.replace(/_/g, " ");
  const tone = vendorComplianceTone(rawStatus);
  return (
    <div className="mt-5 rounded-xl bg-muted/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{vendor.name}</p>
          {tax ? <p className="text-xs text-muted-foreground">{tax}</p> : null}
        </div>
        <Badge variant={tone === "block" ? "destructive" : tone === "warn" ? "warning" : "muted"} className="uppercase">
          {status}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {vendor.contact_person ? (
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5" />
            {vendor.contact_person}
          </span>
        ) : null}
        {vendor.email ? (
          <span className="inline-flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            {vendor.email}
          </span>
        ) : null}
        {vendor.phone ? (
          <span className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            {vendor.phone}
          </span>
        ) : null}
        {!vendor.contact_person && !vendor.email && !vendor.phone ? (
          <span>{t("procurement.detail.noVendorContact")}</span>
        ) : null}
        {tone === "block" ? (
          <p className="mt-2 w-full text-xs text-destructive">{t("procurement.wizard.vendorBlocked")}</p>
        ) : tone === "warn" ? (
          <p className="mt-2 w-full text-xs text-amber-700 dark:text-amber-300">{t("procurement.wizard.vendorGrace")}</p>
        ) : null}
      </div>
    </div>
  );
}

function buildTimeline(
  d: Awaited<ReturnType<typeof getPurchaseRequisition>>,
  t: (key: string, opts?: Record<string, string>) => string,
  locale: string,
): TimelineNode[] {
  const submitted = d.history.find((ev) => ev.action === "submitted" || ev.action === "resubmitted");
  const initiatedDone = Boolean(submitted) || !["draft", "returned", "changes_requested"].includes(d.header.status);
  const initiated: TimelineNode = {
    id: "initiated",
    title: t("procurement.detail.timelineInitiated"),
    state: initiatedDone ? "done" : "current",
    meta: t("procurement.detail.timelineBy", { name: d.header.requester_name }),
    date: formatStamp(submitted?.created_at ?? d.header.created_at, locale),
  };

  const currentPending = d.steps.find((s) => s.status === "pending");
  const stepNodes: TimelineNode[] = d.steps.map((step) => {
    const role = step.step_role as string;
    let state: TimelineNode["state"] = "upcoming";
    if (step.status === "approved" || step.status === "skipped") state = "done";
    else if (step.status === "rejected") state = "rejected";
    else if (currentPending?.id === step.id && !["rejected", "returned", "cancelled"].includes(d.header.status)) {
      state = "current";
    }
    const actor = step.acted_by ? d.actorNames[step.acted_by] : null;
    const stepComment = typeof step.comments === "string" ? step.comments.trim() : "";
    return {
      id: step.id,
      title: t(`procurement.detail.timelineStep.${role}`, { defaultValue: t(`procurement.steps.${role}`) }),
      state,
      meta:
        state === "current"
          ? t("procurement.detail.pendingAction")
          : state === "rejected"
            ? stepComment || t("procurement.status.rejected")
            : actor
              ? t("procurement.detail.timelineBy", { name: actor })
              : "",
      date: step.acted_at ? formatStamp(step.acted_at, locale) : undefined,
    };
  });

  const hasRejectedStep = d.steps.some((s) => s.status === "rejected");
  const cycleNotes: TimelineNode[] = hasRejectedStep
    ? []
    : d.history
        .filter((ev) => ev.action === "returned" || ev.action === "rejected" || ev.action === "resubmitted")
        .map((ev) => {
          const actor = ev.actor_id ? d.actorNames[ev.actor_id] : null;
          const comment = typeof ev.comments === "string" ? ev.comments.trim() : "";
          return {
            id: `hist-${ev.id}`,
            title:
              ev.action === "resubmitted"
                ? t("procurement.detail.timelineResubmitted")
                : ev.action === "returned"
                  ? t("procurement.detail.timelineReturned")
                  : t("procurement.detail.timelineRejectedNote"),
            state: (ev.action === "resubmitted" ? "done" : "rejected") as TimelineNode["state"],
            meta:
              comment ||
              (actor ? t("procurement.detail.timelineBy", { name: actor }) : ""),
            date: formatStamp(ev.created_at, locale),
          };
        });

  let finalState: TimelineNode["state"] = "upcoming";
  let finalMeta = t("procurement.detail.awaitingSignoffs");
  if (d.header.status === "approved" || d.header.status === "po_created") {
    finalState = "done";
    finalMeta = t("procurement.status.approved");
  } else if (d.header.status === "rejected") {
    finalState = "rejected";
    finalMeta = t("procurement.status.rejected");
  } else if (d.header.status === "cancelled") {
    finalState = "rejected";
    finalMeta = t("procurement.status.cancelled");
  }

  return [
    initiated,
    ...cycleNotes,
    ...stepNodes,
    {
      id: "final",
      title: t("procurement.detail.finalStatus"),
      state: finalState,
      meta: finalMeta,
    },
  ];
}

function formatLongDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(locale?.startsWith("ar") ? "ar" : "en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(locale?.startsWith("ar") ? "ar" : "en-US");
}

function formatStamp(value: string | null | undefined, locale: string) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d
    .toLocaleDateString(locale?.startsWith("ar") ? "ar" : "en", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
