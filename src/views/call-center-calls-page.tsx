"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useCallCenterSoftphoneOptional } from "@/components/call-center/softphone-provider";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  exportCallCenterCdrCsv,
  generateCallCenterTranscriptStub,
  loadCallCenterCdr,
  loadCallCenterConfigBundle,
  loadCallCenterTagCatalog,
  saveCallCenterAgentNotes,
  saveCallCenterCallTags,
  saveCallCenterTranscript,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterCall } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { CallCenterShell } from "@/views/call-center-section-nav";

type Chip = "all" | "today" | "missed" | "outbound";

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function CallCenterCallsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const softphone = useCallCenterSoftphoneOptional();
  const queryClient = useQueryClient();
  const canUse = canUserDo(
    roles.map((r) => r.role),
    "call_center.view",
  );
  const [chip, setChip] = useState<Chip>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [queueId, setQueueId] = useState("");
  const [direction, setDirection] = useState<string>("");
  const [applied, setApplied] = useState({
    fromDate: startOfTodayIso(),
    toDate: "",
    queueId: "",
    direction: "" as string,
    status: "" as string,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftTranscript, setDraftTranscript] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const config = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const tagsCatalog = useQuery({
    queryKey: ["call-center", "tags"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterTagCatalog({});
      if (!result.ok) throw new Error(result.error);
      return result.data.tags.filter((tag) => tag.isActive);
    },
  });

  const cdr = useQuery({
    queryKey: ["call-center", "cdr", applied],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterCdr({
        fromDate: applied.fromDate || null,
        toDate: applied.toDate || null,
        queueId: applied.queueId || null,
        direction:
          applied.direction === "inbound" ||
          applied.direction === "outbound" ||
          applied.direction === "internal_test"
            ? applied.direction
            : null,
        status:
          applied.status === "missed" ||
          applied.status === "declined" ||
          applied.status === "failed"
            ? (applied.status as CallCenterCall["status"])
            : null,
        limit: 150,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const filtered = useMemo(() => {
    const rows = cdr.data ?? [];
    if (chip === "missed") {
      return rows.filter((c) => ["missed", "declined", "failed"].includes(c.status));
    }
    if (chip === "outbound") {
      return rows.filter((c) => c.direction === "outbound");
    }
    return rows;
  }, [cdr.data, chip]);

  function applyChip(next: Chip) {
    setChip(next);
    if (next === "today") {
      setApplied((a) => ({
        ...a,
        fromDate: startOfTodayIso(),
        toDate: "",
        direction: "",
        status: "",
      }));
      setDirection("");
    } else if (next === "outbound") {
      setApplied((a) => ({
        ...a,
        fromDate: "",
        direction: "outbound",
        status: "",
      }));
      setDirection("outbound");
    } else if (next === "missed") {
      setApplied((a) => ({
        ...a,
        fromDate: startOfTodayIso(),
        direction: "",
        status: "",
      }));
      setDirection("");
    } else {
      setApplied((a) => ({
        ...a,
        fromDate: "",
        toDate: "",
        direction: "",
        status: "",
      }));
      setDirection("");
    }
  }

  function openDetail(call: CallCenterCall) {
    setExpandedId((id) => (id === call.id ? null : call.id));
    setDraftTranscript(call.transcriptText || "");
    setDraftNotes(call.agentNotes || "");
    setDraftTags(call.tags ?? []);
  }

  async function onExportCsv() {
    setPending(true);
    const result = await exportCallCenterCdrCsv({
      fromDate: applied.fromDate || null,
      toDate: applied.toDate || null,
      queueId: applied.queueId || null,
      direction:
        applied.direction === "inbound" ||
        applied.direction === "outbound" ||
        applied.direction === "internal_test"
          ? applied.direction
          : null,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `call-center-cdr-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("callCenter.csvExported", { count: result.data.count }));
  }

  async function onGenerateStub(callId: string) {
    setPending(true);
    const result = await generateCallCenterTranscriptStub({ callId });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDraftTranscript(result.data.transcriptText);
    toast.success(t("callCenter.transcriptGenerated"));
    await queryClient.invalidateQueries({ queryKey: ["call-center", "cdr"] });
  }

  async function onSaveTranscript(callId: string) {
    setPending(true);
    const result = await saveCallCenterTranscript({
      callId,
      text: draftTranscript,
      status: "final",
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.transcriptSaved"));
    await queryClient.invalidateQueries({ queryKey: ["call-center", "cdr"] });
  }

  async function onSaveNotes(callId: string) {
    setPending(true);
    const result = await saveCallCenterAgentNotes({ callId, notes: draftNotes });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.notesSaved"));
    await queryClient.invalidateQueries({ queryKey: ["call-center", "cdr"] });
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.callsTitle" subtitleKey="callCenter.callsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const chips: { id: Chip; label: string }[] = [
    { id: "today", label: t("callCenter.chipToday") },
    { id: "missed", label: t("callCenter.chipMissed") },
    { id: "outbound", label: t("callCenter.chipOutbound") },
    { id: "all", label: t("callCenter.chipAll") },
  ];

  return (
    <CallCenterShell titleKey="callCenter.callsTitle" subtitleKey="callCenter.callsSubtitle">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => applyChip(c.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              chip === c.id
                ? "border-foreground/20 bg-foreground text-background"
                : "border-border/70 bg-card text-muted-foreground hover:bg-muted/50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 bg-card p-4">
        <div className="space-y-1.5">
          <Label>{t("callCenter.filterFrom")}</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("callCenter.filterTo")}</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("callCenter.filterQueue")}</Label>
          <Select value={queueId || "all"} onValueChange={(v) => setQueueId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("callCenter.filterAll")}</SelectItem>
              {(config.data?.queues ?? []).map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("callCenter.filterDirection")}</Label>
          <Select
            value={direction || "all"}
            onValueChange={(v) => setDirection(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("callCenter.filterAll")}</SelectItem>
              <SelectItem value="inbound">inbound</SelectItem>
              <SelectItem value="outbound">outbound</SelectItem>
              <SelectItem value="internal_test">test</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={() => {
            setChip("all");
            setApplied({
              fromDate: fromDate ? new Date(fromDate).toISOString() : "",
              toDate: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : "",
              queueId,
              direction,
              status: "",
            });
          }}
        >
          {t("callCenter.applyFilters")}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void onExportCsv()}>
          {t("callCenter.exportCsv")}
        </Button>
      </section>

      {cdr.isLoading ? (
        <div className="flex justify-center py-12">
          <FecLoader density="page" />
        </div>
      ) : cdr.isError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-2xl border border-border/50 bg-card">
          {filtered.length === 0 ? (
            <li className="p-8 text-center text-sm text-muted-foreground">{t("callCenter.noCalls")}</li>
          ) : (
            filtered.map((call) => (
              <li key={call.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-start"
                    onClick={() => openDetail(call)}
                  >
                    <p className="font-medium">
                      {call.fromE164 || "—"} → {call.toE164 || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(call.startedAt).toLocaleString()} · {call.direction}
                      {call.talkSeconds != null ? ` · ${call.talkSeconds}s` : ""}
                      {call.recordingUrl || call.recordingEnabled
                        ? ` · ${t("callCenter.hasRecording")}`
                        : ""}
                      {call.dispositionCode ? ` · ${call.dispositionCode}` : ""}
                      {call.transferType ? ` · ${call.transferType} → ${call.transferTarget}` : ""}
                      {call.transcriptStatus !== "none"
                        ? ` · ${t("callCenter.hasTranscript")}`
                        : ""}
                      {call.agentNotes ? ` · ${t("callCenter.hasNotes")}` : ""}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    {softphone ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(softphone.activeCall) || softphone.pending}
                        onClick={() => softphone.onCallback(call)}
                      >
                        <Phone className="me-1 h-3.5 w-3.5" aria-hidden />
                        {t("callCenter.callback")}
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="secondary" onClick={() => openDetail(call)}>
                      {t("callCenter.details")}
                    </Button>
                    <Badge variant="secondary">{call.status}</Badge>
                  </div>
                </div>
                {expandedId === call.id ? (
                  <div className="mt-3 grid gap-3 rounded-xl border border-border/60 p-3 lg:grid-cols-2">
                    {(call.recordingUrl || call.recordingEnabled) && (
                      <div className="space-y-2 lg:col-span-2">
                        <p className="text-xs font-medium text-foreground">
                          {t("callCenter.playRecording")}
                          {call.recordingEnabled && !call.recordingUrl
                            ? " (flagged — URL pending egress)"
                            : ""}
                        </p>
                        {call.recordingUrl ? (
                          <audio controls className="w-full max-w-xl" src={call.recordingUrl}>
                            <track kind="captions" />
                          </audio>
                        ) : null}
                      </div>
                    )}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground">{t("callCenter.callNotes")}</p>
                      <Textarea
                        value={draftNotes}
                        onChange={(e) => setDraftNotes(e.target.value)}
                        rows={6}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => void onSaveNotes(call.id)}
                      >
                        {t("callCenter.saveNotes")}
                      </Button>
                      <div className="pt-2">
                        <p className="text-xs font-medium text-foreground">{t("callCenter.callTags")}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(tagsCatalog.data ?? []).map((tag) => {
                            const on = draftTags.includes(tag.name);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-xs font-medium",
                                  on
                                    ? "border-foreground/20 bg-foreground text-background"
                                    : "border-border bg-card text-muted-foreground",
                                )}
                                style={on ? undefined : { borderColor: tag.color }}
                                onClick={() =>
                                  setDraftTags((prev) =>
                                    on ? prev.filter((x) => x !== tag.name) : [...prev, tag.name],
                                  )
                                }
                              >
                                {tag.name}
                              </button>
                            );
                          })}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2"
                          disabled={pending}
                          onClick={() => {
                            void (async () => {
                              setPending(true);
                              const result = await saveCallCenterCallTags({
                                callId: call.id,
                                tags: draftTags,
                              });
                              setPending(false);
                              if (!result.ok) {
                                toast.error(result.error);
                                return;
                              }
                              toast.success(t("callCenter.tagsSaved"));
                              await queryClient.invalidateQueries({ queryKey: ["call-center", "cdr"] });
                            })();
                          }}
                        >
                          {t("callCenter.saveTags")}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground">
                        {t("callCenter.transcript")} · {call.transcriptStatus}
                      </p>
                      <Textarea
                        value={draftTranscript}
                        onChange={(e) => setDraftTranscript(e.target.value)}
                        rows={6}
                        className="font-mono text-xs"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => void onGenerateStub(call.id)}
                        >
                          {t("callCenter.generateTranscript")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => void onSaveTranscript(call.id)}
                        >
                          {t("callCenter.saveTranscript")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      )}
    </CallCenterShell>
  );
}

export default CallCenterCallsPage;
