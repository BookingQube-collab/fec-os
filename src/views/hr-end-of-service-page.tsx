"use client";

/* Hallmark · pre-emit critique: P5 H4 E4 S5 R4 V4
 * redesign inside the existing FEC HR shell.
 * macrostructure: workbench (queue + next step) · tone: utilitarian
 * theme: existing hr-shell · enrichment: none
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Scale } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { uploadEmployeeDocument } from "@/lib/hr-documents.functions";
import {
  eosNextAction,
  eosStage,
  noticeRuleRows,
  settlementLines,
  type EosKind,
  type EosNextAction,
  type EosStage,
} from "@/lib/hr-eos";
import { DEFAULT_CLEARANCE_SEED, HR_TERMINATION_TYPES } from "@/lib/hr-exit";
import {
  applyTermination,
  approveResignation,
  approveTermination,
  completeClearanceItem,
  initiateTermination,
  listClearanceItems,
  listResignations,
  listTerminations,
  submitResignation,
  suggestNoticeForStaff,
} from "@/lib/hr-exit.functions";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { HR_POLICY_DEFAULTS } from "@/lib/hr-policy";
import { listHrPolicySettings } from "@/lib/hr-policy.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

const STAGE_RANK: Record<EosStage, number> = {
  review: 0,
  draft: 1,
  approved: 2,
  completed: 3,
  closed: 4,
};

const SEED_ORDER = new Map(DEFAULT_CLEARANCE_SEED.map((item) => [item.label, String(item.sortOrder)]));

type EosCase = {
  key: string;
  id: string;
  kind: EosKind;
  staffName: string | null;
  employeeCode: string | null;
  department: string | null;
  reason: string;
  status: string;
  stage: EosStage;
  employmentCategory: string | null;
  lengthOfServiceDays: number | null;
  suggestedNoticeDays: number | null;
  requiredNoticeDays: number | null;
  noticeOverride: boolean;
  proposedLwd: string | null;
  approvedLwd: string | null;
  lastWorkingDate: string | null;
  effectiveOn: string | null;
  submittedOn: string | null;
  terminationType: string | null;
  noticeTreatment: string | null;
  assetClearance: boolean;
  deptClearance: boolean;
  financeClearance: boolean;
  finalSettlementStub: Record<string, unknown>;
  letterDocumentId: string | null;
  airTicketEligible: boolean;
  releasingDate: string | null;
  handoverNotes: string | null;
  noticeWaiver: boolean;
  noticeRecovery: boolean;
  sortDate: string;
};

function stageVariant(stage: EosStage): "muted" | "warning" | "info" | "success" | "outline" {
  if (stage === "draft") return "muted";
  if (stage === "review") return "warning";
  if (stage === "approved") return "info";
  if (stage === "completed") return "success";
  return "outline";
}

function peoplePrefix() {
  return queryKeys.people.all;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export default function HrEndOfServicePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canResign = usePermission("hr.resignation.manage");
  const canInitiate = usePermission("hr.termination.initiate");
  const canApproveTermination = usePermission("hr.termination.approve");
  const canCreate = canResign || canInitiate;

  const [tab, setTab] = useState("cases");
  const [stage, setStage] = useState<EosStage | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const pendingKey = useRef<string | null>(null);

  const resignations = useQuery({
    queryKey: queryKeys.people.hrResignations({ status: "all", view: "eos" }),
    queryFn: () => listResignations({ status: "all" }),
    staleTime: STALE.people,
  });
  const terminations = useQuery({
    queryKey: queryKeys.people.hrTerminations({ status: "all", view: "eos" }),
    queryFn: () => listTerminations({ status: "all" }),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [...peoplePrefix(), "hr-resignations"] });
    void qc.invalidateQueries({ queryKey: [...peoplePrefix(), "hr-terminations"] });
    void qc.invalidateQueries({ queryKey: [...peoplePrefix(), "hr-clearance"] });
  };

  const cases = useMemo(() => {
    const resignationCases: EosCase[] = (resignations.data ?? []).map((row) => ({
      key: `resignation:${row.id}`,
      id: row.id,
      kind: "resignation",
      staffName: row.staffName,
      employeeCode: row.employeeCode,
      department: row.department,
      reason: row.reason,
      status: row.status,
      stage: eosStage("resignation", row.status),
      employmentCategory: row.employmentCategory,
      lengthOfServiceDays: row.lengthOfServiceDays,
      suggestedNoticeDays: row.suggestedNoticeDays,
      requiredNoticeDays: row.requiredNoticeDays,
      noticeOverride: row.noticeOverride,
      proposedLwd: row.proposedLwd,
      approvedLwd: row.approvedLwd,
      lastWorkingDate: row.approvedLwd ?? row.proposedLwd,
      effectiveOn: null,
      submittedOn: row.submittedOn,
      terminationType: null,
      noticeTreatment: null,
      assetClearance: row.assetClearance,
      deptClearance: row.deptClearance,
      financeClearance: row.financeClearance,
      finalSettlementStub: row.finalSettlementStub,
      letterDocumentId: row.letterDocumentId,
      airTicketEligible: row.airTicketEligible,
      releasingDate: row.releasingDate,
      handoverNotes: row.handoverNotes,
      noticeWaiver: row.noticeWaiver,
      noticeRecovery: row.noticeRecovery,
      sortDate: row.approvedLwd ?? row.proposedLwd ?? row.submittedOn,
    }));
    const terminationCases: EosCase[] = (terminations.data ?? []).map((row) => ({
      key: `termination:${row.id}`,
      id: row.id,
      kind: "termination",
      staffName: row.staffName,
      employeeCode: row.employeeCode,
      department: row.department,
      reason: row.reason,
      status: row.status,
      stage: eosStage("termination", row.status),
      employmentCategory: row.employmentCategory,
      lengthOfServiceDays: null,
      suggestedNoticeDays: null,
      requiredNoticeDays: null,
      noticeOverride: false,
      proposedLwd: null,
      approvedLwd: null,
      lastWorkingDate: row.lastWorkingDate,
      effectiveOn: row.effectiveOn,
      submittedOn: null,
      terminationType: row.terminationType,
      noticeTreatment: row.noticeTreatment,
      assetClearance: row.assetClearance,
      deptClearance: row.deptClearance,
      financeClearance: row.financeClearance,
      finalSettlementStub: row.finalSettlementStub,
      letterDocumentId: row.supportingDocumentId,
      airTicketEligible: row.airTicketEligible,
      releasingDate: row.releasingDate,
      handoverNotes: null,
      noticeWaiver: false,
      noticeRecovery: false,
      sortDate: row.lastWorkingDate,
    }));
    return [...resignationCases, ...terminationCases].sort((a, b) => {
      const rank = STAGE_RANK[a.stage] - STAGE_RANK[b.stage];
      if (rank !== 0) return rank;
      return a.sortDate.localeCompare(b.sortDate);
    });
  }, [resignations.data, terminations.data]);

  const counts = useMemo(() => {
    const tally: Record<EosStage, number> = { draft: 0, review: 0, approved: 0, completed: 0, closed: 0 };
    for (const row of cases) tally[row.stage] += 1;
    return tally;
  }, [cases]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cases.filter((row) => {
      if (stage !== "all" && row.stage !== stage) return false;
      if (!needle) return true;
      return [row.staffName, row.employeeCode, row.department, row.reason, row.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [cases, search, stage]);

  useEffect(() => {
    if (pendingKey.current) {
      if (cases.some((row) => row.key === pendingKey.current)) pendingKey.current = null;
      else return;
    }
    if (!filtered.length) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey((current) =>
      current && filtered.some((row) => row.key === current) ? current : filtered[0]!.key,
    );
  }, [filtered, cases]);

  const selected = filtered.find((row) => row.key === selectedKey) ?? null;
  const loading = resignations.isLoading || terminations.isLoading;
  const partialError = resignations.isError || terminations.isError;

  return (
    <CapabilityGate capability="hr.manage" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={Scale}
          kicker={t("hrWorkspace.eos.kicker")}
          title={t("hrWorkspace.eos.title")}
          subtitle={t("hrWorkspace.eos.subtitle")}
        >
          {canCreate ? (
            <div className="flex sm:justify-end">
              <Button type="button" className="w-full sm:w-auto" onClick={() => setComposerOpen(true)}>
                {t("hrWorkspace.eos.newCase")}
              </Button>
            </div>
          ) : null}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="cases">{t("hrWorkspace.eos.tabs.cases")}</TabsTrigger>
              <TabsTrigger value="rules">{t("hrWorkspace.eos.tabs.rules")}</TabsTrigger>
            </TabsList>

            <TabsContent value="cases" className="space-y-4">
              <p className="max-w-3xl text-sm text-muted-foreground">{t("hrWorkspace.eos.stageNote")}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("hrWorkspace.eos.stagesLabel")}>
                <StageChip
                  pressed={stage === "all"}
                  label={t("hrWorkspace.eos.allStages")}
                  count={cases.length}
                  onClick={() => setStage("all")}
                />
                {(["draft", "review", "approved", "completed", "closed"] as const).map((key) => (
                  <StageChip
                    key={key}
                    pressed={stage === key}
                    label={t(`hrWorkspace.eos.stages.${key}`)}
                    count={counts[key]}
                    onClick={() => setStage(key)}
                  />
                ))}
              </div>

              <div className="max-w-md">
                <Label htmlFor="eos-search" className="sr-only">
                  {t("hrWorkspace.eos.search")}
                </Label>
                <Input
                  id="eos-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("hrWorkspace.eos.search")}
                  className="min-w-0"
                />
              </div>

              {partialError ? (
                <p className="text-sm text-destructive">{t("hrWorkspace.eos.loadPartial")}</p>
              ) : null}

              {loading ? (
                <FecLoader label={t("common.loading")} />
              ) : cases.length === 0 ? (
                <HrPanel className="px-4 py-2">
                  <HrEmptyState message={t("hrWorkspace.eos.empty")} hint={t("hrWorkspace.eos.emptyHint")} icon={Scale} />
                  {canCreate ? (
                    <div className="flex justify-center pb-6">
                      <Button type="button" onClick={() => setComposerOpen(true)}>
                        {t("hrWorkspace.eos.newCase")}
                      </Button>
                    </div>
                  ) : null}
                </HrPanel>
              ) : filtered.length === 0 ? (
                <HrEmptyState message={t("hrWorkspace.eos.emptyFiltered")} icon={Scale} />
              ) : (
                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                  <ul className="order-2 min-w-0 space-y-2 lg:order-1">
                    {filtered.map((row) => (
                      <li key={row.key}>
                        <button
                          type="button"
                          className={`hr-list-row w-full min-w-0 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                            row.key === selectedKey ? "bg-secondary" : ""
                          }`}
                          aria-pressed={row.key === selectedKey}
                          onClick={() => setSelectedKey(row.key)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{row.staffName ?? t("hrWorkspace.unknownStaff")}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[
                                row.employeeCode,
                                row.department,
                                row.lastWorkingDate,
                                t(`hrWorkspace.eos.kind.${row.kind}`),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <Badge variant={stageVariant(row.stage)}>
                            {t(`hrWorkspace.eos.status.${row.kind}.${row.status}`, { defaultValue: row.status })}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {selected ? (
                    <CaseDetail
                      row={selected}
                      canResign={canResign}
                      canClear={canResign || canInitiate}
                      canApproveTermination={canApproveTermination}
                      onChanged={invalidate}
                    />
                  ) : null}
                </div>
              )}
            </TabsContent>

            <TabsContent value="rules">
              <RulesPanel />
            </TabsContent>
          </Tabs>
        </HrSection>
        <NewSeparationDialog
          open={composerOpen}
          onOpenChange={setComposerOpen}
          canResign={canResign}
          canInitiate={canInitiate}
            onCreated={(key) => {
            pendingKey.current = key;
            invalidate();
            setTab("cases");
            setStage("all");
            setSearch("");
            setSelectedKey(key);
          }}
        />
      </HrShell>
    </CapabilityGate>
  );
}

function StageChip({
  pressed,
  label,
  count,
  onClick,
}: {
  pressed: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button type="button" size="sm" variant={pressed ? "default" : "outline"} aria-pressed={pressed} onClick={onClick}>
      {label}
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}

function CaseDetail({
  row,
  canResign,
  canClear,
  canApproveTermination,
  onChanged,
}: {
  row: EosCase;
  canResign: boolean;
  canClear: boolean;
  canApproveTermination: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const clearance = useQuery({
    queryKey: queryKeys.people.hrClearance(
      row.kind === "resignation" ? { resignationId: row.id } : { terminationId: row.id },
    ),
    queryFn: () =>
      row.kind === "resignation"
        ? listClearanceItems({ resignationId: row.id })
        : listClearanceItems({ terminationId: row.id }),
    staleTime: STALE.people,
  });
  const remaining = clearance.data ? clearance.data.filter((item) => !item.completed).length : null;
  const action = eosNextAction({
    kind: row.kind,
    status: row.status,
    assetClearance: row.assetClearance,
    deptClearance: row.deptClearance,
    financeClearance: row.financeClearance,
    clearanceRemaining: remaining,
  });
  const lines = settlementLines(row.finalSettlementStub);

  const approveResign = useMutation({
    mutationFn: () => approveResignation({ resignationId: row.id, approveNoticeOverride: true }),
    onSuccess: () => {
      toast.success(t("hr.resignations.approved"));
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const approveTerm = useMutation({
    mutationFn: () => approveTermination({ terminationId: row.id, slot: "auto" }),
    onSuccess: (result) => {
      toast.success(t("hr.terminations.partialApproved", { status: result.status }));
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const applyTerm = useMutation({
    mutationFn: () => applyTermination({ terminationId: row.id }),
    onSuccess: () => {
      toast.success(t("hr.terminations.applied"));
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const clearItem = useMutation({
    mutationFn: (itemId: string) => completeClearanceItem({ itemId, completed: true }),
    onSuccess: () => {
      toast.success(t("hr.resignations.clearanceItem"));
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const category = row.employmentCategory
    ? t(`hrWorkspace.eos.category.${row.employmentCategory}`, { defaultValue: row.employmentCategory })
    : null;

  return (
    <HrPanel className="order-1 min-w-0 space-y-4 p-4 lg:order-2">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-base font-semibold">{row.staffName ?? t("hrWorkspace.unknownStaff")}</p>
        <p className="text-sm text-muted-foreground">
          {[row.employeeCode, row.department || t("hrWorkspace.eos.noDepartment"), category]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="outline">{t(`hrWorkspace.eos.kind.${row.kind}`)}</Badge>
          <Badge variant={stageVariant(row.stage)}>
            {t(`hrWorkspace.eos.status.${row.kind}.${row.status}`, { defaultValue: row.status })}
          </Badge>
          {row.noticeOverride ? <Badge variant="warning">{t("hrWorkspace.eos.noticeOverride")}</Badge> : null}
        </div>
      </div>

      <div className="hr-notice">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold">{t("hrWorkspace.eos.nextTitle")}</p>
          <p className="text-sm">{t(`hrWorkspace.eos.next.${action}`)}</p>
          <NextActionButton
            action={action}
            canResign={canResign}
            canApproveTermination={canApproveTermination}
            pending={approveResign.isPending || approveTerm.isPending || applyTerm.isPending}
            onApproveResignation={() => approveResign.mutate()}
            onApproveTermination={() => approveTerm.mutate()}
            onApply={() => applyTerm.mutate()}
          />
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {row.submittedOn ? <Fact label={t("hrWorkspace.eos.submittedOn")} value={row.submittedOn} /> : null}
        {row.effectiveOn ? <Fact label={t("hrWorkspace.eos.effectiveOn")} value={row.effectiveOn} /> : null}
        {row.proposedLwd ? <Fact label={t("hrWorkspace.eos.proposedLwd")} value={row.proposedLwd} /> : null}
        {row.approvedLwd ? <Fact label={t("hrWorkspace.eos.approvedLwd")} value={row.approvedLwd} /> : null}
        {row.kind === "termination" && row.lastWorkingDate ? (
          <Fact label={t("hrWorkspace.eos.lwd")} value={row.lastWorkingDate} />
        ) : null}
        {row.releasingDate ? <Fact label={t("hrWorkspace.eos.releasing")} value={row.releasingDate} /> : null}
        {row.requiredNoticeDays != null ? (
          <Fact
            label={t("hr.resignations.requiredNotice")}
            value={t("hrWorkspace.eos.noticeLine", {
              required: row.requiredNoticeDays,
              suggested: row.suggestedNoticeDays ?? row.requiredNoticeDays,
            })}
          />
        ) : null}
        {row.lengthOfServiceDays != null ? (
          <Fact
            label={t("hrWorkspace.eos.service")}
            value={t("hrWorkspace.eos.serviceDays", { count: row.lengthOfServiceDays })}
          />
        ) : null}
        {row.terminationType ? (
          <Fact
            label={t("hr.terminations.type")}
            value={t(`hr.terminations.types.${row.terminationType}`, { defaultValue: row.terminationType })}
          />
        ) : null}
        {row.noticeTreatment ? (
          <Fact
            label={t("hrWorkspace.eos.notice")}
            value={t(`hrWorkspace.eos.noticeTreatment.${row.noticeTreatment}`, {
              defaultValue: row.noticeTreatment,
            })}
          />
        ) : null}
      </div>

      {row.reason ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("hrWorkspace.eos.reason")}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{row.reason}</p>
        </div>
      ) : null}
      {row.handoverNotes ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("hrWorkspace.eos.handover")}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{row.handoverNotes}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{row.assetClearance ? t("hrWorkspace.eos.assetsCleared") : t("hrWorkspace.eos.assetsOpen")}</span>
        <span>·</span>
        <span>{row.deptClearance ? t("hrWorkspace.eos.deptCleared") : t("hrWorkspace.eos.deptOpen")}</span>
        <span>·</span>
        <span>{row.financeClearance ? t("hrWorkspace.eos.financeCleared") : t("hrWorkspace.eos.financeOpen")}</span>
        {row.airTicketEligible ? <span>· {t("hrWorkspace.eos.airTicket")}</span> : null}
        {row.noticeWaiver ? <span>· {t("hrWorkspace.eos.waiver")}</span> : null}
        {row.noticeRecovery ? <span>· {t("hrWorkspace.eos.recovery")}</span> : null}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t("hrWorkspace.eos.clearanceTitle")}</h2>
        {clearance.isLoading ? (
          <FecLoader label={t("common.loading")} />
        ) : clearance.isError ? (
          <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
        ) : (clearance.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hrWorkspace.eos.clearanceEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {(clearance.data ?? []).map((item) => {
              const seedKey = SEED_ORDER.get(item.label);
              const label = seedKey ? t(`hrWorkspace.eos.seed.${seedKey}`, { defaultValue: item.label }) : item.label;
              return (
                <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words">
                    {label}
                    {item.department ? <span className="text-muted-foreground"> · {item.department}</span> : null}
                  </span>
                  {item.completed ? (
                    <Badge variant="success">{t("hrWorkspace.eos.done")}</Badge>
                  ) : canClear ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={clearItem.isPending}
                      onClick={() => clearItem.mutate(item.id)}
                    >
                      {t("hrWorkspace.eos.markDone")}
                    </Button>
                  ) : (
                    <Badge variant="muted">{t("hrWorkspace.eos.stages.review")}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t("hrWorkspace.eos.settlementTitle")}</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hrWorkspace.eos.noStub")}</p>
        ) : (
          <div className="grid gap-2 text-sm">
            {lines.map((line) => (
              <div key={line.key} className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                <span className="text-muted-foreground">
                  {line.known
                    ? t(`hrWorkspace.eos.settlement.${line.key}`)
                    : line.key.replace(/_/g, " ")}
                </span>
                <span className="font-medium tabular-nums">
                  {line.value === "yes"
                    ? t("hrWorkspace.eos.yes")
                    : line.value === "no"
                      ? t("hrWorkspace.eos.no")
                      : line.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {row.letterDocumentId ? (
        <p className="text-sm text-muted-foreground">{t("hrWorkspace.eos.letterFiled")}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/people/hr/resignations">{t("hrWorkspace.eos.openResignations")}</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/people/hr/terminations">{t("hrWorkspace.eos.openTerminations")}</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/people/hr/letters">{t("hrWorkspace.eos.openLetters")}</Link>
        </Button>
      </div>
    </HrPanel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value}</p>
    </div>
  );
}

function NextActionButton({
  action,
  canResign,
  canApproveTermination,
  pending,
  onApproveResignation,
  onApproveTermination,
  onApply,
}: {
  action: EosNextAction;
  canResign: boolean;
  canApproveTermination: boolean;
  pending: boolean;
  onApproveResignation: () => void;
  onApproveTermination: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  if ((action === "approve_resignation" || action === "approve_notice_override") && canResign) {
    return (
      <Button type="button" size="sm" disabled={pending} onClick={onApproveResignation}>
        {pending ? t("common.saving") : t("hrWorkspace.eos.approveLwd")}
      </Button>
    );
  }
  if (
    (action === "review_draft_termination" ||
      action === "approve_termination_hr" ||
      action === "approve_termination_exec") &&
    canApproveTermination
  ) {
    return (
      <Button type="button" size="sm" disabled={pending} onClick={onApproveTermination}>
        {pending ? t("common.saving") : t("hrWorkspace.eos.recordApproval")}
      </Button>
    );
  }
  if (action === "apply_termination" && canApproveTermination) {
    return (
      <Button type="button" size="sm" disabled={pending} onClick={onApply}>
        {pending ? t("common.saving") : t("hrWorkspace.eos.apply")}
      </Button>
    );
  }
  if (action === "submit_resignation" || action === "await_serving_notice") {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/people/hr/resignations">{t("hrWorkspace.eos.openResignationsAction")}</Link>
      </Button>
    );
  }
  return null;
}

function RulesPanel() {
  const { t } = useTranslation();
  const policy = useQuery({
    queryKey: queryKeys.people.hrPolicySettings(),
    queryFn: () => listHrPolicySettings(),
    staleTime: STALE.people,
  });
  const noticeValues =
    policy.data?.sections.find((section) => section.section === "notice")?.values ?? HR_POLICY_DEFAULTS.notice;
  const rows = noticeRuleRows(noticeValues as Record<string, unknown>);

  return (
    <div className="grid min-w-0 gap-4">
      <HrPanel className="space-y-3 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("hrWorkspace.eos.rules.noticeTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("hrWorkspace.eos.rules.noticeBody")}</p>
          {policy.isError ? (
            <p className="text-sm text-muted-foreground">{t("hrWorkspace.eos.rules.noticeFallback")}</p>
          ) : null}
        </div>
        {policy.isLoading ? (
          <FecLoader label={t("common.loading")} />
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((row) => (
              <li key={row.key} className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0 break-words">{t(`hrWorkspace.eos.noticeRules.${row.key}`)}</span>
                <span className="text-muted-foreground">
                  {t("hrWorkspace.eos.rules.days", { count: row.days })}
                  {" · "}
                  {row.contractual
                    ? t("hrWorkspace.eos.rules.contractual")
                    : t("hrWorkspace.eos.rules.notContractual")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href="/people/hr/settings">{t("hrWorkspace.eos.openSettings")}</Link>
        </Button>
      </HrPanel>

      <HrPanel className="space-y-3 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("hrWorkspace.eos.rules.clearanceTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("hrWorkspace.eos.rules.clearanceBody")}</p>
        </div>
        <ol className="space-y-2 text-sm">
          {DEFAULT_CLEARANCE_SEED.map((item) => (
            <li key={item.sortOrder} className="flex min-w-0 flex-wrap justify-between gap-2">
              <span>{t(`hrWorkspace.eos.seed.${item.sortOrder}`)}</span>
              <span className="text-muted-foreground">{item.department}</span>
            </li>
          ))}
        </ol>
      </HrPanel>

      <HrPanel className="space-y-3 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("hrWorkspace.eos.rules.docsTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("hrWorkspace.eos.rules.docsBody")}</p>
        </div>
        <ul className="space-y-2 text-sm">
          <li>{t("hrWorkspace.eos.rules.docResignation")}</li>
          <li>{t("hrWorkspace.eos.rules.docTermination")}</li>
          <li>{t("hrWorkspace.eos.rules.docSettlement")}</li>
        </ul>
        <Button variant="outline" size="sm" asChild>
          <Link href="/people/hr/letters">{t("hrWorkspace.eos.openLetters")}</Link>
        </Button>
      </HrPanel>
    </div>
  );
}

function NewSeparationDialog({
  open,
  onOpenChange,
  canResign,
  canInitiate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canResign: boolean;
  canInitiate: boolean;
  onCreated: (key: string) => void;
}) {
  const { t } = useTranslation();
  const wasOpen = useRef(false);
  const [kind, setKind] = useState<EosKind>(canResign ? "resignation" : "termination");
  const [staffId, setStaffId] = useState("");
  const [reason, setReason] = useState("");
  const [requiredNotice, setRequiredNotice] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [proposedLwd, setProposedLwd] = useState("");
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [termType, setTermType] = useState<(typeof HR_TERMINATION_TYPES)[number]>("with_notice");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [lwd, setLwd] = useState("");
  const [letterKey, setLetterKey] = useState(0);

  useEffect(() => {
    if (open && !wasOpen.current) setKind(canResign ? "resignation" : "termination");
    wasOpen.current = open;
  }, [open, canResign]);

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff-picker-eos" }),
    queryFn: () => listStaffForLeaveBalances(),
    enabled: open,
    staleTime: STALE.people,
  });
  const suggestion = useQuery({
    queryKey: queryKeys.people.hrResignations({ view: "eos-suggest", staffId }),
    queryFn: () => suggestNoticeForStaff({ staffId }),
    enabled: open && kind === "resignation" && Boolean(staffId),
    staleTime: STALE.people,
  });

  const reset = () => {
    setReason("");
    setRequiredNotice("");
    setOverrideReason("");
    setProposedLwd("");
    setLetterFile(null);
    setLetterKey((current) => current + 1);
    setEffectiveOn("");
    setLwd("");
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!staffId || !reason.trim()) {
        throw new Error(
          kind === "resignation" ? t("hr.resignations.formRequired") : t("hr.terminations.formRequired"),
        );
      }
      if (kind === "termination" && (!effectiveOn || !lwd)) {
        throw new Error(t("hr.terminations.formRequired"));
      }
      const required = requiredNotice.trim() ? Number(requiredNotice) : null;
      if (
        kind === "resignation" &&
        required != null &&
        suggestion.data &&
        required !== suggestion.data.suggestedDays &&
        !overrideReason.trim()
      ) {
        throw new Error(t("hrWorkspace.eos.form.overrideRequired"));
      }
      let documentId: string | null = null;
      if (letterFile) {
        const contentBase64 = await fileToBase64(letterFile);
        const uploaded = await uploadEmployeeDocument({
          staffId,
          docType: kind === "resignation" ? "resignation_letter" : "termination_letter",
          filename: letterFile.name,
          data_base64: contentBase64,
          content_type: letterFile.type || "application/pdf",
          title: letterFile.name,
        });
        documentId = uploaded.id;
      }
      if (kind === "resignation") {
        const row = await submitResignation({
          staffId,
          reason: reason.trim(),
          letterDocumentId: documentId,
          requiredNoticeDays: required,
          noticeOverrideReason: overrideReason.trim() || null,
          proposedLwd: proposedLwd || null,
        });
        return { key: `resignation:${row.id}`, override: row.noticeOverride };
      }
      const row = await initiateTermination({
        staffId,
        terminationType: termType,
        reason: reason.trim(),
        effectiveOn,
        lastWorkingDate: lwd,
        supportingDocumentId: documentId,
      });
      return { key: `termination:${row.id}`, override: false };
    },
    onSuccess: (result) => {
      toast.success(
        kind === "resignation"
          ? result.override
            ? t("hr.resignations.submittedOverride")
            : t("hr.resignations.submitted")
          : t("hr.terminations.initiated"),
      );
      reset();
      onOpenChange(false);
      onCreated(result.key);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const noticeDiffers =
    kind === "resignation" &&
    requiredNotice.trim() !== "" &&
    suggestion.data != null &&
    Number(requiredNotice) !== suggestion.data.suggestedDays;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85vh,40rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hrWorkspace.eos.form.title")}</DialogTitle>
          <DialogDescription>{t("hrWorkspace.eos.form.body")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-3">
          <div className="space-y-1">
            <Label>{t("hrWorkspace.eos.form.kind")}</Label>
            <div className="flex flex-wrap gap-2">
              {canResign ? (
                <Button type="button" size="sm" variant={kind === "resignation" ? "default" : "outline"} onClick={() => setKind("resignation")}>
                  {t("hrWorkspace.eos.kind.resignation")}
                </Button>
              ) : null}
              {canInitiate ? (
                <Button type="button" size="sm" variant={kind === "termination" ? "default" : "outline"} onClick={() => setKind("termination")}>
                  {t("hrWorkspace.eos.kind.termination")}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("hrWorkspace.eos.form.staff")}</Label>
            <SearchableSelect
              value={staffId}
              onValueChange={setStaffId}
              placeholder={t("hrWorkspace.eos.form.pickStaff")}
              emptyOption={{ value: "", label: t("hrWorkspace.eos.form.pickStaff") }}
              options={(staffOptions.data ?? []).map((person) => ({
                value: person.id,
                label: person.name,
                description: person.employeeCode ?? undefined,
              }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="eos-reason">{t("hrWorkspace.eos.form.reason")}</Label>
            <Textarea id="eos-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
            <p className="text-xs text-muted-foreground">{t("hrWorkspace.eos.form.reasonHint")}</p>
          </div>
          {kind === "resignation" ? (
            <>
              {suggestion.data ? (
                <p className="text-sm text-muted-foreground">
                  {t("hrWorkspace.eos.form.suggested", {
                    days: suggestion.data.suggestedDays,
                    band: t(`hrWorkspace.eos.noticeRules.${suggestion.data.band}_days`, {
                      defaultValue: suggestion.data.band.replace(/_/g, " "),
                    }),
                  })}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="eos-notice">{t("hrWorkspace.eos.form.requiredNotice")}</Label>
                  <Input
                    id="eos-notice"
                    inputMode="numeric"
                    value={requiredNotice}
                    onChange={(event) => setRequiredNotice(event.target.value)}
                    placeholder={suggestion.data ? String(suggestion.data.suggestedDays) : ""}
                    className="min-w-0"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eos-lwd-proposed">{t("hrWorkspace.eos.form.proposedLwd")}</Label>
                  <Input
                    id="eos-lwd-proposed"
                    type="date"
                    value={proposedLwd}
                    onChange={(event) => setProposedLwd(event.target.value)}
                    className="min-w-0"
                  />
                </div>
              </div>
              {noticeDiffers ? (
                <div className="space-y-1">
                  <Label htmlFor="eos-override">{t("hrWorkspace.eos.form.overrideReason")}</Label>
                  <Input
                    id="eos-override"
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    className="min-w-0"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label>{t("hrWorkspace.eos.form.type")}</Label>
                <SearchableSelect
                  value={termType}
                  onValueChange={(value) => setTermType(value as (typeof HR_TERMINATION_TYPES)[number])}
                  options={HR_TERMINATION_TYPES.map((type) => ({
                    value: type,
                    label: t(`hr.terminations.types.${type}`),
                  }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="eos-effective">{t("hrWorkspace.eos.form.effectiveOn")}</Label>
                  <Input
                    id="eos-effective"
                    type="date"
                    value={effectiveOn}
                    onChange={(event) => setEffectiveOn(event.target.value)}
                    className="min-w-0"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eos-lwd">{t("hrWorkspace.eos.form.lwd")}</Label>
                  <Input id="eos-lwd" type="date" value={lwd} onChange={(event) => setLwd(event.target.value)} className="min-w-0" />
                </div>
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="eos-letter">{t("hrWorkspace.eos.form.letter")}</Label>
            <Input
              id="eos-letter"
              key={letterKey}
              type="file"
              className="min-w-0"
              onChange={(event) => setLetterFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending
              ? t("common.saving")
              : kind === "resignation"
                ? t("hrWorkspace.eos.form.submitResignation")
                : t("hrWorkspace.eos.form.submitTermination")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Denied() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <HrPanel>
        <HrEmptyState message={t("hr.dashboard.noAccess")} />
      </HrPanel>
    </HrShell>
  );
}
