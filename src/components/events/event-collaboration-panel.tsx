"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Gavel, MessagesSquare, Video } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  addEventDiscussionPost,
  deleteEventDecision,
  deleteEventDiscussion,
  deleteEventMeeting,
  deleteEventMeetingAction,
  getEventCollaboration,
  upsertEventDecision,
  upsertEventDiscussion,
  upsertEventMeeting,
  upsertEventMeetingAction,
  upsertEventWikiPage,
} from "@/lib/events.functions";
import { formatStaffMentionToken } from "@/lib/events/collaboration";
import { MEETING_ACTION_STATUSES } from "@/lib/events/constants";
import { LIFECYCLE_PHASES } from "@/lib/events/lifecycle";
import { KPI_ICON_CLASS, KPI_TINT_CLASS, type KpiTint } from "@/lib/ui/command-surface";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type StaffOpt = { id: string; full_name: string };

function Kpi({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "danger" | "ok" | "warn";
  icon: typeof MessagesSquare;
}) {
  const tint: KpiTint = tone === "danger" ? "red" : tone === "warn" ? "amber" : tone === "ok" ? "green" : "sky";
  return (
    <div className={cn("min-w-0 rounded-2xl border px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]", KPI_TINT_CLASS[tint])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-xl font-bold tabular-nums", tone === "danger" && "text-rag-red")}>{value}</p>
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", KPI_ICON_CLASS[tint])}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventCollaborationPanel({
  eventId,
  staff,
  canEdit,
}: {
  eventId: string;
  staff: StaffOpt[];
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const collab = useQuery({
    queryKey: queryKeys.events.collaboration(eventId),
    queryFn: () => getEventCollaboration({ eventId }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.events.collaboration(eventId) });
  };

  const data = collab.data;
  const docs = data?.documents ?? [];
  const kpis = data?.kpis;

  const [activeDiscussionId, setActiveDiscussionId] = useState<string>("");
  const [threadTitle, setThreadTitle] = useState("");
  const [threadDoc, setThreadDoc] = useState("");
  const [postBody, setPostBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [mentionPick, setMentionPick] = useState("");

  const [meetingDraft, setMeetingDraft] = useState({
    id: "",
    title: "",
    scheduled_at: "",
    agenda: "",
    minutes: "",
    phase_code: "",
    document_id: "",
    attendees: [] as string[],
  });
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [actionDraft, setActionDraft] = useState({
    id: "",
    title: "",
    assignee_staff_id: "",
    due_date: "",
    status: "open" as (typeof MEETING_ACTION_STATUSES)[number],
    notes: "",
    createTask: false,
  });

  const [decisionDraft, setDecisionDraft] = useState({
    id: "",
    title: "",
    decision: "",
    decided_at: "",
    decided_by_staff_id: "",
    context: "",
    meeting_id: "",
    document_id: "",
  });

  const [wikiBody, setWikiBody] = useState("");
  const [wikiTitle, setWikiTitle] = useState("Notes");

  useEffect(() => {
    if (!data?.wiki) return;
    setWikiBody(data.wiki.body_md);
    setWikiTitle(data.wiki.title);
  }, [data?.wiki?.id, data?.wiki?.updated_at]);

  const activeDiscussion =
    data?.discussions.find((d) => d.id === activeDiscussionId) ?? data?.discussions[0] ?? null;
  const posts = activeDiscussion ? (data?.postsByDiscussion[activeDiscussion.id] ?? []) : [];

  const meetingActions = (data?.actions ?? []).filter(
    (a) => !selectedMeetingId || a.meeting_id === selectedMeetingId,
  );

  const saveThread = useMutation({
    mutationFn: () =>
      upsertEventDiscussion({
        eventId,
        title: threadTitle,
        document_id: threadDoc || null,
      }),
    onSuccess: (res) => {
      setThreadTitle("");
      setThreadDoc("");
      setActiveDiscussionId(res.id);
      invalidate();
      toast.success(t("events.collab.threadSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const savePost = useMutation({
    mutationFn: () => {
      if (!activeDiscussion) throw new Error("No discussion");
      return addEventDiscussionPost({
        eventId,
        discussionId: activeDiscussion.id,
        body: postBody,
        parent_post_id: replyTo,
      });
    },
    onSuccess: () => {
      setPostBody("");
      setReplyTo(null);
      invalidate();
      toast.success(t("events.collab.postSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveMeeting = useMutation({
    mutationFn: () =>
      upsertEventMeeting({
        id: meetingDraft.id || undefined,
        eventId,
        title: meetingDraft.title,
        scheduled_at: meetingDraft.scheduled_at
          ? new Date(meetingDraft.scheduled_at).toISOString()
          : new Date().toISOString(),
        agenda: meetingDraft.agenda || null,
        minutes: meetingDraft.minutes || null,
        phase_code: meetingDraft.phase_code || null,
        document_id: meetingDraft.document_id || null,
        attendee_staff_ids: meetingDraft.attendees,
      }),
    onSuccess: (res) => {
      setSelectedMeetingId(res.id);
      setMeetingDraft({
        id: "",
        title: "",
        scheduled_at: "",
        agenda: "",
        minutes: "",
        phase_code: "",
        document_id: "",
        attendees: [],
      });
      invalidate();
      toast.success(t("events.collab.meetingSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveAction = useMutation({
    mutationFn: () => {
      const mid = selectedMeetingId || meetingDraft.id;
      if (!mid) throw new Error("Select a meeting");
      return upsertEventMeetingAction({
        id: actionDraft.id || undefined,
        eventId,
        meetingId: mid,
        title: actionDraft.title,
        assignee_staff_id: actionDraft.assignee_staff_id || null,
        due_date: actionDraft.due_date || null,
        status: actionDraft.status,
        notes: actionDraft.notes || null,
        createTask: actionDraft.createTask,
      });
    },
    onSuccess: () => {
      setActionDraft({
        id: "",
        title: "",
        assignee_staff_id: "",
        due_date: "",
        status: "open",
        notes: "",
        createTask: false,
      });
      invalidate();
      toast.success(t("events.collab.actionSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveDecision = useMutation({
    mutationFn: () =>
      upsertEventDecision({
        id: decisionDraft.id || undefined,
        eventId,
        title: decisionDraft.title,
        decision: decisionDraft.decision,
        decided_at: decisionDraft.decided_at
          ? new Date(decisionDraft.decided_at).toISOString()
          : null,
        decided_by_staff_id: decisionDraft.decided_by_staff_id || null,
        context: decisionDraft.context || null,
        meeting_id: decisionDraft.meeting_id || null,
        document_id: decisionDraft.document_id || null,
      }),
    onSuccess: () => {
      setDecisionDraft({
        id: "",
        title: "",
        decision: "",
        decided_at: "",
        decided_by_staff_id: "",
        context: "",
        meeting_id: "",
        document_id: "",
      });
      invalidate();
      toast.success(t("events.collab.decisionSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveWiki = useMutation({
    mutationFn: () =>
      upsertEventWikiPage({
        eventId,
        slug: "notes",
        title: wikiTitle || "Notes",
        body_md: wikiBody,
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.collab.wikiSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const insertMention = () => {
    if (!mentionPick) return;
    const token = formatStaffMentionToken(mentionPick);
    setPostBody((b) => (b ? `${b} ${token}` : token));
    setMentionPick("");
  };

  const toggleAttendee = (id: string) => {
    setMeetingDraft((d) => ({
      ...d,
      attendees: d.attendees.includes(id) ? d.attendees.filter((x) => x !== id) : [...d.attendees, id],
    }));
  };

  if (collab.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (collab.isError) {
    return <p className="text-sm text-destructive">{(collab.error as Error).message}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("events.collab.kpiDiscussions")} value={String(kpis?.discussionCount ?? 0)} icon={MessagesSquare} />
        <Kpi label={t("events.collab.kpiMeetings")} value={String(kpis?.meetingCount ?? 0)} icon={Video} />
        <Kpi
          label={t("events.collab.kpiOpenActions")}
          value={String(kpis?.openActions ?? 0)}
          tone={(kpis?.openActions ?? 0) > 0 ? "warn" : "ok"}
          icon={Gavel}
        />
        <Kpi label={t("events.collab.kpiDecisions")} value={String(kpis?.decisionCount ?? 0)} icon={BookOpen} />
      </div>

      <Tabs defaultValue="discussions" className="space-y-3">
        <TabsList>
          <TabsTrigger value="discussions">{t("events.collab.tabDiscussions")}</TabsTrigger>
          <TabsTrigger value="meetings">{t("events.collab.tabMeetings")}</TabsTrigger>
          <TabsTrigger value="decisions">{t("events.collab.tabDecisions")}</TabsTrigger>
          <TabsTrigger value="notes">{t("events.collab.tabNotes")}</TabsTrigger>
        </TabsList>

        <TabsContent value="discussions" className="space-y-3">
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/40 bg-card p-3">
              <Input
                className="h-8 max-w-xs"
                placeholder={t("events.collab.newThread")}
                value={threadTitle}
                onChange={(e) => setThreadTitle(e.target.value)}
              />
              <Select value={threadDoc || "none"} onValueChange={(v) => setThreadDoc(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder={t("events.collab.linkDoc")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {docs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!threadTitle.trim() || saveThread.isPending}
                onClick={() => saveThread.mutate()}
              >
                {t("events.collab.createThread")}
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[14rem_1fr]">
            <ul className="max-h-[28rem] space-y-1 overflow-y-auto rounded-xl border border-border/40 bg-card p-2 text-sm">
              {(data?.discussions ?? []).length === 0 ? (
                <li className="p-2 text-muted-foreground">{t("events.collab.noThreads")}</li>
              ) : (
                (data?.discussions ?? []).map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col rounded-lg px-2 py-1.5 text-start hover:bg-muted/60",
                        activeDiscussion?.id === d.id && "bg-muted",
                      )}
                      onClick={() => setActiveDiscussionId(d.id)}
                    >
                      <span className="truncate font-medium">{d.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {t("events.collab.postCount", { n: d.post_count })}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            <section className="space-y-3 rounded-xl border border-border/40 bg-card p-3">
              {activeDiscussion ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{activeDiscussion.title}</h3>
                      {activeDiscussion.document_title ? (
                        <p className="text-xs text-muted-foreground">
                          {t("events.collab.linkedDoc")}: {activeDiscussion.document_title}
                        </p>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await deleteEventDiscussion({ id: activeDiscussion.id });
                            setActiveDiscussionId("");
                            invalidate();
                            toast.success(t("events.collab.threadDeleted"));
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        {t("common.delete")}
                      </Button>
                    ) : null}
                  </div>

                  <ul className="max-h-[18rem] space-y-2 overflow-y-auto text-sm">
                    {posts.length === 0 ? (
                      <li className="text-muted-foreground">{t("events.collab.noPosts")}</li>
                    ) : (
                      posts.map((p) => (
                        <li
                          key={p.id}
                          className={cn(
                            "rounded-lg border border-border/30 px-3 py-2",
                            p.parent_post_id && "ms-4 border-dashed",
                          )}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{p.author_name ?? t("events.collab.unknownAuthor")}</span>
                            <span>·</span>
                            <span className="tabular-nums">{new Date(p.created_at).toLocaleString()}</span>
                            {p.mentioned_staff_ids.length ? (
                              <Badge variant="outline">{t("events.collab.mentions", { n: p.mentioned_staff_ids.length })}</Badge>
                            ) : null}
                            {canEdit ? (
                              <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setReplyTo(p.id)}>
                                {t("events.collab.reply")}
                              </Button>
                            ) : null}
                          </div>
                          <p className="whitespace-pre-wrap">{p.body}</p>
                        </li>
                      ))
                    )}
                  </ul>

                  {canEdit ? (
                    <div className="space-y-2 border-t border-border/40 pt-2">
                      {replyTo ? (
                        <p className="text-xs text-muted-foreground">
                          {t("events.collab.replying")}{" "}
                          <button type="button" className="underline" onClick={() => setReplyTo(null)}>
                            {t("common.cancel")}
                          </button>
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Select value={mentionPick || "none"} onValueChange={(v) => setMentionPick(v === "none" ? "" : v)}>
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue placeholder={t("events.collab.mention")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {staff.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" disabled={!mentionPick} onClick={insertMention}>
                          {t("events.collab.insertMention")}
                        </Button>
                      </div>
                      <Textarea
                        rows={3}
                        value={postBody}
                        onChange={(e) => setPostBody(e.target.value)}
                        placeholder={t("events.collab.postPlaceholder")}
                      />
                      <Button size="sm" disabled={!postBody.trim() || savePost.isPending} onClick={() => savePost.mutate()}>
                        {replyTo ? t("events.collab.postReply") : t("events.collab.post")}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("events.collab.pickThread")}</p>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="meetings" className="space-y-3">
          {canEdit ? (
            <div className="space-y-2 rounded-xl border border-border/40 bg-card p-3">
              <p className="text-sm font-semibold">
                {meetingDraft.id ? t("events.collab.editMeeting") : t("events.collab.newMeeting")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-8 max-w-xs"
                  placeholder={t("events.collab.meetingTitle")}
                  value={meetingDraft.title}
                  onChange={(e) => setMeetingDraft((d) => ({ ...d, title: e.target.value }))}
                />
                <Input
                  className="h-8 w-52"
                  type="datetime-local"
                  value={meetingDraft.scheduled_at}
                  onChange={(e) => setMeetingDraft((d) => ({ ...d, scheduled_at: e.target.value }))}
                />
                <Select
                  value={meetingDraft.phase_code || "none"}
                  onValueChange={(v) => setMeetingDraft((d) => ({ ...d, phase_code: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={t("events.collab.phase")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {LIFECYCLE_PHASES.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {ar ? p.label_ar : p.label_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={meetingDraft.document_id || "none"}
                  onValueChange={(v) => setMeetingDraft((d) => ({ ...d, document_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={t("events.collab.linkDoc")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {docs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                rows={2}
                placeholder={t("events.collab.agenda")}
                value={meetingDraft.agenda}
                onChange={(e) => setMeetingDraft((d) => ({ ...d, agenda: e.target.value }))}
              />
              <Textarea
                rows={2}
                placeholder={t("events.collab.minutes")}
                value={meetingDraft.minutes}
                onChange={(e) => setMeetingDraft((d) => ({ ...d, minutes: e.target.value }))}
              />
              <div className="flex flex-wrap gap-1">
                <span className="w-full text-xs text-muted-foreground">{t("events.collab.attendees")}</span>
                {staff.map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={meetingDraft.attendees.includes(s.id) ? "default" : "outline"}
                    className="h-7"
                    onClick={() => toggleAttendee(s.id)}
                  >
                    {s.full_name}
                  </Button>
                ))}
              </div>
              <Button
                size="sm"
                disabled={!meetingDraft.title.trim() || !meetingDraft.scheduled_at || saveMeeting.isPending}
                onClick={() => saveMeeting.mutate()}
              >
                {meetingDraft.id ? t("common.save") : t("events.collab.saveMeeting")}
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <ul className="max-h-[22rem] space-y-2 overflow-y-auto text-sm">
              {(data?.meetings ?? []).length === 0 ? (
                <li className="text-muted-foreground">{t("events.collab.noMeetings")}</li>
              ) : (
                (data?.meetings ?? []).map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "cursor-pointer rounded-xl border border-border/40 bg-card p-3",
                      selectedMeetingId === m.id && "ring-1 ring-primary/40",
                    )}
                    onClick={() => {
                      setSelectedMeetingId(m.id);
                      if (canEdit) {
                        setMeetingDraft({
                          id: m.id,
                          title: m.title,
                          scheduled_at: toLocalInput(m.scheduled_at),
                          agenda: m.agenda ?? "",
                          minutes: m.minutes ?? "",
                          phase_code: m.phase_code ?? "",
                          document_id: m.document_id ?? "",
                          attendees: m.attendee_staff_ids,
                        });
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{m.title}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {new Date(m.scheduled_at).toLocaleString()}
                        </p>
                        {m.phase_code ? (
                          <Badge variant="outline" className="mt-1">
                            {t(`events.phase.${m.phase_code}`, { defaultValue: m.phase_code })}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {m.open_action_count > 0 ? (
                          <Badge variant="secondary">{t("events.collab.openN", { n: m.open_action_count })}</Badge>
                        ) : null}
                        {canEdit ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await deleteEventMeeting({ id: m.id });
                                if (selectedMeetingId === m.id) setSelectedMeetingId("");
                                invalidate();
                                toast.success(t("events.collab.meetingDeleted"));
                              } catch (err) {
                                toast.error((err as Error).message);
                              }
                            }}
                          >
                            {t("common.delete")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {m.attendee_names.length ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{m.attendee_names.join(", ")}</p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>

            <section className="space-y-3 rounded-xl border border-border/40 bg-card p-3">
              <h3 className="text-sm font-semibold">{t("events.collab.actions")}</h3>
              {!selectedMeetingId ? (
                <p className="text-sm text-muted-foreground">{t("events.collab.pickMeeting")}</p>
              ) : (
                <>
                  {canEdit ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <Input
                        className="h-8 max-w-xs"
                        placeholder={t("events.collab.actionTitle")}
                        value={actionDraft.title}
                        onChange={(e) => setActionDraft((d) => ({ ...d, title: e.target.value }))}
                      />
                      <Select
                        value={actionDraft.assignee_staff_id || "none"}
                        onValueChange={(v) =>
                          setActionDraft((d) => ({ ...d, assignee_staff_id: v === "none" ? "" : v }))
                        }
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder={t("events.collab.assignee")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8 w-36"
                        type="date"
                        value={actionDraft.due_date}
                        onChange={(e) => setActionDraft((d) => ({ ...d, due_date: e.target.value }))}
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={actionDraft.createTask}
                          onChange={(e) => setActionDraft((d) => ({ ...d, createTask: e.target.checked }))}
                        />
                        {t("events.collab.createTask")}
                      </label>
                      <Button
                        size="sm"
                        disabled={!actionDraft.title.trim() || saveAction.isPending}
                        onClick={() => saveAction.mutate()}
                      >
                        {t("events.collab.addAction")}
                      </Button>
                    </div>
                  ) : null}
                  <ul className="max-h-[16rem] space-y-2 overflow-y-auto text-sm">
                    {meetingActions.length === 0 ? (
                      <li className="text-muted-foreground">{t("events.collab.noActions")}</li>
                    ) : (
                      meetingActions.map((a) => (
                        <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg border border-border/30 px-2 py-1.5">
                          <div className="min-w-0">
                            <p className="font-medium">{a.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {a.assignee_name ?? t("events.collab.unassigned")}
                              {a.due_date ? ` · ${a.due_date}` : ""}
                              {a.task_title ? ` · ${a.task_title}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge variant={a.status === "open" ? "secondary" : "outline"}>
                              {t(`events.collab.actionStatus.${a.status}`)}
                            </Badge>
                            {canEdit && a.status === "open" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7"
                                onClick={async () => {
                                  try {
                                    await upsertEventMeetingAction({
                                      id: a.id,
                                      eventId,
                                      meetingId: a.meeting_id,
                                      title: a.title,
                                      status: "done",
                                      assignee_staff_id: a.assignee_staff_id,
                                      due_date: a.due_date,
                                      notes: a.notes,
                                    });
                                    invalidate();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                {t("events.collab.markDone")}
                              </Button>
                            ) : null}
                            {canEdit ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7"
                                onClick={async () => {
                                  try {
                                    await deleteEventMeetingAction({ id: a.id });
                                    invalidate();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                {t("common.delete")}
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="decisions" className="space-y-3">
          {canEdit ? (
            <div className="space-y-2 rounded-xl border border-border/40 bg-card p-3">
              <Input
                className="h-8 max-w-md"
                placeholder={t("events.collab.decisionTitle")}
                value={decisionDraft.title}
                onChange={(e) => setDecisionDraft((d) => ({ ...d, title: e.target.value }))}
              />
              <Textarea
                rows={2}
                placeholder={t("events.collab.decisionBody")}
                value={decisionDraft.decision}
                onChange={(e) => setDecisionDraft((d) => ({ ...d, decision: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-8 w-52"
                  type="datetime-local"
                  value={decisionDraft.decided_at}
                  onChange={(e) => setDecisionDraft((d) => ({ ...d, decided_at: e.target.value }))}
                />
                <Select
                  value={decisionDraft.decided_by_staff_id || "none"}
                  onValueChange={(v) =>
                    setDecisionDraft((d) => ({ ...d, decided_by_staff_id: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={t("events.collab.decidedBy")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={decisionDraft.meeting_id || "none"}
                  onValueChange={(v) => setDecisionDraft((d) => ({ ...d, meeting_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={t("events.collab.linkMeeting")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(data?.meetings ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={decisionDraft.document_id || "none"}
                  onValueChange={(v) => setDecisionDraft((d) => ({ ...d, document_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={t("events.collab.linkDoc")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {docs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                rows={2}
                placeholder={t("events.collab.context")}
                value={decisionDraft.context}
                onChange={(e) => setDecisionDraft((d) => ({ ...d, context: e.target.value }))}
              />
              <Button
                size="sm"
                disabled={!decisionDraft.title.trim() || !decisionDraft.decision.trim() || saveDecision.isPending}
                onClick={() => saveDecision.mutate()}
              >
                {t("events.collab.saveDecision")}
              </Button>
            </div>
          ) : null}

          <ul className="space-y-2 text-sm">
            {(data?.decisions ?? []).length === 0 ? (
              <li className="text-muted-foreground">{t("events.collab.noDecisions")}</li>
            ) : (
              (data?.decisions ?? []).map((d) => (
                <li key={d.id} className="rounded-xl border border-border/40 bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{d.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{d.decision}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {d.decided_by_name ?? "—"} · {new Date(d.decided_at).toLocaleString()}
                        {d.meeting_title ? ` · ${d.meeting_title}` : ""}
                        {d.document_title ? ` · ${d.document_title}` : ""}
                      </p>
                      {d.context ? <p className="mt-1 text-xs">{d.context}</p> : null}
                    </div>
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await deleteEventDecision({ id: d.id });
                            invalidate();
                            toast.success(t("events.collab.decisionDeleted"));
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        {t("common.delete")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </TabsContent>

        <TabsContent value="notes" className="space-y-3">
          <section className="space-y-2 rounded-xl border border-border/40 bg-card p-3">
            <p className="text-sm font-semibold">{t("events.collab.notesHint")}</p>
            {canEdit ? (
              <Input
                className="h-8 max-w-sm"
                value={wikiTitle}
                onChange={(e) => setWikiTitle(e.target.value)}
                placeholder={t("events.collab.notesTitle")}
              />
            ) : (
              <p className="text-sm font-medium">{wikiTitle}</p>
            )}
            <Textarea
              rows={12}
              value={wikiBody}
              onChange={(e) => setWikiBody(e.target.value)}
              disabled={!canEdit}
              placeholder={t("events.collab.notesPlaceholder")}
              className="font-mono text-sm"
            />
            {canEdit ? (
              <Button size="sm" disabled={saveWiki.isPending} onClick={() => saveWiki.mutate()}>
                {t("events.collab.saveNotes")}
              </Button>
            ) : null}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
