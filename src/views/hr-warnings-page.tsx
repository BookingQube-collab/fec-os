"use client";

import { FecLoader } from "@/components/fec";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmbedFrame } from "@/components/hr/hr-embed-frame";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
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
  aiDraftWarningDescription,
  decideWarning,
  issueWarning,
  listWarnings,
} from "@/lib/hr-warnings.functions";
import { HR_WARNING_CATEGORIES, HR_WARNING_LEVELS } from "@/lib/hr-warnings";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function HrWarningsWorkspace({
  lockedStaffId,
  embedded = false,
  onChanged,
}: {
  lockedStaffId?: string;
  embedded?: boolean;
  onChanged?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"active" | "escalations" | "all">("active");
  const [pickedStaffId, setPickedStaffId] = useState("");
  const staffId = lockedStaffId ?? pickedStaffId;
  const [incidentOn, setIncidentOn] = useState("");
  const [category, setCategory] = useState<(typeof HR_WARNING_CATEGORIES)[number]>("conduct");
  const [level, setLevel] = useState<(typeof HR_WARNING_LEVELS)[number]>("written");
  const [description, setDescription] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [letterFile, setLetterFile] = useState<File | null>(null);

  const list = useQuery({
    queryKey: queryKeys.people.hrWarnings({ status, staffId: lockedStaffId ?? null }),
    queryFn: () => listWarnings({ status, staffId: lockedStaffId ?? null }),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff-picker" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
    enabled: !lockedStaffId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrWarnings() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
    onChanged?.();
  };

  const draftDescription = useMutation({
    mutationFn: async () => {
      if (!staffId || !incidentOn) {
        throw new Error(t("hr.warnings.aiNeedsStaffDate"));
      }
      return aiDraftWarningDescription({
        staffId,
        category,
        warningLevel: level,
        incidentOn,
        notes: description.trim() || null,
        locale: i18n.language?.startsWith("ar") ? "ar" : "en",
      });
    },
    onSuccess: (res) => {
      setDescription(res.description);
      toast.success(
        res.aiGenerated ? t("hr.warnings.aiApplied") : t("hr.warnings.aiFallback"),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issue = useMutation({
    mutationFn: async () => {
      if (!staffId || !incidentOn || !description.trim()) {
        throw new Error(t("hr.warnings.formRequired"));
      }
      let letterDocumentId: string | null = null;
      if (letterFile) {
        const contentBase64 = await fileToBase64(letterFile);
        const uploaded = await uploadEmployeeDocument({
          staffId,
          docType: "warning_letter",
          filename: letterFile.name,
          data_base64: contentBase64,
          content_type: letterFile.type || "application/pdf",
          title: `Warning letter ${incidentOn}`,
        });
        letterDocumentId = uploaded.id;
      }
      return issueWarning({
        staffId,
        incidentOn,
        category,
        description: description.trim(),
        warningLevel: level,
        validUntil: validUntil || null,
        letterDocumentId,
        locale: i18n.language?.startsWith("ar") ? "ar" : "en",
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
      setIncidentOn("");
      setValidUntil("");
      if (!lockedStaffId) setPickedStaffId("");
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

  const busy = issue.isPending || draftDescription.isPending;

  return (
    <CapabilityGate
      capability="hr.warnings.manage"
      fallback={
        embedded ? (
          <HrEmptyState message={t("hr.warnings.noAccess")} />
        ) : (
          <HrShell>
            <HrPanel>
              <HrEmptyState message={t("hr.warnings.noAccess")} />
            </HrPanel>
          </HrShell>
        )
      }
    >
      <HrEmbedFrame
        embedded={embedded}
        icon={AlertTriangle}
        kicker={t("hr.warnings.kicker")}
        title={t("hr.warnings.title")}
        subtitle={t("hr.warnings.subtitle")}
      >
        <HrPanel className="space-y-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("hr.warnings.issueTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("hr.warnings.issueHint")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {lockedStaffId ? null : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("hr.warnings.staff")}</Label>
                <SearchableSelect
                  value={staffId}
                  onValueChange={setPickedStaffId}
                  placeholder={t("hr.warnings.pickStaff")}
                  emptyOption={{ value: "", label: t("hr.warnings.pickStaff") }}
                  options={(staffOptions.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                    keywords: `${s.name} ${s.employeeCode ?? ""}`,
                  }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("hr.warnings.incidentOn")}</Label>
              <Input type="date" value={incidentOn} onChange={(e) => setIncidentOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hr.warnings.validUntil")}</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
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
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{t("hr.warnings.description")}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !staffId || !incidentOn}
                onClick={() => draftDescription.mutate()}
              >
                {draftDescription.isPending ? (
                  <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="me-1.5 h-3.5 w-3.5" />
                )}
                {t("hr.warnings.generateDescription")}
              </Button>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder={t("hr.warnings.descriptionPlaceholder")}
              className="min-h-[7.5rem]"
            />
            <p className="text-xs text-muted-foreground">{t("hr.warnings.descriptionHint")}</p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 space-y-3">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border border-border/60">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{t("hr.warnings.letterheadTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("hr.warnings.letterheadHint")}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("hr.warnings.letterOptional")}</Label>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setLetterFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => issue.mutate()} disabled={busy}>
              {issue.isPending ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("hr.warnings.issue")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("hr.warnings.neverTerminate")}</p>
          </div>
        </HrPanel>

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={status === f.value ? "default" : "outline"}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {list.isLoading ? (
          <HrPanel>
            <FecLoader density="chip" label={t("common.loading")} />
          </HrPanel>
        ) : !list.data?.length ? (
          <HrEmptyState message={t("hr.warnings.empty")} icon={AlertTriangle} />
        ) : (
          <ul className="space-y-2">
            {list.data.map((w) => (
              <li key={w.id} className="hr-list-row !items-start flex-col gap-3 sm:!items-stretch">
                <div className="flex w-full flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      {w.staffName}{" "}
                      <span className="text-muted-foreground font-normal">({w.employeeCode})</span>
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
                <p className="w-full whitespace-pre-wrap text-sm text-foreground/90">{w.description}</p>
                <p className="w-full text-xs text-muted-foreground">
                  {t("hr.warnings.staffStatus", { status: w.staffStatus ?? "—" })}
                </p>
                {w.status === "active" || w.status === "acknowledged" || w.status === "appealed" ? (
                  <div className="flex w-full flex-wrap gap-2">
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
              </li>
            ))}
          </ul>
        )}
      </HrEmbedFrame>
    </CapabilityGate>
  );
}

export default function HrWarningsPage() {
  return <HrWarningsWorkspace />;
}
