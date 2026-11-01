"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Clock,
  FileText,
  Timer,
  TreePalm,
  Plane,
  ScrollText,
  Settings2,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatOtPolicySummary } from "@/lib/hr-advanced";
import { getOtPolicy, updateOtPolicy } from "@/lib/hr-announcements.functions";
import { HR_POLICY_SECTIONS, type HrPolicySection } from "@/lib/hr-policy";
import { listHrPolicySettings, upsertHrPolicySection } from "@/lib/hr-policy.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

const SECTION_ICONS: Record<HrPolicySection, LucideIcon> = {
  leave: TreePalm,
  ot: Clock,
  warning: ShieldAlert,
  probation: Timer,
  notice: ScrollText,
  document: FileText,
  air_ticket: Plane,
  payroll: Wallet,
  notification: Bell,
};

/** Friendly payroll late-deduct keys — edited in a dedicated panel, not raw JSON. */
const PAYROLL_LATE_DEDUCT_KEYS = new Set([
  "late_deduct_enabled",
  "late_deduct_units_per_day",
  "late_escalate_after_count",
  "late_escalate_extra_units",
]);

const LATE_DEDUCT_UNIT_OPTIONS = [
  { value: "0", labelKey: "hr.settings.lateDeduct.unitsNone" },
  { value: "0.5", labelKey: "hr.settings.lateDeduct.unitsHalf" },
  { value: "1", labelKey: "hr.settings.lateDeduct.unitsFull" },
] as const;

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function parseEditedValue(raw: string, previous: unknown): unknown {
  const trimmed = raw.trim();
  if (trimmed === "" && previous == null) return null;
  if (typeof previous === "boolean") return trimmed === "true" || trimmed === "1";
  if (typeof previous === "number") {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : previous;
  }
  if (Array.isArray(previous) || (previous && typeof previous === "object")) {
    try {
      return JSON.parse(trimmed || "null");
    } catch {
      return previous;
    }
  }
  if (trimmed === "true" || trimmed === "false") return trimmed === "true";
  if (trimmed !== "" && Number.isFinite(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

export default function HrSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const policy = useQuery({
    queryKey: queryKeys.people.hrPolicySettings(),
    queryFn: () => listHrPolicySettings(),
    staleTime: STALE.peopleCatalog,
  });
  const otLegacy = useQuery({
    queryKey: queryKeys.people.hrOtPolicy(),
    queryFn: () => getOtPolicy(),
    staleTime: STALE.peopleCatalog,
  });

  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const requested = useSearchParams().get("section");
  const [activeSection, setActiveSection] = useState<HrPolicySection>(
    requested && (HR_POLICY_SECTIONS as readonly string[]).includes(requested)
      ? (requested as HrPolicySection)
      : "leave",
  );

  useEffect(() => {
    if (!policy.data?.sections) return;
    const next: Record<string, Record<string, string>> = {};
    for (const block of policy.data.sections) {
      next[block.section] = {};
      for (const [key, value] of Object.entries(block.values)) {
        next[block.section][key] = stringifyValue(value);
      }
    }
    setDrafts(next);
  }, [policy.data]);

  const sectionValues = useMemo(() => {
    const block = policy.data?.sections.find((s) => s.section === activeSection);
    return block?.values ?? {};
  }, [policy.data, activeSection]);

  const saveSection = useMutation({
    mutationFn: upsertHrPolicySection,
    onSuccess: () => {
      toast.success(t("hr.settings.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrPolicySettings() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveOtLegacy = useMutation({
    mutationFn: updateOtPolicy,
    onSuccess: () => {
      toast.success(t("hr.settings.otLegacySaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrOtPolicy() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSaveSection = () => {
    const draft = drafts[activeSection] ?? {};
    const values: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(draft)) {
      values[key] = parseEditedValue(raw, sectionValues[key]);
    }
    saveSection.mutate({ section: activeSection, values });
  };

  return (
    <CapabilityGate
      capability="hr.policy.configure"
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
              <p className="text-sm text-muted-foreground">{t("hr.settings.hint")}</p>
              <Tabs
                value={activeSection}
                onValueChange={(v) => setActiveSection(v as HrPolicySection)}
              >
                <TabsList className="flex h-auto flex-wrap gap-1">
                  {HR_POLICY_SECTIONS.map((section) => {
                    const Icon = SECTION_ICONS[section];
                    return (
                    <TabsTrigger key={section} value={section}>
                      <Icon aria-hidden />
                      {t(`hr.settings.sections.${section}`)}
                    </TabsTrigger>
                    );
                  })}
                </TabsList>
                {HR_POLICY_SECTIONS.map((section) => (
                  <TabsContent key={section} value={section} className="space-y-3 pt-3">
                    {section === "payroll" ? (
                      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-4">
                        <div>
                          <h3 className="text-sm font-semibold">
                            {t("hr.settings.lateDeduct.title")}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t("hr.settings.lateDeduct.hint")}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5 sm:col-span-2">
                            <div className="flex items-center gap-2 pt-1">
                              <Switch
                                id="payroll-late_deduct_enabled"
                                checked={(drafts.payroll?.late_deduct_enabled ?? "true") === "true"}
                                onCheckedChange={(checked) =>
                                  setDrafts((d) => ({
                                    ...d,
                                    payroll: {
                                      ...d.payroll,
                                      late_deduct_enabled: String(checked),
                                    },
                                  }))
                                }
                              />
                              <Label htmlFor="payroll-late_deduct_enabled">
                                {t("hr.settings.lateDeduct.enabled")}
                              </Label>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="payroll-late_deduct_units_per_day">
                              {t("hr.settings.lateDeduct.perDay")}
                            </Label>
                            <Select
                              value={drafts.payroll?.late_deduct_units_per_day ?? "0.5"}
                              onValueChange={(value) =>
                                setDrafts((d) => ({
                                  ...d,
                                  payroll: {
                                    ...d.payroll,
                                    late_deduct_units_per_day: value,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger id="payroll-late_deduct_units_per_day">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LATE_DEDUCT_UNIT_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {t(opt.labelKey)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="payroll-late_escalate_after_count">
                              {t("hr.settings.lateDeduct.escalateAfter")}
                            </Label>
                            <Input
                              id="payroll-late_escalate_after_count"
                              type="number"
                              min={0}
                              step={1}
                              value={drafts.payroll?.late_escalate_after_count ?? "0"}
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  payroll: {
                                    ...d.payroll,
                                    late_escalate_after_count: e.target.value,
                                  },
                                }))
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              {t("hr.settings.lateDeduct.escalateAfterHelp")}
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="payroll-late_escalate_extra_units">
                              {t("hr.settings.lateDeduct.escalateExtra")}
                            </Label>
                            <Select
                              value={drafts.payroll?.late_escalate_extra_units ?? "1"}
                              onValueChange={(value) =>
                                setDrafts((d) => ({
                                  ...d,
                                  payroll: {
                                    ...d.payroll,
                                    late_escalate_extra_units: value,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger id="payroll-late_escalate_extra_units">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LATE_DEDUCT_UNIT_OPTIONS.filter((o) => o.value !== "0").map(
                                  (opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {t(opt.labelKey)}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.keys(drafts[section] ?? {})
                        .filter(
                          (key) =>
                            !(section === "payroll" && PAYROLL_LATE_DEDUCT_KEYS.has(key)),
                        )
                        .map((key) => {
                        const raw = drafts[section]?.[key] ?? "";
                        const prev = sectionValues[key];
                        const isBool = typeof prev === "boolean";
                        return (
                          <div key={key} className="space-y-1.5">
                            <Label htmlFor={`${section}-${key}`}>{key}</Label>
                            {isBool ? (
                              <div className="flex items-center gap-2 pt-1">
                                <Switch
                                  id={`${section}-${key}`}
                                  checked={raw === "true"}
                                  onCheckedChange={(checked) =>
                                    setDrafts((d) => ({
                                      ...d,
                                      [section]: { ...d[section], [key]: String(checked) },
                                    }))
                                  }
                                />
                                <span className="text-sm text-muted-foreground">
                                  {raw === "true" ? t("hr.settings.on") : t("hr.settings.off")}
                                </span>
                              </div>
                            ) : Array.isArray(prev) || (prev && typeof prev === "object") ? (
                              <Textarea
                                id={`${section}-${key}`}
                                rows={3}
                                value={raw}
                                onChange={(e) =>
                                  setDrafts((d) => ({
                                    ...d,
                                    [section]: { ...d[section], [key]: e.target.value },
                                  }))
                                }
                              />
                            ) : (
                              <Input
                                id={`${section}-${key}`}
                                value={raw}
                                onChange={(e) =>
                                  setDrafts((d) => ({
                                    ...d,
                                    [section]: { ...d[section], [key]: e.target.value },
                                  }))
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Button disabled={saveSection.isPending} onClick={onSaveSection}>
                      {t("hr.settings.saveSection")}
                    </Button>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </HrPanel>

          <HrPanel delay={0.05} className="mt-4">
            <div className="space-y-3 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">{t("hr.settings.otLegacyTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("hr.settings.otLegacyHint")}</p>
              {otLegacy.data ? (
                <>
                  <div className="hr-notice">
                    <p className="text-sm font-medium">
                      {formatOtPolicySummary({
                        overtimeAfterMinutes: otLegacy.data.overtimeAfterMinutes,
                        maxDailyOtMinutes: otLegacy.data.maxDailyOtMinutes,
                        maxWeeklyOtMinutes: otLegacy.data.maxWeeklyOtMinutes,
                        requiresPreapproval: otLegacy.data.requiresPreapproval,
                      })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={saveOtLegacy.isPending}
                    onClick={() =>
                      saveOtLegacy.mutate({
                        overtimeAfterMinutes: Number(
                          drafts.ot?.overtime_after_minutes ?? otLegacy.data.overtimeAfterMinutes,
                        ) || 480,
                        maxDailyOtMinutes: drafts.ot?.max_daily_ot_minutes
                          ? Number(drafts.ot.max_daily_ot_minutes)
                          : otLegacy.data.maxDailyOtMinutes,
                        maxWeeklyOtMinutes: drafts.ot?.max_weekly_ot_minutes
                          ? Number(drafts.ot.max_weekly_ot_minutes)
                          : otLegacy.data.maxWeeklyOtMinutes,
                        requiresPreapproval: (drafts.ot?.requires_preapproval ?? "false") === "true",
                        summaryNotes: null,
                      })
                    }
                  >
                    {t("hr.settings.syncOtLegacy")}
                  </Button>
                </>
              ) : null}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
