"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, FileText, Upload } from "lucide-react";
import { useState } from "react";

import { useTranslation } from "react-i18next";

import { ragForContract, ragForService, translateAmcCategory, translateAmcStatus } from "@/lib/amc/constants";
import { lineStatus } from "@/lib/compliance/compliance-derive";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtQar } from "@/lib/currency";
import { cn } from "@/lib/utils";

export interface AmcContractCardData {
  id: string;
  category: string;
  vendor_name: string;
  vendor_contact_person: string | null;
  vendor_phone: string | null;
  location_code: string;
  location_name: string;
  contract_start_date: string;
  contract_end_date: string;
  days_left: number;
  status: string;
  payment_status: string;
  contract_value: number;
  paid_amount: number;
  outstanding_amount: number;
  service_frequency: string;
  last_service_date: string | null;
  next_service_date: string | null;
  remarks: string | null;
  schedules?: Array<{
    id: string;
    service_number: number;
    visit_label?: string | null;
    planned_date: string;
    actual_service_date: string | null;
    status: string;
    verification_status: string;
  }>;
  payment_lines?: Array<{
    id: string;
    label: string;
    percent: number | null;
    amount: number;
    due_date: string;
    paid: boolean;
    paid_date: string | null;
  }>;
  visits_total?: number;
  visits_done?: number;
  visits_pct?: number;
  paid_pct?: number;
  contract_overdue?: boolean;
  next_unpaid_line?: { label: string; amount: number; due_date: string } | null;
  scope_of_work?: string | null;
  internal_notes?: string | null;
  contract_ref?: string | null;
}

function statusBadgeClass(status: string) {
  if (status === "active" || status === "done" || status === "paid") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (status === "overdue" || status === "expired" || status === "unpaid") return "rag-red";
  if (status === "partially_paid" || status === "pending" || status === "rescheduled") return "rag-amber";
  return "bg-muted text-muted-foreground";
}

export function AmcContractCard({
  contract,
  showSite = true,
}: {
  contract: AmcContractCardData;
  showSite?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const rag = ragForContract(contract.contract_end_date, contract.status);
  const categoryLabel = translateAmcCategory(t, contract.category);

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            {showSite && (
              <div className="mb-1 text-xs font-semibold tracking-wide">
                <span className="font-mono text-primary">{contract.location_code}</span>
                <span className="mx-1 text-muted-foreground">·</span>
                <span>{contract.location_name}</span>
              </div>
            )}
            <div className="text-sm font-semibold">{categoryLabel}</div>
            <div className="text-xs text-muted-foreground">{contract.vendor_name}</div>
            {contract.contract_ref && (
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{contract.contract_ref}</div>
            )}
          </div>
          <Badge variant="outline" className={statusBadgeClass(contract.status)}>
            {translateAmcStatus(t, contract.status)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border text-center text-xs">
        <div className="bg-card p-2">
          <div className="text-muted-foreground">{t("amc.card.start")}</div>
          <div className="font-medium">{contract.contract_start_date}</div>
        </div>
        <div className="bg-card p-2">
          <div className="text-muted-foreground">{t("amc.card.end")}</div>
          <div className="font-medium">{contract.contract_end_date}</div>
        </div>
        <div className={cn("bg-card p-2", rag === "red" && "text-rose-400", rag === "orange" && "text-amber-400")}>
          <div className="text-muted-foreground">{t("amc.card.daysLeft")}</div>
          <div className="font-semibold">{contract.days_left}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border border-t border-border text-center text-xs">
        <div className="bg-card p-2">
          <div className="text-muted-foreground">{t("amc.card.value")}</div>
          <div className="font-medium">{fmtQar(contract.contract_value)}</div>
        </div>
        <div className="bg-card p-2">
          <div className="text-muted-foreground">{t("amc.card.paid")}</div>
          <div className="font-medium text-emerald-600">{fmtQar(contract.paid_amount)}</div>
        </div>
        <div className="bg-card p-2">
          <div className="text-muted-foreground">{t("amc.card.outstanding")}</div>
          <div className={cn("font-medium", contract.outstanding_amount > 0 && "text-amber-400")}>
            {fmtQar(contract.outstanding_amount)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-xs">
        <Badge variant="outline" className={statusBadgeClass(contract.payment_status)}>
          {translateAmcStatus(t, contract.payment_status)}
        </Badge>
        {contract.paid_pct != null && (
          <span className="text-muted-foreground">{t("amc.card.paidPct", { pct: contract.paid_pct })}</span>
        )}
        {contract.visits_total != null && (
          <span className="text-muted-foreground">{t("amc.card.visits", { done: contract.visits_done, total: contract.visits_total })}</span>
        )}
        <span className="text-muted-foreground">{t(`amc.freq.${contract.service_frequency}`, { defaultValue: contract.service_frequency.replace(/_/g, " ") })}</span>
        {contract.next_service_date && (
          <span className="text-muted-foreground">{t("amc.card.next", { date: contract.next_service_date })}</span>
        )}
      </div>

      {contract.next_unpaid_line && (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800">
          {t("amc.card.paymentDue", {
            label: contract.next_unpaid_line.label,
            amount: fmtQar(contract.next_unpaid_line.amount),
            date: contract.next_unpaid_line.due_date,
          })}
        </div>
      )}

      {contract.status === "tbc" && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          {t("amc.card.docsPending")}
        </div>
      )}

      {(contract.payment_lines?.length ?? 0) > 0 && (
        <div className="border-t border-border px-4 py-2 text-xs">
          <div className="mb-1 font-medium text-muted-foreground">{t("amc.card.paymentLines")}</div>
          <ul className="space-y-1">
            {contract.payment_lines!.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{p.label}</span>
                <span className={lineStatus(p.paid, p.due_date) === "Paid" ? "text-emerald-600" : lineStatus(p.paid, p.due_date) === "Overdue" ? "rag-red" : ""}>
                  {fmtQar(p.amount)} · {t(`amc.line.${lineStatus(p.paid, p.due_date)}`, { defaultValue: lineStatus(p.paid, p.due_date) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(contract.schedules?.length ?? 0) > 0 && (
        <div className="border-t border-border">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium hover:bg-muted/40"
            onClick={() => setExpanded((v) => !v)}
          >
            {t("amc.card.serviceSchedule", { count: contract.schedules!.length })}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {expanded && (
            <div className="divide-y divide-border border-t border-border">
              {contract.schedules!.map((s) => {
                const sRag = ragForService(s.planned_date, s.status);
                return (
                  <div key={s.id} className="grid grid-cols-4 gap-2 px-4 py-2 text-xs">
                    <span className="font-mono">#{s.service_number}</span>
                    <span>{s.planned_date}</span>
                    <span>{s.actual_service_date ?? "—"}</span>
                    <Badge variant="outline" className={cn(
                      sRag === "green" && "bg-emerald-500/15 text-emerald-700",
                      sRag === "red" && "rag-red",
                      sRag === "orange" && "rag-amber",
                      sRag === "yellow" && "text-amber-200",
                    )}>
                      {translateAmcStatus(t, s.status)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-border bg-muted/20 px-4 py-3">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/compliance/amc-contracts/${contract.id}`}>
            <FileText className="h-4 w-4" />{t("amc.card.details")}
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/compliance/amc-contracts/${contract.id}?upload=1`}>
            <Upload className="h-4 w-4" />{t("amc.card.attach")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
