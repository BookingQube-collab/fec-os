"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
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
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import {
  decideWarning,
  issueWarning,
  listWarnings,
} from "@/lib/hr-warnings.functions";
import { HR_WARNING_CATEGORIES, HR_WARNING_LEVELS } from "@/lib/hr-warnings";
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

export default function HrWarningsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"active" | "escalations" | "all">("active");
  const [staffId, setStaffId] = useState("");
  const [incidentOn, setIncidentOn] = useState("");
  const [category, setCategory] = useState<(typeof HR_WARNING_CATEGORIES)[number]>("conduct");
  const [level, setLevel] = useState<(typeof HR_WARNING_LEVELS)[number]>("written");
  const [description, setDescription] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [letterFile, setLetterFile] = useState<File | null>(null);

  const list = useQuery({
    queryKey: queryKeys.people.hrWarnings({ status }),
    queryFn: () => listWarnings({ status }),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff-picker" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrWarnings() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const issue = useMutation({
    mutationFn: async () => {
      if (!staffId || !incidentOn || !description.trim()) {
        throw new Error(t("hr.warnings.formRequired"));
      }
      if (!letterFile) throw new Error(t("hr.warnings.letterRequired"));
      const contentBase64 = await fileToBase64(letterFile);
      const uploaded = await uploadEmployeeDocument({
        staffId,
        docType: "warning_letter",
        filename: letterFile.name,
        data_base64: contentBase64,
        content_type: letterFile.type || "application/pdf",
        title: `Warning letter ${incidentOn}`,
      });
      return issueWarning({
        staffId,
        incidentOn,
        category,
        description: description.trim(),
        warningLevel: level,
        validUntil: validUntil || null,
        letterDocumentId: uploaded.id,
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.escalation.requiresFormalReview
          ? t("hr.warnings.issuedEscalated")
          : res.escalation.triggersProbationReview
            ? t("hr.warnings.issuedProbationReview")
            : t("hr.warnings.issued"),
      );
      setDescription("");
      setLetterFile(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: decideWarning,
    onSuccess: () => {
      toast.success(t("hr.warnings.updated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filters = useMemo(
    () =>
      [
        { value: "active" as const, label: t("hr.warnings.status.active") },
        { value: "escalations" as const, label: t("hr.warnings.escalations") },
        { value: "all" as const, label: t("hr.warnings.status.all") },
      ] as const,
    [t],
  );

  return (
    <CapabilityGate
      capability="hr.warnings.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.warnings.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={AlertTriangle}
          kicker={t("hr.warnings.kicker")}
          title={t("hr.warnings.title")}
          subtitle={t("hr.warnings.subtitle")}
        >
          <HrPanel className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("hr.warnings.issueTitle")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label>{t("hr.warnings.staff")}</Label>
                <SearchableSelect
                  value={staffId}
                  onValueChange={setStaffId}
                  placeholder={t("hr.warnings.pickStaff")}
                  emptyOption={{ value: "", label: t("hr.warnings.pickStaff") }}
                  options={(staffOptions.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                    keywords: `${s.name} ${s.employeeCode ?? ""}`,
                  }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("hr.warnings.incidentOn")}</Label>
                <Input type="date" value={incidentOn} onChange={(e) => setIncidentOn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("hr.warnings.validUntil")}</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("hr.warnings.category")}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}
                >
                  {HR_WARNING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`hr.warnings.categories.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t("hr.warnings.level")}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as typeof level)}
                >
                  {HR_WARNING_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {t(`hr.warnings.levels.${l}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t("hr.warnings.letter")}</Label>
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setLetterFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("hr.warnings.description")}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
              {t("hr.warnings.issue")}
            </Button>
          </HrPanel>

          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  status === f.value
                    ? "border-foreground/20 bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {list.isLoading ? (
            <HrPanel>
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            </HrPanel>
          ) : !list.data?.length ? (
            <HrEmptyState message={t("hr.warnings.empty")} />
          ) : (
            <div className="space-y-2">
              {list.data.map((w) => (
                <HrPanel key={w.id} className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {w.staffName}{" "}
                        <span className="text-muted-foreground">({w.employeeCode})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {w.incidentOn} · {t(`hr.warnings.levels.${w.warningLevel}`)} ·{" "}
                        {t(`hr.warnings.categories.${w.category}`)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{t(`hr.warnings.status.${w.status}`)}</Badge>
                      {w.requiresFormalReview ? (
                        <Badge variant="destructive">{t("hr.warnings.escalations")}</Badge>
                      ) : null}
                      {w.triggersProbationReview ? (
                        <Badge variant="outline">{t("hr.warnings.probationFlag")}</Badge>
                      ) : null}
                      <Badge variant="outline">
                        {t("hr.warnings.activeCount", { count: w.activeCountAtIssue })}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm">{w.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("hr.warnings.staffStatus", { status: w.staffStatus ?? "—" })} ·{" "}
                    {t("hr.warnings.neverTerminate")}
                  </p>
                  {w.status === "active" || w.status === "acknowledged" || w.status === "appealed" ? (
                    <div className="flex flex-wrap gap-2">
                      <CapabilityGate capability="hr.warnings.decide">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({
                              warningId: w.id,
                              action: "management_decision",
                              decision: "formal_review_completed",
                              note: "Reviewed",
                            })
                          }
                        >
                          {t("hr.warnings.markReviewed")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ warningId: w.id, action: "withdraw", note: "Withdrawn" })
                          }
                        >
                          {t("hr.warnings.withdraw")}
                        </Button>
                      </CapabilityGate>
                    </div>
                  ) : null}
                </HrPanel>
              ))}
            </div>
          )}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
