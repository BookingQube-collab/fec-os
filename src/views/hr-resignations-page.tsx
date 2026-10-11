"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrModuleFrame } from "@/components/hr/hr-module-frame";
import { HrPanel } from "@/components/hr/hr-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import {
  approveResignation,
  completeClearanceItem,
  listClearanceItems,
  listResignations,
  submitResignation,
  suggestNoticeForStaff,
} from "@/lib/hr-exit.functions";
import { eosNextAction } from "@/lib/hr-eos";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function exitBadge(status: string): "warning" | "info" | "success" | "muted" | "outline" {
  if (status === "submitted" || status === "pending_override_approval") return "warning";
  if (status === "approved" || status === "serving_notice") return "info";
  if (status === "completed") return "success";
  if (status === "draft") return "muted";
  return "outline";
}

function resignationStatusLabel(t: TFunction, status: string) {
  return t(`hrWorkspace.eos.status.resignation.${status}`, {
    defaultValue: status.replace(/_/g, " "),
  });
}

function staffStatusLabel(t: TFunction, status: string | null | undefined) {
  if (!status) return "—";
  return t(`hr.me.staffStatus.${status}`, { defaultValue: status.replace(/_/g, " ") });
}

function resignationNextLabel(t: TFunction, status: string) {
  if (status === "submitted" || status === "pending_override_approval") return t("hr.resignations.approve");
  if (status === "approved" || status === "serving_notice") return t("hr.resignations.clearance");
  return null;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export default function HrResignationsPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"serving" | "all" | "submitted" | "pending_override_approval">(
    "all",
  );
  const [staffId, setStaffId] = useState("");
  const [reason, setReason] = useState("");
  const [requiredNotice, setRequiredNotice] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState("");
  const [proposedLwd, setProposedLwd] = useState("");
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: queryKeys.people.hrResignations({ status: filter }),
    queryFn: () => listResignations({ status: filter }),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff-picker-resign" }),
    queryFn: () => listStaffForLeaveBalances(),
    enabled: !embedded,
    staleTime: STALE.people,
  });

  const suggestion = useQuery({
    queryKey: queryKeys.people.hrResignations({ view: "suggest", staffId }),
    queryFn: () => suggestNoticeForStaff({ staffId }),
    enabled: !embedded && Boolean(staffId),
    staleTime: STALE.people,
  });

  const clearance = useQuery({
    queryKey: queryKeys.people.hrClearance({ resignationId: selectedId }),
    queryFn: () => listClearanceItems({ resignationId: selectedId! }),
    enabled: Boolean(selectedId),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrResignations() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrClearance() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!staffId || !reason.trim()) throw new Error(t("hr.resignations.formRequired"));
      let letterDocumentId: string | null = null;
      if (letterFile) {
        const contentBase64 = await fileToBase64(letterFile);
        const uploaded = await uploadEmployeeDocument({
          staffId,
          docType: "resignation_letter",
          filename: letterFile.name,
          data_base64: contentBase64,
          content_type: letterFile.type || "application/pdf",
          title: `Resignation letter`,
        });
        letterDocumentId = uploaded.id;
      }
      const required = requiredNotice.trim()
        ? Number(requiredNotice)
        : suggestion.data?.suggestedDays;
      return submitResignation({
        staffId,
        reason: reason.trim(),
        letterDocumentId,
        requiredNoticeDays: required ?? null,
        noticeOverrideReason: overrideReason || null,
        proposedLwd: proposedLwd || null,
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.noticeOverride
          ? t("hr.resignations.submittedOverride")
          : t("hr.resignations.submitted"),
      );
      setReason("");
      setOverrideReason("");
      setRequiredNotice("");
      setLetterFile(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      approveResignation({ resignationId: id, approveNoticeOverride: true }),
    onSuccess: () => {
      toast.success(t("hr.resignations.approved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearItem = useMutation({
    mutationFn: (itemId: string) => completeClearanceItem({ itemId, completed: true }),
    onSuccess: (res) => {
      toast.success(
        res.allComplete ? t("hr.resignations.clearanceDone") : t("hr.resignations.clearanceItem"),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!list.data) return;
    if (!list.data.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && list.data.some((row) => row.id === current) ? current : list.data[0]!.id,
    );
  }, [list.data]);

  const selected = list.data?.find((row) => row.id === selectedId) ?? null;

  return (
    <CapabilityGate
      capability="hr.resignation.manage"
      fallback={
        <HrPanel>
          <HrEmptyState message={t("hr.resignations.noAccess")} />
        </HrPanel>
      }
    >
      <HrModuleFrame
        embedded={embedded}
        icon={LogOut}
        kicker={t("hr.resignations.kicker")}
        title={t("hr.resignations.title")}
        subtitle={t("hr.resignations.subtitle")}
      >
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["serving", "hr.resignations.filters.serving"],
                ["submitted", "hr.resignations.filters.submitted"],
                ["pending_override_approval", "hr.resignations.filters.override"],
                ["all", "hr.resignations.filters.all"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={filter === key ? "default" : "outline"}
                onClick={() => setFilter(key)}
              >
                {t(label)}
              </Button>
            ))}
          </div>

          {embedded ? (
            <p className="text-xs text-muted-foreground">
              {t("hr.resignations.fromEos")}{" "}
              <Link href="/people/hr/end-of-service" className="font-medium text-foreground underline-offset-4 hover:underline">
                {t("nav.endOfService")}
              </Link>
            </p>
          ) : null}

          {!embedded ? (
          <HrPanel className="space-y-3">
            <p className="text-sm font-medium">{t("hr.resignations.submitTitle")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("hr.resignations.staff")}</Label>
                <SearchableSelect
                  value={staffId}
                  onValueChange={setStaffId}
                  placeholder={t("hr.resignations.pickStaff")}
                  emptyOption={{ value: "", label: t("hr.resignations.pickStaff") }}
                  options={(staffOptions.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                    keywords: `${s.name} ${s.employeeCode ?? ""}`,
                  }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("hr.resignations.proposedLwd")}</Label>
                <Input type="date" value={proposedLwd} onChange={(e) => setProposedLwd(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("hr.resignations.reason")}</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1">
                <Label>{t("hr.resignations.suggestedNotice")}</Label>
                <p className="text-sm text-muted-foreground">
                  {suggestion.data
                    ? t("hr.resignations.suggestedValue", {
                        days: suggestion.data.suggestedDays,
                        band: suggestion.data.band,
                        years: suggestion.data.lengthOfServiceYears.toFixed(1),
                      })
                    : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <Label>{t("hr.resignations.requiredNotice")}</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder={
                    suggestion.data ? String(suggestion.data.suggestedDays) : undefined
                  }
                  value={requiredNotice}
                  onChange={(e) => setRequiredNotice(e.target.value)}
                />
              </div>
              {requiredNotice &&
              suggestion.data &&
              Number(requiredNotice) !== suggestion.data.suggestedDays ? (
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t("hr.resignations.overrideReason")}</Label>
                  <Textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    rows={2}
                    placeholder={t("hr.resignations.overrideHint")}
                  />
                </div>
              ) : null}
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("hr.resignations.letter")}</Label>
                <Input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setLetterFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <Button type="button" disabled={submit.isPending} onClick={() => submit.mutate()}>
              {t("hr.resignations.submit")}
            </Button>
          </HrPanel>
          ) : null}

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className={`order-2 min-w-0 space-y-2 lg:order-1 ${selected ? "" : "lg:col-span-2"}`}>
              <h2 className="text-sm font-semibold">{t("hr.resignations.casesTitle")}</h2>
              {list.isLoading ? (
                <FecLoader label={t("common.loading")} />
              ) : list.isError ? (
                <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
              ) : !list.data?.length ? (
                <HrEmptyState message={t("hr.resignations.empty")} />
              ) : (
                <ul className="space-y-2">
                  {list.data.map((r) => {
                    const nextLabel = resignationNextLabel(t, r.status);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          className={`hr-list-row w-full min-w-0 text-start ${
                            r.id === selectedId ? "bg-secondary" : ""
                          }`}
                          aria-pressed={r.id === selectedId}
                          onClick={() => setSelectedId(r.id)}
                        >
                          <span className="min-w-0">
                            <span className="block font-medium">
                              {r.staffName} · {r.employeeCode}
                            </span>
                            {nextLabel ? (
                              <span className="block text-xs text-muted-foreground">
                                {t("hrWorkspace.eos.nextTitle")}: {nextLabel}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex flex-wrap gap-1">
                            <Badge variant={exitBadge(r.status)}>{resignationStatusLabel(t, r.status)}</Badge>
                            {r.noticeOverride ? (
                              <Badge variant="outline">{t("hr.resignations.overrideBadge")}</Badge>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selected ? (
              <HrPanel className="order-1 min-w-0 space-y-4 p-4 lg:order-2">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-base font-semibold">
                    {selected.staffName} · {selected.employeeCode}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant={exitBadge(selected.status)}>{resignationStatusLabel(t, selected.status)}</Badge>
                    {selected.noticeOverride ? (
                      <Badge variant="outline">{t("hr.resignations.overrideBadge")}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="hr-notice">
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-semibold">{t("hrWorkspace.eos.nextTitle")}</p>
                    <p className="text-sm">
                      {t(
                        `hrWorkspace.eos.next.${eosNextAction({
                          kind: "resignation",
                          status: selected.status,
                          assetClearance: selected.assetClearance,
                          deptClearance: selected.deptClearance,
                          financeClearance: selected.financeClearance,
                          clearanceRemaining: clearance.data
                            ? clearance.data.filter((item) => !item.completed).length
                            : null,
                        })}`,
                      )}
                    </p>
                    {["submitted", "pending_override_approval"].includes(selected.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(selected.id)}
                      >
                        {t("hr.resignations.approve")}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("hr.resignations.noticeLine", {
                    suggested: selected.suggestedNoticeDays,
                    required: selected.requiredNoticeDays,
                    lwd: selected.approvedLwd ?? selected.proposedLwd ?? "—",
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("hr.resignations.staffStatus", { status: staffStatusLabel(t, selected.staffStatus) })}
                </p>
                {selected.reason ? (
                  <p className="whitespace-pre-wrap break-words text-sm">{selected.reason}</p>
                ) : null}
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">{t("hr.resignations.clearanceTitle")}</h2>
                  {clearance.isLoading ? (
                    <FecLoader label={t("common.loading")} />
                  ) : (clearance.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("hrWorkspace.eos.clearanceEmpty")}</p>
                  ) : (
                    (clearance.data ?? []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 break-words">
                          {item.label}
                          {item.completed ? (
                            <Badge className="ms-2" variant="success">
                              {t("hr.resignations.done")}
                            </Badge>
                          ) : null}
                        </span>
                        {!item.completed ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={clearItem.isPending}
                            onClick={() => clearItem.mutate(item.id)}
                          >
                            {t("hr.resignations.markDone")}
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                </section>
              </HrPanel>
            ) : null}
          </div>
      </HrModuleFrame>
    </CapabilityGate>
  );
}
