"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { IncomingCallOverlay } from "@/components/call-center/incoming-call-overlay";
import { CallCenterSoftphoneRoom } from "@/components/call-center/softphone-room";
import { FecButton as Button, FecLoader, FecPageHeader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
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
  pollCallCenterIncoming,
  sendCallCenterDtmf,
  setCallCenterAgentStatus,
  testCallCenterRing,
} from "@/lib/call-center/call-center.functions";
import type {
  CallCenterAgentStatusValue,
  CallCenterCall,
  CallCenterMediaSession,
} from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";

const WORKSPACE_KEY = ["call-center", "workspace"] as const;
const STATUSES: CallCenterAgentStatusValue[] = ["available", "busy", "away", "acw", "offline"];

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

  useEffect(() => {
    if (!incoming || activeCall) return;
    // Soft notification when a new ring appears
  }, [incoming, activeCall]);

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

  if (!canUse) {
    return (
      <div className="space-y-5">
        <FecPageHeader
          icon={Headphones}
          kicker={t("callCenter.kicker")}
          title={t("callCenter.title")}
          subtitle={t("callCenter.subtitle")}
        />
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("callCenter.forbidden")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FecPageHeader
        icon={Headphones}
        kicker={t("callCenter.kicker")}
        title={t("callCenter.title")}
        subtitle={t("callCenter.subtitle")}
      />

      {workspace.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : workspace.isError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <>
          {!workspace.data?.settings.sipConfigured ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t("callCenter.configureSipHint")}
            </p>
          ) : null}
          {!workspace.data?.settings.livekitReady ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t("callCenter.configureLivekitHint")}
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

          {activeCall && media ? (
            <CallCenterSoftphoneRoom
              token={media.token}
              serverUrl={media.serverUrl}
              held={held}
              onHangup={() => void onHangup()}
              onHoldToggle={() => void onHoldToggle()}
              onDtmf={(digit) => void onDtmf(digit)}
            />
          ) : null}

          <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
            <h2 className="text-sm font-semibold">{t("callCenter.recentCalls")}</h2>
            <ul className="mt-3 divide-y divide-border/60">
              {(workspace.data?.recentCalls ?? []).length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">{t("callCenter.noCalls")}</li>
              ) : (
                (workspace.data?.recentCalls ?? []).map((call) => (
                  <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{call.fromE164 || "—"} → {call.toE164 || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(call.startedAt).toLocaleString()} · {call.provider}
                      </p>
                    </div>
                    <Badge variant="secondary">{call.status}</Badge>
                  </li>
                ))
              )}
            </ul>
          </section>
        </>
      )}

      {incoming && !activeCall ? (
        <IncomingCallOverlay
          call={incoming}
          pending={pending}
          onAnswer={() => void onAnswer()}
          onDecline={() => void onDecline()}
        />
      ) : null}
    </div>
  );
}

export default CallCenterPage;
