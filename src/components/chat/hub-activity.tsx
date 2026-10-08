"use client";

import { ArrowRight, Calendar, Inbox, Plus, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { useActionInbox, useEscalations } from "@/hooks/queries/useNotifications";
import { listAnnouncements } from "@/lib/hr-announcements.functions";
import type { InboxItem } from "@/lib/notifications/inbox";
import { ackEscalation, markNotificationRead } from "@/lib/notifications.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

type Board = "mine" | "publishing";
type UpdateChip = "foryou" | "unread" | "ack";
type InboxBucket = "approvals" | "hr" | "training" | "updates";
type ReadFilter = "unread" | "all" | "read";

function stamp(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function matches(query: string, parts: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return parts.some((part) => part?.toLowerCase().includes(needle));
}

function inboxBucket(item: InboxItem): InboxBucket | null {
  const url = item.actionUrl.toLowerCase();
  const category = item.category.toLowerCase();
  if (url.includes("/training") || category.includes("training")) return "training";
  if (item.kind === "procurement" || item.kind === "weekly_report" || item.kind === "evaluation") return "approvals";
  if (category === "people" || url.includes("/people/hr") || url.includes("helpdesk")) return "hr";
  if (item.persisted) return "updates";
  return null;
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-8 shrink-0 rounded-full px-3 text-xs font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
        pressed ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80",
      )}
    >
      {children}
    </button>
  );
}

function Pill({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-5 items-center rounded-full border px-2 text-[11px] font-medium",
        live ? "border-transparent bg-primary/10 text-primary" : "border-border bg-background text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function NoticeFooter({
  note,
  href,
  onClick,
  pending = false,
}: {
  note: string;
  href?: string;
  onClick?: () => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const className =
    "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:opacity-50";
  const label = (
    <>
      {t("chat.readNotice")}
      <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
    </>
  );
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">{note}</p>
      {href ? (
        <Link href={href} className={className} onClick={onClick}>
          {label}
        </Link>
      ) : (
        <button type="button" className={className} disabled={pending} onClick={onClick}>
          {label}
        </button>
      )}
    </div>
  );
}

export function useHubActivityCounts(userId: string | null | undefined) {
  const inbox = useActionInbox(userId, { enabled: !!userId });
  const escalations = useEscalations({ enabled: !!userId });
  const items = inbox.data?.items ?? [];
  const updates =
    items.filter((item) => item.persisted && !item.readAt).length + (escalations.data?.length ?? 0);
  const inboxCount = inbox.data?.actionCount ?? 0;
  return { updates, inboxCount, loading: inbox.isLoading || escalations.isLoading };
}

