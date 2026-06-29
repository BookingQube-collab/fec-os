"use client";

import { useMutation } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { aiGenerateLocationRoster, generateDailyOpsRoster } from "@/lib/daily-ops.functions";
import { rosterWeekStartsOn, weekRangeContaining } from "@/lib/daily-ops/roster-calendar-utils";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

type GenerateEntry = {
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  role_label: string;
};

type StaffOption = { id: string; label: string };

type SiteSummary = { code: string; name: string };

type RosterGeneratePanelProps = {
  locationId: string | null;
  selectedSite: SiteSummary | undefined;
  staffOptions: StaffOption[];
  staffLoading: boolean;
  onSaved: (generatedCount: number) => void;
};

const DEFAULT_SHIFT = {
  start_time: "09:00",
  end_time: "17:00",
} as const;

function formatWeekLabel(from: string, to: string, locale: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const start = new Date(`${from}T12:00:00`).toLocaleDateString(locale, opts);
  const end = new Date(`${to}T12:00:00`).toLocaleDateString(locale, opts);
  return `${start} – ${end}`;
}

export function RosterGeneratePanel({
  locationId,
  selectedSite,
  staffOptions,
  staffLoading,
  onSaved,
}: RosterGeneratePanelProps) {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const weekStartsOn = rosterWeekStartsOn(language);
  const today = new Date().toISOString().slice(0, 10);
  const defaultWeek = useMemo(() => weekRangeContaining(today, weekStartsOn), [today, weekStartsOn]);
  const locale = language === "ar" ? "ar-SA" : "en-US";

  const [genWeekStart, setGenWeekStart] = useState(defaultWeek.from);
  const [genWeekEnd, setGenWeekEnd] = useState(defaultWeek.to);
  const [genEntries, setGenEntries] = useState<GenerateEntry[]>([]);
  const [aiGeneratedPreview, setAiGeneratedPreview] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    setGenWeekStart(defaultWeek.from);
    setGenWeekEnd(defaultWeek.to);
  }, [defaultWeek.from, defaultWeek.to]);

  const hasPreview = genEntries.some((e) => e.staff_id);
  const showEmptyState = !hasPreview && !manualOpen;

  const aiGenerateMutation = useMutation({
    mutationFn: () => {
      if (!locationId) throw new Error(t("dailyOps.roster.selectLocation"));
      if (!genWeekStart || !genWeekEnd) throw new Error(t("dailyOps.roster.aiWeekRequired"));
      if (genWeekStart > genWeekEnd) throw new Error(t("dailyOps.roster.aiWeekInvalid"));
      return aiGenerateLocationRoster({
        location_id: locationId,
        week_start: genWeekStart,
        week_end: genWeekEnd,
      });
    },
    onSuccess: (res) => {
      if (!res.entries.length) {
        toast.error(t("dailyOps.roster.aiEmpty"));
        return;
      }
      setGenEntries(
        res.entries.map((e) => ({
          staff_id: e.staff_id,
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
          role_label: e.role_label,
        })),
      );
      setAiGeneratedPreview(true);
      setManualOpen(false);
      toast.success(
        res.ai_generated
          ? t("dailyOps.roster.aiSuccess", { count: res.entries.length, location: res.location_code })
          : t("dailyOps.roster.aiFallbackSuccess", {
              count: res.entries.length,
              location: res.location_code,
            }),
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!locationId) throw new Error(t("dailyOps.roster.selectLocation"));
      const entries = genEntries.filter((e) => e.staff_id);
      if (!entries.length) throw new Error(t("dailyOps.roster.generateEmpty"));
      return generateDailyOpsRoster({
        location_id: locationId,
        entries: entries.map((e) => ({
          staff_id: e.staff_id,
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
          role_label: e.role_label || null,
        })),
      });
    },
    onSuccess: (res) => {
      setAiGeneratedPreview(false);
      setGenEntries([]);
      setManualOpen(false);
      onSaved(res.generated);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function updateEntry(idx: number, patch: Partial<GenerateEntry>) {
    setGenEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function removeEntry(idx: number) {
    setGenEntries((prev) => prev.filter((_, i) => i !== idx));
    if (genEntries.length <= 1) setAiGeneratedPreview(false);
  }

  function addManualEntry() {
    setManualOpen(true);
    setGenEntries((prev) => [
      ...prev,
      {
        staff_id: "",
        date: genWeekStart || today,
        start_time: DEFAULT_SHIFT.start_time,
        end_time: DEFAULT_SHIFT.end_time,
        role_label: "",
      },
    ]);
  }

  function applyCurrentWeek() {
    const range = weekRangeContaining(today, weekStartsOn);
    setGenWeekStart(range.from);
    setGenWeekEnd(range.to);
  }

  const steps = [
    { num: 1, label: t("dailyOps.roster.stepVenue"), done: !!locationId },
    { num: 2, label: t("dailyOps.roster.stepWeek"), done: !!genWeekStart && !!genWeekEnd },
    { num: 3, label: t("dailyOps.roster.stepGenerate"), done: hasPreview },
  ];

  return (
    <div className="space-y-4">
      {/* Hero — 3-step guide */}
      <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-[#1E1B4B] sm:text-lg">
          {t("dailyOps.roster.heroTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("dailyOps.roster.heroSubtitle")}</p>

        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <li
              key={step.num}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                step.done
                  ? "border-violet-200 bg-violet-50/60"
                  : "border-[#E2E8F0] bg-white/80",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  step.done
                    ? "bg-violet-600 text-white"
                    : "bg-[#E2E8F0] text-[#64748B]",
                )}
              >
                {step.num}
              </span>
              <span className="text-sm font-medium leading-snug text-[#334155]">{step.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Controls — venue + week only */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {t("dailyOps.roster.locationFilter")}
            </Label>
            <p className="text-sm font-medium text-[#1E293B]">
              {selectedSite
                ? `${selectedSite.code} — ${selectedSite.name}`
                : t("dailyOps.roster.generateEmptyVenue")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("dailyOps.roster.stepWeek")}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={genWeekStart}
                onChange={(e) => setGenWeekStart(e.target.value)}
                disabled={!locationId || aiGenerateMutation.isPending}
                className="min-w-0 flex-1"
                aria-label={t("dailyOps.roster.from")}
              />
              <span className="text-xs text-muted-foreground">{t("dailyOps.roster.to")}</span>
              <Input
                type="date"
                value={genWeekEnd}
                onChange={(e) => setGenWeekEnd(e.target.value)}
                disabled={!locationId || aiGenerateMutation.isPending}
                className="min-w-0 flex-1"
                aria-label={t("dailyOps.roster.to")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!locationId}
                onClick={applyCurrentWeek}
              >
                {t("dailyOps.roster.aiThisWeek")}
              </Button>
              {genWeekStart && genWeekEnd && (
                <span className="text-xs text-muted-foreground">
                  {formatWeekLabel(genWeekStart, genWeekEnd, locale)}
                </span>
              )}
            </div>
          </div>
        </div>

        {!locationId && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t("dailyOps.roster.generateEmptyState")}
          </p>
        )}
        {locationId && !staffOptions.length && !staffLoading && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t("dailyOps.roster.aiNoStaff")}
          </p>
        )}

        <Button
          type="button"
          size="lg"
          className="mt-4 w-full bg-violet-600 text-white hover:bg-violet-700 sm:w-auto sm:min-w-[240px]"
          onClick={() => aiGenerateMutation.mutate()}
          disabled={!locationId || aiGenerateMutation.isPending || !staffOptions.length}
        >
          {aiGenerateMutation.isPending ? (
            <Loader2 className="me-2 h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="me-2 h-5 w-5" />
          )}
          {aiGenerateMutation.isPending
            ? t("dailyOps.roster.aiGenerating")
            : t("dailyOps.roster.autoGenerate")}
        </Button>
      </div>

      {/* Preview or empty state */}
      {showEmptyState && locationId && staffOptions.length > 0 && (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-violet-400" />
          <p className="mt-3 text-sm font-medium text-[#334155]">
            {t("dailyOps.roster.generateReady", { code: selectedSite?.code ?? "—" })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("dailyOps.roster.generateReadyHint")}</p>
        </div>
      )}

      {hasPreview && (
        <div className="space-y-3 rounded-xl border border-violet-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#1E1B4B]">
                {t("dailyOps.roster.previewTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {aiGeneratedPreview
                  ? t("dailyOps.roster.aiPreviewHint")
                  : t("dailyOps.roster.previewEditHint")}
              </p>
            </div>
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">
              {t("dailyOps.roster.previewCount", { count: genEntries.filter((e) => e.staff_id).length })}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dailyOps.roster.name")}</TableHead>
                  <TableHead>{t("dailyOps.roster.date")}</TableHead>
                  <TableHead>{t("dailyOps.roster.startTime")}</TableHead>
                  <TableHead>{t("dailyOps.roster.endTime")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("dailyOps.roster.role")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {genEntries.map((entry, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="min-w-[140px]">
                      <Select
                        value={entry.staff_id}
                        onValueChange={(v) => updateEntry(idx, { staff_id: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={t("dailyOps.roster.pickStaff")} />
                        </SelectTrigger>
                        <SelectContent>
                          {staffOptions.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={entry.date}
                        onChange={(e) => updateEntry(idx, { date: e.target.value })}
                        className="h-8 w-[130px] text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={entry.start_time}
                        onChange={(e) => updateEntry(idx, { start_time: e.target.value })}
                        className="h-8 w-[100px] text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={entry.end_time}
                        onChange={(e) => updateEntry(idx, { end_time: e.target.value })}
                        className="h-8 w-[100px] text-xs"
                      />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Input
                        value={entry.role_label}
                        placeholder={t("dailyOps.roster.roleOptional")}
                        onChange={(e) => updateEntry(idx, { role_label: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => removeEntry(idx)}
                        aria-label={t("dailyOps.roster.removeRow")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addManualEntry}
            >
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {t("dailyOps.roster.addRow")}
            </Button>
            <Button
              size="lg"
              className="bg-violet-600 hover:bg-violet-700 sm:min-w-[200px]"
              onClick={() => generateMutation.mutate()}
              disabled={!locationId || generateMutation.isPending || !hasPreview}
            >
              {generateMutation.isPending ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("dailyOps.roster.confirmSave")}
            </Button>
          </div>
        </div>
      )}

      {/* Manual entry — collapsed by default */}
      {!hasPreview && (
        <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-left hover:bg-[#F8FAFC]">
            <div>
              <p className="text-sm font-medium text-[#334155]">{t("dailyOps.roster.manualTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("dailyOps.roster.manualHint")}</p>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 text-[#9CA3AF] transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
              {genEntries.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("dailyOps.roster.manualEmpty")}</p>
              )}
              {genEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6"
                >
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">{t("dailyOps.roster.name")}</Label>
                    <Select
                      value={entry.staff_id}
                      onValueChange={(v) => updateEntry(idx, { staff_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("dailyOps.roster.pickStaff")} />
                      </SelectTrigger>
                      <SelectContent>
                        {staffOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("dailyOps.roster.date")}</Label>
                    <Input
                      type="date"
                      value={entry.date}
                      onChange={(e) => updateEntry(idx, { date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("dailyOps.roster.startTime")}</Label>
                    <Input
                      type="time"
                      value={entry.start_time}
                      onChange={(e) => updateEntry(idx, { start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("dailyOps.roster.endTime")}</Label>
                    <Input
                      type="time"
                      value={entry.end_time}
                      onChange={(e) => updateEntry(idx, { end_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("dailyOps.roster.role")}</Label>
                    <Input
                      value={entry.role_label}
                      placeholder={t("dailyOps.roster.roleOptional")}
                      onChange={(e) => updateEntry(idx, { role_label: e.target.value })}
                    />
                  </div>
                  {genEntries.length > 0 && (
                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeEntry(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={addManualEntry}>
                  <Plus className="me-1.5 h-3.5 w-3.5" />
                  {t("dailyOps.roster.addRow")}
                </Button>
                {genEntries.some((e) => e.staff_id) && (
                  <Button
                    size="sm"
                    onClick={() => generateMutation.mutate()}
                    disabled={!locationId || generateMutation.isPending}
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {t("dailyOps.roster.confirmSave")}
                  </Button>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
