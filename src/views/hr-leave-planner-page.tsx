"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { blackoutWindow } from "@/lib/hr-leave-planner";
import {
  deleteLeavePlannerEvent,
  getLeavePlannerBoard,
  getLeavePlannerRules,
  listLeavePlannerEvents,
  updateLeavePlannerRules,
  upsertLeavePlannerEvent,
} from "@/lib/hr-leave-planner.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

type Tab = "people" | "rules" | "events" | "year" | "pairs" | "coverage";

function tierLabel(code: string | undefined): string {
  if (code === "management") return "30d · management";
  if (code === "5y_plus") return "28d · 5y+";
  if (code === "under_5y") return "21d · under 5y";
  return code ?? "—";
}

export default function HrLeavePlannerPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("people");

  const rulesQ = useQuery({
    queryKey: queryKeys.people.hrLeavePlannerRules(),
    queryFn: () => getLeavePlannerRules(),
    staleTime: STALE.people,
  });
  const eventsQ = useQuery({
    queryKey: queryKeys.people.hrLeavePlannerEvents(),
    queryFn: () => listLeavePlannerEvents(),
    staleTime: STALE.people,
  });
  const boardQ = useQuery({
    queryKey: queryKeys.people.hrLeavePlannerBoard(),
    queryFn: () => getLeavePlannerBoard(),
    staleTime: STALE.people,
    enabled:
      tab === "people" || tab === "year" || tab === "pairs" || tab === "coverage" || tab === "rules",
  });

  const rules = rulesQ.data?.rules;
  const [draft, setDraft] = useState<typeof rules | null>(null);
  const effectiveRules = draft ?? rules;

  const [eventForm, setEventForm] = useState({
    id: "" as string,
    name: "",
    eventType: "major" as "major" | "activation",
    startDate: "",
    endDate: "",
    basis: "",
    active: true,
  });

  const saveRules = useMutation({
    mutationFn: updateLeavePlannerRules,
    onSuccess: async () => {
      toast.success(t("hr.leave.planner.rulesSaved", { defaultValue: "Planner rules saved" }));
      setDraft(null);
      await qc.invalidateQueries({ queryKey: queryKeys.people.hrLeavePlannerRules() });
      await qc.invalidateQueries({ queryKey: queryKeys.people.hrLeavePlannerBoard() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEvent = useMutation({
    mutationFn: upsertLeavePlannerEvent,
    onSuccess: async () => {
      toast.success(t("hr.leave.planner.eventSaved", { defaultValue: "Planner event saved" }));
      setEventForm({
        id: "",
        name: "",
        eventType: "major",
        startDate: "",
        endDate: "",
        basis: "",
        active: true,
      });
      await qc.invalidateQueries({ queryKey: queryKeys.people.hrLeavePlannerEvents() });
      await qc.invalidateQueries({ queryKey: queryKeys.people.hrLeavePlannerBoard() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEvent = useMutation({
    mutationFn: deleteLeavePlannerEvent,
    onSuccess: async () => {
      toast.success(t("hr.leave.planner.eventDeleted", { defaultValue: "Planner event deleted" }));
      await qc.invalidateQueries({ queryKey: queryKeys.people.hrLeavePlannerEvents() });
      await qc.invalidateQueries({ queryKey: queryKeys.people.hrLeavePlannerBoard() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tabs: Array<{ id: Tab; label: string }> = useMemo(
    () => [
      { id: "people", label: t("hr.leave.planner.tabPeople", { defaultValue: "People" }) },
      { id: "rules", label: t("hr.leave.planner.tabRules", { defaultValue: "Rules" }) },
      { id: "events", label: t("hr.leave.planner.tabEvents", { defaultValue: "Events" }) },
      { id: "year", label: t("hr.leave.planner.tabYear", { defaultValue: "Year view" }) },
      { id: "pairs", label: t("hr.leave.planner.tabPairs", { defaultValue: "Pair matrix" }) },
      { id: "coverage", label: t("hr.leave.planner.tabCoverage", { defaultValue: "Coverage" }) },
    ],
    [t],
  );

  return (
    <CapabilityGate
      capability="hr.leave.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.leave.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <div className="mb-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarRange className="size-4" />
            {t("hr.leave.planner.kicker", { defaultValue: "Head Office" })}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("hr.leave.planner.title", { defaultValue: "Leave planner" })}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("hr.leave.planner.subtitle", {
              defaultValue:
                "Head Office staff from the employee database with annual leave calculated from hire date and management tiers (21 / 28 / 30). Blackout, department quotas, and overall away cap hard-block annual leave; Emergency can override.",
            })}
          </p>
        </div>

        <div className="hr-filter-bar mb-4 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "hr-chip",
                tab === item.id && "border-[var(--hr-charcoal)] bg-[var(--hr-charcoal)] text-white",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "people" ? (
          <HrPanel>
            <div className="space-y-3 p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">
                {t("hr.leave.planner.peopleKey", {
                  defaultValue:
                    "Names come from the staff directory (Head Office). Entitlement is calculated automatically from DOJ tenure and management rules — not manual or demo values.",
                })}
              </p>
              {boardQ.isLoading ? (
                <HrEmptyState message={t("common.loading", { defaultValue: "Loading…" })} />
              ) : !(boardQ.data?.people ?? []).length ? (
                <HrEmptyState
                  message={t("hr.leave.planner.noHoStaff", {
                    defaultValue: "No Head Office staff found.",
                  })}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-start text-xs text-muted-foreground">
                        <th className="p-2 font-medium">
                          {t("hr.leave.planner.colName", { defaultValue: "Employee" })}
                        </th>
                        <th className="p-2 font-medium">
                          {t("hr.leave.planner.colCode", { defaultValue: "Code" })}
                        </th>
                        <th className="p-2 font-medium">
                          {t("hr.leave.planner.colHire", { defaultValue: "Hire date" })}
                        </th>
                        <th className="p-2 font-medium">
                          {t("hr.leave.planner.colTier", { defaultValue: "Tier" })}
                        </th>
                        <th className="p-2 font-medium">
                          {t("hr.leave.planner.colMonthly", { defaultValue: "Monthly" })}
                        </th>
                        <th className="p-2 font-medium">
                          {t("hr.leave.planner.colAccrued", { defaultValue: "Accrued YTD" })}
                        </th>
                        <th className="p-2 font-medium">
                          {t("hr.leave.planner.colDepts", { defaultValue: "Departments" })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(boardQ.data?.people ?? []).map((person) => (
                        <tr key={person.staffId} className="border-b border-border/40">
                          <td className="p-2">
                            <p className="font-medium">{person.name}</p>
                            {person.jobTitle ? (
                              <p className="text-xs text-muted-foreground">{person.jobTitle}</p>
                            ) : null}
                          </td>
                          <td className="p-2 font-mono text-xs">{person.employeeCode ?? "—"}</td>
                          <td className="p-2 text-xs">{person.hireDate ?? "—"}</td>
                          <td className="p-2">
                            <Badge variant="outline">{tierLabel(person.entitlement?.tierCode)}</Badge>
                          </td>
                          <td className="p-2 text-xs">
                            {person.entitlement?.monthlyAccrual != null
                              ? `${person.entitlement.monthlyAccrual}/mo`
                              : "—"}
                          </td>
                          <td className="p-2 font-medium">
                            {person.entitlement?.eligible
                              ? `${person.entitlement.allottedDays}d`
                              : "—"}
                            {person.entitlement?.monthsAccrued != null ? (
                              <span className="ms-1 text-xs font-normal text-muted-foreground">
                                ({person.entitlement.monthsAccrued} mo)
                              </span>
                            ) : null}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {person.departmentNames?.length
                              ? person.departmentNames.join(", ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </HrPanel>
        ) : null}

        {tab === "rules" ? (
          <HrPanel>
            <div className="space-y-4 p-4 sm:p-5">
              {!effectiveRules ? (
                <HrEmptyState message={t("common.loading", { defaultValue: "Loading…" })} />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Label>
                        {t("hr.leave.planner.activationSet", { defaultValue: "Activation rule set" })}
                      </Label>
                      <SearchableSelect
                        value={effectiveRules.activationRuleSet}
                        onValueChange={(value) =>
                          setDraft({
                            ...effectiveRules,
                            activationRuleSet: value as "as_stated" | "lighter",
                          })
                        }
                        options={[
                          {
                            value: "as_stated",
                            label: t("hr.leave.planner.asStated", {
                              defaultValue: "As stated (20/5)",
                            }),
                          },
                          {
                            value: "lighter",
                            label: t("hr.leave.planner.lighter", {
                              defaultValue: "Lighter activations (15/3)",
                            }),
                          },
                        ]}
                      />
                    </div>
                    {(
                      [
                        ["majorBeforeDays", "Major days before"],
                        ["majorAfterDays", "Major days after"],
                        ["activationBeforeAsStated", "Activation before (as stated)"],
                        ["activationAfterAsStated", "Activation after (as stated)"],
                        ["activationBeforeLighter", "Activation before (lighter)"],
                        ["activationAfterLighter", "Activation after (lighter)"],
                        ["overallMaxAway", "Overall max away"],
                        ["maxAwayPerDepartment", "Max away per department"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <Label>{t(`hr.leave.planner.${key}`, { defaultValue: label })}</Label>
                        <Input
                          type="number"
                          value={effectiveRules[key]}
                          onChange={(e) =>
                            setDraft({
                              ...effectiveRules,
                              [key]: Number(e.target.value || 0),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    disabled={saveRules.isPending || !draft}
                    onClick={() => draft && saveRules.mutate(draft)}
                  >
                    {t("hr.leave.planner.saveRules", { defaultValue: "Save rules" })}
                  </Button>
                </>
              )}
            </div>
          </HrPanel>
        ) : null}

        {tab === "events" ? (
          <div className="space-y-4">
            <HrPanel>
              <div className="space-y-3 p-4 sm:p-5">
                <h2 className="text-sm font-semibold">
                  {eventForm.id
                    ? t("hr.leave.planner.editEvent", { defaultValue: "Edit event" })
                    : t("hr.leave.planner.addEvent", { defaultValue: "Add event" })}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label>{t("hr.leave.planner.eventName", { defaultValue: "Event name" })}</Label>
                    <Input
                      value={eventForm.name}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("hr.leave.planner.eventType", { defaultValue: "Type" })}</Label>
                    <SearchableSelect
                      value={eventForm.eventType}
                      onValueChange={(value) =>
                        setEventForm((prev) => ({
                          ...prev,
                          eventType: value as "major" | "activation",
                        }))
                      }
                      options={[
                        { value: "major", label: "Major" },
                        { value: "activation", label: "Activation" },
                      ]}
                    />
                  </div>
                  <div>
                    <Label>{t("hr.leave.from")}</Label>
                    <Input
                      type="date"
                      value={eventForm.startDate}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("hr.leave.to")}</Label>
                    <Input
                      type="date"
                      value={eventForm.endDate}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("hr.leave.planner.basis", { defaultValue: "Basis / notes" })}</Label>
                    <Input
                      value={eventForm.basis}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, basis: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  disabled={
                    saveEvent.isPending ||
                    !eventForm.name.trim() ||
                    !eventForm.startDate ||
                    !eventForm.endDate
                  }
                  onClick={() =>
                    saveEvent.mutate({
                      id: eventForm.id || null,
                      name: eventForm.name,
                      eventType: eventForm.eventType,
                      startDate: eventForm.startDate,
                      endDate: eventForm.endDate,
                      basis: eventForm.basis || null,
                      active: eventForm.active,
                    })
                  }
                >
                  {t("hr.leave.planner.saveEvent", { defaultValue: "Save event" })}
                </Button>
              </div>
            </HrPanel>

            <HrPanel>
              <div className="space-y-2 p-4 sm:p-5">
                {(eventsQ.data ?? []).length === 0 ? (
                  <HrEmptyState
                    message={t("hr.leave.planner.noEvents", { defaultValue: "No planner events yet." })}
                  />
                ) : (
                  (eventsQ.data ?? []).map((event) => {
                    const window =
                      rules &&
                      blackoutWindow(
                        {
                          eventType: event.eventType,
                          startDate: event.startDate,
                          endDate: event.endDate,
                        },
                        rules,
                      );
                    return (
                      <div
                        key={event.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 px-3 py-3"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{event.name}</p>
                            <Badge variant="secondary">{event.eventType}</Badge>
                            {!event.active ? <Badge variant="outline">inactive</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {event.startDate} → {event.endDate}
                            {window
                              ? ` · blackout ${window.blackoutStart} → ${window.blackoutEnd}`
                              : ""}
                          </p>
                          {event.basis ? (
                            <p className="text-xs text-muted-foreground">{event.basis}</p>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEventForm({
                                id: event.id,
                                name: event.name,
                                eventType: event.eventType,
                                startDate: event.startDate,
                                endDate: event.endDate,
                                basis: event.basis ?? "",
                                active: event.active,
                              })
                            }
                          >
                            {t("common.edit", { defaultValue: "Edit" })}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={removeEvent.isPending}
                            onClick={() => removeEvent.mutate({ id: event.id })}
                          >
                            {t("common.delete", { defaultValue: "Delete" })}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </HrPanel>
          </div>
        ) : null}

        {tab === "year" ? (
          <HrPanel>
            <div className="space-y-4 overflow-x-auto p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">
                {t("hr.leave.planner.yearKey", {
                  defaultValue: "E = event day · X = blackout (no leave) · · = free",
                })}
              </p>
              {(boardQ.data?.yearView ?? []).map((month) => (
                <div key={month.month} className="space-y-2">
                  <h3 className="text-sm font-semibold">{month.month.slice(0, 7)}</h3>
                  <div className="flex flex-wrap gap-1 font-mono text-[0.65rem]">
                    {month.days.map((day) => (
                      <span
                        key={`${month.month}-${day.day}`}
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded border",
                          day.mark === "E" && "border-sky-500/40 bg-sky-500/15 text-sky-800",
                          day.mark === "X" && "border-rose-500/40 bg-rose-500/15 text-rose-800",
                          day.mark === "." && "border-border/50 text-muted-foreground",
                        )}
                        title={`${month.month.slice(0, 8)}${String(day.day).padStart(2, "0")} · ${day.mark}`}
                      >
                        {day.day}
                        <span className="sr-only">{day.mark}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </HrPanel>
        ) : null}

        {tab === "pairs" ? (
          <HrPanel>
            <div className="overflow-auto p-4 sm:p-5">
              <p className="mb-3 text-xs text-muted-foreground">
                {t("hr.leave.planner.pairKey", {
                  defaultValue:
                    "X = never together · ~ = shared department quota · OK = no shared department",
                })}
              </p>
              {!boardQ.data?.pairMatrix.people.length ? (
                <HrEmptyState
                  message={t("hr.leave.planner.noHoStaff", {
                    defaultValue: "No Head Office staff found.",
                  })}
                />
              ) : (
                <table className="min-w-full border-collapse text-[0.65rem]">
                  <thead>
                    <tr>
                      <th className="sticky start-0 bg-background p-1 text-start" />
                      {boardQ.data.pairMatrix.people.map((person) => (
                        <th key={person.staffId} className="max-w-24 truncate p-1 text-start" title={person.name}>
                          {person.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {boardQ.data.pairMatrix.rows.map((row, idx) => (
                      <tr key={row.rowStaffId}>
                        <th className="sticky start-0 max-w-36 truncate bg-background p-1 text-start" title={boardQ.data?.pairMatrix.people[idx]?.name}>
                          {boardQ.data?.pairMatrix.people[idx]?.name}
                        </th>
                        {row.cells.map((cell) => (
                          <td
                            key={`${row.rowStaffId}-${cell.colStaffId}`}
                            className={cn(
                              "p-1 text-center",
                              cell.mark === "X" && "bg-rose-500/15 font-semibold text-rose-800",
                              cell.mark === "~" && "bg-amber-500/15 text-amber-900",
                            )}
                          >
                            {cell.mark}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </HrPanel>
        ) : null}

        {tab === "coverage" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <HrPanel>
              <div className="space-y-3 p-4 sm:p-5">
                <h2 className="text-sm font-semibold">
                  {t("hr.leave.planner.departments", { defaultValue: "Departments" })}
                </h2>
                {(boardQ.data?.departments ?? []).map((dept) => (
                  <div key={dept.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{dept.name}</span>
                    <span className="text-muted-foreground">
                      {dept.headcount} staff · max away{" "}
                      {Math.min(
                        boardQ.data?.rules.maxAwayPerDepartment ?? 2,
                        Math.max(0, dept.headcount - 1),
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </HrPanel>
            <HrPanel>
              <div className="space-y-3 p-4 sm:p-5">
                <h2 className="text-sm font-semibold">
                  {t("hr.leave.planner.awayNow", { defaultValue: "Pending / approved leave" })}
                </h2>
                {(boardQ.data?.awayLeaves ?? []).length === 0 ? (
                  <HrEmptyState
                    message={t("hr.leave.planner.noAway", {
                      defaultValue: "No overlapping leave logged.",
                    })}
                  />
                ) : (
                  (boardQ.data?.awayLeaves ?? []).map((row) => (
                    <div key={row.id} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                      <p className="font-medium">{row.staffName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.dateFrom} → {row.dateTo}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </HrPanel>
          </div>
        ) : null}
      </HrShell>
    </CapabilityGate>
  );
}