export function HubActivity({ mode }: { mode: "updates" | "inbox" }) {
  const { t, i18n } = useTranslation();
  const language = useAppStore((s) => s.language);
  const locale = i18n.language || language;
  const { user } = useAuth();
  const canPublish = usePermission("hr.manage");
  const canReadBoard = canPublish || usePermission("hr.employee_app");
  const queryClient = useQueryClient();
  const inbox = useActionInbox(user?.id, { enabled: !!user });
  const escalations = useEscalations({ enabled: !!user && mode === "updates" });
  const announcements = useQuery({
    queryKey: [...queryKeys.notifications.all, "hub-announcements"],
    queryFn: () => listAnnouncements({}),
    enabled: !!user && mode === "updates" && canReadBoard,
    staleTime: 60_000,
  });
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState<Board>("mine");
  const [updateChip, setUpdateChip] = useState<UpdateChip>("foryou");
  const [bucket, setBucket] = useState<InboxBucket | "all">("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("unread");

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead({ id }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
  const ack = useMutation({
    mutationFn: (id: string) => ackEscalation({ id }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.escalations() }),
  });

  const notices = useMemo(
    () => (inbox.data?.items ?? []).filter((item) => item.persisted),
    [inbox.data?.items],
  );
  const reminders = useMemo(
    () => (inbox.data?.items ?? []).filter((item) => !item.persisted),
    [inbox.data?.items],
  );
  const escalationRows = escalations.data ?? [];
  const posts = announcements.data ?? [];
  const showBoard = canReadBoard && (announcements.isSuccess || announcements.isLoading);
  const publishing = mode === "updates" && board === "publishing" && showBoard;

  const unreadNotices = notices.filter((item) => !item.readAt).length;
  const ackCount = escalationRows.length;

  const visibleNotices = notices.filter((item) => {
    if (updateChip === "unread" && item.readAt) return false;
    if (updateChip === "ack") return false;
    return matches(query, [item.title, item.body, item.category]);
  });
  const visibleEscalations =
    updateChip === "unread"
      ? []
      : escalationRows.filter((row) => matches(query, [row.title, row.detail, row.source]));
  const visiblePosts = posts.filter((post) => matches(query, [post.title, post.body]));

  const bucketCounts = useMemo(() => {
    const counts: Record<InboxBucket, number> = { approvals: 0, hr: 0, training: 0, updates: 0 };
    for (const item of [...reminders, ...notices]) {
      const key = inboxBucket(item);
      if (key) counts[key] += 1;
    }
    return counts;
  }, [notices, reminders]);

  const inboxPool = bucket === "updates" ? notices : bucket === "all" ? reminders : [...reminders, ...notices];
  const inboxItems = inboxPool.filter((item) => {
    if (bucket !== "all" && inboxBucket(item) !== bucket) return false;
    if (readFilter === "unread" && item.readAt) return false;
    if (readFilter === "read" && !item.readAt) return false;
    const title = item.titleKey ? t(item.titleKey, item.titleParams) : item.title;
    return matches(query, [title, item.body, item.category]);
  });

  const loading =
    inbox.isLoading || (mode === "updates" && escalations.isLoading) || (publishing && announcements.isLoading);
  const updatesEmpty =
    !loading &&
    (publishing ? visiblePosts.length === 0 : visibleNotices.length === 0 && visibleEscalations.length === 0);
  const inboxFilteredEmpty = !loading && inboxItems.length === 0;
  const inboxClear =
    inboxFilteredEmpty && !query.trim() && bucket === "all" && readFilter !== "read";

  function refresh() {
    void inbox.refetch();
    void escalations.refetch();
    void announcements.refetch();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">
            {mode === "updates" ? t("chat.updatesTitle") : t("chat.inboxTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "updates" ? t("chat.updatesSubtitle") : t("chat.inboxSubtitle")}
          </p>
        </div>
        {mode === "updates" && canPublish ? (
          <Button asChild>
            <Link href="/people/hr/announcements">
              <Plus className="h-4 w-4" aria-hidden />
              {t("chat.createUpdate")}
            </Link>
          </Button>
        ) : null}
        {mode === "inbox" ? (
          <Button type="button" variant="outline" onClick={refresh} disabled={inbox.isFetching}>
            <RefreshCw className={cn("h-4 w-4", inbox.isFetching && "animate-spin")} aria-hidden />
            {t("chat.inboxRefresh")}
          </Button>
        ) : null}
      </div>

      {mode === "updates" ? (
        <div className="flex flex-wrap gap-1.5 pb-3" role="toolbar" aria-label={t("chat.updatesTitle")}>
          <Chip
            pressed={!publishing && updateChip === "foryou"}
            onClick={() => {
              setBoard("mine");
              setUpdateChip("foryou");
            }}
          >
            {t("chat.updatesForYou", { count: notices.length + ackCount })}
          </Chip>
          <Chip
            pressed={!publishing && updateChip === "unread"}
            onClick={() => {
              setBoard("mine");
              setUpdateChip("unread");
            }}
          >
            {t("chat.updatesUnread", { count: unreadNotices })}
          </Chip>
          {ackCount > 0 ? (
            <Chip
              pressed={!publishing && updateChip === "ack"}
              onClick={() => {
                setBoard("mine");
                setUpdateChip("ack");
              }}
            >
              {t("chat.updatesAck", { count: ackCount })}
            </Chip>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 pb-3" role="toolbar" aria-label={t("chat.inboxTitle")}>
          {bucketCounts.approvals > 0 ? (
            <Chip pressed={bucket === "approvals"} onClick={() => setBucket(bucket === "approvals" ? "all" : "approvals")}>
              {t("chat.inboxApprovals", { count: bucketCounts.approvals })}
            </Chip>
          ) : null}
          {bucketCounts.hr > 0 ? (
            <Chip pressed={bucket === "hr"} onClick={() => setBucket(bucket === "hr" ? "all" : "hr")}>
              {t("chat.inboxHr", { count: bucketCounts.hr })}
            </Chip>
          ) : null}
          {bucketCounts.training > 0 ? (
            <Chip pressed={bucket === "training"} onClick={() => setBucket(bucket === "training" ? "all" : "training")}>
              {t("chat.inboxTraining", { count: bucketCounts.training })}
            </Chip>
          ) : null}
          {bucketCounts.updates > 0 ? (
            <Chip pressed={bucket === "updates"} onClick={() => setBucket(bucket === "updates" ? "all" : "updates")}>
              {t("chat.inboxUpdates", { count: bucketCounts.updates })}
            </Chip>
          ) : null}
        </div>
      )}

      {mode === "updates" && showBoard ? (
        <div className="flex flex-wrap gap-1.5 pb-3">
          <Chip pressed={!publishing} onClick={() => setBoard("mine")}>
            {t("chat.updatesForMe")}
          </Chip>
          <Chip pressed={publishing} onClick={() => setBoard("publishing")}>
            {t("chat.updatesBoard")}
          </Chip>
        </div>
      ) : null}

      {mode === "inbox" ? (
        <div className="flex flex-wrap gap-1.5 pb-3" role="toolbar" aria-label={t("chat.inboxReadFilters")}>
          <Chip pressed={readFilter === "unread"} onClick={() => setReadFilter("unread")}>
            {t("chat.inboxUnread")}
          </Chip>
          <Chip pressed={readFilter === "all"} onClick={() => setReadFilter("all")}>
            {t("chat.inboxAll")}
          </Chip>
          <Chip pressed={readFilter === "read"} onClick={() => setReadFilter("read")}>
            {t("chat.inboxRead")}
          </Chip>
        </div>
      ) : null}

      <div className="relative pb-4">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === "updates" ? t("chat.updatesSearch") : t("chat.inboxSearch")}
          aria-label={mode === "updates" ? t("chat.updatesSearch") : t("chat.inboxSearch")}
          autoComplete="off"
          className="h-10 rounded-full ps-9"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <p className="py-6 text-sm text-muted-foreground">{t("inbox.loading")}</p> : null}
        {mode === "updates" && updatesEmpty ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("chat.updatesEmpty")}</p>
        ) : null}
        {mode === "inbox" && inboxClear ? (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
            <Inbox className="mx-auto h-8 w-8 text-primary" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 text-sm font-semibold text-foreground">{t("chat.inboxClear")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t("chat.inboxClearBody")}</p>
          </div>
        ) : null}
        {mode === "inbox" && inboxFilteredEmpty && !inboxClear ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("chat.inboxNoMatches")}</p>
        ) : null}

        {mode === "updates" && !publishing && !loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {visibleNotices.map((item) => {
              const title = item.titleKey ? t(item.titleKey, item.titleParams) : item.title;
              return (
                <article key={item.id} className="flex flex-col rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {!item.readAt ? <Pill>{t("chat.updatesUnreadPill")}</Pill> : null}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
                  {item.body ? <p className="mt-1 line-clamp-3 text-sm leading-5 text-muted-foreground">{item.body}</p> : null}
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {item.category ? <p>{item.category}</p> : null}
                    <p className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" aria-hidden />
                      <time dateTime={item.createdAt}>{stamp(item.createdAt, locale)}</time>
                    </p>
                  </div>
                  <NoticeFooter
                    note={t("chat.updatesInfo")}
                    href={item.actionUrl || "/notifications"}
                    onClick={() => {
                      if (!item.readAt && item.id.startsWith("notif:")) markRead.mutate(item.id.slice(6));
                    }}
                  />
                </article>
              );
            })}
            {updateChip !== "unread"
              ? visibleEscalations.map((row) => (
                  <article key={row.id} className="flex flex-col rounded-2xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">{row.title}</h3>
                    {row.detail ? <p className="mt-1 line-clamp-3 text-sm leading-5 text-muted-foreground">{row.detail}</p> : null}
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {row.source ? <p>{row.source}</p> : null}
                      <p className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" aria-hidden />
                        <time dateTime={row.created_at}>{stamp(row.created_at, locale)}</time>
                      </p>
                    </div>
                    <NoticeFooter note={t("chat.ackRequired")} pending={ack.isPending} onClick={() => ack.mutate(row.id)} />
                  </article>
                ))
              : null}
          </div>
        ) : null}

        {publishing && !loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {visiblePosts.map((post) => (
              <article key={post.id} className="flex flex-col rounded-2xl border border-border bg-card p-4">
                {post.active ? <Pill live>{t("chat.updatesLive")}</Pill> : null}
                <h3 className="mt-3 text-sm font-semibold text-foreground">{post.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm leading-5 text-muted-foreground">{post.body}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  <time dateTime={post.publishedAt}>{stamp(post.publishedAt, locale)}</time>
                </p>
                <NoticeFooter note={t("chat.updatesInfo")} href="/people/hr/announcements" />
              </article>
            ))}
          </div>
        ) : null}

        {mode === "inbox" && !inboxFilteredEmpty && !loading ? (
          <ul className="grid gap-3">
            {inboxItems.map((item) => {
              const title = item.titleKey ? t(item.titleKey, item.titleParams) : item.title;
              return (
                <li key={item.id}>
                  <Link
                    href={item.actionUrl || "/notifications"}
                    className="flex flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3 text-start hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    onClick={() => {
                      if (item.persisted && !item.readAt && item.id.startsWith("notif:")) {
                        markRead.mutate(item.id.slice(6));
                      }
                    }}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{title}</span>
                      {!item.readAt ? <Pill>{t("chat.updatesUnreadPill")}</Pill> : null}
                    </span>
                    {item.body ? <span className="line-clamp-2 text-sm text-muted-foreground">{item.body}</span> : null}
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" aria-hidden />
                      <time dateTime={item.createdAt}>{stamp(item.createdAt, locale)}</time>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {mode === "inbox" ? (
        <p className="pt-3 text-xs text-muted-foreground">{t("chat.inboxFootnote")}</p>
      ) : null}
    </div>
  );
}
