"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { useUserRoles } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import {
  applyTermination,
  approveTermination,
  completeClearanceItem,
  initiateTermination,
  listClearanceItems,
  listProbationTerminationQueue,
  listTerminations,
  openDraftTerminationFromProbation,
} from "@/lib/hr-exit.functions";
import { HR_TERMINATION_TYPES } from "@/lib/hr-exit";
import { eosNextAction } from "@/lib/hr-eos";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { canUserDo } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function exitBadge(status: string): "warning" | "info" | "success" | "muted" | "outline" {
  if (
    status === "pending_hr_approval" ||
    status === "pending_exec_approval" ||
    status === "submitted" ||
    status === "pending_override_approval"
  ) {
    return "warning";
  }
  if (status === "approved" || status === "serving_notice") return "info";
  if (status === "applied" || status === "completed") return "success";
  if (status === "draft") return "muted";
  return "outline";
}

function terminationStatusLabel(t: TFunction, status: string) {
  return t(`hrWorkspace.eos.status.termination.${status}`, {
    defaultValue: status.replace(/_/g, " "),
  });
}

function terminationNextLabel(
  t: TFunction,
  row: { status: string; assetClearance: boolean; deptClearance: boolean; financeClearance: boolean },
) {
  if (row.status === "draft" || row.status === "pending_hr_approval" || row.status === "pending_exec_approval") {
    return t("hr.terminations.approve");
  }
  if (row.status === "approved") return t("hr.terminations.apply");
  if (row.status === "applied" && !(row.assetClearance && row.deptClearance && row.financeClearance)) {
    return t("hr.terminations.clearance");
  }
  return null;
}

