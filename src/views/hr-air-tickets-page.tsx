"use client";

import { FecLoader } from "@/components/fec";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Plane,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrKpiTile } from "@/components/hr/hr-kpi-tile";
import { HrModuleFrame } from "@/components/hr/hr-module-frame";
import { HrPanel } from "@/components/hr/hr-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createAirTicketEntitlement,
  issueAirTicket,
  listAirTicketEntitlements,
  listStaffForAirTickets,
  markAirTicketPaid,
  previewAirTicketEligibility,
  suggestAirTicketApplications,
} from "@/lib/hr-air-ticket.functions";
import { uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

type Filter = "upcoming" | "overdue" | "all" | "eligible" | "issued";

export default function HrAirTicketsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [staffId, setStaffId] = useState("");
  const [destination, setDestination] = useState("");
  const [familyEligible, setFamilyEligible] = useState(false);
  const [notes, setNotes] = useState("");
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [priceQar, setPriceQar] = useState("");
  const [cashQar, setCashQar] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [travelFrom, setTravelFrom] = useState("");
  const [travelTo, setTravelTo] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [creatingSuggestionId, setCreatingSuggestionId] = useState<string | null>(null);

  const listStatus =
    filter === "upcoming" || filter === "overdue" || filter === "all" ? filter : filter;

  const list = useQuery({
    queryKey: queryKeys.people.hrAirTickets({ status: listStatus }),
    queryFn: () => listAirTicketEntitlements({ status: listStatus }),
    staleTime: STALE.people,
  });

  const allForKpis = useQuery({
    queryKey: queryKeys.people.hrAirTickets({ status: "all", view: "kpi" }),
    queryFn: () => listAirTicketEntitlements({ status: "all" }),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrAirTickets({ view: "staff-picker" }),
    queryFn: () => listStaffForAirTickets(),
    staleTime: STALE.people,
  });

  const suggestions = useQuery({
    queryKey: queryKeys.people.hrAirTickets({
      view: "suggestions",
      locale: i18n.language?.startsWith("ar") ? "ar" : "en",
    }),
    queryFn: () =>
      suggestAirTicketApplications({
        locale: i18n.language?.startsWith("ar") ? "ar" : "en",
        withAiSummary: true,
      }),
    staleTime: STALE.people,
  });

  const preview = useQuery({
    queryKey: queryKeys.people.hrAirTickets({ preview: staffId }),
    queryFn: () => previewAirTicketEligibility({ staffId }),
    enabled: Boolean(staffId),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrAirTickets() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const create = useMutation({
    mutationFn: (input?: {
      staffId: string;
      cycleIndex?: number;
      familyEligible?: boolean;
      notes?: string | null;
    }) => {
      const id = input?.staffId || staffId;
      if (!id) throw new Error(t("hr.airTickets.formRequired"));
      return createAirTicketEntitlement({
        staffId: id,
        destination: input ? null : destination || null,
        familyEligible: input?.familyEligible ?? familyEligible,
        cycleIndex: input?.cycleIndex ?? null,
        notes: input?.notes ?? (notes || null),
      });
    },
    onSuccess: () => {
      toast.success(t("hr.airTickets.created"));
      setDestination("");
      setNotes("");
      setCreatingSuggestionId(null);
      invalidate();
    },
    onError: (e: Error) => {
      setCreatingSuggestionId(null);
      toast.error(e.message);
    },
  });

  const issue = useMutation({
    mutationFn: async () => {
      if (!issueFor) throw new Error(t("hr.airTickets.formRequired"));
      const entitlement = (list.data ?? []).find((r) => r.id === issueFor);
      if (!entitlement) throw new Error(t("hr.airTickets.formRequired"));
      let invoiceDocId: string | null = null;
      if (invoiceFile) {
        const contentBase64 = await fileToBase64(invoiceFile);
        const uploaded = await uploadEmployeeDocument({
          staffId: entitlement.staffId,
          docType: "air_ticket_receipt",
          filename: invoiceFile.name,
          data_base64: contentBase64,
          content_type: invoiceFile.type || "application/pdf",
          title: `Air ticket ${bookingRef || entitlement.eligibilityOn}`,
        });
        invoiceDocId = uploaded.id;
      }
      return issueAirTicket({
        entitlementId: issueFor,
        priceQar: priceQar ? Number(priceQar) : 0,
        cashAllowanceQar: cashQar ? Number(cashQar) : 0,
        bookingRef: bookingRef || null,
        travelDateFrom: travelFrom || null,
        travelDateTo: travelTo || null,
        invoiceDocId,
      });
    },
    onSuccess: () => {
      toast.success(t("hr.airTickets.issued"));
      setIssueFor(null);
      setPriceQar("");
      setCashQar("");
      setBookingRef("");
      setTravelFrom("");
      setTravelTo("");
      setInvoiceFile(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: (issueId: string) => markAirTicketPaid({ issueId }),
    onSuccess: () => {
      toast.success(t("hr.airTickets.paid"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filters = useMemo(
    () =>
      [
        { value: "upcoming" as const, label: t("hr.airTickets.filters.upcoming") },
        { value: "overdue" as const, label: t("hr.airTickets.filters.overdue") },
        { value: "eligible" as const, label: t("hr.airTickets.status.eligible") },
        { value: "issued" as const, label: t("hr.airTickets.status.issued") },
        { value: "all" as const, label: t("hr.airTickets.filters.all") },
      ] as const,
    [t],
  );

  const kpiRows = allForKpis.data ?? [];
  const kpiDue = suggestions.data?.counts.due ?? 0;
  const kpiApproaching = suggestions.data?.counts.approaching ?? 0;
  const kpiOverdue = kpiRows.filter((r) => r.overdue).length;
  const kpiIssued = kpiRows.filter((r) => r.status === "issued").length;

  useEffect(() => {
    if (!suggestions.isSuccess) return;
    if ((suggestions.data?.counts.total ?? 0) === 0) {
      setShowManualCreate(true);
    }
  }, [suggestions.isSuccess, suggestions.data?.counts.total]);

  const applySuggestion = (row: {
    staffId: string;
    cycleIndex: number;
    staffName: string;
  }) => {
    setCreatingSuggestionId(row.staffId);
    setStaffId(row.staffId);
    setShowManualCreate(true);
    create.mutate({
      staffId: row.staffId,
      cycleIndex: row.cycleIndex,
      notes: t("hr.airTickets.suggestionNote", { name: row.staffName }),
    });
  };

  const fillFromSuggestion = (row: {
    staffId: string;
    staffName: string;
  }) => {
    setStaffId(row.staffId);
    setShowManualCreate(true);
    toast.message(t("hr.airTickets.suggestionFilled", { name: row.staffName }));
  };

  const staffSelectOptions = useMemo(
    () =>
      (staffOptions.data ?? []).map((s) => ({
        value: s.id,
        label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
        keywords: `${s.name} ${s.employeeCode ?? ""} ${s.employmentType ?? ""} ${s.hireDate ?? ""}`,
      })),
    [staffOptions.data],
  );

  return (
    <CapabilityGate
      capability="hr.air_ticket.manage"
      fallback={
        <HrModuleFrame
          icon={Plane}
          kicker={t("hr.airTickets.kicker")}
          title={t("hr.airTickets.title")}
          subtitle={t("hr.airTickets.subtitle")}
        >
          <HrPanel>
            <HrEmptyState message={t("hr.airTickets.noAccess")} />
          </HrPanel>
        </HrModuleFrame>
      }
    >
      <HrModuleFrame
        icon={Plane}
        kicker={t("hr.airTickets.kicker")}
        title={t("hr.airTickets.title")}
        subtitle={t("hr.airTickets.subtitle")}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HrKpiTile
            label={t("hr.airTickets.kpi.due")}
            value={suggestions.isLoading ? "…" : kpiDue}
            icon={AlertCircle}
            tone="alert"
            delay={0}
          />
          <HrKpiTile
            label={t("hr.airTickets.kpi.approaching")}
            value={suggestions.isLoading ? "…" : kpiApproaching}
            icon={CalendarClock}
            tone="mustard"
            delay={1}
          />
          <HrKpiTile
            label={t("hr.airTickets.kpi.overdue")}
            value={allForKpis.isLoading ? "…" : kpiOverdue}
            icon={AlertCircle}
            tone="info"
            delay={2}
          />
          <HrKpiTile
            label={t("hr.airTickets.kpi.issued")}
            value={allForKpis.isLoading ? "…" : kpiIssued}
            icon={CheckCircle2}
            tone="ok"
            delay={3}
          />
        </div>

        <HrPanel className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--hr-border)] bg-[var(--hr-surface-muted,hsl(var(--muted)))] text-foreground">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">{t("hr.airTickets.suggestionsTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("hr.airTickets.suggestionsHint", {
                    days: suggestions.data?.policy.upcomingHorizonDays ?? 60,
                  })}
                </p>
              </div>
            </div>
            {suggestions.data?.aiGenerated ? (
              <Badge variant="outline">{t("hr.airTickets.aiBrief")}</Badge>
            ) : null}
          </div>

          {suggestions.isLoading ? (
            <FecLoader density="chip" label={t("common.loading")} />
          ) : suggestions.isError ? (
            <p className="text-sm text-destructive">{t("hr.airTickets.suggestionsError")}</p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-foreground/90">
                {suggestions.data?.summary}
              </p>
              {(suggestions.data?.suggestions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("hr.airTickets.suggestionsEmpty")}</p>
              ) : (
                <ul className="space-y-2">
                  {(suggestions.data?.suggestions ?? []).map((row) => (
                    <li
                      key={`${row.staffId}-${row.eligibilityOn}`}
                      className="flex flex-col gap-3 rounded-xl border border-[var(--hr-border)] bg-[var(--hr-surface,hsl(var(--background)))] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {row.staffName}
                            {row.employeeCode ? (
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                · {row.employeeCode}
                              </span>
                            ) : null}
                          </p>
                          <Badge variant={row.kind === "due" ? "destructive" : "secondary"}>
                            {t(`hr.airTickets.suggestionKind.${row.kind}`)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{row.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("hr.airTickets.eligibility")}: {row.eligibilityOn}
                          {" · "}
                          {t("hr.airTickets.hire")}: {row.hireDate}
                          {" · "}
                          {t("hr.airTickets.cycleLabel", { n: row.cycleIndex })}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={create.isPending}
                          onClick={() => applySuggestion(row)}
                        >
                          {creatingSuggestionId === row.staffId && create.isPending ? (
                            <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          {t("hr.airTickets.createFromSuggestion")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fillFromSuggestion(row)}
                        >
                          {t("hr.airTickets.reviewFirst")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </HrPanel>

        <HrPanel className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t("hr.airTickets.createTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("hr.airTickets.createHint")}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowManualCreate((v) => !v)}
            >
              {showManualCreate ? t("hr.airTickets.hideForm") : t("hr.airTickets.showForm")}
            </Button>
          </div>

          {showManualCreate ? (
            <div className="space-y-4 border-t border-[var(--hr-border)] pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label>{t("hr.airTickets.staff")}</Label>
                  <SearchableSelect
                    value={staffId}
                    onValueChange={setStaffId}
                    placeholder={
                      staffOptions.isLoading
                        ? t("common.loading")
                        : t("hr.airTickets.pickStaff")
                    }
                    emptyOption={{ value: "", label: t("hr.airTickets.pickStaff") }}
                    options={staffSelectOptions}
                  />
                  {staffOptions.isError ? (
                    <p className="text-xs text-destructive">{t("hr.airTickets.staffLoadError")}</p>
                  ) : null}
                  {!staffOptions.isLoading && staffSelectOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("hr.airTickets.staffEmpty")}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label>{t("hr.airTickets.destination")}</Label>
                  <Input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder={t("hr.airTickets.destinationPlaceholder")}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={familyEligible}
                      onCheckedChange={(v) => setFamilyEligible(Boolean(v))}
                    />
                    {t("hr.airTickets.familyEligible")}
                  </label>
                </div>
              </div>

              {preview.data ? (
                <div className="rounded-xl border border-dashed border-[var(--hr-border)] bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {t("hr.airTickets.preview", {
                    eligibility: preview.data.eligibilityOn,
                    cycle: `${preview.data.cycleStart} → ${preview.data.cycleEnd}`,
                    status: preview.data.status,
                  })}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>{t("hr.airTickets.notes")}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("hr.airTickets.notesPlaceholder")}
                  rows={2}
                />
              </div>

              <Button
                disabled={!staffId || create.isPending}
                onClick={() => create.mutate(undefined)}
              >
                {create.isPending && !creatingSuggestionId ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : null}
                {t("hr.airTickets.create")}
              </Button>
            </div>
          ) : null}
        </HrPanel>

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {list.isLoading ? (
          <HrPanel className="p-4">
            <FecLoader density="chip" label={t("common.loading")} />
          </HrPanel>
        ) : (list.data ?? []).length === 0 ? (
          <HrPanel className="p-6">
            <HrEmptyState
              message={t("hr.airTickets.empty")}
              icon={Plane}
              hint={
                (suggestions.data?.counts.total ?? 0) > 0
                  ? t("hr.airTickets.emptyHint", { count: suggestions.data?.counts.total ?? 0 })
                  : undefined
              }
            />
          </HrPanel>
        ) : (
          <ul className="space-y-3">
            {(list.data ?? []).map((row) => (
              <li key={row.id}>
                <HrPanel className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        {row.staffName}
                        {row.employeeCode ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {row.employeeCode}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("hr.airTickets.eligibility")}: {row.eligibilityOn}
                        {row.destination ? ` · ${row.destination}` : ""}
                        {row.hireDate ? ` · ${t("hr.airTickets.hire")} ${row.hireDate}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{t(`hr.airTickets.status.${row.status}`)}</Badge>
                      {row.overdue ? (
                        <Badge variant="destructive">{t("hr.airTickets.filters.overdue")}</Badge>
                      ) : null}
                      {row.upcoming ? (
                        <Badge variant="outline">{t("hr.airTickets.filters.upcoming")}</Badge>
                      ) : null}
                      {row.familyEligible ? (
                        <Badge variant="outline">{t("hr.airTickets.family")}</Badge>
                      ) : null}
                    </div>
                  </div>

                  {(row.issues ?? []).map((iss) => (
                    <div
                      key={iss.id}
                      className={cn(
                        "rounded-xl border border-[var(--hr-border)] bg-muted/15 px-3 py-2.5 text-sm",
                      )}
                    >
                      <p>
                        {t("hr.airTickets.booking")}: {iss.bookingRef || "—"}
                        {iss.priceQar != null ? ` · ${iss.priceQar.toFixed(2)} QAR` : ""}
                        {iss.cashAllowanceQar != null && iss.cashAllowanceQar > 0
                          ? ` · cash ${iss.cashAllowanceQar.toFixed(2)} QAR`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(`hr.airTickets.issueStatus.${iss.status}`)} ·{" "}
                        {t(`hr.airTickets.payroll.${iss.payrollPaymentStatus}`)}
                        {iss.travelDateFrom
                          ? ` · ${iss.travelDateFrom}${iss.travelDateTo ? ` → ${iss.travelDateTo}` : ""}`
                          : ""}
                      </p>
                      {iss.status !== "paid" && iss.payrollPaymentStatus !== "paid" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2"
                          disabled={markPaid.isPending}
                          onClick={() => markPaid.mutate(iss.id)}
                        >
                          {t("hr.airTickets.markPaid")}
                        </Button>
                      ) : null}
                    </div>
                  ))}

                  {row.status !== "issued" &&
                  row.status !== "cancelled" &&
                  row.status !== "expired" ? (
                    issueFor === row.id ? (
                      <div className="grid gap-3 rounded-xl border border-dashed border-[var(--hr-border)] p-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>{t("hr.airTickets.priceQar")}</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={priceQar}
                            onChange={(e) => setPriceQar(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("hr.airTickets.cashQar")}</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={cashQar}
                            onChange={(e) => setCashQar(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("hr.airTickets.booking")}</Label>
                          <Input
                            value={bookingRef}
                            onChange={(e) => setBookingRef(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("hr.airTickets.invoice")}</Label>
                          <Input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("hr.airTickets.travelFrom")}</Label>
                          <Input
                            type="date"
                            value={travelFrom}
                            onChange={(e) => setTravelFrom(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("hr.airTickets.travelTo")}</Label>
                          <Input
                            type="date"
                            value={travelTo}
                            onChange={(e) => setTravelTo(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2 sm:col-span-2">
                          <Button size="sm" disabled={issue.isPending} onClick={() => issue.mutate()}>
                            {issue.isPending ? (
                              <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {t("hr.airTickets.issue")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setIssueFor(null)}>
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setIssueFor(row.id)}>
                        {t("hr.airTickets.issue")}
                      </Button>
                    )
                  ) : null}
                </HrPanel>
              </li>
            ))}
          </ul>
        )}
      </HrModuleFrame>
    </CapabilityGate>
  );
}
