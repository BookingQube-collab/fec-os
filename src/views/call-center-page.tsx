"use client";

import { Delete, Phone, PhoneCall } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CallCenterSoftphoneRoom } from "@/components/call-center/softphone-room";
import { useCallCenterSoftphone } from "@/components/call-center/softphone-provider";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CallCenterAgentStatusValue } from "@/lib/call-center/types";
import { CallCenterShell } from "@/views/call-center-section-nav";

const STATUSES: CallCenterAgentStatusValue[] = ["available", "busy", "away", "acw", "offline"];
const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

function statusLabelKey(status: CallCenterAgentStatusValue) {
  return `callCenter.status.${status}` as const;
}

function CallCenterPage() {
  const { t } = useTranslation();
  const phone = useCallCenterSoftphone();

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
    <CallCenterShell titleKey="callCenter.dialerTitle" subtitleKey="callCenter.dialerSubtitle">
      {phone.workspaceLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : phone.workspaceError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-4">
            {!phone.sipConfigured ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                {t("callCenter.configureSipHint")}
              </p>
            ) : null}

            <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
              <div className="min-w-[12rem] space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("callCenter.agentStatus")}</p>
                <Select
                  value={phone.workspaceStatus}
                  onValueChange={(value) => void phone.changeStatus(value as CallCenterAgentStatusValue)}
                  disabled={phone.pending}
                >
                  <SelectTrigger aria-label={t("callCenter.agentStatus")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(statusLabelKey(status))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" disabled={phone.pending} onClick={() => void phone.onTestRing()}>
                <PhoneCall className="me-1.5 h-4 w-4" aria-hidden />
                {t("callCenter.testRing")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("callCenter.signedInAs", { id: phone.agentUserId?.slice(0, 8) ?? "—" })}
              </p>
            </section>

            {!phone.activeCall ? (
              <section className="rounded-2xl border border-border/50 bg-[radial-gradient(ellipse_at_top,_hsl(var(--muted)/0.55),_transparent_55%),hsl(var(--card))] p-5 shadow-elevated-xs">
                <h2 className="text-sm font-semibold tracking-tight">{t("callCenter.outboundDial")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("callCenter.outboundHint")}</p>
                <Input
                  className="mt-4 h-14 border-border/60 bg-background/80 text-center font-mono text-2xl tracking-[0.12em]"
                  value={phone.dialDigits}
                  onChange={(e) => phone.setDialDigits(e.target.value)}
                  inputMode="tel"
                  aria-label={t("callCenter.outboundDial")}
                />
                <div className="mx-auto mt-5 grid max-w-[17rem] grid-cols-3 gap-2.5">
                  {DIAL_KEYS.map((digit) => (
                    <Button
                      key={digit}
                      type="button"
                      variant="secondary"
                      className="h-14 rounded-2xl text-xl font-semibold shadow-sm"
                      onClick={() => phone.setDialDigits((v) => v + digit)}
                    >
                      {digit}
                    </Button>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12"
                    onClick={() => phone.setDialDigits((v) => (v.length <= 1 ? "+" : v.slice(0, -1)))}
                  >
                    <Delete className="me-1.5 h-4 w-4" aria-hidden />
                    {t("callCenter.backspace")}
                  </Button>
                  <Button
                    type="button"
                    className="min-h-12 min-w-[8.5rem] rounded-full text-base"
                    disabled={phone.pending}
                    onClick={() => void phone.onDial()}
                  >
                    <Phone className="me-1.5 h-4 w-4" aria-hidden />
                    {t("callCenter.call")}
                  </Button>
                </div>
              </section>
            ) : null}

            {phone.activeCall && phone.media ? (
              <CallCenterSoftphoneRoom
                token={phone.media.token}
                serverUrl={phone.media.serverUrl}
                held={phone.held}
                answeredAt={phone.activeCall.answeredAt}
                transferTargets={phone.transferTargets}
                onHangup={() => void phone.onHangup()}
                onHoldToggle={() => void phone.onHoldToggle()}
                onDtmf={(digit) => void phone.onDtmf(digit)}
                onTransfer={(type, target) => void phone.onTransfer(type, target)}
              />
            ) : null}
          </div>

          <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
            <h2 className="text-sm font-semibold">{t("callCenter.recentCalls")}</h2>
            <ul className="mt-3 divide-y divide-border/60">
              {phone.recentCalls.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">{t("callCenter.noCalls")}</li>
              ) : (
                phone.recentCalls.map((call) => (
                  <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {call.fromE164 || "—"} → {call.toE164 || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(call.startedAt).toLocaleString()} · {call.direction} · {call.provider}
                        {call.transferType ? ` · ${call.transferType}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">{call.status}</Badge>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterPage;
