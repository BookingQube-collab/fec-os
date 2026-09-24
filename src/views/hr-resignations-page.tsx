"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useState } from "react";
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
import { uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import {
  approveResignation,
  completeClearanceItem,
  listClearanceItems,
  listResignations,
  submitResignation,
  suggestNoticeForStaff,
} from "@/lib/hr-exit.functions";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export default function HrResignationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"serving" | "all" | "submitted" | "pending_override_approval">(
    "serving",
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
    staleTime: STALE.people,
  });

  const suggestion = useQuery({
    queryKey: queryKeys.people.hrResignations({ view: "suggest", staffId }),
    queryFn: () => suggestNoticeForStaff({ staffId }),
    enabled: Boolean(staffId),
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

  return (
    <CapabilityGate
      capability="hr.resignation.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.resignations.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
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

          <HrPanel className="space-y-3">
            {!list.data?.length ? (
              <HrEmptyState message={t("hr.resignations.empty")} />
            ) : (
              list.data.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {r.staffName} · {r.employeeCode}
                      </span>
                      <Badge variant="secondary">{r.status}</Badge>
                      {r.noticeOverride ? (
                        <Badge variant="outline">{t("hr.resignations.overrideBadge")}</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("hr.resignations.noticeLine", {
                        suggested: r.suggestedNoticeDays,
                        required: r.requiredNoticeDays,
                        lwd: r.approvedLwd ?? r.proposedLwd ?? "—",
                      })}
                    </p>
                    <p className="text-sm">{r.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("hr.resignations.staffStatus", { status: r.staffStatus ?? "—" })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedId(r.id)}
                    >
                      {t("hr.resignations.clearance")}
                    </Button>
                    {["submitted", "pending_override_approval"].includes(r.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(r.id)}
                      >
                        {t("hr.resignations.approve")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </HrPanel>

          {selectedId ? (
            <HrPanel className="space-y-2">
              <p className="text-sm font-medium">{t("hr.resignations.clearanceTitle")}</p>
              {(clearance.data ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {item.label}
                    {item.completed ? (
                      <Badge className="ms-2" variant="secondary">
                        {t("hr.resignations.done")}
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
                      {t("hr.resignations.markDone")}
                    </Button>
                  ) : null}
                </div>
              ))}
            </HrPanel>
          ) : null}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
