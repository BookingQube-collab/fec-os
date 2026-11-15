"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Delete,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Star,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CallCenterSoftphoneRoom } from "@/components/call-center/softphone-room";
import { useCallCenterSoftphone } from "@/components/call-center/softphone-provider";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { loadCallCenterTagCatalog } from "@/lib/call-center/call-center.functions";
import type {
  CallCenterAgentStatusValue,
  CallCenterCall,
  CallCenterCallStatus,
} from "@/lib/call-center/types";
import { cn } from "@/lib/utils";
import { CallCenterShell } from "@/views/call-center-section-nav";

/** Live inbound still waiting — show Connect directly (not Call back). */
const LIVE_CONNECTABLE_STATUSES = new Set<CallCenterCallStatus>([
  "ivr",
  "queued",
  "ringing",
  "offered",
]);

const CALLBACK_STATUSES = new Set<CallCenterCallStatus>([
  "ended",
  "missed",
  "declined",
  "failed",
  "voicemail",
]);

function recentCallRowClass(status: CallCenterCallStatus): string {
  switch (status) {
    case "ivr":
      return "rounded-xl bg-sky-500/10 px-2 ring-1 ring-inset ring-sky-500/25";
    case "queued":
      return "rounded-xl bg-amber-500/10 px-2 ring-1 ring-inset ring-amber-500/25";
    case "ringing":
    case "offered":
      return "rounded-xl bg-emerald-500/10 px-2 ring-1 ring-inset ring-emerald-500/25";
    case "missed":
    case "declined":
      return "rounded-xl bg-rose-500/10 px-2 ring-1 ring-inset ring-rose-500/20";
    default:
      return "";
  }
}

function recentStatusBadgeVariant(
  status: CallCenterCallStatus,
): "info" | "warning" | "success" | "destructive" | "muted" | "secondary" {
  switch (status) {
    case "ivr":
      return "info";
    case "queued":
      return "warning";
    case "ringing":
    case "offered":
    case "answered":
      return "success";
    case "missed":
    case "declined":
    case "failed":
      return "destructive";
    case "ended":
    case "voicemail":
      return "muted";
    default:
      return "secondary";
  }
}

function recentStatusLabel(status: CallCenterCallStatus, t: (key: string) => string): string {
  const key = `callCenter.callStatus.${status}`;
  const labeled = t(key);
  return labeled === key ? status : labeled;
}

function isLiveConnectable(call: CallCenterCall): boolean {
  if (call.direction === "outbound") return false;
  return LIVE_CONNECTABLE_STATUSES.has(call.status);
}

function isCallbackable(call: CallCenterCall): boolean {
  return CALLBACK_STATUSES.has(call.status);
}

const AWAY_REASONS = ["On Break", "In Training", "Admin Work", "Meeting"] as const;
/** Matches softphone `cc-*:v1` localStorage keys — "1" = expanded, "0" = collapsed. */
const RECENT_CALLS_EXPANDED_KEY = "cc-recent-calls-expanded:v1";

