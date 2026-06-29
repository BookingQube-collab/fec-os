"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Award,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Medal,
  MessageSquare,
  RefreshCw,
  TicketCheck,
  Trophy,
  User,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  listLeaderboard,
  listStaffRecentActivity,
  refreshLeaderboard,
  type LeaderboardRow,
  type StaffActivityItem,
  type StaffActivityKind,
} from "@/lib/leaderboard.functions";
import { useSites } from "@/hooks/queries/useSites";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SortMode = "rank" | "recent";

const ACTIVITY_PREVIEW = 6;
const ACTIVITY_FETCH_LIMIT = 8;

const ACTIVITY_ICONS: Record<StaffActivityKind, typeof CheckSquare> = {
  task: CheckSquare,
  booking: Calendar,
  ticket: TicketCheck,
  complaint: MessageSquare,
  work_order: Wrench,
};

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatPeriodMonth(iso: string, locale: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

function pickEmployeeOfMonth(rows: LeaderboardRow[]): LeaderboardRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    if (b.overall_score !== a.overall_score) return b.overall_score - a.overall_score;
    return (a.rank ?? 999) - (b.rank ?? 999);
  })[0];
}

function Page() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("rank");

  const { data: locs } = useSites();
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", { locationId }],
    queryFn: () => listLeaderboard({ locationId }),
  });
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["leaderboard", "activity", { locationId }],
    queryFn: () =>
      listStaffRecentActivity({ locationId, days: 7, limit: ACTIVITY_FETCH_LIMIT }),
    refetchInterval: 60_000,
  });

  const lastActiveByProfile = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of activity ?? []) {
      if (!map.has(item.profile_id)) map.set(item.profile_id, item.at);
    }
    return map;
  }, [activity]);

  const sortedRows = useMemo(() => {
    const rows = [...(data ?? [])];
    if (sortMode === "recent") {
      rows.sort((a, b) => {
        const aAt = lastActiveByProfile.get(a.profile_id) ?? a.updated_at ?? "";
        const bAt = lastActiveByProfile.get(b.profile_id) ?? b.updated_at ?? "";
        return bAt.localeCompare(aAt);
      });
      return rows;
    }
    rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return rows;
  }, [data, sortMode, lastActiveByProfile]);

  const employeeOfMonth = useMemo(() => pickEmployeeOfMonth(data ?? []), [data]);

  const runnersUp = useMemo(() => {
    if (!data?.length) return [];
    return [...data]
      .filter((r) => r.id !== employeeOfMonth?.id)
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      .slice(0, 2);
  }, [data, employeeOfMonth]);

  const periodEnd = data?.[0]?.period_end;
  const monthLabel = periodEnd ? formatPeriodMonth(periodEnd, i18n.language) : null;

  const refreshMut = useMutation({
    mutationFn: () => refreshLeaderboard(),
    onSuccess: (r) => {
      toast.success(t("leaderboard.refreshSuccess", { count: r.count }));
      void qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rag-amber/10 text-rag-amber">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("leaderboard.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("leaderboard.subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={locationId ?? "all"}
            onValueChange={(v) => setLocationId(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("common.allBranches")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allBranches")}</SelectItem>
              {(locs ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rank">{t("leaderboard.sortRank")}</SelectItem>
              <SelectItem value="recent">{t("leaderboard.sortRecent")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
          >
            {refreshMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("leaderboard.refresh")}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          {t("leaderboard.loading")}
        </div>
      ) : employeeOfMonth ? (
        <EmployeeOfMonthHero
          row={employeeOfMonth}
          monthLabel={monthLabel}
          branchScoped={!!locationId}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("leaderboard.empty")}
        </div>
      )}

      {runnersUp.length > 0 && <RunnersUpRow rows={runnersUp} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RankingsTable
            rows={sortedRows}
            isLoading={isLoading}
            showBranch={!locationId}
            lastActiveByProfile={lastActiveByProfile}
            highlightId={employeeOfMonth?.id}
          />
        </div>
        <RecentActivityPanel
          items={activity ?? []}
          loading={activityLoading}
          showBranch={!locationId}
        />
      </div>
    </div>
  );
}

function EmployeeOfMonthHero({
  row,
  monthLabel,
  branchScoped,
}: {
  row: LeaderboardRow;
  monthLabel: string | null;
  branchScoped: boolean;
}) {
  const { t } = useTranslation();
  const name = row.profiles.display_name ?? "—";
  const code = row.profiles.role;
  const branch = row.location;

  const stats = [
    { label: t("leaderboard.tasks"), value: row.tasks_completed, icon: CheckSquare },
    { label: t("leaderboard.incidents"), value: row.incidents_resolved, icon: TicketCheck },
    { label: t("leaderboard.complaints"), value: row.complaints_handled, icon: MessageSquare },
    { label: t("leaderboard.bookings"), value: row.bookings_created, icon: Calendar },
  ];

  return (
    <section className="relative overflow-hidden rounded-xl border border-rag-amber/30 bg-gradient-to-br from-rag-amber/10 via-card to-card">
      <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-rag-amber/10 blur-2xl" />
      <div className="relative flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-5">
          <Avatar className="h-20 w-20 border-2 border-rag-amber/40 shadow-lg shadow-rag-amber/10">
            <AvatarFallback className="bg-rag-amber/15 text-xl font-semibold text-rag-amber">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-rag-amber/40 bg-rag-amber/15 text-rag-amber hover:bg-rag-amber/15">
                <Trophy className="mr-1.5 h-3.5 w-3.5" />
                {t("leaderboard.eomBadge")}
              </Badge>
              {monthLabel && (
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {monthLabel}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {name}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {code}
              {branch && (
                <>
                  <span className="mx-1.5 text-border">·</span>
                  {branch.code} — {branch.name}
                </>
              )}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {branchScoped ? t("leaderboard.eomBranchCaption") : t("leaderboard.eomOverallCaption")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-rag-amber/20 bg-background/90 px-8 py-5 text-center">
          <div className="text-4xl font-bold tabular-nums text-foreground">{row.overall_score}</div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("leaderboard.score")}
          </div>
          {row.badge && (
            <div className="mt-3">
              <BadgeIcon badge={row.badge} />
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-rag-amber/20 bg-rag-amber/10 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-3 bg-card/80 px-5 py-4">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RunnersUpRow({ rows }: { rows: LeaderboardRow[] }) {
  const { t } = useTranslation();
  const icons = [Medal, Award];

  return (
    <section>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("leaderboard.runnersUp")}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row, i) => {
          const Icon = icons[i] ?? Award;
          const name = row.profiles.display_name ?? "—";
          return (
            <div
              key={row.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs font-medium">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{name}</div>
                <div className="text-xs text-muted-foreground">
                  #{row.rank ?? "—"}
                  {row.location && ` · ${row.location.code}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums text-foreground">
                  {row.overall_score}
                </div>
                <div className="text-[10px] uppercase text-muted-foreground">
                  {t("leaderboard.score")}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RankingsTable({
  rows,
  isLoading,
  showBranch,
  lastActiveByProfile,
  highlightId,
}: {
  rows: LeaderboardRow[];
  isLoading: boolean;
  showBranch: boolean;
  lastActiveByProfile: Map<string, string>;
  highlightId?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{t("leaderboard.rankingsTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("leaderboard.rankingsSubtitle")}</p>
      </div>
      <div className="max-h-[min(70vh,640px)] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14">{t("leaderboard.rank")}</TableHead>
              <TableHead>{t("leaderboard.staff")}</TableHead>
              <TableHead className="text-right">{t("leaderboard.score")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                {t("leaderboard.lastActive")}
              </TableHead>
              <TableHead className="w-24">{t("leaderboard.badge")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {t("leaderboard.loading")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {t("leaderboard.empty")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const lastActiveAt =
                lastActiveByProfile.get(row.profile_id) ?? row.updated_at ?? null;
              const recentlyActive = isWithinDays(lastActiveByProfile.get(row.profile_id), 2);
              const isEom = row.id === highlightId;

              return (
                <TableRow
                  key={row.id}
                  className={cn(
                    recentlyActive && "bg-rag-amber/[0.03]",
                    isEom && "bg-rag-amber/[0.06]",
                  )}
                >
                  <TableCell className="font-mono text-sm font-semibold">
                    {row.rank ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-[10px] font-medium">
                          {getInitials(row.profiles.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground">
                            {row.profiles.display_name ?? "—"}
                          </span>
                          {recentlyActive && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                              <Zap className="mr-0.5 h-2.5 w-2.5" />
                              {t("leaderboard.activeNow")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.profiles.role}
                          {showBranch && row.location && (
                            <>
                              <span className="mx-1 text-border">·</span>
                              {row.location.code}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-base font-semibold tabular-nums">
                    {row.overall_score}
                  </TableCell>
                  <TableCell className="hidden text-right text-sm text-muted-foreground sm:table-cell">
                    {formatRelativeTime(lastActiveAt)}
                  </TableCell>
                  <TableCell>
                    <BadgeIcon badge={row.badge} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RecentActivityPanel({
  items,
  loading,
  showBranch,
}: {
  items: StaffActivityItem[];
  loading: boolean;
  showBranch: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, ACTIVITY_PREVIEW);
  const hasMore = items.length > ACTIVITY_PREVIEW;

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-rag-amber" />
          <h2 className="text-sm font-semibold text-foreground">{t("leaderboard.recentTitle")}</h2>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("leaderboard.recentSubtitle")}</p>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {t("leaderboard.loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {t("leaderboard.recentEmpty")}
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-border overflow-auto">
            {visible.map((item) => {
              const Icon = ACTIVITY_ICONS[item.kind];
              return (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted/80">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">{item.staff_name}</span>
                        <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                          {t(`leaderboard.activity.${item.kind}`)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.summary}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground/80">
                        <span>{formatRelativeTime(item.at)}</span>
                        {showBranch && item.location_label && (
                          <span className="truncate">{item.location_label}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div className="border-t border-border p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="mr-1 h-3.5 w-3.5" />
                    {t("leaderboard.showLess")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-3.5 w-3.5" />
                    {t("leaderboard.viewAll", { count: items.length })}
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function isWithinDays(iso: string | undefined, days: number) {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  return Date.now() - at <= days * 86_400_000;
}

function formatRelativeTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function BadgeIcon({ badge }: { badge: string | null }) {
  if (!badge) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<
    string,
    { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    gold: { icon: <Trophy className="mr-1 h-3 w-3" />, variant: "default" },
    silver: { icon: <Medal className="mr-1 h-3 w-3" />, variant: "secondary" },
    bronze: { icon: <Award className="mr-1 h-3 w-3" />, variant: "outline" },
    top10: { icon: <User className="mr-1 h-3 w-3" />, variant: "outline" },
  };
  const cfg = map[badge] ?? { icon: null, variant: "outline" as const };
  return (
    <Badge variant={cfg.variant} className="text-[10px]">
      {cfg.icon}
      {badge}
    </Badge>
  );
}

export default Page;
