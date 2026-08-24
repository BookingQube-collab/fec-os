"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { EventFinanceKpis, EventFinanceMoreFigures } from "@/components/events/event-finance-kpis";
import { EventMarginChart } from "@/components/events/event-margin-chart";
import { EventSpendChart } from "@/components/events/event-spend-chart";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { PageHeader } from "@/components/layout/page-header";
import { PrStatusPill } from "@/components/procurement/pr-status-pill";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEvent, useEventBudget } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import { fmtQar } from "@/lib/currency";
import { INVOICE_STATUSES } from "@/lib/events/constants";
import { boqLineTotals, missingDepartmentBoqs, missingRequiredByType, resolveDocumentStatus } from "@/lib/events/documents";
import {
  budgetHealth,
  evaluateBudgetAlerts,
  finalRevenue,
  marginPct,
  overBudgetLines,
  prCommittedTotal,
  remainingBudget,
  revisedBudget,
  sumBudgetLines,
  unlinkedPrs,
  varianceCommitted,
  varianceForecast,
} from "@/lib/events/finance";
import {
  deleteEventClientInvoice,
  saveEventBaseline,
  upsertEventBudget,
  upsertEventClientInvoice,
} from "@/lib/events.functions";
import type { EventBudgetTotals } from "@/lib/events/types";
import { queryKeys } from "@/lib/query-keys";

type LineDraft = {
  key: string;
  id?: string;
  category_id: string;
  subcategory_id: string;
  title: string;
  original_amount: number;
  approved_changes: number;
  committed_amount: number;
  actual_amount: number;
  forecast_amount: number;
  notes: string;
};

type RevenueDraft = {
  contract_value: number;
  additional_revenue: number;
  approved_change_orders: number;
  discounts: number;
  taxes: number;
};

type InvoiceDraft = {
  invoice_number: string;
  title: string;
  status: (typeof INVOICE_STATUSES)[number];
  amount: number;
  currency: string;
  fx_rate: number;
  paid_amount: number;
  issue_date: string;
  due_date: string;
};

function emptyInvoice(): InvoiceDraft {
  return {
    invoice_number: "",
    title: "",
    status: "draft",
    amount: 0,
    currency: "QAR",
    fx_rate: 1,
    paid_amount: 0,
    issue_date: "",
    due_date: "",
  };
}

function emptyFinance(): EventBudgetTotals {
  return {
    original: null,
    approvedChanges: null,
    revised: null,
    committed: null,
    actual: null,
    forecast: null,
    variance: null,
    varianceForecast: null,
    varianceCommitted: null,
    remaining: null,
    contractValue: null,
    additionalRevenue: null,
    changeOrders: null,
    discounts: null,
    taxes: null,
    finalRevenue: null,
    recognizedRevenue: null,
    grossProfit: null,
    forecastProfit: null,
    actualProfit: null,
    marginPct: null,
    originalMarginPct: null,
    revisedMarginPct: null,
    forecastMarginPct: null,
    actualMarginPct: null,
    receivable: null,
    payable: null,
    hasBudget: false,
    hasInvoices: false,
  };
}