function readRecentCallsExpandedPref(): boolean | null {
  try {
    const raw = localStorage.getItem(RECENT_CALLS_EXPANDED_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* private mode / disabled storage */
  }
  return null;
}

function writeRecentCallsExpandedPref(expanded: boolean) {
  try {
    localStorage.setItem(RECENT_CALLS_EXPANDED_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const STATUSES: CallCenterAgentStatusValue[] = ["available", "busy", "away", "acw", "offline"];
const DIAL_KEYS = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
] as const;

const DISPOSITIONS = [
  "resolved",
  "callback",
  "voicemail_followup",
  "wrong_number",
  "spam",
  "info_only",
  "escalated",
  "other",
] as const;

function AcwDispositionPanel({
  onSave,
  pending,
}: {
  onSave: (code: string, notes: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState<string>("resolved");
  const [notes, setNotes] = useState("");
  return (
    <section className="rounded-2xl border border-amber-600/25 bg-amber-50/60 p-4">
      <p className="text-sm font-semibold text-foreground">{t("callCenter.disposition")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {DISPOSITIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              code === d
                ? "border-foreground/20 bg-foreground text-background"
                : "border-border bg-card text-foreground/80",
            )}
            onClick={() => setCode(d)}
          >
            {d}
          </button>
        ))}
      </div>
      <Textarea
        className="mt-2"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("callCenter.dispositionNotes")}
      />
      <Button
        type="button"
        size="sm"
        className="mt-2"
        disabled={pending}
        onClick={() => onSave(code, notes)}
      >
        {t("callCenter.saveDisposition")}
      </Button>
    </section>
  );
}

function statusLabelKey(status: CallCenterAgentStatusValue) {
  return `callCenter.status.${status}` as const;
}

function statusDotClass(status: CallCenterAgentStatusValue) {
  if (status === "available") return "bg-emerald-500";
  if (status === "busy") return "bg-rose-500";
  if (status === "acw") return "bg-amber-500";
  if (status === "away") return "bg-orange-500";
  return "bg-zinc-500";
}

function statusPillClass(status: CallCenterAgentStatusValue, selected: boolean) {
  if (!selected) {
    return "border-border/70 bg-card text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground";
  }
  if (status === "available") {
    return "border-emerald-600/30 bg-emerald-600 text-white shadow-sm";
  }
  if (status === "busy") {
    return "border-rose-600/30 bg-rose-600 text-white shadow-sm";
  }
  if (status === "acw") {
    return "border-amber-600/30 bg-amber-500 text-white shadow-sm";
  }
  if (status === "away") {
    return "border-orange-600/30 bg-orange-500 text-white shadow-sm";
  }
  return "border-foreground/20 bg-foreground text-background shadow-sm";
}

function CallCenterPage() {
  const { t } = useTranslation();
  const phone = useCallCenterSoftphone();
  const [speedLabel, setSpeedLabel] = useState("");
  const [speedE164, setSpeedE164] = useState("+974");
  const [recentCallsOpen, setRecentCallsOpen] = useState(true);
  const [recentCallsPrefLoaded, setRecentCallsPrefLoaded] = useState(false);

  const tagsCatalog = useQuery({
    queryKey: ["call-center", "tags"],
    enabled: phone.canUse,
    queryFn: async () => {
      const result = await loadCallCenterTagCatalog({});
      if (!result.ok) throw new Error(result.error);
      return result.data.tags.filter((tag) => tag.isActive);
    },
  });

  const notesNeedSpace = Boolean(phone.activeCall || phone.notesCallId);

  useEffect(() => {
    const stored = readRecentCallsExpandedPref();
    if (stored !== null) {
      setRecentCallsOpen(stored);
    } else {
      // No saved preference: keep notes/tags visible during an active call.
      setRecentCallsOpen(!notesNeedSpace);
    }
    setRecentCallsPrefLoaded(true);
    // Mount only — later call state is handled below when no pref exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional first-paint default
  }, []);

  useEffect(() => {
    if (!recentCallsPrefLoaded) return;
    if (readRecentCallsExpandedPref() !== null) return;
    if (notesNeedSpace) setRecentCallsOpen(false);
  }, [notesNeedSpace, recentCallsPrefLoaded]);

  function onRecentCallsOpenChange(open: boolean) {
    setRecentCallsOpen(open);
    writeRecentCallsExpandedPref(open);
  }

  if (!phone.canUse) {
    return (
      <CallCenterShell>
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("callCenter.forbidden")}
        </p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.dialerTitle" subtitleKey="callCenter.dialerSubtitle" dense>
      {phone.workspaceLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : phone.workspaceError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <div className="space-y-4">
          {/* Top agent bar */}
          <header className="flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-border/50 bg-card px-4 py-3 shadow-elevated-xs">
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("callCenter.agentStatus")}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={cn("inline-block h-2.5 w-2.5 rounded-full", statusDotClass(phone.workspaceStatus))}
                  aria-hidden
                />
                <p className="text-lg font-semibold tracking-tight sm:text-xl">
                  {t(statusLabelKey(phone.workspaceStatus))}
                </p>
                {phone.acwRemaining != null ? (
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    {t("callCenter.acwTimer", { seconds: phone.acwRemaining })}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("callCenter.agentStatus")}>
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={phone.pending}
                  onClick={() => void phone.changeStatus(status)}
                  aria-pressed={phone.workspaceStatus === status}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    statusPillClass(status, phone.workspaceStatus === status),
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      phone.workspaceStatus === status ? "bg-white/90" : statusDotClass(status),
                    )}
                    aria-hidden
                  />
                  {t(statusLabelKey(status))}
                </button>
              ))}
            </div>
            {phone.workspaceStatus === "away" ? (
              <Select
                value={phone.awayReason || AWAY_REASONS[0]}
                onValueChange={(v) => void phone.changeStatus("away", { awayReason: v })}
              >
                <SelectTrigger className="h-9 w-[9.5rem]">
                  <SelectValue placeholder={t("callCenter.awayReason")} />
                </SelectTrigger>
                <SelectContent>
                  {AWAY_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <div className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5">
              <Switch
                checked={phone.autoAnswer}
                disabled={phone.pending}
                onCheckedChange={(v) => void phone.setAutoAnswer(v)}
                id="cc-auto-answer"
              />
              <Label htmlFor="cc-auto-answer" className="text-xs font-medium">
                {t("callCenter.autoAnswer")}
              </Label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                aria-pressed={phone.micMuted}
                onClick={() => phone.setMicMuted(!phone.micMuted)}
              >
                {phone.micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span className="ms-1.5 hidden sm:inline">
                  {phone.micMuted ? t("callCenter.unmute") : t("callCenter.mute")}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                aria-pressed={phone.speakerMuted}
                onClick={() => phone.setSpeakerMuted(!phone.speakerMuted)}
              >
                {phone.speakerMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                <span className="ms-1.5 hidden sm:inline">
                  {phone.speakerMuted ? t("callCenter.speakerOff") : t("callCenter.speakerOn")}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                disabled={phone.pending}
                onClick={() => void phone.onTestRing()}
              >
                <PhoneCall className="me-1.5 h-4 w-4" aria-hidden />
                {t("callCenter.testRing")}
              </Button>
              {phone.acwRemaining != null ? (
                <Button type="button" size="sm" className="min-h-10" onClick={() => void phone.endAcwEarly()}>
                  {t("callCenter.endAcw")} ({phone.acwRemaining}s)
                </Button>
              ) : null}
              {phone.activeCall ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-10"
                    disabled={phone.pending}
                    onClick={() => void phone.onPark()}
                  >
                    {t("callCenter.park")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-10"
                    disabled={phone.pending}
                    onClick={() => void phone.onToggleRecording()}
                  >
                    {phone.activeCall.recordingEnabled
                      ? t("callCenter.recordingOn")
                      : t("callCenter.toggleRecording")}
                  </Button>
                </>
              ) : null}
            </div>
          </header>

          {phone.parkedCalls.length > 0 ? (
            <section className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("callCenter.parkOrbit")}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {phone.parkedCalls.map((call) => (
                  <li key={call.id}>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={phone.pending}
                      onClick={() => void phone.onRetrieveParked(call.id)}
                    >
                      {t("callCenter.retrieveSlot", {
                        slot: call.parkedSlot,
                        from: call.fromE164 || call.toE164,
                      })}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {phone.acwRemaining != null ? (
            <AcwDispositionPanel
              onSave={(code, notes) => void phone.onSaveDisposition(code, notes)}
              pending={phone.pending}
            />
          ) : null}

          {!phone.callCenterEnabled || phone.myQueues.length === 0 || !phone.sipConfigured ? (
            <div className="space-y-2">
              {!phone.callCenterEnabled ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-amber-600/30 bg-amber-50/70 px-4 py-3">
                  <p className="text-sm text-foreground">{t("callCenter.emptyEnableSettings")}</p>
                  <Button asChild type="button" size="sm" variant="outline" className="min-h-9">
                    <Link href="/call-center/settings">{t("callCenter.openSettings")}</Link>
                  </Button>
                </div>
              ) : null}
              {phone.myQueues.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border/70 bg-card/60 px-4 py-3">
                  <p className="text-sm text-muted-foreground">{t("callCenter.emptyJoinQueue")}</p>
                  <Button asChild type="button" size="sm" variant="outline" className="min-h-9">
                    <Link href="/call-center/queues">{t("callCenter.openQueues")}</Link>
                  </Button>
                </div>
              ) : null}
              {!phone.sipConfigured ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border/70 bg-card/60 px-4 py-3">
                  <p className="text-sm text-muted-foreground">{t("callCenter.configureSipHint")}</p>
                  <Button asChild type="button" size="sm" variant="ghost" className="min-h-9">
                    <Link href="/call-center/settings">{t("callCenter.openSettings")}</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 3-zone workspace */}
          <div className="grid gap-4 xl:grid-cols-[minmax(14rem,0.9fr)_minmax(0,1.35fr)_minmax(14rem,0.95fr)]">
            {/* Left: queues + speed dial + available */}
            <aside className="space-y-4">
              <section className="rounded-[1.5rem] border border-border/50 bg-card p-4 shadow-elevated-xs">
                <h2 className="text-sm font-semibold">{t("callCenter.myQueues")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("callCenter.myQueuesHint")}</p>
                {phone.myQueues.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-border/60 px-3 py-4 text-center">
                    <p className="text-xs text-muted-foreground">{t("callCenter.emptyJoinQueue")}</p>
                    <Link
                      href="/call-center/queues"
                      className="mt-2 inline-block text-xs font-semibold text-[var(--fec-star)] underline-offset-2 hover:underline"
                    >
                      {t("callCenter.openQueues")}
                    </Link>
                  </div>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {phone.myQueues.map((q) => (
                      <li
                        key={q.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{q.name}</span>
                        <span className="text-[0.7rem] text-muted-foreground">
                          ACW {q.wrapUpSeconds}s
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-[1.5rem] border border-border/50 bg-card p-4 shadow-elevated-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{t("callCenter.whoAvailable")}</h2>
                  <span className="text-[0.7rem] tabular-nums text-muted-foreground">
                    {phone.availableAgents.length}
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {phone.availableAgents.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
                      {t("callCenter.noAvailableAgents")}
                    </li>
                  ) : (
                    phone.availableAgents.slice(0, 6).map((agent) => (
                      <li key={agent.userId} className="flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" aria-hidden />
                        <span className="truncate text-xs font-medium">{agent.displayName}</span>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section className="rounded-[1.5rem] border border-border/50 bg-card p-4 shadow-elevated-xs">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                  {t("callCenter.speedDial")}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("callCenter.speedDialHint")}</p>
                <ul className="mt-3 space-y-1.5">
                  {phone.speedDials.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
                      {t("callCenter.speedDialEmpty")}
                    </li>
                  ) : (
                    phone.speedDials.map((item) => (
                      <li key={item.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          className="min-w-0 flex-1 rounded-xl px-2.5 py-2 text-start text-sm hover:bg-muted/50"
                          onClick={() => {
                            phone.setDialDigits(item.e164);
                            void phone.onDial(item.e164);
                          }}
                        >
                          <span className="block truncate font-medium">{item.label}</span>
                          <span className="block font-mono text-[0.7rem] text-muted-foreground">
                            {item.e164}
                          </span>
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => void phone.onDeleteSpeedDial(item.id)}
                          aria-label={t("callCenter.speedDialDelete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
                <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                  <Input
                    value={speedLabel}
                    onChange={(e) => setSpeedLabel(e.target.value)}
                    placeholder={t("callCenter.speedDialLabel")}
                    className="min-h-10"
                  />
                  <Input
                    value={speedE164}
                    onChange={(e) => setSpeedE164(e.target.value)}
                    placeholder="+974…"
                    className="min-h-10 font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    disabled={phone.pending || !speedLabel.trim() || speedE164.trim().length < 4}
                    onClick={() => {
                      void phone.onAddSpeedDial(speedLabel.trim(), speedE164.trim()).then(() => {
                        setSpeedLabel("");
                        setSpeedE164("+974");
                      });
                    }}
                  >
                    {t("callCenter.speedDialAdd")}
                  </Button>
                </div>
              </section>
            </aside>

            {/* Center: dialer / active call */}
            <main className="min-w-0">
              {phone.activeCall && phone.media ? (
                <CallCenterSoftphoneRoom
                  token={phone.media.token}
                  serverUrl={phone.media.serverUrl}
                  held={phone.held}
                  answeredAt={phone.activeCall.answeredAt}
                  callerLabel={
                    phone.activeCall.direction === "outbound"
                      ? phone.activeCall.toE164
                      : phone.activeCall.fromE164 || t("callCenter.unknownCaller")
                  }
                  transferTargets={phone.transferTargets}
                  micMuted={phone.micMuted}
                  speakerMuted={phone.speakerMuted}
                  onMicMutedChange={phone.setMicMuted}
                  onHangup={() => void phone.onHangup()}
                  onHoldToggle={() => void phone.onHoldToggle()}
                  onDtmf={(digit) => void phone.onDtmf(digit)}
                  onTransfer={(type, target) => void phone.onTransfer(type, target)}
                  onConference={() => void phone.onConference()}
                />
              ) : (
                <section className="rounded-[1.75rem] border border-border/50 bg-card p-5 shadow-elevated-xs sm:p-7">
                  <p className="text-center text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("callCenter.outboundDial")}
                  </p>
                  <p className="mt-1 text-center text-xs text-muted-foreground">
                    {t("callCenter.outboundDialHint")}
                  </p>
                  <Input
                    className="mt-4 h-16 border-0 bg-transparent text-center font-mono text-3xl tracking-[0.14em] shadow-none focus-visible:ring-0 sm:text-4xl"
                    value={phone.dialDigits}
                    onChange={(e) => phone.setDialDigits(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void phone.onDial();
                      }
                    }}
                    inputMode="tel"
                    aria-label={t("callCenter.outboundDial")}
                  />
                  {phone.callerIdOptions.length > 0 ? (
                    <div className="mx-auto mt-3 flex max-w-[19rem] flex-col gap-1.5">
                      <Label className="text-center text-xs text-muted-foreground">
                        {t("callCenter.callerIdPicker")}
                      </Label>
                      <Select
                        value={phone.outboundCallerId || phone.callerIdOptions[0]}
                        onValueChange={phone.setOutboundCallerId}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {phone.callerIdOptions.map((id) => (
                            <SelectItem key={id} value={id}>
                              {id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="mx-auto mt-4 grid max-w-[19rem] grid-cols-3 gap-3">
                    {DIAL_KEYS.map((key) => (
                      <button
                        key={key.digit}
                        type="button"
                        className="flex h-16 flex-col items-center justify-center rounded-[1.25rem] border border-border/50 bg-[var(--surface-2)] text-foreground shadow-sm transition hover:bg-[color-mix(in_oklab,var(--fec-star)_10%,var(--card))] active:scale-[0.98]"
                        onClick={() => {
                          if (key.digit === "0" && phone.dialDigits === "+974") {
                            // keep +974; append 0
                          }
                          phone.setDialDigits((v) => v + key.digit);
                        }}
                      >
                        <span className="text-2xl font-semibold leading-none">{key.digit}</span>
                        {key.letters ? (
                          <span className="mt-1 text-[0.6rem] tracking-[0.18em] text-muted-foreground">
                            {key.letters}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-14 min-w-14 rounded-full"
                      onClick={() => phone.setDialDigits((v) => (v.length <= 1 ? "+" : v.slice(0, -1)))}
                      aria-label={t("callCenter.backspace")}
                    >
                      <Delete className="h-5 w-5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      className="min-h-14 min-w-[10rem] rounded-full bg-emerald-600 text-base text-white hover:bg-emerald-700"
                      disabled={phone.pending}
                      onClick={() => void phone.onDial()}
                    >
                      <Phone className="me-2 h-5 w-5" aria-hidden />
                      {t("callCenter.call")}
                    </Button>
                  </div>
                  <p className="mt-4 text-center text-[0.7rem] text-muted-foreground">
                    {t("callCenter.dialShortcuts")}
                  </p>
                </section>
              )}
            </main>

            {/* Right: recent + notes */}
            <aside className="space-y-4">
              <section className="rounded-[1.5rem] border border-border/50 bg-card p-4 shadow-elevated-xs">
                <Collapsible open={recentCallsOpen} onOpenChange={onRecentCallsOpenChange}>
                  <CollapsibleTrigger
                    type="button"
                    className="group flex w-full items-center gap-2 text-start"
                    aria-label={t("callCenter.recentCallsToggle")}
                  >
                    <h2 className="min-w-0 flex-1 text-sm font-semibold">
                      {t("callCenter.recentCalls")}
                      {!recentCallsOpen && phone.recentCalls.length > 0 ? (
                        <span className="ms-1.5 font-normal text-muted-foreground">
                          ({Math.min(12, phone.recentCalls.length)})
                        </span>
                      ) : null}
                    </h2>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                      aria-hidden
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul
                      id="cc-recent-calls-list"
                      className="mt-3 max-h-56 divide-y divide-border/60 overflow-y-auto overscroll-contain pe-1"
                    >
                      {phone.recentCalls.length === 0 ? (
                        <li className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                          {t("callCenter.noCallsHint")}
                        </li>
                      ) : (
                        phone.recentCalls.slice(0, 12).map((call) => {
                          const live = isLiveConnectable(call);
                          const canCallback = isCallbackable(call);
                          return (
                            <li
                              key={call.id}
                              className={cn(
                                "flex items-start justify-between gap-2 py-2.5 text-sm",
                                recentCallRowClass(call.status),
                              )}
                            >
                              <div className="min-w-0">
                                <p
                                  className={cn(
                                    "truncate font-medium",
                                    call.status === "ivr" && "text-sky-950 dark:text-sky-50",
                                    (call.status === "queued" ||
                                      call.status === "ringing" ||
                                      call.status === "offered") &&
                                      "text-foreground",
                                    (call.status === "missed" || call.status === "declined") &&
                                      "text-rose-800 dark:text-rose-100",
                                  )}
                                >
                                  {call.direction === "outbound"
                                    ? call.toE164 || "—"
                                    : call.fromE164 || "—"}
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                                  <span>{new Date(call.startedAt).toLocaleString()}</span>
                                  <Badge
                                    variant={recentStatusBadgeVariant(call.status)}
                                    className="h-5 px-1.5 text-[0.65rem] font-semibold uppercase tracking-wide"
                                  >
                                    {recentStatusLabel(call.status, t)}
                                  </Badge>
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <Badge variant="secondary" className="text-[0.65rem]">
                                  {call.direction}
                                </Badge>
                                {live ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="default"
                                    className="h-8 px-2 text-xs"
                                    disabled={phone.pending || Boolean(phone.activeCall)}
                                    onClick={() => void phone.onConnectDirectly(call)}
                                  >
                                    <PhoneIncoming className="me-1 h-3 w-3" aria-hidden />
                                    {t("callCenter.connectDirectly")}
                                  </Button>
                                ) : null}
                                {canCallback ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2 text-xs"
                                    disabled={phone.pending || Boolean(phone.activeCall)}
                                    onClick={() => phone.onCallback(call)}
                                  >
                                    <Phone className="me-1 h-3 w-3" aria-hidden />
                                    {t("callCenter.callback")}
                                  </Button>
                                ) : null}
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              <section className="rounded-[1.5rem] border border-border/50 bg-card p-4 shadow-elevated-xs">
                <h2 className="text-sm font-semibold">{t("callCenter.callNotes")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {phone.notesCallId
                    ? t("callCenter.callNotesHint")
                    : t("callCenter.callNotesIdle")}
                </p>
                <Textarea
                  className="mt-3 min-h-[8rem]"
                  value={phone.notesDraft}
                  onChange={(e) => phone.setNotesDraft(e.target.value)}
                  disabled={!phone.notesCallId}
                  placeholder={t("callCenter.callNotesPlaceholder")}
                />
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={phone.pending || !phone.notesCallId}
                  onClick={() => void phone.onSaveNotes()}
                >
                  {t("callCenter.saveNotes")}
                </Button>
                <div className="mt-4 border-t border-border/60 pt-4">
                  <p className="text-xs font-medium text-foreground">{t("callCenter.callTags")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(tagsCatalog.data ?? []).map((tag) => {
                      const on = phone.tagsDraft.includes(tag.name);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          disabled={!phone.notesCallId || phone.pending}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50",
                            on
                              ? "border-foreground/20 bg-foreground text-background"
                              : "border-border bg-card text-muted-foreground",
                          )}
                          style={on ? undefined : { borderColor: tag.color }}
                          onClick={() =>
                            phone.setTagsDraft((prev) =>
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
                    className="mt-3"
                    disabled={phone.pending || !phone.notesCallId}
                    onClick={() => void phone.onSaveTags()}
                  >
                    {t("callCenter.saveTags")}
                  </Button>
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterPage;
