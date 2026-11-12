"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { FecLoader } from "@/components/fec";
import { useAuth } from "@/hooks/use-auth";
import { loadCallCenterAnalytics } from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CallCenterAnalyticsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const canUse = canUserDo(
    roles.map((r) => r.role),
    "call_center.view",
  );

  const analytics = useQuery({
    queryKey: ["call-center", "analytics"],
    enabled: canUse,
    refetchInterval: 15_000,
    queryFn: async () => {
      const result = await loadCallCenterAnalytics({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.analyticsTitle" subtitleKey="callCenter.analyticsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const data = analytics.data;

  return (
    <CallCenterShell titleKey="callCenter.analyticsTitle" subtitleKey="callCenter.analyticsSubtitle">
      {analytics.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : analytics.isError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={t("callCenter.metricCallsToday")} value={String(data?.callsToday ?? 0)} />
          <MetricCard
            label={t("callCenter.metricAnswerRate")}
            value={`${data?.answerRate ?? 0}%`}
            hint={t("callCenter.metricAnswered", { count: data?.answeredToday ?? 0 })}
          />
          <MetricCard
            label={t("callCenter.metricAvgHandle")}
            value={`${data?.avgHandleSeconds ?? 0}s`}
          />
          <MetricCard
            label={t("callCenter.metricAgentsAvailable")}
            value={String(data?.agentsAvailable ?? 0)}
            hint={t("callCenter.metricAgentsBusy", { count: data?.agentsBusy ?? 0 })}
          />
          <MetricCard label={t("callCenter.metricActiveCalls")} value={String(data?.activeCalls ?? 0)} />
          <MetricCard label={t("callCenter.metricMissed")} value={String(data?.missedToday ?? 0)} />
          <MetricCard
            label={t("callCenter.metricAsa")}
            value={`${data?.avgSpeedAnswerSeconds ?? 0}s`}
          />
          <MetricCard
            label={t("callCenter.metricAbandon")}
            value={`${data?.abandonRate ?? 0}%`}
          />
          <MetricCard
            label={t("callCenter.metricInCall")}
            value={String(data?.agentsInCall ?? 0)}
          />
          <MetricCard
            label={t("callCenter.metricVoicemail")}
            value={String(data?.voicemailsPending ?? 0)}
          />
          <MetricCard label={t("callCenter.metricAway")} value={String(data?.agentsAway ?? 0)} />
          <MetricCard label={t("callCenter.metricOffline")} value={String(data?.agentsOffline ?? 0)} />
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterAnalyticsPage;
