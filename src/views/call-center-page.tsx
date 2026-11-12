"use client";

import {
  Delete,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  Star,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CallCenterSoftphoneRoom } from "@/components/call-center/softphone-room";
import { useCallCenterSoftphone } from "@/components/call-center/softphone-provider";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CallCenterAgentStatusValue } from "@/lib/call-center/types";
import { cn } from "@/lib/utils";
import { CallCenterShell } from "@/views/call-center-section-nav";

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
  if (status === "away") return "bg-orange-400";
  return "bg-zinc-400";
}

function CallCenterPage() {
  const { t } = useTranslation();
  const phone = useCallCenterSoftphone();
  const [speedLabel, setSpeedLabel] = useState("");
  const [speedE164, setSpeedE164] = useState("+974");

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
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={phone.pending}
                  onClick={() => void phone.changeStatus(status)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    phone.workspaceStatus === status
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-border/70 bg-background text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {t(statusLabelKey(status))}
                </button>
              ))}
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

          {!phone.callCenterEnabled ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t("callCenter.emptyEnableSettings")}{" "}
              <Link href="/call-center/settings" className="font-medium text-foreground underline-offset-2 hover:underline">
                {t("callCenterNav.settings")}
              </Link>
            </p>
          ) : null}

          {phone.myQueues.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t("callCenter.emptyJoinQueue")}{" "}
              <Link href="/call-center/queues" className="font-medium text-foreground underline-offset-2 hover:underline">
                {t("callCenterNav.queues")}
              </Link>
            </p>
          ) : null}

          {!phone.sipConfigured ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t("callCenter.configureSipHint")}
            </p>
          ) : null}

          {/* 3-zone workspace */}
          <div className="grid gap-4 xl:grid-cols-[minmax(14rem,0.9fr)_minmax(0,1.35fr)_minmax(14rem,0.95fr)]">
            {/* Left: queues + speed dial + available */}
            <aside className="space-y-4">
              <section className="rounded-[1.5rem] border border-border/50 bg-card p-4 shadow-elevated-xs">
                <h2 className="text-sm font-semibold">{t("callCenter.myQueues")}</h2>
                {phone.myQueues.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">{t("callCenter.emptyJoinQueue")}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {phone.myQueues.map((q) => (
                      <li
                        key={q.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-muted/35 px-3 py-2 text-sm"
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
                <h2 className="text-sm font-semibold">{t("callCenter.whoAvailable")}</h2>
                <ul className="mt-3 space-y-2">
                  {phone.availableAgents.length === 0 ? (
                    <li className="text-xs text-muted-foreground">{t("callCenter.noAvailableAgents")}</li>
                  ) : (
                    phone.availableAgents.slice(0, 8).map((agent) => (
                      <li key={agent.userId} className="flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                        <span className="font-mono text-xs">{agent.userId.slice(0, 8)}…</span>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section className="rounded-[1.5rem] border border-border/50 bg-card p-4 shadow-elevated-xs">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Star className="h-3.5 w-3.5" aria-hidden />
                  {t("callCenter.speedDial")}
                </h2>
                <ul className="mt-3 space-y-1.5">
                  {phone.speedDials.length === 0 ? (
                    <li className="text-xs text-muted-foreground">{t("callCenter.speedDialEmpty")}</li>
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
                  onMicMutedChange={phone.setMicMuted}
                  onHangup={() => void phone.onHangup()}
                  onHoldToggle={() => void phone.onHoldToggle()}
                  onDtmf={(digit) => void phone.onDtmf(digit)}
                  onTransfer={(type, target) => void phone.onTransfer(type, target)}
                />
              ) : (
                <section className="rounded-[1.75rem] border border-border/50 bg-[radial-gradient(ellipse_at_top,_hsl(var(--muted)/0.65),_transparent_58%),hsl(var(--card))] p-5 shadow-elevated-xs sm:p-7">
                  <p className="text-center text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("callCenter.outboundDial")}
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
                  <div className="mx-auto mt-4 grid max-w-[19rem] grid-cols-3 gap-3">
                    {DIAL_KEYS.map((key) => (
                      <button
                        key={key.digit}
                        type="button"
                        className="flex h-16 flex-col items-center justify-center rounded-[1.25rem] border border-border/40 bg-background/80 text-foreground shadow-sm transition hover:bg-muted/60 active:scale-[0.98]"
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
                <h2 className="text-sm font-semibold">{t("callCenter.recentCalls")}</h2>
                <ul className="mt-3 divide-y divide-border/60">
                  {phone.recentCalls.length === 0 ? (
                    <li className="py-6 text-center text-sm text-muted-foreground">{t("callCenter.noCalls")}</li>
                  ) : (
                    phone.recentCalls.slice(0, 12).map((call) => (
                      <li key={call.id} className="flex items-start justify-between gap-2 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {call.direction === "outbound"
                              ? call.toE164 || "—"
                              : call.fromE164 || "—"}
                          </p>
                          <p className="text-[0.7rem] text-muted-foreground">
                            {new Date(call.startedAt).toLocaleString()} · {call.status}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="secondary" className="text-[0.65rem]">
                            {call.direction}
                          </Badge>
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
                        </div>
                      </li>
                    ))
                  )}
                </ul>
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
              </section>
            </aside>
          </div>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterPage;
