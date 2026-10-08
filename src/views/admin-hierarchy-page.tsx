"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { OrgHierarchyBoard } from "@/components/admin/org-hierarchy-board";
import { OrgLoginTree, type IssuedStaffLogin } from "@/components/admin/org-login-tree";
import { HrShell } from "@/components/hr/hr-shell";
import { HrSection } from "@/components/hr/hr-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import {
  applyOrgChartMove,
  getOrgChart,
  placeOrgChartPerson,
  removeOrgChartPerson,
  type OrgChartView,
} from "@/lib/admin-hierarchy.functions";
import { provisionStaffLogin } from "@/lib/admin.functions";
import { hierarchyAccessMode, staffProfileOpenIds, type HierarchyAccessMode } from "@/lib/hierarchy-access";
import {
  groupOrgChart,
  planOrgChartMove,
  reportCandidateIds,
  reportingDrop,
  reportLikeOthersPlacement,
  suggestedOrgMoveMode,
  type OrgChartMoveMode,
  type OrgChartSnapshot,
} from "@/lib/org-hierarchy";
import { queryKeys } from "@/lib/query-keys";

function Forbidden() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t("hr.hierarchy.noAccess")}
      </div>
    </HrShell>
  );
}

export default function AdminHierarchyPage() {
  const { t } = useTranslation();
  const { roles, rolesSettled } = useAuth();
  const reports = useHasDirectReports();
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  if (!rolesSettled || (maxLevel < 95 && reports.isPending)) {
    return (
      <HrShell>
        <p className="text-sm text-muted-foreground">{t("hr.hierarchy.loading")}</p>
      </HrShell>
    );
  }
  if (maxLevel < 95 && reports.isError) {
    return (
      <HrShell>
        <p className="text-sm text-destructive">{t("hr.hierarchy.loadError")}</p>
      </HrShell>
    );
  }
  const mode = hierarchyAccessMode({
    maxRoleLevel: maxLevel,
    directReportCount: reports.data?.directReportStaffIds.length ?? 0,
  });
  if (mode === "none") return <Forbidden />;
  return (
    <HrShell>
      <HierarchyEditor accessMode={mode} />
    </HrShell>
  );
}

