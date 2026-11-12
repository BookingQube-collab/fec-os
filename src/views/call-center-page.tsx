"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Delete, Phone, PhoneCall } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { IncomingCallOverlay } from "@/components/call-center/incoming-call-overlay";
import { CallCenterSoftphoneRoom } from "@/components/call-center/softphone-room";
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
import { useAuth } from "@/hooks/use-auth";
import {
  answerCallCenterCall,
  declineCallCenterCall,
  hangupCallCenterCall,
  holdCallCenterCall,
  loadCallCenterAgentWorkspace,
  placeCallCenterOutbound,
  pollCallCenterIncoming,
  sendCallCenterDtmf,
  setCallCenterAgentStatus,
  testCallCenterRing,
  transferCallCenterCall,
} from "@/lib/call-center/call-center.functions";
import type {
  CallCenterAgentStatusValue,
  CallCenterCall,
  CallCenterMediaSession,
} from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

const WORKSPACE_KEY = ["call-center", "workspace"] as const;
const STATUSES: CallCenterAgentStatusValue[] = ["available", "busy", "away", "acw", "offline"];
const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

function statusLabelKey(status: CallCenterAgentStatusValue) {
  return `callCenter.status.${status}` as const;
}

function CallCenterPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const [pending, setPending] = useState(false);
  const [activeCall, setActiveCall] = useState<CallCenterCall | null>(null);
  const [media, setMedia] = useState<CallCenterMediaSession | null>(null);
  const [held, setHeld] = useState(false);
  const [dialDigits, setDialDigits] = useState("+974");

  const workspace = useQuery({
    queryKey: WORKSPACE_KEY,
    enabled: canUse,
    refetchInterval: 8_000,
    queryFn: async () => {
      const result = await loadCallCenterAgentWorkspace({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const ringingQuery = useQuery({
    queryKey: ["call-center", "ringing"],
    enabled: canUse && workspace.data?.status.status === "available" && !activeCall,
    refetchInterval: 2_000,
    queryFn: async () => {
      const result = await pollCallCenterIncoming({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const incoming = ringingQuery.data?.[0] ?? workspace.data?.ringing[0] ?? null;

  async function changeStatus(status: CallCenterAgentStatusValue) {
    setPending(true);
    const result = await setCallCenterAgentStatus({ status });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
    toast.success(t("callCenter.statusUpdated"));
  }

  async function onTestRing() {
    setPending(true);
    const result = await testCallCenterRing({});
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
    toast.success(t("callCenter.testRingSent"));
  }

  async function onDial() {
    setPending(true);
    const result = await placeCallCenterOutbound({
      toE164: dialDigits,
      fromE164: workspace.data?.settings.outboundCallerIdE164 || undefined,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(result.data.call);
    setMedia(result.data.media);
    setHeld(false);
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
    toast.success(t("callCenter.outboundStarted"));
  }

  async function onAnswer() {
    if (!incoming) return;
    setPending(true);
    const result = await answerCallCenterCall({ callId: incoming.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(result.data.call);
    setMedia(result.data.media);
    setHeld(false);
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
  }

  async function onDecline() {
    if (!incoming) return;
    setPending(true);
    const result = await declineCallCenterCall({ callId: incoming.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
  }

  async function onHangup() {
    if (!activeCall) return;
    setPending(true);
    const result = await hangupCallCenterCall({ callId: activeCall.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(null);
    setMedia(null);
    setHeld(false);
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
  }

  async function onHoldToggle() {
    if (!activeCall) return;
    const next = !held;
    setPending(true);
    const result = await holdCallCenterCall({ callId: activeCall.id, held: next });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setHeld(next);
    setActiveCall(result.data);
  }

  async function onDtmf(digit: string) {
    if (!activeCall) return;
    const result = await sendCallCenterDtmf({ callId: activeCall.id, digit });
    if (!result.ok) toast.error(result.error);
  }

  async function onTransfer(type: "cold" | "warm", target: string) {
    if (!activeCall) return;
    setPending(true);
    const result = await transferCallCenterCall({ callId: activeCall.id, type, target });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.transferRecorded"));
    if (type === "cold") {
      setActiveCall(null);
      setMedia(null);
      setHeld(false);
    } else {
      setActiveCall(result.data);
      setHeld(true);
    }
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
  }

  if (!canUse) {
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
      {workspace.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : workspace.isError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            {!workspace.data?.settings.sipConfigured ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                {t("callCenter.configureSipHint")}
              </p>
            ) : null}

            <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
              <div className="min-w-[12rem] space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("callCenter.agentStatus")}</p>
                <Select
                  value={workspace.data?.status.status ?? "offline"}
                  onValueChange={(value) => void changeStatus(value as CallCenterAgentStatusValue)}
                  disabled={pending}
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
              <Button type="button" variant="outline" disabled={pending} onClick={() => void onTestRing()}>
                <PhoneCall className="me-1.5 h-4 w-4" aria-hidden />
                {t("callCenter.testRing")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("callCenter.signedInAs", { id: user?.id?.slice(0, 8) ?? "—" })}
              </p>
            </section>

            {!activeCall ? (
              <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
                <h2 className="text-sm font-semibold">{t("callCenter.outboundDial")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("callCenter.outboundHint")}</p>
                <Input
                  className="mt-3 font-mono text-lg tracking-wide"
                  value={dialDigits}
                  onChange={(e) => setDialDigits(e.target.value)}
                  inputMode="tel"
                  aria-label={t("callCenter.outboundDial")}
                />
                <div className="mt-3 grid max-w-[16rem] grid-cols-3 gap-2">
                  {DIAL_KEYS.map((digit) => (
                    <Button
                      key={digit}
                      type="button"
                      variant="secondary"
                      className="min-h-11 font-semibold"
                      onClick={() => setDialDigits((v) => v + digit)}
                    >
                      {digit}
                    </Button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialDigits((v) => (v.length <= 1 ? "+" : v.slice(0, -1)))}
                  >
                    <Delete className="me-1.5 h-4 w-4" aria-hidden />
                    {t("callCenter.backspace")}
                  </Button>
                  <Button type="button" disabled={pending} onClick={() => void onDial()}>
                    <Phone className="me-1.5 h-4 w-4" aria-hidden />
                    {t("callCenter.call")}
                  </Button>
                </div>
              </section>
            ) : null}

            {activeCall && media ? (
              <CallCenterSoftphoneRoom
                token={media.token}
                serverUrl={media.serverUrl}
                held={held}
                onHangup={() => void onHangup()}
                onHoldToggle={() => void onHoldToggle()}
                onDtmf={(digit) => void onDtmf(digit)}
                onTransfer={(type, target) => void onTransfer(type, target)}
              />
            ) : null}
          </div>

          <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
            <h2 className="text-sm font-semibold">{t("callCenter.recentCalls")}</h2>
            <ul className="mt-3 divide-y divide-border/60">
              {(workspace.data?.recentCalls ?? []).length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">{t("callCenter.noCalls")}</li>
              ) : (
                (workspace.data?.recentCalls ?? []).map((call) => (
                  <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {call.fromE164 || "—"} → {call.toE164 || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(call.startedAt).toLocaleString()} · {call.direction} · {call.provider}
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

      {incoming && !activeCall ? (
        <IncomingCallOverlay
          call={incoming}
          pending={pending}
          onAnswer={() => void onAnswer()}
          onDecline={() => void onDecline()}
        />
      ) : null}
    </CallCenterShell>
  );
}

export default CallCenterPage;
