"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { listPayrollPeriods } from "@/lib/hr-payroll.functions";
import { createExpenseAdjustment, listExpenseAdjustments } from "@/lib/hr-workspace.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const qar = new Intl.NumberFormat("en-QA", {
  style: "currency",
  currency: "QAR",
  maximumFractionDigits: 2,
});

type AdjTypeFilter = "all" | "extra" | "other_add";
type StatusFilter = "all" | "pending" | "approved" | "rejected" | "posted";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export default function HrExpensesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canGenerate = usePermission("payroll.generate");
  const canFinance = usePermission("payroll.finance");
  const canFile = canGenerate || canFinance;
  const canDocsManage = usePermission("hr.docs.manage");
  const canHrManage = usePermission("hr.manage");
  const canUploadDocs = canDocsManage || canHrManage;

  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [adjType, setAdjType] = useState<AdjTypeFilter>("all");
  const [filterStaffId, setFilterStaffId] = useState("");
  const [filterPeriodId, setFilterPeriodId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const [periodId, setPeriodId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [formType, setFormType] = useState<"extra" | "other_add">("extra");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const listFilters = useMemo(
    () => ({
      status,
      adjType,
      staffId: filterStaffId || null,
      periodId: filterPeriodId || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      q: search.trim().slice(0, 120) || null,
    }),
    [status, adjType, filterStaffId, filterPeriodId, dateFrom, dateTo, search],
  );

  const rows = useQuery({
    queryKey: queryKeys.people.hrExpenses(listFilters),
    queryFn: () => listExpenseAdjustments(listFilters),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff-picker" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
  });

  const periods = useQuery({
    queryKey: queryKeys.people.hrPayrollPeriods({ status: "all" }),
    queryFn: () => listPayrollPeriods({ status: "all" }),
    staleTime: STALE.people,
  });

  const editablePeriods = useMemo(
    () => (periods.data ?? []).filter((p) => p.status !== "locked"),
    [periods.data],
  );

  const defaultPeriodId = editablePeriods[0]?.id ?? "";
  const effectivePeriodId = periodId || defaultPeriodId;

  const staffSelectOptions = useMemo(
    () =>
      (staffOptions.data ?? []).map((s) => ({
        value: s.id,
        label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
        keywords: `${s.name} ${s.employeeCode ?? ""}`,
      })),
    [staffOptions.data],
  );

  const periodSelectOptions = useMemo(
    () =>
      (periods.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.displayName || p.month} · ${p.status}`,
        keywords: `${p.month} ${p.displayName ?? ""} ${p.status}`,
      })),
    [periods.data],
  );

  const editablePeriodOptions = useMemo(
    () =>
      editablePeriods.map((p) => ({
        value: p.id,
        label: `${p.displayName || p.month} · ${p.status}`,
        keywords: `${p.month} ${p.displayName ?? ""} ${p.status}`,
      })),
    [editablePeriods],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-expenses"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const resolvedPeriodId = periodId || defaultPeriodId;
      if (!resolvedPeriodId || !staffId || reason.trim().length < 2) {
        throw new Error(t("hrWorkspace.expenses.formRequired"));
      }
      const amountQar = Number(amount);
      if (!Number.isFinite(amountQar) || amountQar <= 0) {
        throw new Error(t("hrWorkspace.expenses.amountRequired"));
      }

      let documentRef = receiptRef.trim() || null;
      if (receiptFile && canUploadDocs) {
        const contentBase64 = await fileToBase64(receiptFile);
        const uploaded = await uploadEmployeeDocument({
          staffId,
          docType: "other",
          filename: receiptFile.name,
          data_base64: contentBase64,
          content_type: receiptFile.type || "application/pdf",
          title: `Expense receipt · ${formType} · ${amountQar} QAR`,
        });
        const docToken = `doc:${uploaded.id}`;
        documentRef = documentRef ? `${documentRef} · ${docToken}` : docToken;
        if (documentRef.length > 260) {
          documentRef = documentRef.slice(documentRef.length - 260);
        }
      }

      return createExpenseAdjustment({
        periodId: resolvedPeriodId,
        staffId,
        adjType: formType,
        amountQar,
        reason: reason.trim(),
        documentRef,
      });
    },
    onSuccess: () => {
      toast.success(t("hrWorkspace.expenses.created"));
      setAmount("");
      setReason("");
      setReceiptRef("");
      setReceiptFile(null);
      setShowForm(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusFilters = useMemo(
    () =>
      [
        { value: "all" as const, label: t("hrWorkspace.expenses.filters.all") },
        { value: "pending" as const, label: t("hrWorkspace.expenses.statuses.pending") },
        { value: "approved" as const, label: t("hrWorkspace.expenses.statuses.approved") },
        { value: "rejected" as const, label: t("hrWorkspace.expenses.statuses.rejected") },
        { value: "posted" as const, label: t("hrWorkspace.expenses.statuses.posted") },
      ] as const,
    [t],
  );

  const typeFilters = useMemo(
    () =>
      [
        { value: "all" as const, label: t("hrWorkspace.expenses.filters.allTypes") },
        { value: "extra" as const, label: t("hrWorkspace.expenses.types.extra") },
        { value: "other_add" as const, label: t("hrWorkspace.expenses.types.other_add") },
      ] as const,
    [t],
  );

  return (
    <CapabilityGate capability="payroll.view" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={Receipt}
          kicker={t("hrWorkspace.expenses.kicker")}
          title={t("hrWorkspace.expenses.title")}
          subtitle={t("hrWorkspace.expenses.subtitle")}
          actions={
            canFile ? (
              <Button
                size="sm"
                variant={showForm ? "secondary" : "default"}
                onClick={() => setShowForm((v) => !v)}
              >
                <Plus className="size-4" />
                {showForm ? t("common.cancel") : t("hrWorkspace.expenses.add")}
              </Button>
            ) : null
          }
        >
          {canFile && showForm ? (
            <HrPanel className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("hrWorkspace.expenses.createTitle")}
              </p>
              <p className="text-xs text-muted-foreground">{t("hrWorkspace.expenses.createHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label>{t("hrWorkspace.expenses.staff")}</Label>
                  <SearchableSelect
                    value={staffId}
                    onValueChange={setStaffId}
                    placeholder={t("hrWorkspace.expenses.pickStaff")}
                    emptyOption={{ value: "", label: t("hrWorkspace.expenses.pickStaff") }}
                    options={staffSelectOptions}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("hrWorkspace.expenses.period")}</Label>
                  <SearchableSelect
                    value={effectivePeriodId}
                    onValueChange={setPeriodId}
                    placeholder={t("hrWorkspace.expenses.pickPeriod")}
                    emptyOption={{ value: "", label: t("hrWorkspace.expenses.pickPeriod") }}
                    options={editablePeriodOptions}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("hrWorkspace.expenses.type")}</Label>
                  <SearchableSelect
                    value={formType}
                    onValueChange={(v) => setFormType(v as "extra" | "other_add")}
                    options={[
                      { value: "extra", label: t("hrWorkspace.expenses.types.extra") },
                      { value: "other_add", label: t("hrWorkspace.expenses.types.other_add") },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("hrWorkspace.expenses.amount")}</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("hrWorkspace.expenses.receiptRef")}</Label>
                  <Input
                    value={receiptRef}
                    onChange={(e) => setReceiptRef(e.target.value)}
                    placeholder={t("hrWorkspace.expenses.receiptRefPh")}
                    maxLength={200}
                  />
                </div>
                {canUploadDocs ? (
                  <div className="space-y-1">
                    <Label>{t("hrWorkspace.expenses.receiptFile")}</Label>
                    <Input
                      type="file"
                      accept="image/*,.pdf,application/pdf"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>{t("hrWorkspace.expenses.notes")}</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("hrWorkspace.expenses.notesPh")}
                  rows={2}
                />
              </div>
              <Button
                disabled={
                  create.isPending ||
                  !staffId ||
                  !effectivePeriodId ||
                  reason.trim().length < 2 ||
                  !amount
                }
                onClick={() => create.mutate()}
              >
                <Upload className="size-4" />
                {create.isPending
                  ? t("common.saving", { defaultValue: "Saving…" })
                  : t("hrWorkspace.expenses.submit")}
              </Button>
            </HrPanel>
          ) : null}

          <HrPanel className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={status === f.value ? "default" : "secondary"}
                  onClick={() => setStatus(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {typeFilters.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={adjType === f.value ? "default" : "secondary"}
                  onClick={() => setAdjType(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>{t("hrWorkspace.expenses.filterStaff")}</Label>
                <SearchableSelect
                  value={filterStaffId}
                  onValueChange={setFilterStaffId}
                  placeholder={t("hrWorkspace.expenses.allStaff")}
                  emptyOption={{ value: "", label: t("hrWorkspace.expenses.allStaff") }}
                  options={staffSelectOptions}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("hrWorkspace.expenses.filterPeriod")}</Label>
                <SearchableSelect
                  value={filterPeriodId}
                  onValueChange={setFilterPeriodId}
                  placeholder={t("hrWorkspace.expenses.allPeriods")}
                  emptyOption={{ value: "", label: t("hrWorkspace.expenses.allPeriods") }}
                  options={periodSelectOptions}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("hrWorkspace.expenses.dateFrom")}</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("hrWorkspace.expenses.dateTo")}</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("hrWorkspace.expenses.search")}</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("hrWorkspace.expenses.searchPh")}
                maxLength={120}
              />
            </div>
          </HrPanel>

          {rows.isLoading ? (
            <FecLoader density="page" label={t("common.loading")} />
          ) : rows.isError ? (
            <HrEmptyState message={t("hrWorkspace.loadFailed")} />
          ) : (rows.data ?? []).length === 0 ? (
            <HrEmptyState message={t("hrWorkspace.expenses.empty")} icon={Receipt} />
          ) : (
            <ul className="space-y-2">
              {(rows.data ?? []).map((row) => (
                <li key={row.id} className={cn("hr-list-row")}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {row.reason || t(`hrWorkspace.expenses.types.${row.adjType}`)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        row.staffName,
                        row.employeeCode,
                        row.periodMonth,
                        row.documentRef,
                        row.createdAt.slice(0, 10),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-end">
                    <p className="font-medium tabular-nums">{qar.format(row.amountQar)}</p>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Badge variant="outline">
                        {t(`hrWorkspace.expenses.types.${row.adjType}`, {
                          defaultValue: row.adjType,
                        })}
                      </Badge>
                      <Badge variant={row.status === "pending" ? "secondary" : "outline"}>
                        {t(`hrWorkspace.expenses.statuses.${row.status}`, {
                          defaultValue: row.status,
                        })}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

function Denied() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <HrEmptyState message={t("hr.dashboard.noAccess")} />
    </HrShell>
  );
}
