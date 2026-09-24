"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { canUserDo } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export default function HrTerminationsPage() {
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
          : t("hr.terminations.partialApproved", { status: res.status }),
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

  if (!canView) {
    return (
      <HrShell>
        <HrPanel>
          <HrEmptyState message={t("hr.terminations.noAccess")} />
        </HrPanel>
      </HrShell>
    );
  }

  return (
    <HrShell>
        <HrSection
          icon={ShieldAlert}
          kicker={t("hr.terminations.kicker")}
          title={t("hr.terminations.title")}
          subtitle={t("hr.terminations.subtitle")}
        >
          <p className="text-xs text-muted-foreground">{t("hr.terminations.neverAuto")}</p>

          <HrPanel className="space-y-2">
            <p className="text-sm font-medium">{t("hr.terminations.probationQueue")}</p>
            {!probationQueue.data?.length ? (
              <p className="text-sm text-muted-foreground">{t("hr.terminations.probationEmpty")}</p>
            ) : (
              probationQueue.data.map((p) => (
                <div
                  key={p.probationReviewId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
                >
                  <div>
                    <span className="font-medium">
                      {p.staffName} · {p.employeeCode}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {t("hr.terminations.staffStatus", { status: p.staffStatus ?? "—" })}
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

          {canInitiate ? (
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

          <HrPanel className="space-y-3">
            <p className="text-sm font-medium">{t("hr.terminations.queueTitle")}</p>
            {!queue.data?.length ? (
              <HrEmptyState message={t("hr.terminations.empty")} />
            ) : (
              queue.data.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {row.staffName} · {row.employeeCode}
                      </span>
                      <Badge variant="secondary">{row.status}</Badge>
                      <Badge variant="outline">{row.terminationType}</Badge>
                    </div>
                    <p className="text-sm">{row.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("hr.terminations.datesLine", {
                        effective: row.effectiveOn,
                        lwd: row.lastWorkingDate,
                      })}
                      {" · "}
                      {t("hr.terminations.staffStatus", { status: row.staffStatus ?? "—" })}
                      {" · "}
                      HR: {row.hrApprovedBy ? "✓" : "—"} / Exec: {row.execApprovedBy ? "✓" : "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedId(row.id)}
                    >
                      {t("hr.terminations.clearance")}
                    </Button>
                    {canApprove &&
                    ["draft", "pending_hr_approval", "pending_exec_approval"].includes(
                      row.status,
                    ) ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(row.id)}
                      >
                        {t("hr.terminations.approve")}
                      </Button>
                    ) : null}
                    {canApprove && row.status === "approved" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={apply.isPending}
                        onClick={() => apply.mutate(row.id)}
                      >
                        {t("hr.terminations.apply")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </HrPanel>

          {selectedId ? (
            <HrPanel className="space-y-2">
              <p className="text-sm font-medium">{t("hr.terminations.clearanceTitle")}</p>
              {(clearance.data ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {item.label}
                    {item.completed ? (
                      <Badge className="ms-2" variant="secondary">
                        done
                      </Badge>
                    ) : null}
                  </span>
                  {!item.completed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => clearItem.mutate(item.id)}
                    >
                      {t("hr.terminations.markDone")}
                    </Button>
                  ) : null}
                </div>
              ))}
            </HrPanel>
          ) : null}
        </HrSection>
      </HrShell>
  );
}
