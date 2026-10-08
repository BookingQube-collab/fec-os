"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  LayoutGrid,
  Mail,
  MapPin,
  Search,
  Plus,
  RefreshCw,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import dynamic from "next/dynamic";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
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
import { useSites } from "@/hooks/queries/useSites";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { listUploadedRosterAssignments } from "@/lib/attendance-hr/roster-register.functions";
import { listEmployeeDocuments } from "@/lib/hr-documents.functions";
import {
  QUALIFICATION_DOC_TYPES,
  addCalendarDays,
  dueQualifications,
  extraRosterPlaces,
  filterLocations,
  filterStaffByQuery,
  isCancelledShift,
  isQualificationRecord,
  placeCounts,
  qatarDayBounds,
  qatarToday,
  rosterDays,
  shiftFormError,
  splitMyShifts,
  windowEnd,
  workforceTab,
  type WorkforceTab,
} from "@/lib/hr-workforce";
import { venueTitle } from "@/lib/locations/normalize";
import { createShift, listShifts, listStaff } from "@/lib/people.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type Site = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  region: string | null;
  status: string;
  timezone?: string | null;
};

type StaffPerson = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  status: string | null;
  locationId: string | null;
};

type ShiftRow = {
  id: string;
  location_id: string;
  user_id: string | null;
  staff_id: string | null;
  role_label: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  swap_requested_at: string | null;
  swap_requested_for: string | null;
};

type RosterFocus = "roster" | "members" | "access";

const TAB_ICONS: Record<WorkforceTab, LucideIcon> = {
  workspace: Users,
  locations: MapPin,
  bulk: LayoutGrid,
  offers: CalendarDays,
  staffing: BadgeCheck,
  renewals: RefreshCw,
};

const PURPLE = "bg-electric text-white hover:bg-electric/90";

const ShiftRosterImport = dynamic(
  () => import("@/views/staff-roster-import-page").then((mod) => mod.ShiftRosterImport),
  {
    ssr: false,
    loading: () => <BulkRosterLoader />,
  },
);

function BulkRosterLoader() {
  const { t } = useTranslation();
  return <FecLoader label={t("common.loading")} />;
}

function qatarClock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function qatarDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

