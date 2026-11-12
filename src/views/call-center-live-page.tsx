"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { loadCallCenterWallboard } from "@/lib/call-center/call-center.functions";
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
  const canUse = canUserDo(
    roles.map((r) => r.role),
    "call_center.view",
  );

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
                  return (
                    <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {call.fromE164 || "—"} → {call.toE164 || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {queue?.name ?? "—"} · {call.direction}
                        </p>
                      </div>
                      <Badge variant={statusTone(call.status)}>{call.status}</Badge>
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