export default function EventBudgetPage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const canFinance = usePermission("events.finance");
  const eventQ = useEvent(id);
  const budgetQ = useEventBudget(id);
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const [threshold, setThreshold] = useState(0);
  const [contingencyCap, setContingencyCap] = useState(80);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [revenue, setRevenue] = useState<RevenueDraft>({
    contract_value: 0,
    additional_revenue: 0,
    approved_change_orders: 0,
    discounts: 0,
    taxes: 0,
  });
  const [invoiceForm, setInvoiceForm] = useState<InvoiceDraft>(emptyInvoice());
  const [newLine, setNewLine] = useState({ category_id: "", subcategory_id: "", title: "" });

  useEffect(() => {
    if (!budgetQ.data) return;
    const d = budgetQ.data;
    setStatus(d.header?.status ?? "draft");
    setNotes(d.header?.notes ?? "");
    setThreshold(d.header?.line_alert_threshold_pct ?? 0);
    setContingencyCap(d.header?.contingency_usage_threshold_pct ?? 80);
    setRevenue({
      contract_value: d.header?.contract_value ?? d.eventContracted ?? 0,
      additional_revenue: d.header?.additional_revenue ?? 0,
      approved_change_orders: d.header?.approved_change_orders ?? 0,
      discounts: d.header?.discounts ?? 0,
      taxes: d.header?.taxes ?? 0,
    });
    setLines(
      d.lines.map((l) => ({
        key: l.id,
        id: l.id,
        category_id: l.category_id,
        subcategory_id: l.subcategory_id ?? "",
        title: l.title,
        original_amount: l.original_amount,
        approved_changes: l.approved_changes,
        committed_amount: l.committed_amount,
        actual_amount: l.actual_amount,
        forecast_amount: l.forecast_amount,
        notes: l.notes ?? "",
      })),
    );
  }, [budgetQ.data]);

  const categories = budgetQ.data?.categories ?? [];
  const subcategories = budgetQ.data?.subcategories ?? [];
  const locked = status === "locked";
  const editable = canFinance && !locked;
  const linkedPrs = budgetQ.data?.linkedPrs ?? [];
  const documents = eventQ.data?.documents ?? [];
  const missingBoqN =
    missingDepartmentBoqs(documents, eventQ.data?.workstreams).length ||
    missingRequiredByType(documents, "boq").length;
  const missingBoq = missingBoqN > 0;
  const boqUploaded = documents.some((doc) => doc.doc_type === "boq" && resolveDocumentStatus(doc) === "uploaded");
  const boqTotals = boqLineTotals(documents);

  const computedLines = useMemo(
    () =>
      lines.map((line) => {
        const revised = revisedBudget(line.original_amount, line.approved_changes);
        return {
          ...line,
          revised_amount: revised,
          remaining: remainingBudget(revised, line.committed_amount),
          variance_forecast: varianceForecast(revised, line.forecast_amount),
          variance_committed: varianceCommitted(revised, line.committed_amount),
        };
      }),
    [lines],
  );

  const lineTotals = useMemo(() => sumBudgetLines(computedLines), [computedLines]);
  const liveFinal = finalRevenue({
    contractValue: revenue.contract_value,
    additionalRevenue: revenue.additional_revenue,
    changeOrders: revenue.approved_change_orders,
    discounts: revenue.discounts,
    taxes: revenue.taxes,
  });

  const extraCommitted = useMemo(
    () =>
      prCommittedTotal(
        linkedPrs.map((p) => ({
          id: p.id,
          status: p.status,
          total_amount: p.total_amount,
          cost_category_id: p.cost_category_id,
        })),
      ),
    [linkedPrs],
  );

  const liveCommitted = lineTotals.committed + extraCommitted;
  const liveRemaining = remainingBudget(lineTotals.revised, liveCommitted);
  const liveMargin = marginPct(liveFinal, lineTotals.forecast);
  const health = budgetHealth({
    revised: lineTotals.revised,
    committed: liveCommitted,
    forecast: lineTotals.forecast,
  });
  const overLines = useMemo(() => overBudgetLines(computedLines), [computedLines]);
  const unlinked = useMemo(() => unlinkedPrs(linkedPrs), [linkedPrs]);
  const spendWithoutPrs = lineTotals.actual > 0 && linkedPrs.length === 0;

  const liveFinance: EventBudgetTotals = useMemo(() => {
    const saved = budgetQ.data?.finance;
    const base = saved ?? emptyFinance();
    const forecastGp = liveFinal - lineTotals.forecast;
    return {
      ...base,
      original: lineTotals.original,
      approvedChanges: lineTotals.approvedChanges,
      revised: lineTotals.revised,
      committed: liveCommitted,
      actual: lineTotals.actual,
      forecast: lineTotals.forecast,
      variance: lineTotals.varianceForecast,
      varianceForecast: lineTotals.varianceForecast,
      varianceCommitted: varianceCommitted(lineTotals.revised, liveCommitted),
      remaining: liveRemaining,
      contractValue: revenue.contract_value,
      additionalRevenue: revenue.additional_revenue,
      changeOrders: revenue.approved_change_orders,
      discounts: revenue.discounts,
      taxes: revenue.taxes,
      finalRevenue: liveFinal,
      grossProfit: forecastGp,
      forecastProfit: forecastGp,
      marginPct: liveMargin,
      originalMarginPct: marginPct(revenue.contract_value, lineTotals.original),
      revisedMarginPct: marginPct(liveFinal, lineTotals.revised),
      forecastMarginPct: liveMargin,
      hasBudget: computedLines.length > 0,
    };
  }, [budgetQ.data?.finance, computedLines.length, lineTotals, liveCommitted, liveFinal, liveMargin, liveRemaining, revenue]);

  const liveAlerts = useMemo(
    () =>
      evaluateBudgetAlerts({
        lines: computedLines.map((l) => ({
          ...l,
          category_code: categories.find((c) => c.id === l.category_id)?.code,
        })),
        prs: linkedPrs.map((p) => ({
          id: p.id,
          status: p.status,
          total_amount: p.total_amount,
          cost_category_id: p.cost_category_id,
        })),
        lineThresholdPct: threshold,
        contingencyUsagePct: contingencyCap,
      }),
    [computedLines, linkedPrs, categories, threshold, contingencyCap],
  );

  const grouped = useMemo(() => {
    const byCat = new Map<string, typeof computedLines>();
    for (const line of computedLines) {
      const list = byCat.get(line.category_id) ?? [];
      list.push(line);
      byCat.set(line.category_id, list);
    }
    return [...byCat.entries()].map(([categoryId, catLines]) => {
      const cat = categories.find((c) => c.id === categoryId);
      const bySub = new Map<string, typeof computedLines>();
      for (const line of catLines) {
        const key = line.subcategory_id || "_none";
        const list = bySub.get(key) ?? [];
        list.push(line);
        bySub.set(key, list);
      }
      return {
        categoryId,
        cat,
        totals: sumBudgetLines(catLines),
        subs: [...bySub.entries()].map(([subId, subLines]) => ({
          subId,
          sub: subcategories.find((s) => s.id === subId),
          totals: sumBudgetLines(subLines),
          lines: subLines,
        })),
      };
    });
  }, [computedLines, categories, subcategories]);

  const spendRows = useMemo(
    () =>
      grouped.map((group) => ({
        label: group.cat ? (ar ? group.cat.label_ar : group.cat.label_en) : group.categoryId,
        budget: group.totals.revised,
        spent: group.totals.actual,
        committed: group.totals.committed,
      })),
    [ar, grouped],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.events.all });

  const save = useMutation({
    mutationFn: () =>
      upsertEventBudget({
        eventId: id,
        status: status as "draft" | "approved" | "locked",
        notes: notes || null,
        contract_value: revenue.contract_value,
        additional_revenue: revenue.additional_revenue,
        approved_change_orders: revenue.approved_change_orders,
        discounts: revenue.discounts,
        taxes: revenue.taxes,
        line_alert_threshold_pct: threshold,
        contingency_usage_threshold_pct: contingencyCap,
        lines: computedLines.map((l, idx) => ({
          id: l.id,
          category_id: l.category_id,
          subcategory_id: l.subcategory_id || null,
          title: l.title || null,
          original_amount: l.original_amount,
          approved_changes: l.approved_changes,
          committed_amount: l.committed_amount,
          actual_amount: l.actual_amount,
          forecast_amount: l.forecast_amount,
          notes: l.notes || null,
          sort_order: idx,
        })),
      }),
    onSuccess: (res) => {
      invalidate();
      if (res.alerts.length) toast.error(t("events.budget.alertSave"));
      else toast.success(t("events.toasts.budgetSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const baseline = useMutation({
    mutationFn: () => saveEventBaseline({ eventId: id, baseline_type: "budget" }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.budgetBaseline"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveInvoice = useMutation({
    mutationFn: () =>
      upsertEventClientInvoice({
        eventId: id,
        invoice_number: invoiceForm.invoice_number,
        title: invoiceForm.title || null,
        status: invoiceForm.status,
        amount: invoiceForm.amount,
        currency: invoiceForm.currency,
        fx_rate: invoiceForm.fx_rate,
        paid_amount: invoiceForm.paid_amount,
        issue_date: invoiceForm.issue_date || null,
        due_date: invoiceForm.due_date || null,
      }),
    onSuccess: () => {
      invalidate();
      setInvoiceForm(emptyInvoice());
      toast.success(t("events.toasts.invoiceSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeInvoice = useMutation({
    mutationFn: (invoiceId: string) => deleteEventClientInvoice({ id: invoiceId }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.invoiceDeleted"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const catLabel = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return categoryId;
    return ar ? cat.label_ar : cat.label_en;
  };

  const setLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addLine = () => {
    if (!newLine.category_id) return;
    setLines((rows) => [
      ...rows,
      {
        key: crypto.randomUUID(),
        category_id: newLine.category_id,
        subcategory_id: newLine.subcategory_id,
        title: newLine.title,
        original_amount: 0,
        approved_changes: 0,
        committed_amount: 0,
        actual_amount: 0,
        forecast_amount: 0,
        notes: "",
      },
    ]);
    setNewLine({ category_id: "", subcategory_id: "", title: "" });
  };

  const filteredSubs = subcategories.filter((s) => s.category_id === newLine.category_id);
  const ev = eventQ.data?.event;
  const healthVariant = health === "over" ? "destructive" : health === "on" ? "outline" : health === "under" ? "success" : null;

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <PageHeader
        kicker={ev?.event_number ?? undefined}
        title={t("events.budget.title")}
        subtitle={t("events.budget.purpose")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canFinance ? (
              <Button size="sm" variant="outline" onClick={() => baseline.mutate()} disabled={baseline.isPending}>
                {t("events.budget.saveBaseline")}
              </Button>
            ) : null}
            <EventWorkspaceNav eventId={id} />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {ev?.name ? <span className="text-sm text-muted-foreground">{ev.name}</span> : null}
        {health && healthVariant ? (
          <Badge variant={healthVariant}>{t(`events.budget.health${health === "under" ? "Under" : health === "on" ? "On" : "Over"}`)}</Badge>
        ) : null}
        <Badge variant="outline">{t(`events.budgetStatus.${status}`)}</Badge>
        {overLines.length > 0 ? (
          <Badge variant="destructive">{t("events.budget.overLinesN", { n: overLines.length })}</Badge>
        ) : null}
        {unlinked.length > 0 ? (
          <Badge variant="warning">{t("events.budget.unlinkedSpendN", { n: unlinked.length })}</Badge>
        ) : null}
        {spendWithoutPrs ? <Badge variant="warning">{t("events.budget.spendWithoutPrs")}</Badge> : null}
        <Link href={`/events/${id}/scope#documents`}>
          <Badge variant={missingBoq || !boqUploaded ? "destructive" : "success"}>
            {t("events.plan.boqChip")} ·{" "}
            {missingBoq
              ? t("events.plan.boqMissingN", { n: missingBoqN })
              : boqUploaded
                ? t("events.plan.boqUploaded")
                : t("events.plan.boqMissing")}
          </Badge>
        </Link>
        {boqTotals.total > 0 && (lineTotals.revised ?? 0) > 0 ? (
          <Badge variant="outline">
            {t("events.docs.boqVsBudget", { boq: fmtQar(boqTotals.total), budget: fmtQar(lineTotals.revised) })}
          </Badge>
        ) : null}
      </div>

      <EventFinanceKpis finance={liveFinance} />

      {liveAlerts.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-rag-red/40 bg-rag-red/10 p-3 text-sm">
          {liveAlerts.map((alert, idx) => (
            <p key={`${alert.kind}-${alert.prId ?? alert.lineId ?? idx}`}>
              {alert.kind === "pr_exceeds_category"
                ? t("events.budget.alertPrExceed", { amount: fmtQar(alert.amount) })
                : alert.kind === "contingency_usage"
                  ? t("events.budget.alertContingency", { pct: Math.round(alert.pct ?? 0) })
                  : alert.kind === "line_threshold"
                    ? t("events.budget.alertThreshold", { amount: fmtQar(alert.amount), pct: Math.round(alert.pct ?? 0) })
                    : t("events.budget.alertForecast", { amount: fmtQar(alert.amount), category: catLabel(alert.categoryId ?? "") })}
            </p>
          ))}
        </div>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div>
          <h2 className="text-sm font-semibold">{t("events.budget.spendChart")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.budget.costBreakdownHint")}</p>
        </div>
        <EventSpendChart rows={spendRows} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus} disabled={!editable}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["draft", "approved", "locked"].map((s) => (
              <SelectItem key={s} value={s}>{t(`events.budgetStatus.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("events.budget.lineThreshold")}
          <Input className="h-8 w-20" type="number" min={0} disabled={!editable} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("events.budget.contingencyThreshold")}
          <Input className="h-8 w-20" type="number" min={0} disabled={!editable} value={contingencyCap} onChange={(e) => setContingencyCap(Number(e.target.value) || 80)} />
        </label>
        <Input
          className="max-w-xs"
          placeholder={t("events.fields.description")}
          disabled={!editable}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {canFinance ? (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        ) : null}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("events.budget.costBreakdown")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.budget.costBreakdownHint")}</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card shadow-elevated-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("events.budget.line")}</TableHead>
                <TableHead>{t("events.budget.original")}</TableHead>
                <TableHead>{t("events.budget.approvedChanges")}</TableHead>
                <TableHead>{t("events.budget.revised")}</TableHead>
                <TableHead>{t("events.budget.committed")}</TableHead>
                <TableHead>{t("events.budget.actual")}</TableHead>
                <TableHead>{t("events.budget.forecast")}</TableHead>
                <TableHead>{t("events.budget.varianceForecast")}</TableHead>
                <TableHead>{t("events.budget.remaining")}</TableHead>
                {editable ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((group) => (
                <Fragment key={group.categoryId}>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>{catLabel(group.categoryId)}</TableCell>
                    <TableCell className="tabular-nums">{fmtQar(group.totals.original)}</TableCell>
                    <TableCell className="tabular-nums">{fmtQar(group.totals.approvedChanges)}</TableCell>
                    <TableCell className="tabular-nums">{fmtQar(group.totals.revised)}</TableCell>
                    <TableCell className="tabular-nums">{fmtQar(group.totals.committed)}</TableCell>
                    <TableCell className="tabular-nums">{fmtQar(group.totals.actual)}</TableCell>
                    <TableCell className="tabular-nums">{fmtQar(group.totals.forecast)}</TableCell>
                    <TableCell className={`tabular-nums ${group.totals.varianceForecast < 0 ? "text-rag-red" : ""}`}>{fmtQar(group.totals.varianceForecast)}</TableCell>
                    <TableCell className={`tabular-nums ${group.totals.remaining < 0 ? "text-rag-red" : ""}`}>{fmtQar(group.totals.remaining)}</TableCell>
                    {editable ? <TableCell /> : null}
                  </TableRow>
                  {group.subs.map((sub) => (
                    <Fragment key={`${group.categoryId}-${sub.subId}`}>
                      {sub.sub ? (
                        <TableRow className="bg-muted/20 text-sm">
                          <TableCell className="ps-6">{ar ? sub.sub.label_ar : sub.sub.label_en}</TableCell>
                          <TableCell className="tabular-nums">{fmtQar(sub.totals.original)}</TableCell>
                          <TableCell className="tabular-nums">{fmtQar(sub.totals.approvedChanges)}</TableCell>
                          <TableCell className="tabular-nums">{fmtQar(sub.totals.revised)}</TableCell>
                          <TableCell className="tabular-nums">{fmtQar(sub.totals.committed)}</TableCell>
                          <TableCell className="tabular-nums">{fmtQar(sub.totals.actual)}</TableCell>
                          <TableCell className="tabular-nums">{fmtQar(sub.totals.forecast)}</TableCell>
                          <TableCell className="tabular-nums">{fmtQar(sub.totals.varianceForecast)}</TableCell>
                          <TableCell className="tabular-nums">{fmtQar(sub.totals.remaining)}</TableCell>
                          {editable ? <TableCell /> : null}
                        </TableRow>
                      ) : null}
                      {sub.lines.map((line) => {
                        const over = line.forecast_amount > line.revised_amount + 0.005 || line.remaining < -0.005;
                        return (
                          <TableRow key={line.key} className={over ? "bg-rag-red/5" : undefined}>
                            <TableCell className="ps-10">
                              <div className="flex items-center gap-2">
                                <Input className="h-8" disabled={!editable} value={line.title} onChange={(e) => setLine(line.key, { title: e.target.value })} />
                                {over ? <Badge variant="destructive">{t("events.budget.healthOver")}</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input type="number" min={0} className="h-8 w-24" disabled={!editable} value={line.original_amount} onChange={(e) => setLine(line.key, { original_amount: Number(e.target.value) || 0 })} />
                            </TableCell>
                            <TableCell>
                              <Input type="number" className="h-8 w-24" disabled={!editable} value={line.approved_changes} onChange={(e) => setLine(line.key, { approved_changes: Number(e.target.value) || 0 })} />
                            </TableCell>
                            <TableCell className="tabular-nums">{fmtQar(line.revised_amount)}</TableCell>
                            <TableCell>
                              <Input type="number" min={0} className="h-8 w-24" disabled={!editable} value={line.committed_amount} onChange={(e) => setLine(line.key, { committed_amount: Number(e.target.value) || 0 })} />
                            </TableCell>
                            <TableCell>
                              <Input type="number" min={0} className="h-8 w-24" disabled={!editable} value={line.actual_amount} onChange={(e) => setLine(line.key, { actual_amount: Number(e.target.value) || 0 })} />
                            </TableCell>
                            <TableCell>
                              <Input type="number" min={0} className="h-8 w-24" disabled={!editable} value={line.forecast_amount} onChange={(e) => setLine(line.key, { forecast_amount: Number(e.target.value) || 0 })} />
                            </TableCell>
                            <TableCell className={`tabular-nums ${line.variance_forecast < 0 ? "text-rag-red" : ""}`}>{fmtQar(line.variance_forecast)}</TableCell>
                            <TableCell className={`tabular-nums ${line.remaining < 0 ? "text-rag-red" : ""}`}>{fmtQar(line.remaining)}</TableCell>
                            {editable ? (
                              <TableCell>
                                <Button size="sm" variant="ghost" onClick={() => setLines((rows) => rows.filter((r) => r.key !== line.key))}>
                                  {t("common.delete")}
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              <TableRow className="font-semibold">
                <TableCell>{t("events.budget.eventTotal")}</TableCell>
                <TableCell className="tabular-nums">{fmtQar(lineTotals.original)}</TableCell>
                <TableCell className="tabular-nums">{fmtQar(lineTotals.approvedChanges)}</TableCell>
                <TableCell className="tabular-nums">{fmtQar(lineTotals.revised)}</TableCell>
                <TableCell className="tabular-nums">{fmtQar(lineTotals.committed)}</TableCell>
                <TableCell className="tabular-nums">{fmtQar(lineTotals.actual)}</TableCell>
                <TableCell className="tabular-nums">{fmtQar(lineTotals.forecast)}</TableCell>
                <TableCell className="tabular-nums">{fmtQar(lineTotals.varianceForecast)}</TableCell>
                <TableCell className="tabular-nums">{fmtQar(lineTotals.remaining)}</TableCell>
                {editable ? <TableCell /> : null}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {editable ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select value={newLine.category_id} onValueChange={(v) => setNewLine({ category_id: v, subcategory_id: "", title: newLine.title })}>
            <SelectTrigger className="w-56"><SelectValue placeholder={t("events.budget.category")} /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{ar ? c.label_ar : c.label_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newLine.subcategory_id || undefined} onValueChange={(v) => setNewLine((s) => ({ ...s, subcategory_id: v }))} disabled={!filteredSubs.length}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t("events.budget.subcategory")} /></SelectTrigger>
            <SelectContent>
              {filteredSubs.map((s) => (
                <SelectItem key={s.id} value={s.id}>{ar ? s.label_ar : s.label_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="w-48" placeholder={t("events.budget.lineTitle")} value={newLine.title} onChange={(e) => setNewLine((s) => ({ ...s, title: e.target.value }))} />
          <Button size="sm" variant="outline" onClick={addLine} disabled={!newLine.category_id}>{t("events.budget.addLine")}</Button>
        </div>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("events.budget.linkedPrs")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.proc.clearHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/procurement/requisitions?eventId=${id}`}>{t("events.budget.openPrs")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/procurement/requisitions/new?eventId=${id}`}>{t("events.proc.newPr")}</Link>
            </Button>
          </div>
        </div>
        {linkedPrs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">{t("events.budget.noPrs")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("events.budget.prNumber")}</TableHead>
                <TableHead>{t("events.fields.status")}</TableHead>
                <TableHead>{t("events.budget.category")}</TableHead>
                <TableHead>{t("events.budget.amount")}</TableHead>
                <TableHead>{t("events.budget.prWarning")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedPrs.map((pr) => {
                const category = pr.cost_category_id
                  ? (ar ? pr.category_label_ar : pr.category_label_en) || catLabel(pr.cost_category_id)
                  : null;
                return (
                  <TableRow key={pr.id} className={pr.exceed_by || !pr.cost_category_id ? "bg-rag-red/5" : undefined}>
                    <TableCell>
                      <Link className="font-medium underline underline-offset-2" href={`/procurement/requisitions/${pr.id}`}>
                        {pr.pr_number ?? pr.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <PrStatusPill status={pr.status} />
                    </TableCell>
                    <TableCell>
                      {category ?? <Badge variant="warning">{t("events.budget.unlinkedSpend")}</Badge>}
                    </TableCell>
                    <TableCell className="tabular-nums">{fmtQar(pr.total_amount)}</TableCell>
                    <TableCell className="text-rag-red">
                      {pr.exceed_by ? t("events.budget.alertPrExceed", { amount: fmtQar(pr.exceed_by) }) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <CollapsibleSection title={t("events.budget.moreFigures")} defaultOpen={false}>
        <p className="mb-3 text-xs text-muted-foreground">{t("events.budget.moreFiguresHint")}</p>
        <EventFinanceMoreFigures finance={liveFinance} />

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-border/40 bg-card p-4">
            <h3 className="text-sm font-semibold">{t("events.budget.profitability")}</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">{t("events.budget.originalMargin")}</dt>
              <dd className="text-end tabular-nums">{liveFinance.originalMarginPct == null ? "—" : `${Math.round(liveFinance.originalMarginPct)}%`}</dd>
              <dt className="text-muted-foreground">{t("events.budget.revisedMargin")}</dt>
              <dd className="text-end tabular-nums">{liveFinance.revisedMarginPct == null ? "—" : `${Math.round(liveFinance.revisedMarginPct)}%`}</dd>
              <dt className="text-muted-foreground">{t("events.budget.forecastMargin")}</dt>
              <dd className="text-end tabular-nums">{liveFinance.forecastMarginPct == null ? "—" : `${Math.round(liveFinance.forecastMarginPct)}%`}</dd>
              <dt className="text-muted-foreground">{t("events.budget.actualMargin")}</dt>
              <dd className="text-end tabular-nums">{liveFinance.actualMarginPct == null ? "—" : `${Math.round(liveFinance.actualMarginPct)}%`}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">{t("events.budget.marginHelp")}</p>
            <EventMarginChart points={budgetQ.data?.marginTrend ?? []} />
          </div>
          <div className="space-y-3 rounded-2xl border border-border/40 bg-card p-4">
            <h3 className="text-sm font-semibold">{t("events.budget.baseline")}</h3>
            {budgetQ.data?.baselineCompare.baselineId ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">{t("events.budget.baselineOriginal")}</dt>
                <dd className="text-end tabular-nums">{fmtQar(budgetQ.data.baselineCompare.original ?? 0)}</dd>
                <dt className="text-muted-foreground">{t("events.budget.baselineCurrent")}</dt>
                <dd className="text-end tabular-nums">{fmtQar(budgetQ.data.baselineCompare.currentRevised ?? 0)}</dd>
                <dt className="text-muted-foreground">{t("events.budget.baselineVariance")}</dt>
                <dd className={`text-end tabular-nums ${(budgetQ.data.baselineCompare.variance ?? 0) > 0 ? "text-rag-red" : ""}`}>
                  {fmtQar(budgetQ.data.baselineCompare.variance ?? 0)}
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t("events.budget.noBaseline")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("events.budget.varianceHelp")}</p>
          </div>
        </div>

        <section className="mt-4 space-y-3 rounded-2xl border border-border/40 bg-card p-4">
          <h3 className="text-sm font-semibold">{t("events.budget.revenue")}</h3>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {(
              [
                ["contract_value", "contract"],
                ["additional_revenue", "additionalRevenue"],
                ["approved_change_orders", "changeOrders"],
                ["discounts", "discounts"],
                ["taxes", "taxes"],
              ] as const
            ).map(([field, key]) => (
              <label key={field} className="space-y-1 text-xs">
                <span className="text-muted-foreground">{t(`events.budget.${key}`)}</span>
                <Input
                  type="number"
                  min={0}
                  disabled={!editable}
                  value={revenue[field]}
                  onChange={(e) => setRevenue((r) => ({ ...r, [field]: Number(e.target.value) || 0 }))}
                />
              </label>
            ))}
            <div className="space-y-1 text-xs">
              <p className="text-muted-foreground">{t("events.budget.finalRevenue")}</p>
              <p className="pt-2 text-lg font-semibold tabular-nums">{fmtQar(liveFinal)}</p>
            </div>
          </div>
        </section>

        <section className="mt-4 space-y-3 rounded-2xl border border-border/40 bg-card p-4">
          <h3 className="text-sm font-semibold">{t("events.budget.invoices")}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("events.budget.invoiceNumber")}</TableHead>
                <TableHead>{t("events.budget.invoiceTitle")}</TableHead>
                <TableHead>{t("events.fields.status")}</TableHead>
                <TableHead>{t("events.budget.amount")}</TableHead>
                <TableHead>{t("events.budget.paid")}</TableHead>
                <TableHead>{t("events.budget.outstanding")}</TableHead>
                {canFinance ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(budgetQ.data?.invoices ?? []).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.title ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`events.invoiceStatus.${inv.status}`)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{fmtQar(inv.base_amount)}</TableCell>
                  <TableCell className="tabular-nums">{fmtQar(inv.paid_amount)}</TableCell>
                  <TableCell className="tabular-nums">{fmtQar(inv.outstanding)}</TableCell>
                  {canFinance ? (
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => removeInvoice.mutate(inv.id)}>
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {canFinance ? (
            <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-8">
              <Input placeholder={t("events.budget.invoiceNumber")} value={invoiceForm.invoice_number} onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_number: e.target.value }))} />
              <Input placeholder={t("events.budget.invoiceTitle")} value={invoiceForm.title} onChange={(e) => setInvoiceForm((f) => ({ ...f, title: e.target.value }))} />
              <Select value={invoiceForm.status} onValueChange={(v) => setInvoiceForm((f) => ({ ...f, status: v as InvoiceDraft["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`events.invoiceStatus.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" min={0} placeholder={t("events.budget.amount")} value={invoiceForm.amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))} />
              <Input type="number" min={0} placeholder={t("events.budget.paid")} value={invoiceForm.paid_amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, paid_amount: Number(e.target.value) || 0 }))} />
              <Input type="date" value={invoiceForm.issue_date} onChange={(e) => setInvoiceForm((f) => ({ ...f, issue_date: e.target.value }))} />
              <Input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm((f) => ({ ...f, due_date: e.target.value }))} />
              <Button size="sm" onClick={() => saveInvoice.mutate()} disabled={!invoiceForm.invoice_number || saveInvoice.isPending}>
                {t("events.budget.addInvoice")}
              </Button>
            </div>
          ) : null}
        </section>
      </CollapsibleSection>
    </div>
  );
}
