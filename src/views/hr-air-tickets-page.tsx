"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plane } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
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
import {
  createAirTicketEntitlement,
  issueAirTicket,
  listAirTicketEntitlements,
  markAirTicketPaid,
  previewAirTicketEligibility,
} from "@/lib/hr-air-ticket.functions";
import { uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [staffId, setStaffId] = useState("");
  const [destination, setDestination] = useState("");
  const [familyEligible, setFamilyEligible] = useState(false);
  const [notes, setNotes] = useState("");
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [priceQar, setPriceQar] = useState("");
  const [cashQar, setCashQar] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [travelFrom, setTravelFrom] = useState("");
  const [travelTo, setTravelTo] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  const listStatus =
    filter === "upcoming" || filter === "overdue" || filter === "all"
      ? filter
      : filter;

  const list = useQuery({
    queryKey: queryKeys.people.hrAirTickets({ status: listStatus }),
    queryFn: () => listAirTicketEntitlements({ status: listStatus }),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff-picker" }),
    queryFn: () => listStaffForLeaveBalances(),
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
    mutationFn: () => {
      if (!staffId) throw new Error(t("hr.airTickets.formRequired"));
      return createAirTicketEntitlement({
        staffId,
        destination: destination || null,
        familyEligible,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      toast.success(t("hr.airTickets.created"));
      setDestination("");
      setNotes("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
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

  return (
    <CapabilityGate
      capability="hr.air_ticket.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.airTickets.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Plane}
          kicker={t("hr.airTickets.kicker")}
          title={t("hr.airTickets.title")}
          subtitle={t("hr.airTickets.subtitle")}
        >
          <HrPanel className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("hr.airTickets.createTitle")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label>{t("hr.airTickets.staff")}</Label>
                <SearchableSelect
                  value={staffId}
                  onValueChange={setStaffId}
                  placeholder={t("hr.airTickets.pickStaff")}
                  emptyOption={{ value: "", label: t("hr.airTickets.pickStaff") }}
                  options={(staffOptions.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                    keywords: `${s.name} ${s.employeeCode ?? ""}`,
                  }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("hr.airTickets.destination")}</Label>
                <Input value={destination} onChange={(e) => setDestination(e.target.value)} />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={familyEligible}
                    onChange={(e) => setFamilyEligible(e.target.checked)}
                  />
                  {t("hr.airTickets.familyEligible")}
                </label>
              </div>
            </div>
            {preview.data ? (
              <p className="text-xs text-muted-foreground">
                {t("hr.airTickets.preview", {
                  eligibility: preview.data.eligibilityOn,
                  cycle: `${preview.data.cycleStart} → ${preview.data.cycleEnd}`,
                  status: preview.data.status,
                })}
              </p>
            ) : null}
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("hr.airTickets.notes")}
              rows={2}
            />
            <Button disabled={!staffId || create.isPending} onClick={() => create.mutate()}>
              {t("hr.airTickets.create")}
            </Button>
          </HrPanel>

          <div className="mt-4 flex flex-wrap gap-2">
            {filters.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "secondary"}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {list.isLoading ? (
            <HrPanel className="mt-4">
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            </HrPanel>
          ) : (list.data ?? []).length === 0 ? (
            <HrPanel className="mt-4">
              <HrEmptyState message={t("hr.airTickets.empty")} />
            </HrPanel>
          ) : (
            <ul className="mt-4 space-y-3">
              {(list.data ?? []).map((row) => (
                <li key={row.id}>
                  <HrPanel className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {row.staffName}
                          {row.employeeCode ? (
                            <span className="text-muted-foreground"> · {row.employeeCode}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("hr.airTickets.eligibility")}: {row.eligibilityOn}
                          {row.destination ? ` · ${row.destination}` : ""}
                          {row.hireDate ? ` · hire ${row.hireDate}` : ""}
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
                          "rounded-xl border border-[var(--hr-border)] px-3 py-2 text-sm",
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

                    {row.status !== "issued" && row.status !== "cancelled" && row.status !== "expired" ? (
                      issueFor === row.id ? (
                        <div className="grid gap-2 rounded-xl border border-dashed border-[var(--hr-border)] p-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label>{t("hr.airTickets.priceQar")}</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={priceQar}
                              onChange={(e) => setPriceQar(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("hr.airTickets.cashQar")}</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={cashQar}
                              onChange={(e) => setCashQar(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("hr.airTickets.booking")}</Label>
                            <Input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("hr.airTickets.invoice")}</Label>
                            <Input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png,image/webp"
                              onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("hr.airTickets.travelFrom")}</Label>
                            <Input type="date" value={travelFrom} onChange={(e) => setTravelFrom(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("hr.airTickets.travelTo")}</Label>
                            <Input type="date" value={travelTo} onChange={(e) => setTravelTo(e.target.value)} />
                          </div>
                          <div className="flex gap-2 sm:col-span-2">
                            <Button size="sm" disabled={issue.isPending} onClick={() => issue.mutate()}>
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
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