function HierarchyEditor({ accessMode }: { accessMode: Exclude<HierarchyAccessMode, "none"> }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const keepView = (snapshot: OrgChartSnapshot): OrgChartView => {
    const current = qc.getQueryData<OrgChartView>(queryKeys.admin.hierarchy());
    return {
      ...snapshot,
      access: current?.access ?? accessMode,
      viewerStaffId: current?.viewerStaffId ?? null,
      directReportStaffIds: current?.directReportStaffIds ?? [],
    };
  };
  const [view, setView] = useState<"chart" | "logins">("logins");
  const [issued, setIssued] = useState<Record<string, IssuedStaffLogin>>({});
  const query = useQuery({
    queryKey: queryKeys.admin.hierarchy(),
    queryFn: () => getOrgChart(),
  });
  const readOnly = (query.data?.access ?? accessMode) !== "edit";
  const [pending, setPending] = useState<{ staffId: string; targetStaffId: string } | null>(null);
  const [mode, setMode] = useState<OrgChartMoveMode>("reports-to");
  const [chosen, setChosen] = useState<string[]>([]);
  const [designation, setDesignation] = useState("");
  const place = useMutation({
    mutationFn: (input: { staffId: string; managerStaffId: string | null }) => placeOrgChartPerson(input),
    onSuccess: (snapshot, variables) => {
      qc.setQueryData(queryKeys.admin.hierarchy(), keepView(snapshot));
      const manager = snapshot.people.find((person) => person.staffId === variables.managerStaffId);
      const person = snapshot.people.find((row) => row.staffId === variables.staffId);
      const name = person?.fullName ?? t("hr.hierarchy.unknownPerson");
      if (!variables.managerStaffId) {
        toast.success(t("hr.hierarchy.placedTop", { name }));
        return;
      }
      toast.success(
        t("hr.hierarchy.placedUnder", {
          name,
          manager: manager?.fullName ?? t("hr.hierarchy.unknownManager"),
        }),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const move = useMutation({
    mutationFn: (input: {
      staffId: string;
      targetStaffId: string;
      mode: OrgChartMoveMode;
      reportStaffIds?: string[];
      jobTitle?: string;
    }) => applyOrgChartMove(input),
    onSuccess: (snapshot, variables) => {
      qc.setQueryData(queryKeys.admin.hierarchy(), keepView(snapshot));
      const person = snapshot.people.find((row) => row.staffId === variables.staffId);
      const manager = snapshot.people.find((row) => row.staffId === variables.targetStaffId);
      const name = person?.fullName ?? t("hr.hierarchy.unknownPerson");
      const managerName = manager?.fullName ?? t("hr.hierarchy.unknownManager");
      if (variables.mode === "takes-reports") {
        toast.success(t("hr.hierarchy.reportsMoved", { name, count: variables.reportStaffIds?.length ?? 0 }));
      } else if (variables.mode === "same-manager") {
        const nextManager = snapshot.people.find((row) => row.staffId === person?.reportingManagerStaffId);
        toast.success(
          t("hr.hierarchy.reportedLikeOthers", {
            name,
            manager: nextManager?.fullName ?? t("hr.hierarchy.unknownManager"),
          }),
        );
      } else if (variables.mode === "insert-between") {
        const aboveId = person?.reportingManagerStaffId;
        const above = snapshot.people.find((row) => row.staffId === aboveId);
        const leafInsert = manager?.reportingManagerStaffId === variables.staffId && aboveId !== variables.targetStaffId;
        toast.success(
          leafInsert
            ? t("hr.hierarchy.insertedAbove", {
                name,
                manager: above?.fullName ?? t("hr.hierarchy.unknownManager"),
                target: managerName,
              })
            : t("hr.hierarchy.inserted", { name, manager: managerName }),
        );
      } else if (variables.jobTitle && person?.jobTitle === variables.jobTitle && variables.mode === "reports-to") {
        const moved = person.reportingManagerStaffId === variables.targetStaffId;
        toast.success(
          moved
            ? t("hr.hierarchy.placedUnder", { name, manager: managerName })
            : t("hr.hierarchy.titleSaved", { name }),
        );
      } else {
        toast.success(t("hr.hierarchy.placedUnder", { name, manager: managerName }));
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (input: { staffId: string }) => removeOrgChartPerson(input),
    onSuccess: (snapshot) => {
      qc.setQueryData(queryKeys.admin.hierarchy(), keepView(snapshot));
      toast.success(t("hr.hierarchy.removed"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createLogin = useMutation({
    mutationFn: async (staffId: string) => {
      const result = await provisionStaffLogin({ staffId });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (result, staffId) => {
      setIssued((current) => ({
        ...current,
        [staffId]: {
          email: result.email ?? "",
          password: result.password,
          linkedExisting: result.linkedExisting,
        },
      }));
      qc.setQueryData(queryKeys.admin.hierarchy(), (current: OrgChartSnapshot | undefined) => {
        if (!current) return current;
        return {
          ...current,
          people: current.people.map((person) =>
            person.staffId === staffId ? { ...person, loginLinked: true, loginEmail: result.email } : person,
          ),
        };
      });
      toast.success(
        result.linkedExisting && !result.password
          ? t("people.profile.login.linkedExisting")
          : t("people.profile.login.created"),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saving = place.isPending || move.isPending || remove.isPending;

  const onPlace = (staffId: string, managerStaffId: string | null) => {
    const snapshot = query.data;
    if (!snapshot || saving) return;
    if (managerStaffId) {
      if (staffId === managerStaffId) {
        toast.error(t("hr.hierarchy.selfReport"));
        return;
      }
      const person = snapshot.people.find((row) => row.staffId === staffId);
      if (!person) return;
      const managers = new Map(snapshot.people.map((row) => [row.staffId, row.reportingManagerStaffId]));
      setMode(suggestedOrgMoveMode(managers, staffId, managerStaffId));
      setChosen([]);
      setDesignation(person.jobTitle ?? "");
      setPending({ staffId, targetStaffId: managerStaffId });
      return;
    }
    const managers = new Map(snapshot.people.map((person) => [person.staffId, person.reportingManagerStaffId]));
    const drop = reportingDrop(managers, staffId, null);
    if (!drop.ok) {
      toast.error(t("hr.hierarchy.selfReport"));
      return;
    }
    const person = snapshot.people.find((row) => row.staffId === staffId);
    if (!person) return;
    const onChart = groupOrgChart(snapshot.people).onChart;
    const unchanged = person.reportingManagerStaffId === null && (person.orgChartPlaced || onChart.has(person.staffId));
    if (unchanged) return;
    const previous = snapshot;
    qc.setQueryData(queryKeys.admin.hierarchy(), {
      ...snapshot,
      people: snapshot.people.map((row) =>
        row.staffId === staffId ? { ...row, reportingManagerStaffId: null, orgChartPlaced: true } : row,
      ),
    });
    place.mutate(
      { staffId, managerStaffId: null },
      { onError: () => qc.setQueryData(queryKeys.admin.hierarchy(), previous) },
    );
  };

  const snapshot = query.data;
  const dragged = snapshot?.people.find((row) => row.staffId === pending?.staffId);
  const target = snapshot?.people.find((row) => row.staffId === pending?.targetStaffId);
  const managers = new Map(snapshot?.people.map((person) => [person.staffId, person.reportingManagerStaffId]) ?? []);
  const directReports =
    snapshot && pending
      ? snapshot.people
          .filter((row) => row.reportingManagerStaffId === pending.targetStaffId && row.staffId !== pending.staffId)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      : [];
  const candidateIds =
    pending && snapshot ? reportCandidateIds(managers, pending.staffId, pending.targetStaffId) : [];
  const reportChoices = candidateIds
    .map((staffId) => snapshot?.people.find((row) => row.staffId === staffId))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const targetManager = snapshot?.people.find((row) => row.staffId === target?.reportingManagerStaffId);
  const placement =
    pending && snapshot ? reportLikeOthersPlacement(managers, pending.staffId, pending.targetStaffId) : null;
  const lineManager = snapshot?.people.find((row) => row.staffId === placement?.managerStaffId);
  const lineManagerName = lineManager?.fullName ?? t("hr.hierarchy.unknownManager");
  const suggestedMode =
    pending && snapshot ? suggestedOrgMoveMode(managers, pending.staffId, pending.targetStaffId) : "reports-to";
  const reportsToDrop = pending ? reportingDrop(managers, pending.staffId, pending.targetStaffId) : null;
  const reportsToBlocked = Boolean(reportsToDrop && !reportsToDrop.ok);
  const insertUnavailable = Boolean(pending) && directReports.length === 0 && !target?.reportingManagerStaffId;
  const insertPlan =
    pending && snapshot
      ? planOrgChartMove(managers, {
          staffId: pending.staffId,
          targetStaffId: pending.targetStaffId,
          mode: "insert-between",
        })
      : null;
  const insertBlocked = Boolean(insertPlan && !insertPlan.ok && (insertPlan.reason === "self" || insertPlan.reason === "cycle"));
  const likeOthersChoice = placement ? (
    <div className="space-y-1">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="org-move"
          className="mt-1"
          checked={mode === "same-manager"}
          onChange={() => setMode("same-manager")}
        />
        <span>{t("hr.hierarchy.reportLikeOthers")}</span>
      </label>
      {mode === "same-manager" ? (
        <p className="ms-6 text-xs text-muted-foreground">
          {t("hr.hierarchy.reportLikeOthersHint", {
            name: dragged?.fullName ?? "",
            manager: lineManagerName,
          })}
        </p>
      ) : null}
    </div>
  ) : null;

  const applyMove = () => {
    if (!pending || !snapshot || !dragged || saving) return;
    const managers = new Map(snapshot.people.map((person) => [person.staffId, person.reportingManagerStaffId]));
    const plan = planOrgChartMove(managers, {
      staffId: pending.staffId,
      targetStaffId: pending.targetStaffId,
      mode,
      reportStaffIds: chosen,
    });
    const nextTitle = designation.trim();
    const titleChange = nextTitle.length > 0 && nextTitle !== (dragged.jobTitle ?? "").trim();
    if (!plan.ok && !(plan.reason === "none" && titleChange)) {
      toast.error(
        plan.reason === "self"
          ? t("hr.hierarchy.selfReport")
          : plan.reason === "cycle"
            ? t("hr.hierarchy.cycle")
            : t("hr.hierarchy.nothingToChange"),
      );
      return;
    }
    const updates = plan.ok ? plan.updates : [];
    if (!updates.length && !titleChange) {
      toast.error(t("hr.hierarchy.nothingToChange"));
      return;
    }
    const byId = new Map(updates.map((update) => [update.staffId, update.managerStaffId]));
    const previous = snapshot;
    qc.setQueryData(queryKeys.admin.hierarchy(), {
      ...snapshot,
      people: snapshot.people.map((row) => {
        const managerStaffId = byId.get(row.staffId);
        const next = managerStaffId === undefined ? row : { ...row, reportingManagerStaffId: managerStaffId, orgChartPlaced: true };
        return row.staffId === pending.staffId && titleChange ? { ...next, jobTitle: nextTitle } : next;
      }),
    });
    const request = { ...pending, mode, reportStaffIds: chosen, jobTitle: titleChange ? nextTitle : undefined };
    setPending(null);
    move.mutate(request, { onError: () => qc.setQueryData(queryKeys.admin.hierarchy(), previous) });
  };

  return (
    <HrSection
      icon={Network}
      kicker={t("hr.hierarchy.kicker")}
      title={t("nav.operationsHierarchy")}
      subtitle={t(readOnly ? "hr.hierarchy.teamSubtitle" : "hr.hierarchy.subtitle")}
    >
      <div className="flex flex-col items-start gap-3 pe-16">
        <Link href="/people/hr" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {t("hr.hierarchy.back")}
        </Link>
        <div className="flex rounded-xl border border-border/70 bg-card p-1">
          <button
            type="button"
            className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${view === "logins" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            aria-pressed={view === "logins"}
            onClick={() => setView("logins")}
          >
            {t("hr.hierarchy.viewLogins")}
          </button>
          <button
            type="button"
            className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${view === "chart" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            aria-pressed={view === "chart"}
            onClick={() => setView("chart")}
          >
            {t("hr.hierarchy.viewChart")}
          </button>
        </div>
      </div>

      {query.isLoading ? <p className="text-sm text-muted-foreground">{t("hr.hierarchy.loading")}</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : t("hr.hierarchy.loadError")}
        </p>
      ) : null}
      {query.data && view === "chart" ? (
        <OrgHierarchyBoard
          snapshot={query.data satisfies OrgChartSnapshot}
          saving={saving}
          readOnly={readOnly}
          onPlace={readOnly ? () => {} : onPlace}
          onRemove={(staffId) => {
            if (readOnly || saving) return;
            remove.mutate({ staffId });
          }}
        />
      ) : null}
      {query.data && view === "logins" ? (
        <OrgLoginTree
          people={query.data.people}
          creatingId={createLogin.isPending ? (createLogin.variables ?? null) : null}
          issued={issued}
          hint={readOnly ? t("hr.hierarchy.teamLoginHint") : undefined}
          createStaffIds={readOnly ? new Set(query.data.directReportStaffIds ?? []) : null}
          profileStaffIds={
            readOnly
              ? staffProfileOpenIds(
                  query.data.people,
                  query.data.viewerStaffId,
                  query.data.directReportStaffIds ?? [],
                )
              : null
          }
          onCreate={(staffId) => {
            if (readOnly && !(query.data?.directReportStaffIds ?? []).includes(staffId)) return;
            if (!createLogin.isPending) createLogin.mutate(staffId);
          }}
        />
      ) : null}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open && !saving) setPending(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.hierarchy.moveTitle", { name: dragged?.fullName ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("hr.hierarchy.moveHint", { name: dragged?.fullName ?? "", manager: target?.fullName ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-3">
            {suggestedMode === "same-manager" ? likeOthersChoice : null}
            <label className={`flex items-start gap-2 text-sm ${reportsToBlocked ? "opacity-50" : ""}`}>
              <input
                type="radio"
                name="org-move"
                className="mt-1"
                checked={mode === "reports-to"}
                disabled={reportsToBlocked}
                onChange={() => setMode("reports-to")}
              />
              <span>{t("hr.hierarchy.reportsTo")}</span>
            </label>
            {reportsToDrop && !reportsToDrop.ok ? (
              <p className="ms-6 text-xs text-muted-foreground">
                {reportsToDrop.reason === "self"
                  ? t("hr.hierarchy.selfReport")
                  : t("hr.hierarchy.reportsToBlocked", {
                      name: dragged?.fullName ?? "",
                      target: target?.fullName ?? "",
                    })}
              </p>
            ) : null}
            {suggestedMode !== "same-manager" ? likeOthersChoice : null}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="org-move"
                className="mt-1"
                checked={mode === "takes-reports"}
                disabled={reportChoices.length === 0}
                onChange={() => setMode("takes-reports")}
              />
              <span>{t("hr.hierarchy.takesReports")}</span>
            </label>
            {mode === "takes-reports" ? (
              <div className="ms-6 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {directReports.length > 0
                    ? t("hr.hierarchy.takesReportsHint", { name: dragged?.fullName ?? "", manager: target?.fullName ?? "" })
                    : t("hr.hierarchy.takesReportsPeers", { name: dragged?.fullName ?? "", target: target?.fullName ?? "" })}
                </p>
                {reportChoices.map((row) => (
                  <label key={row.staffId} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={chosen.includes(row.staffId)}
                      onCheckedChange={(value) => {
                        setChosen((current) =>
                          value === true ? [...current, row.staffId] : current.filter((id) => id !== row.staffId),
                        );
                      }}
                    />
                    <span>{row.fullName}</span>
                  </label>
                ))}
              </div>
            ) : null}
            <label className={`flex items-start gap-2 text-sm ${insertUnavailable || insertBlocked ? "opacity-50" : ""}`}>
              <input
                type="radio"
                name="org-move"
                className="mt-1"
                checked={mode === "insert-between"}
                disabled={insertUnavailable || insertBlocked}
                onChange={() => setMode("insert-between")}
              />
              <span>
                {directReports.length > 0
                  ? t("hr.hierarchy.teamLeader", { manager: target?.fullName ?? "" })
                  : t("hr.hierarchy.insertBetween")}
              </span>
            </label>
            {insertBlocked ? (
              <p className="ms-6 text-xs text-muted-foreground">
                {target?.reportingManagerStaffId === dragged?.staffId
                  ? t("hr.hierarchy.insertBetweenSelf", { name: dragged?.fullName ?? "", target: target?.fullName ?? "" })
                  : t("hr.hierarchy.cycle")}
              </p>
            ) : null}
            {mode === "insert-between" && !insertUnavailable && !insertBlocked ? (
              <p className="ms-6 text-xs text-muted-foreground">
                {directReports.length > 0
                  ? t("hr.hierarchy.insertBetweenHint", { name: dragged?.fullName ?? "", manager: target?.fullName ?? "" })
                  : t("hr.hierarchy.insertBetweenLeaf", {
                      name: dragged?.fullName ?? "",
                      manager: targetManager?.fullName ?? "",
                      target: target?.fullName ?? "",
                    })}
              </p>
            ) : null}
            {insertUnavailable ? (
              <p className="text-xs text-muted-foreground">{t("hr.hierarchy.insertRootLeaf", { name: target?.fullName ?? "" })}</p>
            ) : null}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="org-designation">{t("hr.hierarchy.designation")}</Label>
            <Input id="org-designation" value={designation} onChange={(event) => setDesignation(event.target.value)} maxLength={120} />
            <p className="text-xs text-muted-foreground">{t("hr.hierarchy.designationHint")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setPending(null)}>
              {t("hr.hierarchy.cancelMove")}
            </Button>
            <Button type="button" disabled={saving} onClick={applyMove}>
              {t("hr.hierarchy.applyMove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HrSection>
  );
}
