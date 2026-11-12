"use client";

import { useQuery } from "@tanstack/react-query";
import { Ear, Phone, Radio, Users } from "lucide-react";
import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { CallCenterShell } from "@/views/call-center-section-nav";

function statusTone(status: string) {
  if (status === "available") return "success" as const;
  if (status === "busy" || status === "answered") return "destructive" as const;
  if (status === "held" || status === "acw" || status === "away") return "warning" as const;
  return "muted" as const;
}

function statusDot(status: string) {
  if (status === "available") return "bg-emerald-500";
  if (status === "busy") return "bg-rose-500";
  if (status === "acw") return "bg-amber-500";
  if (status === "away") return "bg-orange-500";
  return "bg-zinc-500";
}

function MetricCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{hint}</p> : null}
    </div>
  );
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

  const agents = wallboard.data?.agents ?? [];
  const activeCalls = wallboard.data?.activeCalls ?? [];
  const metrics = wallboard.data?.metrics;

  return (
    <CallCenterShell titleKey="callCenter.liveTitle" subtitleKey="callCenter.liveSubtitle">
      {wallboard.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : wallboard.isError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <div className="space-y-8">
          <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">{t("callCenter.liveMetricsHeading")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("callCenter.liveMetricsHint")}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-[var(--surface-2)] px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground">
                <Radio className="h-3 w-3 text-[var(--fec-star)]" aria-hidden />
                {t("callCenter.liveRefreshing")}
              </span>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <MetricCell
                label={t("callCenter.metricInCall")}
                value={
                  metrics?.agentsInCall ?? agents.filter((a) => a.status === "busy").length
                }
              />
              <MetricCell
                label={t("callCenter.agentsWall")}
                value={
                  <>
                    {metrics?.agentsAvailable ??
                      agents.filter((a) => a.status === "available").length}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {agents.length}
                    </span>
                  </>
                }
                hint={t("callCenter.metricAvailableHint")}
              />
              <MetricCell
                label={t("callCenter.activeCalls")}
                value={metrics?.activeCalls ?? activeCalls.length}
              />
              <MetricCell
                label={t("callCenter.metricAsa")}
                value={`${metrics?.avgSpeedAnswerSeconds ?? 0}s`}
              />
              <MetricCell
                label={t("callCenter.metricAbandon")}
                value={`${metrics?.abandonRate ?? 0}%`}
              />
              <MetricCell
                label={t("callCenter.metricMissed")}
                value={
                  <>
                    {metrics?.missedToday ?? 0}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {metrics?.voicemailsPending ?? 0}
                    </span>
                  </>
                }
                hint={t("callCenter.metricMissedHint")}
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold tracking-tight">{t("callCenter.agentsWall")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("callCenter.agentsWallHint")}</p>
              </div>
            </div>
            {agents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-10 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground/70" aria-hidden />
                <p className="mt-3 text-sm font-medium text-foreground">{t("callCenter.noAgents")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("callCenter.noAgentsHint")}</p>
                <Button asChild type="button" size="sm" className="mt-4 min-h-10">
                  <Link href="/call-center">{t("callCenter.goToDialer")}</Link>
                </Button>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {agents.map((agent) => (
                  <li
                    key={agent.userId}
                    className="rounded-[1.35rem] border border-border/50 bg-card p-4 shadow-elevated-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "h-3 w-3 rounded-full ring-4",
                            statusDot(agent.status),
                            agent.status === "available"
                              ? "ring-emerald-500/20"
                              : agent.status === "busy"
                                ? "ring-rose-500/20"
                                : "ring-border/40",
                          )}
                          aria-hidden
                        />
                        <div>
                          <p className="font-mono text-sm font-semibold tracking-tight">
                            {agent.userId.slice(0, 8)}…
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("callCenter.since", {
                              time: new Date(agent.statusSince).toLocaleTimeString(),
                            })}
                          </p>
                        </div>
                      </div>
                      <Badge variant={statusTone(agent.status)}>
                        {t(`callCenter.status.${agent.status}`)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold tracking-tight">{t("callCenter.activeCalls")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("callCenter.activeCallsHint")}</p>
              </div>
            </div>
            {activeCalls.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-10 text-center">
                <Phone className="mx-auto h-8 w-8 text-muted-foreground/70" aria-hidden />
                <p className="mt-3 text-sm font-medium text-foreground">{t("callCenter.noActiveCalls")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("callCenter.noActiveCallsHint")}</p>
              </div>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {activeCalls.map((call) => {
                  const queue = wallboard.data?.queues.find((q) => q.id === call.queueId);
                  const inCall = call.status === "answered" || call.status === "held";
                  return (
                    <li
                      key={call.id}
                      className="rounded-[1.35rem] border border-border/50 bg-card p-4 shadow-elevated-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-lg font-semibold tracking-tight">
                            {call.fromE164 || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            → {call.toE164 || "—"} · {queue?.name ?? "—"} · {call.direction}
                            {call.whisperActive ? ` · ${t("callCenter.whisper")}` : ""}
                            {call.bargeActive ? ` · ${t("callCenter.barge")}` : ""}
                          </p>
                        </div>
                        <Badge variant={statusTone(call.status)}>{call.status}</Badge>
                      </div>
                      {canSupervise && inCall ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="min-h-10"
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
                            className="min-h-10"
                            disabled={pendingId === `${call.id}:barge`}
                            onClick={() => void startMonitor(call.id, "barge", call.agentUserId)}
                          >
                            <Users className="me-1 h-3.5 w-3.5" aria-hidden />
                            {t("callCenter.barge")}
                          </Button>
                        </div>
                      ) : null}
                      {monitor?.callId === call.id ? (
                        <div className="mt-3">
                          <SupervisorMonitorRoom
                            token={monitor.media.token}
                            serverUrl={monitor.media.serverUrl}
                            mode={monitor.mode}
                            agentUserId={monitor.agentUserId}
                            onLeave={() => setMonitor(null)}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterLivePage;