export default function HrWorkforcePage() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const tab = workforceTab(params.get("tab"));
  const canEdit = usePermission("people.edit_roster");
  const canDocs = usePermission("hr.docs.manage") || usePermission("hr.manage");
  const sitesQuery = useSites();
  const sites = (sitesQuery.data ?? []) as Site[];
  const [teamId, setTeamId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [start, setStart] = useState(() => qatarToday());

  useEffect(() => {
    if (!sites.length) return;
    setTeamId((current) => (current && sites.some((site) => site.id === current) ? current : sites[0]!.id));
  }, [sites]);

  function selectTab(next: WorkforceTab) {
    const query = new URLSearchParams(params.toString());
    if (next === "workspace") query.delete("tab");
    else query.set("tab", next);
    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openTeam(id: string) {
    setTeamId(id);
    selectTab("workspace");
  }

  function refresh() {
    void qc.invalidateQueries({ queryKey: queryKeys.sites.all });
    void qc.invalidateQueries({ queryKey: queryKeys.people.all });
  }

  return (
    <CapabilityGate capability="people.view_roster" fallback={<Denied />}>
      <HrShell className="min-w-0 overflow-x-clip">
        <HrSection
          className="min-w-0"
          kicker={t("hrWorkspace.workforce.kicker")}
          title={t("hrWorkspace.workforce.title")}
          subtitle={t("hrWorkspace.workforce.subtitle")}
          actions={
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={refresh}>
              <RefreshCw />
              {t("hrWorkspace.team.refresh")}
            </Button>
          }
        >
          {sitesQuery.isLoading ? <FecLoader label={t("common.loading")} /> : null}
          {sitesQuery.isError ? <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p> : null}
          {!sitesQuery.isLoading && !sitesQuery.isError && sites.length === 0 ? (
            <HrPanel className="px-4 py-2">
              <HrEmptyState message={t("hrWorkspace.workforce.empty")} icon={Building2} />
            </HrPanel>
          ) : null}
          {sites.length > 0 ? (
            <div className="min-w-0 space-y-4">
              {tab === "workspace" || tab === "offers" ? <WindowBar start={start} onStart={setStart} /> : null}
              <Tabs value={tab} onValueChange={(value) => selectTab(workforceTab(value))} className="min-w-0">
                <TabsList aria-label={t("hrWorkspace.workforce.tabsLabel")} className="max-w-full">
                  {(["workspace", "locations", "bulk", "offers", "staffing", "renewals"] as const).map((id) => {
                    const Icon = TAB_ICONS[id];
                    return (
                      <TabsTrigger key={id} value={id}>
                        <Icon aria-hidden />
                        {t(`hrWorkspace.workforce.tabs.${id}`)}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                <TabsContent value="workspace" className="min-w-0">
                  <TeamWorkspace
                    sites={sites}
                    teamId={teamId}
                    start={start}
                    canEdit={canEdit}
                    onTeam={setTeamId}
                    onLocations={() => selectTab("locations")}
                    onCreate={() => setCreateOpen(true)}
                  />
                </TabsContent>
                <TabsContent value="locations" className="min-w-0">
                  <LocationsPanel sites={sites} onOpen={openTeam} onAdd={() => selectTab("locations")} />
                </TabsContent>
                <TabsContent value="bulk" className="min-w-0">
                  <BulkPanel />
                </TabsContent>
                <TabsContent value="offers" className="min-w-0">
                  <OffersPanel sites={sites} start={start} />
                </TabsContent>
                <TabsContent value="staffing" className="min-w-0">
                  <StaffingPanel canDocs={canDocs} />
                </TabsContent>
                <TabsContent value="renewals" className="min-w-0">
                  <RenewalsPanel canDocs={canDocs} />
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </HrSection>
        {teamId ? (
          <CreateShiftDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            locationId={teamId}
            locationName={sites.find((site) => site.id === teamId)?.name ?? ""}
          />
        ) : null}
      </HrShell>
    </CapabilityGate>
  );
}

function Denied() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <HrEmptyState message={t("hr.dashboard.noAccess")} />
    </HrShell>
  );
}

function WindowBar({ start, onStart }: { start: string; onStart: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor="workforce-window">{t("hrWorkspace.workforce.workspace.range")}</Label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input
          id="workforce-window"
          type="date"
          value={start}
          onChange={(event) => event.target.value && onStart(event.target.value)}
          className="w-full min-w-0 sm:w-44"
        />
        <Button type="button" size="sm" variant="outline" onClick={() => onStart(addCalendarDays(start, -14))}>
          {t("hrWorkspace.workforce.workspace.previous")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onStart(qatarToday())}>
          {t("hrWorkspace.workforce.workspace.today")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onStart(addCalendarDays(start, 14))}>
          {t("hrWorkspace.workforce.workspace.next")}
        </Button>
        <p className="min-w-0 text-sm text-muted-foreground">{t("hrWorkspace.workforce.timezoneNote")}</p>
      </div>
    </div>
  );
}

function TeamWorkspace({
  sites,
  teamId,
  start,
  canEdit,
  onTeam,
  onLocations,
  onCreate,
}: {
  sites: Site[];
  teamId: string | null;
  start: string;
  canEdit: boolean;
  onTeam: (id: string) => void;
  onLocations: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState<RosterFocus>("roster");
  const end = windowEnd(start);
  const bounds = qatarDayBounds(start, end);
  const team = sites.find((site) => site.id === teamId) ?? null;

  const shifts = useQuery({
    queryKey: [...queryKeys.people.shifts(teamId), bounds.from, bounds.to],
    queryFn: () => listShifts({ locationId: teamId, from: bounds.from, to: bounds.to }),
    enabled: Boolean(teamId),
    staleTime: STALE.people,
  });
  const roster = useQuery({
    queryKey: queryKeys.people.rosterRegister({ scope: "workforce", locationId: teamId, dateFrom: start, dateTo: end }),
    queryFn: () => listUploadedRosterAssignments({ locationId: teamId, dateFrom: start, dateTo: end }),
    enabled: Boolean(teamId),
    staleTime: STALE.people,
  });
  const members = useQuery({
    queryKey: queryKeys.people.staff(teamId),
    queryFn: () => listStaff({ locationId: teamId }),
    enabled: Boolean(teamId),
    staleTime: STALE.people,
  });

  const shiftRows = (shifts.data ?? []) as ShiftRow[];
  const rosterRows = roster.data?.rows ?? [];
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of members.data ?? []) map.set(person.id, person.full_name);
    return map;
  }, [members.data]);
  const counts = useMemo(() => {
    const base = placeCounts(
      shiftRows.map((row) => ({
        staffId: row.staff_id,
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        swapRequestedAt: row.swap_requested_at,
      })),
      Date.now(),
    );
    const extra = extraRosterPlaces(
      rosterRows.map((row) => ({
        staffId: row.staffId,
        workDate: row.workDate,
        isWeekOff: row.isWeekOff,
        leaveType: row.leaveType,
      })),
      shiftRows.map((row) => ({
        staffId: row.staff_id,
        status: row.status,
        day: qatarDay(row.starts_at),
        swapRequestedAt: row.swap_requested_at,
      })),
    );
    return {
      ...base,
      accepted: base.accepted + extra,
      total: base.total + extra,
    };
  }, [rosterRows, shiftRows]);
  const shiftDays = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const row of shiftRows) {
      if (isCancelledShift(row.status)) continue;
      const day = qatarDay(row.starts_at);
      const list = map.get(day) ?? [];
      list.push(row);
      map.set(day, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shiftRows]);
  const days = rosterDays(rosterRows);
  const loading = shifts.isLoading || roster.isLoading;
  const rosterEmpty = !loading && shiftDays.length === 0 && days.length === 0;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="workforce-team">{t("hrWorkspace.team.teamLabel")}</Label>
          <SearchableSelect
            id="workforce-team"
            className="mt-1"
            value={teamId ?? ""}
            onValueChange={onTeam}
            placeholder={t("hrWorkspace.team.teamLabel")}
            options={sites.map((site) => ({ value: site.id, label: venueTitle(site) }))}
          />
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onLocations}>
            <Building2 />
            {t("hrWorkspace.workforce.addSite")}
          </Button>
          <Button type="button" className={PURPLE} onClick={onLocations}>
            <Plus />
            {t("hrWorkspace.workforce.addTeam")}
          </Button>
        </div>
      </div>

      {team ? (
        <HrPanel className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--electric)_16%,white)] text-electric">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{venueTitle(team)}</p>
              <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.locationProfile")}</p>
            </div>
          </div>
          <Link href="/admin/locations" className="shrink-0 text-sm font-semibold text-electric hover:underline">
            {t("hrWorkspace.workforce.details")}
          </Link>
        </HrPanel>
      ) : null}

      <div className="flex min-w-0 flex-wrap gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href="/people?tab=staff">{t("hrWorkspace.workforce.skillsCatalogue")}</Link>
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/people?tab=staff">
            <Plus />
            {t("hrWorkspace.workforce.addMember")}
          </Link>
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/admin">
            <Shield />
            {t("hrWorkspace.workforce.grantLead")}
          </Link>
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/people/roster">{t("hrWorkspace.workforce.recurring")}</Link>
        </Button>
        <Button type="button" className={PURPLE} onClick={onCreate} disabled={!canEdit}>
          <Plus />
          {t("hrWorkspace.workforce.create.action")}
        </Button>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("hrWorkspace.workforce.stats.upcoming")}
          value={loading ? "…" : String(counts.upcomingLive)}
        />
        <Stat
          label={t("hrWorkspace.workforce.stats.accepted")}
          value={loading ? "…" : t("hrWorkspace.workforce.stats.acceptedOf", { accepted: counts.accepted, total: counts.total })}
        />
        <Stat label={t("hrWorkspace.workforce.stats.unfilled")} value={loading ? "…" : String(counts.unfilled)} />
        <Stat label={t("hrWorkspace.workforce.stats.awaiting")} value={loading ? "…" : String(counts.awaiting)} />
      </div>

      <div className="fec-inner-tabs max-w-full" role="tablist" aria-label={team ? venueTitle(team) : t("hrWorkspace.workforce.tabs.workspace")}>
        {(["roster", "members", "access"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={cn("fec-inner-tab", focus === id && "is-active")}
            aria-pressed={focus === id}
            onClick={() => setFocus(id)}
          >
            {t(`hrWorkspace.workforce.workspace.${id}`)}
          </button>
        ))}
      </div>

      {focus === "roster" ? (
        <div className="min-w-0 space-y-4">
          <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.placesNote")}</p>
          {loading ? <FecLoader label={t("common.loading")} /> : null}
          {shifts.isError && roster.isError ? <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p> : null}
          {shifts.isError || roster.isError ? (
            shifts.isError && roster.isError ? null : <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
          ) : null}
          {rosterEmpty ? (
            <QuietEmpty
              icon={CalendarDays}
              message={t("hrWorkspace.workforce.workspace.empty")}
              hint={t("hrWorkspace.workforce.workspace.emptyHint")}
            />
          ) : null}
          {shiftDays.length > 0 ? (
            <div className="min-w-0 space-y-4">
              {shiftDays.map(([day, rows]) => (
                <section key={day} className="min-w-0">
                  <h3 className="mb-2 text-sm font-semibold">{formatWorkDateDdMmYyyy(day)}</h3>
                  <ul className="space-y-2">
                    {rows.map((row) => (
                      <li key={row.id} className="hr-list-row min-w-0">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {row.role_label ||
                              (row.staff_id ? names.get(row.staff_id) : null) ||
                              t("hrWorkspace.workforce.workspace.unassigned")}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {qatarClock(row.starts_at)}–{qatarClock(row.ends_at)}
                            {row.staff_id && names.get(row.staff_id) && row.role_label
                              ? ` · ${names.get(row.staff_id)}`
                              : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
          {shiftDays.length === 0 && days.length > 0 ? (
            <div className="min-w-0 space-y-4">
              {days.map((day) => (
                <section key={day.date} className="min-w-0">
                  <h3 className="mb-2 text-sm font-semibold">{formatWorkDateDdMmYyyy(day.date)}</h3>
                  <ul className="space-y-2">
                    {day.rows.map((row) => (
                      <li key={row.id} className="hr-list-row min-w-0">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.staffName ?? t("hrWorkspace.unknownStaff")}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.isWeekOff
                              ? t("hrWorkspace.workforce.workspace.weekOff")
                              : row.leaveType
                                ? t(`hr.leave.types.${row.leaveType}`, { defaultValue: row.leaveType })
                                : [row.shiftStart, row.shiftEnd].filter(Boolean).join("–") || row.employeeCode || "—"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {focus === "members" ? (
        members.isLoading ? (
          <FecLoader label={t("common.loading")} />
        ) : members.isError ? (
          <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
        ) : (members.data ?? []).length === 0 ? (
          <QuietEmpty icon={Users} message={t("hrWorkspace.workforce.workspace.membersEmpty")} />
        ) : (
          <ul className="space-y-2">
            {(members.data ?? []).map((person) => (
              <li key={person.id} className="hr-list-row min-w-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{person.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[person.employee_code, person.job_title, person.department].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <Link
                  href={`/people/staff/${person.id}`}
                  className="shrink-0 text-xs font-medium text-electric underline-offset-4 hover:underline"
                >
                  {t("people.profile.skills")}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {focus === "access" && team ? (
        <HrPanel className="min-w-0 space-y-3 p-4">
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("hrWorkspace.workforce.workspace.accessBody", { timezone: team.timezone || "Asia/Qatar" })}
          </p>
          <Button type="button" variant="outline" asChild>
            <Link href="/people/hr/shift-policy">{t("hrWorkspace.workforce.hours")}</Link>
          </Button>
        </HrPanel>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="min-w-0 rounded-2xl border border-border/40 bg-card px-4 py-4 shadow-[0_4px_20px_color-mix(in_oklab,#6d4aff_10%,transparent)]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
    </article>
  );
}

function QuietEmpty({ icon: Icon, message, hint }: { icon: LucideIcon; message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="font-semibold">{message}</p>
      {hint ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function LocationsPanel({
  sites,
  onOpen,
  onAdd,
}: {
  sites: Site[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const visible = useMemo(
    () => filterLocations(sites, query, kind === "all" || kind === "uncategorized" ? "all" : kind),
    [sites, query, kind],
  );
  const typeOptions = [
    { value: "all", label: t("hrWorkspace.workforce.locations.allTypes") },
    { value: "uncategorized", label: t("hrWorkspace.workforce.locations.uncategorized") },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("hrWorkspace.workforce.locations.heading", { count: sites.length })}</h2>
          <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.locations.intro")}</p>
        </div>
        <Button type="button" className={cn(PURPLE, "w-full sm:w-auto")} onClick={onAdd}>
          <Plus />
          {t("hrWorkspace.workforce.locations.add")}
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Label htmlFor="workforce-location-search" className="sr-only">
            {t("hrWorkspace.workforce.locations.find")}
          </Label>
          <Input
            id="workforce-location-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("hrWorkspace.workforce.locations.find")}
            className="min-w-0 ps-9"
          />
        </div>
        <SearchableSelect
          aria-label={t("hrWorkspace.workforce.locations.allTypes")}
          className="w-full sm:w-44"
          value={kind}
          onValueChange={setKind}
          options={typeOptions}
        />
      </div>
      {visible.length === 0 ? (
        <QuietEmpty icon={MapPin} message={t("hrWorkspace.workforce.locations.empty")} />
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((site) => {
            const type = t("hrWorkspace.workforce.locations.uncategorized");
            return (
              <li key={site.id} className="min-w-0">
                <article className="hr-panel flex h-full min-w-0 flex-col">
                  <div className="relative flex h-36 items-center justify-center bg-[linear-gradient(160deg,color-mix(in_oklab,var(--electric)_22%,white),color-mix(in_oklab,var(--electric)_8%,white))]">
                    <span className="absolute end-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-xs text-muted-foreground">
                      {type}
                    </span>
                    <span className="grid h-16 w-16 place-items-center rounded-2xl bg-card/80 text-electric shadow-sm">
                      <MapPin className="h-7 w-7" aria-hidden />
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                    <h3 className="truncate font-semibold">{venueTitle(site)}</h3>
                    <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{t("hrWorkspace.workforce.locations.noAddress")}</span>
                    </p>
                    <div className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t border-border/50 pt-3">
                      <span className="truncate text-xs text-muted-foreground">{site.timezone || "—"}</span>
                      <button
                        type="button"
                        className="shrink-0 text-sm font-semibold text-electric hover:underline"
                        onClick={() => onOpen(site.id)}
                      >
                        {t("hrWorkspace.workforce.locations.viewProfile")}
                      </button>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BulkPanel() {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold">{t("hrWorkspace.workforce.tabs.bulk")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("hrWorkspace.workforce.bulk.body")}</p>
      </div>
      <ShiftRosterImport embedded />
      <p className="text-xs text-muted-foreground">
        <Link href="/people/roster" className="font-medium text-electric hover:underline">
          {t("hrWorkspace.workforce.bulk.monthly")}
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/people/attendance/roster" className="font-medium text-electric hover:underline">
          {t("hrWorkspace.workforce.bulk.register")}
        </Link>
      </p>
    </div>
  );
}

function OffersPanel({ sites, start }: { sites: Site[]; start: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const end = windowEnd(start);
  const bounds = qatarDayBounds(start, end);
  const shifts = useQuery({
    queryKey: [...queryKeys.people.shifts("mine"), bounds.from, bounds.to],
    queryFn: () => listShifts({ from: bounds.from, to: bounds.to }),
    staleTime: STALE.people,
  });
  const staff = useQuery({
    queryKey: queryKeys.people.staff(null),
    queryFn: () => listStaff({}),
    staleTime: STALE.people,
  });
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of staff.data ?? []) map.set(row.id, row.full_name);
    return map;
  }, [staff.data]);
  const siteName = useMemo(() => new Map(sites.map((site) => [site.id, site.name])), [sites]);
  const split = splitMyShifts(
    ((shifts.data ?? []) as ShiftRow[]).map((row) => ({
      ...row,
      userId: row.user_id,
      swapRequestedAt: row.swap_requested_at,
      swapRequestedFor: row.swap_requested_for,
    })),
    user?.id ?? "",
  );

  return (
    <div className="min-w-0 space-y-4">
      {shifts.isLoading ? <FecLoader label={t("common.loading")} /> : null}
      {shifts.isError ? <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p> : null}
      {!shifts.isLoading && !shifts.isError ? (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
          <HrPanel className="min-w-0 space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t("hrWorkspace.workforce.offers.mine")}</h2>
            {split.mine.length === 0 ? (
              <QuietEmpty icon={CalendarDays} message={t("hrWorkspace.workforce.offers.empty")} />
            ) : (
              <ShiftList rows={split.mine} names={names} siteName={siteName} />
            )}
          </HrPanel>
          <HrPanel className="min-w-0 space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t("hrWorkspace.workforce.offers.title")}</h2>
            {split.offers.length === 0 ? (
              <QuietEmpty icon={CalendarDays} message={t("hrWorkspace.workforce.offers.offersEmpty")} />
            ) : (
              <ShiftList rows={split.offers} names={names} siteName={siteName} />
            )}
          </HrPanel>
        </div>
      ) : null}
    </div>
  );
}

function ShiftList({
  rows,
  names,
  siteName,
}: {
  rows: Array<ShiftRow & { userId: string | null }>;
  names: Map<string, string>;
  siteName: Map<string, string>;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="hr-list-row min-w-0">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.role_label || names.get(row.staff_id ?? "") || siteName.get(row.location_id) || "—"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[siteName.get(row.location_id), `${qatarClock(row.starts_at)}–${qatarClock(row.ends_at)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{formatWorkDateDdMmYyyy(qatarDay(row.starts_at))}</span>
        </li>
      ))}
    </ul>
  );
}

function StaffingPanel({ canDocs }: { canDocs: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [staffId, setStaffId] = useState("");
  const [typeName, setTypeName] = useState("");
  const people = useQuery({
    queryKey: queryKeys.people.staff(null),
    queryFn: () => listStaff({}),
    staleTime: STALE.people,
  });
  const docs = useQuery({
    queryKey: queryKeys.people.hrDocs({ view: "workforce" }),
    queryFn: () => listEmployeeDocuments({}),
    enabled: canDocs && Boolean(staffId),
    staleTime: STALE.people,
  });
  const directory = useMemo<StaffPerson[]>(
    () =>
      (people.data ?? []).map((row) => ({
        id: row.id,
        fullName: row.full_name,
        employeeCode: row.employee_code,
        jobTitle: row.job_title,
        department: row.department,
        status: row.status,
        locationId: row.location_id,
      })),
    [people.data],
  );
  const matches = filterStaffByQuery(directory, query).slice(0, 12);
  const person = directory.find((row) => row.id === staffId) ?? null;
  const profileOptions = (person && !matches.some((row) => row.id === person.id) ? [person, ...matches] : matches).map(
    (row) => ({
      value: row.id,
      label: row.employeeCode ? `${row.fullName} · ${row.employeeCode}` : row.fullName,
    }),
  );
  const certificates = (docs.data ?? []).filter((doc) => doc.staffId === staffId && isQualificationRecord(doc));

  return (
    <div className="min-w-0 space-y-4">
      <HrPanel className="min-w-0 space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-semibold">{t("hrWorkspace.workforce.staffing.selection")}</h2>
        <div className="space-y-1">
          <Label htmlFor="workforce-staff-search">{t("hrWorkspace.workforce.staffing.find")}</Label>
          <Input
            id="workforce-staff-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("hrWorkspace.workforce.staffing.searchPlaceholder")}
            className="min-w-0"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="workforce-staff-profile">{t("hrWorkspace.workforce.staffing.profile")}</Label>
          <SearchableSelect
            id="workforce-staff-profile"
            value={staffId}
            onValueChange={setStaffId}
            placeholder={t("hrWorkspace.workforce.staffing.select")}
            options={profileOptions}
          />
          {query.trim().length >= 2 && matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.staffing.none")}</p>
          ) : null}
        </div>
        {person && canDocs ? (
          <div className="min-w-0 space-y-2 border-t border-border/50 pt-3">
            <p className="truncate text-sm text-muted-foreground">
              {[person.employeeCode, person.jobTitle, person.department].filter(Boolean).join(" · ")}
            </p>
            {docs.isLoading ? <FecLoader label={t("common.loading")} /> : null}
            {docs.isError ? <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p> : null}
            {!docs.isLoading && !docs.isError && certificates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.staffing.empty")}</p>
            ) : null}
            <ul className="space-y-2">
              {certificates.map((doc) => (
                <li key={doc.id} className="hr-list-row min-w-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {doc.qualification || doc.title || t(`hr.docs.types.${doc.docType}`, { defaultValue: doc.docType })}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {doc.expiryDate ? formatWorkDateDdMmYyyy(doc.expiryDate) : t("hrWorkspace.workforce.staffing.noExpiry")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {person && !canDocs ? <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.staffing.noAccess")}</p> : null}
      </HrPanel>

      <HrPanel className="min-w-0 space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">{t("hrWorkspace.workforce.staffing.typesTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("hrWorkspace.workforce.staffing.typesHint")}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="workforce-type-name">{t("hrWorkspace.workforce.staffing.typeName")}</Label>
            <Input
              id="workforce-type-name"
              value={typeName}
              onChange={(event) => setTypeName(event.target.value)}
              className="min-w-0"
            />
          </div>
          <Button
            type="button"
            className={cn(PURPLE, "w-full sm:w-auto")}
            onClick={() => router.push("/people/hr/documents")}
          >
            <Plus />
            {t("hrWorkspace.workforce.staffing.addType")}
          </Button>
        </div>
        {QUALIFICATION_DOC_TYPES.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.staffing.noTypes")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {QUALIFICATION_DOC_TYPES.map((type) => (
              <li key={type}>{t(`hr.docs.types.${type}`)}</li>
            ))}
          </ul>
        )}
      </HrPanel>
      <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.staffing.hint")}</p>
    </div>
  );
}

function RenewalsPanel({ canDocs }: { canDocs: boolean }) {
  const { t } = useTranslation();
  const today = qatarToday();
  const docs = useQuery({
    queryKey: queryKeys.people.hrDocs({ view: "workforce-renewals" }),
    queryFn: () => listEmployeeDocuments({}),
    enabled: canDocs,
    staleTime: STALE.people,
  });
  const due = useMemo(() => dueQualifications(docs.data ?? [], today), [docs.data, today]);

  return (
    <div className="min-w-0 space-y-4">
      <HrPanel className="min-w-0 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">{t("hrWorkspace.workforce.renewals.rulesTitle")}</h2>
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/people/hr/settings?section=document">
              <RefreshCw />
              {t("hrWorkspace.workforce.renewals.configure")}
            </Link>
          </Button>
        </div>
      </HrPanel>

      <HrPanel className="min-w-0 space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">{t("hrWorkspace.workforce.renewals.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("hrWorkspace.workforce.renewals.hint")}</p>
        </div>
        {!canDocs ? <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.staffing.noAccess")}</p> : null}
        {canDocs && docs.isLoading ? <FecLoader label={t("common.loading")} /> : null}
        {canDocs && docs.isError ? <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p> : null}
        {canDocs && !docs.isLoading && !docs.isError ? (
          <>
            <p className="text-sm font-medium">{t("hrWorkspace.workforce.renewals.dueCount", { count: due.length })}</p>
            {(docs.data ?? []).length >= 200 ? (
              <p className="text-sm text-muted-foreground">{t("hrWorkspace.workforce.renewals.capped")}</p>
            ) : null}
            <div className="min-w-0 overflow-x-auto rounded-xl border border-dashed border-border/70">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-start text-muted-foreground">
                    <th className="px-4 py-3 text-start font-medium">{t("hrWorkspace.workforce.renewals.colPerson")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("hrWorkspace.workforce.renewals.colExpiry")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("hrWorkspace.workforce.renewals.colReminder")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("hrWorkspace.workforce.renewals.colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {due.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <QuietEmpty
                          icon={Mail}
                          message={t("hrWorkspace.workforce.renewals.empty")}
                          hint={t("hrWorkspace.workforce.renewals.emptyHint")}
                        />
                      </td>
                    </tr>
                  ) : (
                    due.map((doc) => {
                      const expired = doc.expiryDate != null && doc.expiryDate < today;
                      const label =
                        doc.qualification || doc.title || t(`hr.docs.types.${doc.docType}`, { defaultValue: doc.docType });
                      return (
                        <tr key={doc.id} className="border-t border-border/50">
                          <td className="px-4 py-3">
                            <p className="font-medium">{doc.staffName ?? t("hrWorkspace.unknownStaff")}</p>
                            <p className="text-xs text-muted-foreground">{label}</p>
                          </td>
                          <td className="px-4 py-3">{doc.expiryDate ? formatWorkDateDdMmYyyy(doc.expiryDate) : "—"}</td>
                          <td className="px-4 py-3">
                            {expired ? t("hrWorkspace.workforce.renewals.expired") : t("hrWorkspace.workforce.renewals.dueSoon")}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/people/staff/${doc.staffId}`} className="font-semibold text-electric hover:underline">
                              {t("hrWorkspace.workforce.renewals.open")}
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </HrPanel>
    </div>
  );
}

function CreateShiftDialog({
  open,
  onOpenChange,
  locationId,
  locationName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  locationName: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [role, setRole] = useState("");
  const [staffId, setStaffId] = useState("");
  const [notes, setNotes] = useState("");
  const members = useQuery({
    queryKey: queryKeys.people.staff(locationId),
    queryFn: () => listStaff({ locationId }),
    enabled: open,
    staleTime: STALE.people,
  });
  const save = useMutation({
    mutationFn: () =>
      createShift({
        locationId,
        startsAt: localInputToIso(start),
        endsAt: localInputToIso(end),
        roleLabel: role.trim() || undefined,
        staffId: staffId || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("hrWorkspace.workforce.create.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.shifts(locationId) });
      onOpenChange(false);
      setStart("");
      setEnd("");
      setRole("");
      setStaffId("");
      setNotes("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit() {
    const problem = shiftFormError(start, end);
    if (problem === "required") {
      toast.error(t("hrWorkspace.workforce.create.required"));
      return;
    }
    if (problem === "order") {
      toast.error(t("hrWorkspace.workforce.create.order"));
      return;
    }
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hrWorkspace.workforce.create.title")}</DialogTitle>
          <DialogDescription>
            {locationName ? `${locationName}. ` : ""}
            {t("hrWorkspace.workforce.create.body")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="workforce-shift-start">{t("hrWorkspace.workforce.create.start")}</Label>
            <Input
              id="workforce-shift-start"
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="min-w-0"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="workforce-shift-end">{t("hrWorkspace.workforce.create.end")}</Label>
            <Input
              id="workforce-shift-end"
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="min-w-0"
            />
          </div>
          <div className="min-w-0 space-y-1 sm:col-span-2">
            <Label htmlFor="workforce-shift-role">{t("hrWorkspace.workforce.create.role")}</Label>
            <Input id="workforce-shift-role" value={role} onChange={(event) => setRole(event.target.value)} className="min-w-0" />
          </div>
          <div className="min-w-0 space-y-1 sm:col-span-2">
            <Label htmlFor="workforce-shift-person">{t("hrWorkspace.workforce.create.person")}</Label>
            <SearchableSelect
              id="workforce-shift-person"
              value={staffId}
              onValueChange={setStaffId}
              placeholder={t("hrWorkspace.workforce.workspace.unassigned")}
              emptyOption={{ value: "", label: t("hrWorkspace.workforce.workspace.unassigned") }}
              options={(members.data ?? []).map((person) => ({
                value: person.id,
                label: person.employee_code ? `${person.full_name} · ${person.employee_code}` : person.full_name,
              }))}
            />
          </div>
          <div className="min-w-0 space-y-1 sm:col-span-2">
            <Label htmlFor="workforce-shift-notes">{t("hrWorkspace.workforce.create.notes")}</Label>
            <Textarea id="workforce-shift-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={save.isPending}>
            {t("hrWorkspace.workforce.create.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
