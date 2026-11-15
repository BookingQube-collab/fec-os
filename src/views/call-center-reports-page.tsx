"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterReportSchedules,
  removeCallCenterKeywordAlert,
  removeCallCenterReportSchedule,
  runCallCenterReportNow,
  saveCallCenterKeywordAlert,
  saveCallCenterReportSchedule,
  searchCallCenterKeywords,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterCall } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

const FREQUENCIES = ["daily", "weekly", "monthly", "hourly", "once"] as const;

function CallCenterReportsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "admin.view") && maxLevel >= 95;

  const [scheduleName, setScheduleName] = useState("");
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>("daily");
  const [emails, setEmails] = useState("");
  const [includeWhatsapp, setIncludeWhatsapp] = useState(true);
  const [includeAgents, setIncludeAgents] = useState(true);
  const [scheduleActive, setScheduleActive] = useState(true);

  const [alertKeyword, setAlertKeyword] = useState("");
  const [alertEmails, setAlertEmails] = useState("");
  const [alertActive, setAlertActive] = useState(true);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searchResults, setSearchResults] = useState<CallCenterCall[]>([]);

  const bundle = useQuery({
    queryKey: ["call-center", "reports"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterReportSchedules({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.reportsTitle" subtitleKey="callCenter.reportsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.reportsTitle" subtitleKey="callCenter.reportsSubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.reportNewSchedule")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("callCenterAdmin.label")}</Label>
                <Input className="mt-1" value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} />
              </div>
              <div>
                <Label>{t("callCenter.reportFrequency")}</Label>
                <select
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as (typeof FREQUENCIES)[number])}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {t(`callCenter.reportFreq.${f}`, f)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t("callCenter.reportEmails")}</Label>
                <Input
                  className="mt-1"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="ops@example.com, supervisor@example.com"
                />
              </div>
              <div className="flex items-center justify-between gap-2 sm:col-span-2">
                <Label>{t("callCenter.reportIncludeWhatsapp")}</Label>
                <Switch checked={includeWhatsapp} onCheckedChange={setIncludeWhatsapp} />
              </div>
              <div className="flex items-center justify-between gap-2 sm:col-span-2">
                <Label>{t("callCenter.reportIncludeAgents")}</Label>
                <Switch checked={includeAgents} onCheckedChange={setIncludeAgents} />
              </div>
              <div className="flex items-center justify-between gap-2 sm:col-span-2">
                <Label>{t("callCenter.reportScheduleActive")}</Label>
                <Switch checked={scheduleActive} onCheckedChange={setScheduleActive} />
              </div>
            </div>
            <Button
              type="button"
              className="mt-3"
              disabled={!scheduleName.trim()}
              onClick={() => {
                void (async () => {
                  const result = await saveCallCenterReportSchedule({
                    name: scheduleName.trim(),
                    frequency,
                    emails,
                    includeWhatsapp,
                    includeAgents,
                    isActive: scheduleActive,
                  });
                  if (!result.ok) toast.error(result.error);
                  else {
                    toast.success(t("callCenter.reportScheduleSaved"));
                    setScheduleName("");
                    setEmails("");
                    await queryClient.invalidateQueries({ queryKey: ["call-center", "reports"] });
                  }
                })();
              }}
            >
              {t("callCenter.reportSaveSchedule")}
            </Button>
          </section>

          <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/60">
            {(bundle.data?.schedules ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.frequency} · {s.emails.join(", ")}
                    {s.lastSentAt ? ` · ${t("callCenter.reportLastSent")} ${new Date(s.lastSentAt).toLocaleString()}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void (async () => {
                      const result = await runCallCenterReportNow({ scheduleId: s.id });
                      if (!result.ok) toast.error(result.error);
                      else {
                        const sent = result.data.results.filter((r) => r.sent).length;
                        toast.success(t("callCenter.reportRunDone", { count: sent }));
                        await queryClient.invalidateQueries({ queryKey: ["call-center", "reports"] });
                      }
                    })();
                  }}
                >
                  <Mail className="me-1 h-4 w-4" />
                  {t("callCenter.reportRunNow")}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    void (async () => {
                      const result = await removeCallCenterReportSchedule({ id: s.id });
                      if (!result.ok) toast.error(result.error);
                      else {
                        toast.success(t("callCenter.reportScheduleRemoved"));
                        await queryClient.invalidateQueries({ queryKey: ["call-center", "reports"] });
                      }
                    })();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>

          <section className="rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.keywordAlerts")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <Label>{t("callCenter.keywordLabel")}</Label>
                <Input
                  className="mt-1"
                  value={alertKeyword}
                  onChange={(e) => setAlertKeyword(e.target.value)}
                />
              </div>
              <div>
                <Label>{t("callCenter.reportEmails")}</Label>
                <Input
                  className="mt-1"
                  value={alertEmails}
                  onChange={(e) => setAlertEmails(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <Switch checked={alertActive} onCheckedChange={setAlertActive} />
                <Button
                  type="button"
                  disabled={!alertKeyword.trim()}
                  onClick={() => {
                    void (async () => {
                      const result = await saveCallCenterKeywordAlert({
                        keyword: alertKeyword.trim(),
                        notifyEmails: alertEmails,
                        isActive: alertActive,
                      });
                      if (!result.ok) toast.error(result.error);
                      else {
                        toast.success(t("callCenter.keywordAlertSaved"));
                        setAlertKeyword("");
                        await queryClient.invalidateQueries({ queryKey: ["call-center", "reports"] });
                      }
                    })();
                  }}
                >
                  {t("callCenter.keywordAlertSave")}
                </Button>
              </div>
            </div>
            <ul className="mt-4 divide-y divide-border/50 rounded-xl border border-border/40">
              {(bundle.data?.keywordAlerts ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium">{a.keyword}</span>
                  <span className="flex-1 truncate text-muted-foreground">{a.notifyEmails.join(", ")}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      void (async () => {
                        const result = await removeCallCenterKeywordAlert({ id: a.id });
                        if (!result.ok) toast.error(result.error);
                        else {
                          await queryClient.invalidateQueries({ queryKey: ["call-center", "reports"] });
                        }
                      })();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.keywordSearch")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                className="max-w-sm"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder={t("callCenter.keywordSearchPlaceholder")}
              />
              <Button
                type="button"
                disabled={searchPending || !searchKeyword.trim()}
                onClick={() => {
                  void (async () => {
                    setSearchPending(true);
                    try {
                      const result = await searchCallCenterKeywords({
                        keyword: searchKeyword.trim(),
                      });
                      if (!result.ok) throw new Error(result.error);
                      setSearchResults(result.data.calls);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
                    } finally {
                      setSearchPending(false);
                    }
                  })();
                }}
              >
                {t("callCenter.keywordSearchRun")}
              </Button>
            </div>
            <ul className="mt-4 divide-y divide-border/50 rounded-xl border border-border/40">
              {searchResults.map((call) => (
                <li key={call.id} className="px-3 py-2 text-sm">
                  <p className="font-mono text-xs text-muted-foreground">{call.id}</p>
                  <p>
                    {call.fromE164} → {call.toE164} · {call.status} · {call.startedAt}
                  </p>
                  {call.transcriptText ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{call.transcriptText}</p>
                  ) : null}
                </li>
              ))}
              {searchResults.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("callCenter.keywordSearchEmpty")}
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterReportsPage;