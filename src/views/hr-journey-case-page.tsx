"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatQar, sectionOutstanding, sectionsFor, type JourneyGateId } from "@/lib/hr-journeys";
import {
  acknowledgeJourneyPolicy,
  assignJourneyTraining,
  cancelJourney,
  clearJourneyReview,
  completeJourney,
  getJourneyCase,
  reviewJourneyPayroll,
  reviseJourneyPackage,
  updateJourneyTask,
  waiveJourneyTraining,
} from "@/lib/hr-journeys.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

const selectClass = "flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm";
const journeyKey = [...queryKeys.people.all, "hr-checklists"] as const;

function journeyError(t: (key: string, options?: { defaultValue?: string }) => string, error: Error) {
  if (error.message.startsWith("journey:")) {
    return t(`hr.journeys.errors.${error.message.slice("journey:".length)}`, { defaultValue: error.message });
  }
  return error.message;
}

function statusVariant(status: string): "destructive" | "warning" | "success" | "muted" | "info" {
  if (status === "overdue") return "destructive";
  if (status === "awaiting") return "warning";
  if (status === "completed" || status === "acknowledged") return "success";
  if (status === "review_due") return "info";
  return "muted";
}

export default function HrJourneyCasePage() {
  const { t } = useTranslation();
  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.onboarding.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <Case />
    </CapabilityGate>
  );
}

function Case() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const focusTask = search.get("task");
  const qc = useQueryClient();
  const [tab, setTab] = useState("checklist");
  const [section, setSection] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [editing, setEditing] = useState<string | null>(focusTask);
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState<"pending" | "done" | "skipped">("done");
  const [decisionReason, setDecisionReason] = useState("");
  const [ackReason, setAckReason] = useState("");
  const [packageForm, setPackageForm] = useState({
    effectiveOn: "",
    basicQar: "",
    housingQar: "",
    transportationQar: "",
    foodQar: "0",
    otherQar: "0",
    reason: "",
  });
  const [payrollReason, setPayrollReason] = useState("");
  const [trainingForm, setTrainingForm] = useState({ title: "", courseId: "", reason: "" });
  const [waiveReason, setWaiveReason] = useState("");

  const journey = useQuery({
    queryKey: queryKeys.people.hrChecklists({ id }),
    queryFn: () => getJourneyCase({ id }),
    enabled: Boolean(id),
    staleTime: STALE.people,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: journeyKey });
  const onError = (error: Error) => toast.error(journeyError(t, error));
  const saved = { onSuccess: () => { toast.success(t("hr.journeys.saved")); setReason(""); setDecisionReason(""); void invalidate(); }, onError };

  const updateTask = useMutation({ mutationFn: updateJourneyTask, ...saved });
  const clearReview = useMutation({ mutationFn: clearJourneyReview, ...saved });
  const acknowledge = useMutation({ mutationFn: acknowledgeJourneyPolicy, ...saved });
  const revise = useMutation({ mutationFn: reviseJourneyPackage, ...saved });
  const reviewPay = useMutation({ mutationFn: reviewJourneyPayroll, ...saved });
  const assignTraining = useMutation({
    mutationFn: assignJourneyTraining,
    onSuccess: (result) => {
      toast.success(result.registerNote ? t("hr.journeys.trainingLocalOnly") : t("hr.journeys.saved"));
      setTrainingForm({ title: "", courseId: "", reason: "" });
      void invalidate();
    },
    onError,
  });
  const waiveTraining = useMutation({ mutationFn: waiveJourneyTraining, ...saved });
  const cancel = useMutation({ mutationFn: cancelJourney, ...saved });
  const complete = useMutation({ mutationFn: completeJourney, ...saved });

  const data = journey.data;
  const sections = data ? sectionsFor(data.kind) : [];
  const tasks = useMemo(() => {
    const rows = data?.tasks ?? [];
    return rows.filter((task) => {
      if (section !== "all" && task.section !== section) return false;
      if (taskFilter === "open") return task.status === "pending" || task.displayStatus === "review_due";
      if (taskFilter === "overdue") return task.displayStatus === "overdue";
      return true;
    });
  }, [data?.tasks, section, taskFilter]);

  useEffect(() => {
    if (!focusTask) return;
    const node = document.getElementById(`task-${focusTask}`);
    node?.scrollIntoView({ block: "center" });
  }, [focusTask, data?.id]);

  useEffect(() => {
    const latest = data?.packages[0];
    if (!latest || packageForm.effectiveOn) return;
    setPackageForm({
      effectiveOn: latest.effectiveOn,
      basicQar: String(latest.basicQar),
      housingQar: String(latest.housingQar),
      transportationQar: String(latest.transportationQar),
      foodQar: String(latest.foodQar),
      otherQar: String(latest.otherQar),
      reason: "",
    });
  }, [data?.packages, packageForm.effectiveOn]);

  const gate = (gateId: JourneyGateId) => data?.gates.find((row) => row.id === gateId);
  const open = data?.status === "open";

  return (
    <HrShell>
      <HrSection
        icon={ClipboardList}
        kicker={t("hr.journeys.kicker")}
        title={t("hr.journeys.title")}
        subtitle={t("hr.journeys.subtitle")}
      >
        <Link href="/people/hr/onboarding" className="text-sm font-medium underline-offset-4 hover:underline">
          {t("hr.journeys.back")}
        </Link>
        {journey.isLoading ? <FecLoader label={t("common.loading")} /> : null}
        {journey.isError ? (
          <HrPanel>
            <HrEmptyState message={journeyError(t, journey.error as Error)} />
          </HrPanel>
        ) : null}
        {data ? (
          <>
            <HrPanel className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{data.staffName || t("hr.journeys.unnamed")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Badge variant={data.status === "completed" ? "success" : data.status === "cancelled" ? "muted" : "info"}>
                      {t(`hr.journeys.status.${data.status}`, { defaultValue: data.status })}
                    </Badge>
                    <span className="ms-2">
                      {t(`hr.journeys.kinds.${data.kind}`)}
                      {data.anchorDate ? ` · ${data.anchorDate}` : ""}
                      {data.referenceCode ? ` · ${data.referenceCode}` : ""}
                      {data.templateTitle ? ` · ${data.templateTitle}` : ""}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[data.roleTitle, data.departmentName, data.managerName ? t("hr.journeys.managerLine", { name: data.managerName }) : null, data.ownerName ? t("hr.journeys.ownerLine", { name: data.ownerName }) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {data.kind === "offboarding" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {data.exitCause ? t(`hr.journeys.exitCauses.${data.exitCause}`, { defaultValue: data.exitCause }) : ""}
                      {data.noticeDays != null ? ` · ${t("hr.journeys.noticeLine", { days: data.noticeDays })}` : ""}
                      {data.reasonNote ? ` · ${data.reasonNote}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-40 text-end">
                  <p className="text-sm text-muted-foreground">
                    {t("hr.journeys.progress", { done: data.requiredDone, total: data.requiredTotal, percent: data.percent })}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--hr-cream-deep)]">
                    <div className="h-full rounded-full bg-[var(--hr-mustard)]" style={{ width: `${data.percent}%` }} />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.gates.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="rounded-2xl border border-border bg-card p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    onClick={() => setTab(row.id === "compensation" ? "salary" : row.id === "training" ? "training" : "checklist")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{t(`hr.journeys.gates.${row.id}`)}</p>
                      <Badge variant={row.state === "clear" ? "success" : "warning"}>
                        {row.state === "clear" ? t("hr.journeys.clear") : t("hr.journeys.outstanding")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {row.state === "clear" ? t("hr.journeys.gateClear") : t("hr.journeys.gateOpen", { count: row.outstanding })}
                    </p>
                  </button>
                ))}
                {data.kind === "offboarding" ? (
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{t("hr.journeys.gates.eos")}</p>
                      <Badge variant={sectionOutstanding(data.tasks, "end_of_service") === 0 ? "success" : "warning"}>
                        {sectionOutstanding(data.tasks, "end_of_service") === 0 ? t("hr.journeys.clear") : t("hr.journeys.outstanding")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{t("hr.journeys.eosNote")}</p>
                    <Button className="mt-3" size="sm" variant="outline" asChild>
                      <Link href="/people/hr/end-of-service">{t("hr.journeys.openEos")}</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{t("hr.journeys.recheckNote")}</p>
              {data.expiredDocuments.length > 0 ? (
                <ul className="text-sm">
                  {data.expiredDocuments.map((doc) => (
                    <li key={doc.id}>
                      {doc.title} · {doc.expiryDate}
                    </li>
                  ))}
                </ul>
              ) : null}
            </HrPanel>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="checklist">{t("hr.journeys.caseTabs.checklist")}</TabsTrigger>
                <TabsTrigger value="training">{t("hr.journeys.caseTabs.training")}</TabsTrigger>
                <TabsTrigger value="salary">{t("hr.journeys.caseTabs.salary")}</TabsTrigger>
                <TabsTrigger value="history">{t("hr.journeys.caseTabs.history")}</TabsTrigger>
              </TabsList>
              <TabsContent value="checklist" className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <select className={selectClass} value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}>
                    <option value="all">{t("hr.journeys.filters.allTasks")}</option>
                    <option value="open">{t("hr.journeys.filters.openTasks")}</option>
                    <option value="overdue">{t("hr.journeys.filters.overdue")}</option>
                  </select>
                  <select className={selectClass} value={section} onChange={(event) => setSection(event.target.value)}>
                    <option value="all">{t("hr.journeys.filters.allSections")}</option>
                    {sections.map((name) => (
                      <option key={name} value={name}>{t(`hr.journeys.sections.${name}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-5">
                  {(section === "all" ? [...sections, "general"] : [section]).map((name) => {
                    const rows = tasks.filter((task) => task.section === name);
                    if (!rows.length) return null;
                    return (
                      <section key={name} className="space-y-3">
                        <h3 className="text-sm font-semibold">{t(`hr.journeys.sections.${name}`)}</h3>
                        {rows.map((task) => (
                    <HrPanel key={task.id} className="space-y-3 p-4">
                      <div id={`task-${task.id}`} className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{t(`hr.journeys.sections.${task.section}`)}</p>
                          <p className="font-medium">{task.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {task.ownerName ?? t(`hr.journeys.roles.${task.ownerRole}`)}
                            {task.dueOn ? ` · ${t("hr.journeys.due", { date: task.dueOn })}` : ""}
                            {` · ${task.required ? t("hr.journeys.required") : t("hr.journeys.optional")}`}
                          </p>
                        </div>
                        <Badge variant={statusVariant(task.displayStatus)}>{t(`hr.journeys.taskStatus.${task.displayStatus}`)}</Badge>
                      </div>
                      {task.evidence ? <p className="text-sm">{task.evidence}</p> : null}
                      {open ? (
                        editing === task.id ? (
                          <div className="grid gap-3">
                            <select className={selectClass} value={nextStatus} onChange={(event) => setNextStatus(event.target.value as typeof nextStatus)}>
                              <option value="done">{t("hr.journeys.taskStatus.completed")}</option>
                              <option value="pending">{t("hr.journeys.taskStatus.awaiting")}</option>
                              {task.required ? null : <option value="skipped">{t("hr.journeys.taskStatus.waived")}</option>}
                            </select>
                            <Textarea value={evidence} placeholder={t("hr.journeys.evidence")} onChange={(event) => setEvidence(event.target.value)} />
                            <Input value={reason} placeholder={t("hr.journeys.reason")} onChange={(event) => setReason(event.target.value)} />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={reason.trim().length < 3 || updateTask.isPending}
                                onClick={() => updateTask.mutate({ itemId: task.id, status: nextStatus, evidence, reason })}
                              >
                                {t("hr.journeys.saveTask")}
                              </Button>
                              {task.displayStatus === "review_due" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={reason.trim().length < 3 || clearReview.isPending}
                                  onClick={() => clearReview.mutate({ itemId: task.id, reason })}
                                >
                                  {t("hr.journeys.clearReview")}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(task.id);
                              setEvidence(task.evidence ?? "");
                              setNextStatus(task.status === "pending" ? "done" : task.status);
                              setReason("");
                            }}
                          >
                            {t("hr.journeys.updateTask")}
                          </Button>
                        )
                      ) : null}
                    </HrPanel>
                        ))}
                      </section>
                    );
                  })}
                </div>
                <HrPanel className="space-y-3 p-4">
                  <h3 className="font-medium">{t("hr.journeys.gates.handbook")}</h3>
                  {data.acknowledgments.length === 0 ? <p className="text-sm text-muted-foreground">{t("hr.journeys.noAcks")}</p> : null}
                  <ul className="space-y-2">
                    {data.acknowledgments.map((ack) => (
                      <li key={ack.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm">{ack.title}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={ack.status === "acknowledged" ? "success" : "warning"}>
                            {t(`hr.journeys.ackStatus.${ack.status}`)}
                          </Badge>
                          {open && ack.status !== "acknowledged" ? (
                            <Button size="sm" variant="outline" disabled={ackReason.trim().length < 3 || acknowledge.isPending} onClick={() => acknowledge.mutate({ acknowledgmentId: ack.id, reason: ackReason })}>
                              {t("hr.journeys.acknowledge")}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {open && data.acknowledgments.some((ack) => ack.status !== "acknowledged") ? (
                    <Input value={ackReason} placeholder={t("hr.journeys.reason")} onChange={(event) => setAckReason(event.target.value)} />
                  ) : null}
                </HrPanel>
                <HrPanel className="space-y-3 p-4">
                  <h3 className="font-medium">{t("hr.journeys.decision")}</h3>
                  <p className="text-sm text-muted-foreground">{data.canComplete ? t("hr.journeys.readyToClose") : t("hr.journeys.cannotFinish")}</p>
                  {open ? (
                    <>
                      <Input value={decisionReason} placeholder={t("hr.journeys.reason")} onChange={(event) => setDecisionReason(event.target.value)} />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" disabled={decisionReason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate({ checklistId: data.id, reason: decisionReason })}>
                          {t("hr.journeys.cancel")}
                        </Button>
                        <Button disabled={!data.canComplete || decisionReason.trim().length < 3 || complete.isPending} onClick={() => complete.mutate({ checklistId: data.id, reason: decisionReason })}>
                          {t("hr.journeys.complete")}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </HrPanel>
              </TabsContent>
              <TabsContent value="training" className="space-y-4">
                <HrPanel className="space-y-3 p-4">
                  <h3 className="font-medium">{t("hr.journeys.trainingTitle")}</h3>
                  <p className="text-sm text-muted-foreground">{t(data.kind === "offboarding" ? "hr.journeys.trainingExit" : "hr.journeys.trainingJoin")}</p>
                  {data.training.length === 0 ? <p className="text-sm text-muted-foreground">{t("hr.journeys.noTraining")}</p> : null}
                  <ul className="space-y-3">
                    {data.training.map((row) => {
                      const satisfied = row.status !== "assigned" || row.enrollmentStatus === "COMPLETED" || row.enrollmentStatus === "WAIVED";
                      return (
                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{row.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.dueOn ? t("hr.journeys.due", { date: row.dueOn }) : ""}
                              {row.enrollmentStatus ? ` · ${row.enrollmentStatus}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={satisfied ? "success" : "warning"}>
                              {satisfied ? t("hr.journeys.clear") : t("hr.journeys.outstanding")}
                            </Badge>
                            {open && !satisfied ? (
                              <Button size="sm" variant="outline" disabled={waiveReason.trim().length < 3 || waiveTraining.isPending} onClick={() => waiveTraining.mutate({ trainingId: row.id, reason: waiveReason })}>
                                {t("hr.journeys.waive")}
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {open ? (
                    <div className="grid gap-3">
                      <Input value={waiveReason} placeholder={t("hr.journeys.waiveReason")} onChange={(event) => setWaiveReason(event.target.value)} />
                      <h4 className="font-medium">{t("hr.journeys.assignNew")}</h4>
                      <Input value={trainingForm.title} placeholder={t("hr.journeys.courseTitle")} onChange={(event) => setTrainingForm((current) => ({ ...current, title: event.target.value }))} />
                      <select className={selectClass} value={trainingForm.courseId} onChange={(event) => setTrainingForm((current) => ({ ...current, courseId: event.target.value, title: current.title || data.courses.find((course) => course.id === event.target.value)?.title || "" }))}>
                        <option value="">{t("hr.journeys.noPublishedCourse")}</option>
                        {data.courses.map((course) => (
                          <option key={course.id} value={course.id}>{course.title}</option>
                        ))}
                      </select>
                      <Input value={trainingForm.reason} placeholder={t("hr.journeys.reason")} onChange={(event) => setTrainingForm((current) => ({ ...current, reason: event.target.value }))} />
                      <Button
                        className="w-fit"
                        disabled={trainingForm.title.trim().length < 3 || trainingForm.reason.trim().length < 3 || assignTraining.isPending}
                        onClick={() => assignTraining.mutate({ checklistId: data.id, title: trainingForm.title, courseId: trainingForm.courseId || null, reason: trainingForm.reason })}
                      >
                        {t("hr.journeys.assignInduction")}
                      </Button>
                      <Button variant="link" className="w-fit px-0" asChild>
                        <Link href="/training/assignments">{t("hr.journeys.openTraining")}</Link>
                      </Button>
                    </div>
                  ) : null}
                </HrPanel>
              </TabsContent>
              <TabsContent value="salary" className="space-y-4">
                <HrPanel className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{t("hr.journeys.salaryTitle")}</h3>
                      <p className="text-sm text-muted-foreground">{t(data.kind === "offboarding" ? "hr.journeys.salaryExit" : "hr.journeys.salaryJoin")}</p>
                    </div>
                    <Badge variant={gate("compensation")?.state === "clear" ? "success" : "warning"}>
                      {gate("compensation")?.state === "clear" ? t("hr.journeys.clear") : t("hr.journeys.outstanding")}
                    </Badge>
                  </div>
                  {data.packages[0] ? (
                    <>
                      <p className="text-sm">
                        {t("hr.journeys.packageVersion", { version: data.packages.length, date: data.packages[0].effectiveOn })}
                        {data.packages[0].source === "compensation" ? ` · ${t("hr.journeys.compensationSnapshot")}` : ""}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[36rem] text-sm">
                          <thead>
                            <tr className="border-b text-start text-muted-foreground">
                              <th className="py-2 pe-3 font-medium">{t("hr.journeys.columns.component")}</th>
                              <th className="py-2 pe-3 font-medium">{t("hr.journeys.columns.provision")}</th>
                              <th className="py-2 pe-3 font-medium">{t("hr.journeys.columns.frequency")}</th>
                              <th className="py-2 pe-3 font-medium">{t("hr.journeys.columns.amount")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ["base", data.packages[0].basicQar],
                              ["housing", data.packages[0].housingQar],
                              ["transportation", data.packages[0].transportationQar],
                              ["food", data.packages[0].foodQar],
                              ["other", data.packages[0].otherQar],
                            ].map(([key, amount]) => (
                              <tr key={String(key)} className="border-b border-border/70">
                                <td className="py-2 pe-3">{t(`hr.journeys.components.${key}`)}</td>
                                <td className="py-2 pe-3">{Number(amount) > 0 ? t("hr.journeys.provision.cash") : t("hr.journeys.provision.na")}</td>
                                <td className="py-2 pe-3">{Number(amount) > 0 ? t("hr.journeys.frequency.monthly") : "—"}</td>
                                <td className="py-2 pe-3">{Number(amount) > 0 ? formatQar(Number(amount)) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-sm font-medium">{t("hr.journeys.monthlyCash", { amount: formatQar(data.packages[0].monthlyTotalQar) })}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("hr.journeys.noPackage")}</p>
                  )}
                  {data.packages.length > 1 ? (
                    <ul className="text-sm text-muted-foreground">
                      {data.packages.map((row, index) => (
                        <li key={row.id}>
                          {t("hr.journeys.historyVersion", { version: data.packages.length - index, date: row.effectiveOn, amount: formatQar(row.monthlyTotalQar) })}
                          {row.reason ? ` · ${row.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {open ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input type="date" value={packageForm.effectiveOn} onChange={(event) => setPackageForm((current) => ({ ...current, effectiveOn: event.target.value }))} />
                      {(["basicQar", "housingQar", "transportationQar", "foodQar", "otherQar"] as const).map((field) => (
                        <label key={field} className="grid gap-1.5 text-sm">
                          <span className="font-medium">{t(`hr.journeys.packageFields.${field}`)}</span>
                          <Input type="number" min={0} step="0.01" value={packageForm[field]} onChange={(event) => setPackageForm((current) => ({ ...current, [field]: event.target.value }))} />
                        </label>
                      ))}
                      <label className="grid gap-1.5 text-sm md:col-span-2">
                        <span className="font-medium">{t("hr.journeys.reason")}</span>
                        <Input value={packageForm.reason} onChange={(event) => setPackageForm((current) => ({ ...current, reason: event.target.value }))} />
                      </label>
                      <Button
                        className="w-fit"
                        disabled={!packageForm.effectiveOn || packageForm.reason.trim().length < 3 || revise.isPending}
                        onClick={() =>
                          revise.mutate({
                            checklistId: data.id,
                            effectiveOn: packageForm.effectiveOn,
                            basicQar: Number(packageForm.basicQar || 0),
                            housingQar: Number(packageForm.housingQar || 0),
                            transportationQar: Number(packageForm.transportationQar || 0),
                            foodQar: Number(packageForm.foodQar || 0),
                            otherQar: Number(packageForm.otherQar || 0),
                            reason: packageForm.reason,
                          })
                        }
                      >
                        {t("hr.journeys.revisePackage")}
                      </Button>
                      <label className="grid gap-1.5 text-sm md:col-span-2">
                        <span className="font-medium">{t("hr.journeys.payrollReason")}</span>
                        <Input value={payrollReason} onChange={(event) => setPayrollReason(event.target.value)} />
                      </label>
                      <Button className="w-fit" variant="secondary" disabled={payrollReason.trim().length < 3 || reviewPay.isPending} onClick={() => reviewPay.mutate({ checklistId: data.id, reason: payrollReason })}>
                        {t("hr.journeys.reviewPayroll")}
                      </Button>
                    </div>
                  ) : null}
                </HrPanel>
              </TabsContent>
              <TabsContent value="history">
                <HrPanel className="p-4">
                  {data.events.length === 0 ? (
                    <HrEmptyState message={t("hr.journeys.historyEmpty")} />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[40rem] text-sm">
                        <thead>
                          <tr className="border-b text-start text-muted-foreground">
                            <th className="py-2 pe-3 font-medium">{t("hr.journeys.columns.record")}</th>
                            <th className="py-2 pe-3 font-medium">{t("hr.journeys.columns.state")}</th>
                            <th className="py-2 pe-3 font-medium">{t("hr.journeys.columns.reason")}</th>
                            <th className="py-2 pe-3 font-medium">{t("hr.journeys.columns.when")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.events.map((event) => (
                            <tr key={event.id} className="border-b border-border/70 align-top">
                              <td className="py-2 pe-3">{event.actorName}</td>
                              <td className="py-2 pe-3">{t(`hr.journeys.events.${event.type}`, { defaultValue: event.type })}</td>
                              <td className="py-2 pe-3">{event.reason ?? "—"}</td>
                              <td className="py-2 pe-3">{event.at.slice(0, 16).replace("T", " ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </HrPanel>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </HrSection>
    </HrShell>
  );
}
