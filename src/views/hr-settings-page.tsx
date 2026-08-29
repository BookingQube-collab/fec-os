"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatOtPolicySummary } from "@/lib/hr-advanced";
import { getOtPolicy, updateOtPolicy } from "@/lib/hr-announcements.functions";
import { DEFAULT_SHIFT } from "@/lib/attendance-hr/constants";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const policy = useQuery({
    queryKey: queryKeys.people.hrOtPolicy(),
    queryFn: () => getOtPolicy(),
    staleTime: STALE.people,
  });

  const [afterMin, setAfterMin] = useState(String(DEFAULT_SHIFT.overtimeAfterMinutes));
  const [maxDay, setMaxDay] = useState("");
  const [maxWeek, setMaxWeek] = useState("");
  const [preapprove, setPreapprove] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!policy.data) return;
    setAfterMin(String(policy.data.overtimeAfterMinutes));
    setMaxDay(policy.data.maxDailyOtMinutes != null ? String(policy.data.maxDailyOtMinutes) : "");
    setMaxWeek(policy.data.maxWeeklyOtMinutes != null ? String(policy.data.maxWeeklyOtMinutes) : "");
    setPreapprove(policy.data.requiresPreapproval);
    setNotes(policy.data.summaryNotes ?? "");
  }, [policy.data]);

  const save = useMutation({
    mutationFn: updateOtPolicy,
    onSuccess: () => {
      toast.success(t("hr.settings.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrOtPolicy() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = formatOtPolicySummary({
    overtimeAfterMinutes: Number(afterMin) || 480,
    maxDailyOtMinutes: maxDay ? Number(maxDay) : null,
    maxWeeklyOtMinutes: maxWeek ? Number(maxWeek) : null,
    requiresPreapproval: preapprove,
  });

  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.settings.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Settings2}
          kicker={t("hr.settings.kicker")}
          title={t("hr.settings.title")}
          subtitle={t("hr.settings.subtitle")}
        >
          <HrPanel delay={0}>
            <div className="space-y-4 p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">
                {t("hr.settings.attendanceHint", { minutes: DEFAULT_SHIFT.overtimeAfterMinutes })}
              </p>
              <div className="hr-notice">
                <p className="text-sm font-medium">{preview}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label>{t("hr.settings.otAfter")}</Label>
                  <Input type="number" min={60} max={1440} value={afterMin} onChange={(e) => setAfterMin(e.target.value)} />
                </div>
                <div>
                  <Label>{t("hr.settings.maxDaily")}</Label>
                  <Input type="number" min={0} value={maxDay} onChange={(e) => setMaxDay(e.target.value)} placeholder="—" />
                </div>
                <div>
                  <Label>{t("hr.settings.maxWeekly")}</Label>
                  <Input type="number" min={0} value={maxWeek} onChange={(e) => setMaxWeek(e.target.value)} placeholder="—" />
                </div>
                <div className="flex items-end gap-2">
                  <input
                    id="ot-preapprove"
                    type="checkbox"
                    checked={preapprove}
                    onChange={(e) => setPreapprove(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="ot-preapprove">{t("hr.settings.preapprove")}</Label>
                </div>
              </div>
              <div>
                <Label>{t("hr.settings.notes")}</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    overtimeAfterMinutes: Number(afterMin) || 480,
                    maxDailyOtMinutes: maxDay ? Number(maxDay) : null,
                    maxWeeklyOtMinutes: maxWeek ? Number(maxWeek) : null,
                    requiresPreapproval: preapprove,
                    summaryNotes: notes || null,
                  })
                }
              >
                {t("hr.settings.save")}
              </Button>
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
