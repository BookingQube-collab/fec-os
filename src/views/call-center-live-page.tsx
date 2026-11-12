"use client";

import { useQuery } from "@tanstack/react-query";
import { Ear, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SupervisorMonitorRoom } from "@/components/call-center/supervisor-monitor-room";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import {
  joinCallCenterMonitor,
  loadCallCenterWallboard,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterMediaSession, CallCenterSupervisorMode } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function statusTone(status: string) {
  if (status === "available") return "default" as const;
  if (status === "busy" || status === "answered" || status === "held") return "destructive" as const;
  return "secondary" as const;
}

function CallCenterLivePage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canSupervise = canUserDo(roleNames, "admin.view");
  const [monitor, setMonitor] = useState<{
    callId: string;
    mode: CallCenterSupervisorMode;
    media: CallCenterMediaSession;
    agentUserId: string | null;
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const wallboard = useQuery({
    queryKey: ["call-center", "wallboard"],
    enabled: canUse,
    refetchInterval: 3_000,
    queryFn: async () => {
      const result = await loadCallCenterWallboard({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  async function startMonitor(callId: string, mode: CallCenterSupervisorMode, agentUserId: string | null) {
    setPendingId(`${callId}:${mode}`);
    const result = await joinCallCenterMonitor({ callId, mode });
    setPendingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (!result.data.media.token || !result.data.media.serverUrl.startsWith("wss://")) {
      toast.error(t("callCenter.mediaNotConfigured"));
      return;
    }
    setMonitor({
      callId,
      mode,
      media: result.data.media,
      agentUserId,
    });
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.liveTitle" subtitleKey="callCenter.liveSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.liveTitle" subtitleKey="callCenter.liveSubtitle">
      {wallboard.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : wallboard.isError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
            <h2 className="text-sm font-semibold">{t("callCenter.agentsWall")}</h2>
            <ul className="mt-3 divide-y divide-border/60">
              {(wallboard.data?.agents ?? []).length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  {t("callCenter.noAgents")}
                </li>
              ) : (
                (wallboard.data?.agents ?? []).map((agent) => (
                  <li key={agent.userId} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div>
                      <p className="font-medium">{agent.userId.slice(0, 8)}…</p>
                      <p className="text-xs text-muted-foreground">
                        {t("callCenter.since", {
                          time: new Date(agent.statusSince).toLocaleTimeString(),
                        })}
                      </p>
                    </div>
                    <Badge variant={statusTone(agent.status)}>
                      {t(`callCenter.status.${agent.status}`)}
                    </Badge>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
            <h2 className="text-sm font-semibold">{t("callCenter.activeCalls")}</h2>
            <ul className="mt-3 divide-y divide-border/60">
              {(wallboard.data?.activeCalls ?? []).length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  {t("callCenter.noActiveCalls")}
                </li>
              ) : (
                (wallboard.data?.activeCalls ?? []).map((call) => {
                  const queue = wallboard.data?.queues.find((q) => q.id === call.queueId);
                  const inCall = call.status === "answered" || call.status === "held";
                  return (
                    <li key={call.id} className="space-y-2 py-2.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {call.fromE164 || "—"} → {call.toE164 || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {queue?.name ?? "—"} · {call.direction}
                            {call.whisperActive ? ` · ${t("callCenter.whisper")}` : ""}
                            {call.bargeActive ? ` · ${t("callCenter.barge")}` : ""}
                          </p>
                        </div>
                        <Badge variant={statusTone(call.status)}>{call.status}</Badge>
                      </div>
                      {canSupervise && inCall ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={pendingId === `${call.id}:whisper`}
                            onClick={() => void startMonitor(call.id, "whisper", call.agentUserId)}
                          >
                            <Ear className="me-1 h-3.5 w-3.5" aria-hidden />
                            {t("callCenter.whisper")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pendingId === `${call.id}:barge`}
                            onClick={() => void startMonitor(call.id, "barge", call.agentUserId)}
                          >
                            <Users className="me-1 h-3.5 w-3.5" aria-hidden />
                            {t("callCenter.barge")}
                          </Button>
                        </div>
                      ) : null}
                      {monitor?.callId === call.id ? (
                        <SupervisorMonitorRoom
                          token={monitor.media.token}
                          serverUrl={monitor.media.serverUrl}
                          mode={monitor.mode}
                          agentUserId={monitor.agentUserId}
                          onLeave={() => setMonitor(null)}
                        />
                      ) : null}
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterLivePage;