function staffStatusLabel(t: TFunction, status: string | null | undefined) {
  if (!status) return "—";
  return t(`hr.me.staffStatus.${status}`, { defaultValue: status.replace(/_/g, " ") });
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export default function HrTerminationsPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roles = useUserRoles();
  const canView =
    canUserDo(roles, "hr.termination.initiate") ||
    canUserDo(roles, "hr.termination.approve") ||
    canUserDo(roles, "hr.manage");
  const canInitiate = usePermission("hr.termination.initiate");
  const canApprove = usePermission("hr.termination.approve");
  const [staffId, setStaffId] = useState("");
  const [termType, setTermType] = useState<(typeof HR_TERMINATION_TYPES)[number]>("with_notice");
  const [reason, setReason] = useState("");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [lwd, setLwd] = useState("");
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queue = useQuery({
    queryKey: queryKeys.people.hrTerminations({ status: "queue" }),
    queryFn: () => listTerminations({ status: "queue" }),
    staleTime: STALE.people,
  });

  const probationQueue = useQuery({
    queryKey: queryKeys.people.hrTerminations({ view: "probation-flags" }),
    queryFn: () => listProbationTerminationQueue({}),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff-picker-term" }),
    queryFn: () => listStaffForLeaveBalances(),
    enabled: !embedded && canInitiate,
    staleTime: STALE.people,
  });

  const clearance = useQuery({
    queryKey: queryKeys.people.hrClearance({ terminationId: selectedId }),
    queryFn: () => listClearanceItems({ terminationId: selectedId! }),
    enabled: Boolean(selectedId),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrTerminations() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrClearance() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const initiate = useMutation({
    mutationFn: async () => {
      if (!staffId || !reason.trim() || !effectiveOn || !lwd) {
        throw new Error(t("hr.terminations.formRequired"));
      }
      let supportingDocumentId: string | null = null;
      if (letterFile) {
        const contentBase64 = await fileToBase64(letterFile);
        const uploaded = await uploadEmployeeDocument({
          staffId,
          docType: "termination_letter",
          filename: letterFile.name,
          data_base64: contentBase64,
          content_type: letterFile.type || "application/pdf",
          title: `Termination letter`,
        });
        supportingDocumentId = uploaded.id;
      }
      return initiateTermination({
        staffId,
        terminationType: termType,
        reason: reason.trim(),
        effectiveOn,
        lastWorkingDate: lwd,
        supportingDocumentId,
      });
    },
    onSuccess: () => {
      toast.success(t("hr.terminations.initiated"));
      setReason("");
      setLetterFile(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openFromProbation = useMutation({
    mutationFn: (probationReviewId: string) =>
      openDraftTerminationFromProbation({ probationReviewId }),
    onSuccess: () => {
      toast.success(t("hr.terminations.draftFromProbation"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveTermination({ terminationId: id, slot: "auto" }),
    onSuccess: (res) => {
      toast.success(
        res.status === "approved"
          ? t("hr.terminations.fullyApproved")
          : t("hr.terminations.partialApproved", { status: terminationStatusLabel(t, res.status) }),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: (id: string) => applyTermination({ terminationId: id }),
    onSuccess: () => {
      toast.success(t("hr.terminations.applied"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearItem = useMutation({
    mutationFn: (itemId: string) => completeClearanceItem({ itemId, completed: true }),
    onSuccess: () => {
      toast.success(t("hr.terminations.clearanceItem"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!queue.data) return;
    if (!queue.data.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && queue.data.some((row) => row.id === current) ? current : queue.data[0]!.id,
    );
  }, [queue.data]);

  const selected = queue.data?.find((row) => row.id === selectedId) ?? null;

  if (!canView) {
    return (
      <HrPanel>
        <HrEmptyState message={t("hr.terminations.noAccess")} />
      </HrPanel>
    );
  }

  return (
      <HrModuleFrame
        embedded={embedded}
        icon={ShieldAlert}
        kicker={t("hr.terminations.kicker")}
        title={t("hr.terminations.title")}
        subtitle={t("hr.terminations.subtitle")}
      >
          <p className="text-xs text-muted-foreground">{t("hr.terminations.neverAuto")}</p>

          {embedded ? (
            <p className="text-xs text-muted-foreground">
              {t("hr.terminations.fromEos")}{" "}
              <Link href="/people/hr/end-of-service" className="font-medium text-foreground underline-offset-4 hover:underline">
                {t("nav.endOfService")}
              </Link>
            </p>
          ) : null}

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className={`order-2 min-w-0 space-y-4 lg:order-1 ${selected ? "" : "lg:col-span-2"}`}>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">{t("hr.terminations.queueTitle")}</h2>
                {queue.isLoading ? (
                  <FecLoader label={t("common.loading")} />
                ) : queue.isError ? (
                  <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
                ) : !queue.data?.length ? (
                  <HrEmptyState message={t("hr.terminations.empty")} />
                ) : (
                  <ul className="space-y-2">
                    {queue.data.map((row) => {
                      const nextLabel = terminationNextLabel(t, row);
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            className={`hr-list-row w-full min-w-0 text-start ${
                              row.id === selectedId ? "bg-secondary" : ""
                            }`}
                            aria-pressed={row.id === selectedId}
                            onClick={() => setSelectedId(row.id)}
                          >
                            <span className="min-w-0">
                              <span className="block font-medium">
                                {row.staffName} · {row.employeeCode}
                              </span>
                              {nextLabel ? (
                                <span className="block text-xs text-muted-foreground">
                                  {t("hrWorkspace.eos.nextTitle")}: {nextLabel}
                                </span>
                              ) : null}
                            </span>
                            <Badge variant={exitBadge(row.status)}>{terminationStatusLabel(t, row.status)}</Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <HrPanel className="space-y-2 p-4">
                <h2 className="text-sm font-semibold">{t("hr.terminations.probationQueue")}</h2>
                {probationQueue.isLoading ? (
                  <FecLoader label={t("common.loading")} />
                ) : !probationQueue.data?.length ? (
                  <p className="text-sm text-muted-foreground">{t("hr.terminations.probationEmpty")}</p>
                ) : (
                  probationQueue.data.map((p) => (
                    <div
                      key={p.probationReviewId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">
                          {p.staffName} · {p.employeeCode}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {t("hr.terminations.staffStatus", { status: staffStatusLabel(t, p.staffStatus) })}
                          {p.hasDraftTermination
                            ? ` · ${t("hr.terminations.hasDraft")}`
                            : ` · ${t("hr.terminations.needsDraft")}`}
                        </p>
                      </div>
                      {canInitiate && !p.hasDraftTermination ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={openFromProbation.isPending}
                          onClick={() => openFromProbation.mutate(p.probationReviewId)}
                        >
                          {t("hr.terminations.openDraft")}
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </HrPanel>
            </div>

            {selected ? (
              <HrPanel className="order-1 min-w-0 space-y-4 p-4 lg:order-2">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-base font-semibold">
                    {selected.staffName} · {selected.employeeCode}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant={exitBadge(selected.status)}>{terminationStatusLabel(t, selected.status)}</Badge>
                    <Badge variant="outline">
                      {t(`hr.terminations.types.${selected.terminationType}`, {
                        defaultValue: selected.terminationType.replace(/_/g, " "),
                      })}
                    </Badge>
                  </div>
                </div>
                <div className="hr-notice">
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-semibold">{t("hrWorkspace.eos.nextTitle")}</p>
                    <p className="text-sm">
                      {t(
                        `hrWorkspace.eos.next.${eosNextAction({
                          kind: "termination",
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
                    <div className="flex flex-wrap gap-2">
                      {canApprove &&
                      ["draft", "pending_hr_approval", "pending_exec_approval"].includes(selected.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(selected.id)}
                        >
                          {t("hr.terminations.approve")}
                        </Button>
                      ) : null}
                      {canApprove && selected.status === "approved" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={apply.isPending}
                          onClick={() => apply.mutate(selected.id)}
                        >
                          {t("hr.terminations.apply")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("hr.terminations.effectiveOn")}</p>
                    <p>{selected.effectiveOn}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("hr.terminations.lwd")}</p>
                    <p>{selected.lastWorkingDate}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("hr.terminations.hrApproval")}</p>
                    <p>{selected.hrApprovedBy ? t("hr.terminations.recorded") : t("hr.terminations.notRecorded")}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("hr.terminations.execApproval")}</p>
                    <p>{selected.execApprovedBy ? t("hr.terminations.recorded") : t("hr.terminations.notRecorded")}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("hr.terminations.staffStatus", { status: staffStatusLabel(t, selected.staffStatus) })}
                </p>
                {selected.reason ? <p className="whitespace-pre-wrap break-words text-sm">{selected.reason}</p> : null}
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">{t("hr.terminations.clearanceTitle")}</h2>
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
                              {t("hr.terminations.done")}
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
                            {t("hr.terminations.markDone")}
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                </section>
              </HrPanel>
            ) : null}
          </div>

          {canInitiate && !embedded ? (
            <HrPanel className="space-y-3">
              <p className="text-sm font-medium">{t("hr.terminations.initiateTitle")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("hr.terminations.staff")}</Label>
                  <SearchableSelect
                    value={staffId}
                    onValueChange={setStaffId}
                    placeholder={t("hr.terminations.pickStaff")}
                    emptyOption={{ value: "", label: t("hr.terminations.pickStaff") }}
                    options={(staffOptions.data ?? []).map((s) => ({
                      value: s.id,
                      label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                      keywords: `${s.name} ${s.employeeCode ?? ""}`,
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.terminations.type")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={termType}
                    onChange={(e) =>
                      setTermType(e.target.value as (typeof HR_TERMINATION_TYPES)[number])
                    }
                  >
                    {HR_TERMINATION_TYPES.map((ty) => (
                      <option key={ty} value={ty}>
                        {t(`hr.terminations.types.${ty}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.terminations.effectiveOn")}</Label>
                  <Input
                    type="date"
                    value={effectiveOn}
                    onChange={(e) => setEffectiveOn(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.terminations.lwd")}</Label>
                  <Input type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t("hr.terminations.reason")}</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t("hr.terminations.letter")}</Label>
                  <Input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setLetterFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <Button type="button" disabled={initiate.isPending} onClick={() => initiate.mutate()}>
                {t("hr.terminations.initiate")}
              </Button>
            </HrPanel>
          ) : null}

      </HrModuleFrame>
  );
}
