"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { groupOrgChart, personInitials, type OrgChartPerson } from "@/lib/org-hierarchy";
import { staffPhotoUrl } from "@/lib/staff-photo";
import { cn } from "@/lib/utils";

export type IssuedStaffLogin = {
  email: string;
  password: string | null;
  linkedExisting: boolean;
};

function matchesQuery(person: OrgChartPerson, query: string): boolean {
  if (!query) return true;
  return (
    person.fullName.toLowerCase().includes(query) ||
    (person.employeeCode ?? "").toLowerCase().includes(query) ||
    (person.loginEmail ?? "").toLowerCase().includes(query)
  );
}

function selfMatches(person: OrgChartPerson, query: string, missingOnly: boolean): boolean {
  if (missingOnly && person.loginLinked !== false) return false;
  return matchesQuery(person, query);
}

export function OrgLoginTree({
  people,
  creatingId,
  issued,
  onCreate,
  createStaffIds = null,
  profileStaffIds = null,
  hint,
}: {
  people: OrgChartPerson[];
  creatingId: string | null;
  issued: Record<string, IssuedStaffLogin>;
  onCreate: (staffId: string) => void;
  /** When set, create-login is offered only for these people. Null keeps the company-wide action. */
  createStaffIds?: ReadonlySet<string> | null;
  /** When set, Profile is offered only for these people. Null keeps it for everyone on the tree. */
  profileStaffIds?: ReadonlySet<string> | null;
  hint?: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const grouped = useMemo(() => groupOrgChart(people), [people]);
  const parentOf = useMemo(() => {
    const parents = new Map<string, string>();
    for (const [managerId, reports] of grouped.childrenOf) {
      for (const report of reports) parents.set(report.staffId, managerId);
    }
    return parents;
  }, [grouped.childrenOf]);
  const offChart = useMemo(
    () =>
      people
        .filter((person) => !grouped.onChart.has(person.staffId))
        .slice()
        .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.staffId.localeCompare(b.staffId)),
    [people, grouped.onChart],
  );
  const rootIds = useMemo(() => new Set(grouped.roots.map((person) => person.staffId)), [grouped.roots]);
  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  const matchIds = useMemo(() => {
    const ids = new Set<string>();
    if (!query && !missingOnly) return ids;
    for (const person of people) {
      if (selfMatches(person, query, missingOnly)) ids.add(person.staffId);
    }
    return ids;
  }, [people, query, missingOnly]);

  const visibleIds = useMemo(() => {
    if (!query && !missingOnly) return null;
    const ids = new Set(matchIds);
    for (const id of matchIds) {
      let cursor = parentOf.get(id);
      while (cursor && !ids.has(cursor)) {
        ids.add(cursor);
        cursor = parentOf.get(cursor);
      }
    }
    return ids;
  }, [matchIds, parentOf, query, missingOnly]);

  const autoOpen = useMemo(() => {
    const open = new Set<string>();
    if (!visibleIds) return open;
    for (const id of matchIds) {
      let cursor = parentOf.get(id);
      while (cursor) {
        open.add(cursor);
        cursor = parentOf.get(cursor);
      }
    }
    return open;
  }, [matchIds, parentOf, visibleIds]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.staffId, person])), [people]);
  const linkedCount = people.filter((person) => person.loginLinked).length;
  const missingCount = people.filter((person) => person.loginLinked === false).length;

  const setBranchOpen = (staffId: string, next: boolean) => {
    setOpenState((current) => (current[staffId] === next ? current : { ...current, [staffId]: next }));
  };

  const isOpen = (staffId: string) => {
    if (staffId in openState) return openState[staffId];
    if (autoOpen.has(staffId)) return true;
    return rootIds.has(staffId);
  };

  const copyPassword = async (staffId: string, password: string) => {
    try {
      await navigator.clipboard.writeText(password);
      setCopiedId(staffId);
    } catch {
      setCopiedId(null);
    }
  };

  const renderPerson = (person: OrgChartPerson, depth: number, managerName: string | null) => {
    if (visibleIds && !visibleIds.has(person.staffId)) return null;
    const reports = grouped.childrenOf.get(person.staffId) ?? [];
    const shownReports = visibleIds
      ? reports.filter((report) => visibleIds.has(report.staffId) || matchIds.has(person.staffId))
      : reports;
    const open = shownReports.length > 0 && isOpen(person.staffId);
    const issuedLogin = issued[person.staffId];
    const email = issuedLogin?.email || person.loginEmail;
    const teamNames = reports.slice(0, 3).map((report) => report.fullName);
    const teamExtra = Math.max(0, reports.length - teamNames.length);
    return (
      <li key={person.staffId}>
        <div
          className={cn(
            "flex flex-wrap items-start gap-2 rounded-xl border border-transparent px-2 py-2",
            open ? "bg-muted/50" : "hover:border-border/70 hover:bg-muted/40",
          )}
          style={{ paddingInlineStart: 8 + depth * 16 }}
        >
          <div
            className={cn("flex min-w-0 flex-1 items-start gap-2", shownReports.length > 0 && "cursor-pointer")}
            role={shownReports.length > 0 ? "button" : undefined}
            tabIndex={shownReports.length > 0 ? 0 : undefined}
            aria-expanded={shownReports.length > 0 ? open : undefined}
            aria-label={
              shownReports.length > 0
                ? t(open ? "hr.hierarchy.collapseTeam" : "hr.hierarchy.expandTeam", { name: person.fullName })
                : undefined
            }
            onClick={() => {
              if (shownReports.length > 0) setBranchOpen(person.staffId, !open);
            }}
            onKeyDown={(event) => {
              if (shownReports.length === 0) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              setBranchOpen(person.staffId, !open);
            }}
          >
          {shownReports.length > 0 ? (
            <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
            </span>
          ) : (
            <span className="mt-1 h-6 w-6 shrink-0" />
          )}
          <Avatar className="mt-0.5 h-8 w-8 shrink-0">
            {person.hasPhoto ? (
              <AvatarImage src={staffPhotoUrl(person.staffId, person.photoUpdatedAt)} alt="" />
            ) : null}
            <AvatarFallback className="text-[10px] font-semibold">{personInitials(person.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-semibold text-foreground">{person.fullName}</span>
              {person.loginLinked === true ? (
                <Badge variant="success">{t("people.profile.login.exists")}</Badge>
              ) : person.loginLinked === false ? (
                <Badge variant="warning">{t("people.profile.login.missing")}</Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {[person.employeeCode, person.jobTitle?.trim() || t("hr.hierarchy.staffRole")].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("hr.hierarchy.lineManager", {
                name: managerName ?? t("people.profile.login.noManager"),
              })}
            </p>
            {reports.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {teamExtra > 0
                  ? t("hr.hierarchy.teamLineMore", { names: teamNames.join(", "), count: teamExtra })
                  : t("hr.hierarchy.teamLine", { names: teamNames.join(", ") })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("hr.hierarchy.noTeam")}</p>
            )}
            {person.loginLinked ? (
              <p className="text-xs text-foreground">
                {email ?? t("people.profile.login.emailUnavailable")}
              </p>
            ) : null}
            {issuedLogin?.password ? (
              <p className="mt-1 text-xs">
                <span className="text-muted-foreground">{t("people.profile.login.issuedPassword")}: </span>
                <span className="font-mono font-semibold">{issuedLogin.password}</span>
                <button
                  type="button"
                  className="ms-2 font-medium text-primary underline-offset-2 hover:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    const password = issued[person.staffId]?.password;
                    if (password) void copyPassword(person.staffId, password);
                  }}
                >
                  {copiedId === person.staffId ? t("hr.hierarchy.passwordCopied") : t("hr.hierarchy.copyPassword")}
                </button>
              </p>
            ) : null}
            {issuedLogin?.linkedExisting && !issuedLogin.password ? (
              <p className="text-xs text-muted-foreground">{t("people.profile.login.linkedExisting")}</p>
            ) : null}
            {issuedLogin?.password ? (
              <p className="text-xs text-muted-foreground">{t("people.profile.login.shareHint")}</p>
            ) : null}
          </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {profileStaffIds === null || profileStaffIds.has(person.staffId) ? (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`/people/staff/${person.staffId}`}>{t("hr.hierarchy.openProfile")}</Link>
              </Button>
            ) : null}
            {person.loginLinked === false && (createStaffIds === null || createStaffIds.has(person.staffId)) ? (
              <Button
                type="button"
                size="sm"
                disabled={creatingId === person.staffId}
                aria-busy={creatingId === person.staffId}
                onClick={() => onCreate(person.staffId)}
              >
                {creatingId === person.staffId ? t("people.profile.login.creating") : t("people.profile.login.create")}
              </Button>
            ) : null}
          </div>
        </div>
        {open ? (
          <ul>
            {shownReports.map((report) => renderPerson(report, depth + 1, person.fullName))}
          </ul>
        ) : null}
      </li>
    );
  };

  const chartRows = grouped.roots.map((person) => renderPerson(person, 0, null)).filter(Boolean);
  const offChartRows = offChart
    .map((person) => {
      const manager = person.reportingManagerStaffId ? peopleById.get(person.reportingManagerStaffId) : null;
      return renderPerson(person, 0, manager?.fullName ?? null);
    })
    .filter(Boolean);

  return (
    <div className="flex h-[calc(100vh-16.5rem)] min-h-[36rem] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevated-xs">
      <div className="space-y-3 border-b border-border/50 p-3">
        <p className="text-sm text-muted-foreground">{hint ?? t("hr.hierarchy.loginTreeHint")}</p>
        <p className="text-xs text-muted-foreground">
          {t("hr.hierarchy.withLogin", { count: linkedCount })}
          {" · "}
          {t("hr.hierarchy.missingLogin", { count: missingCount })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("hr.hierarchy.searchPeople")}
            autoComplete="off"
            className="min-h-9 max-w-sm py-1.5 text-sm"
          />
          <button
            type="button"
            className={cn(
              "min-h-9 rounded-lg border px-3 text-sm font-medium",
              missingOnly ? "border-primary bg-primary/10 text-foreground" : "border-border/70 text-muted-foreground hover:bg-muted",
            )}
            aria-pressed={missingOnly}
            onClick={() => setMissingOnly((current) => !current)}
          >
            {t("hr.hierarchy.filterMissing")}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {chartRows.length === 0 && offChartRows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("hr.hierarchy.noLoginMatch")}</p>
        ) : (
          <>
            <ul>{chartRows}</ul>
            {offChartRows.length > 0 ? (
              <section className="mt-3 border-t border-border/50 pt-3">
                <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("hr.hierarchy.notOnChart")}
                </h3>
                <ul className="mt-1">{offChartRows}</ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
