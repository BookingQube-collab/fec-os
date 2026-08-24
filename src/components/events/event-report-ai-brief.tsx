"use client";

import { useMutation } from "@tanstack/react-query";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { aiDraftEventReportBrief } from "@/lib/events.functions";
import type { EventReportId } from "@/lib/events/reports";
import type { EventReportVisualModel, ReportRow } from "@/lib/events/report-visuals";

export function EventReportAiBrief({
  reportId,
  reportLabel,
  columns,
  rows,
  visuals,
  portfolio,
  onBriefChange,
}: {
  reportId: EventReportId;
  reportLabel: string;
  columns: string[];
  rows: ReportRow[];
  visuals: EventReportVisualModel;
  portfolio: Array<{ id: string; label: string; row_count: number }>;
  onBriefChange: (text: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<"current" | "executive">("current");
  const [locale, setLocale] = useState<"en" | "ar">(i18n.language?.startsWith("ar") ? "ar" : "en");
  const [bullets, setBullets] = useState<string[]>([]);
  const [includeInExport, setIncludeInExport] = useState(true);

  const kpis = useMemo(
    () =>
      visuals.kpis.slice(0, 8).map((k) => ({
        label: t(k.labelKey),
        value:
          k.format === "money"
            ? `QAR ${k.value}`
            : k.format === "pct"
              ? `${Math.round(k.value)}%`
              : String(k.value),
      })),
    [visuals.kpis, t],
  );

  const compactRows = useMemo(
    () =>
      rows.slice(0, 40).map((row) => {
        const out: Record<string, string | number | null> = {};
        for (const key of columns) out[key] = row[key] ?? null;
        return out;
      }),
    [rows, columns],
  );

  const publish = (next: string[], include: boolean) => {
    const markdown = next.map((b) => `- ${b}`).join("\n");
    onBriefChange(include ? markdown : "");
  };

  const generate = useMutation({
    mutationFn: () =>
      aiDraftEventReportBrief({
        mode,
        report_id: mode === "executive" ? "executive" : reportId,
        report_label: mode === "executive" ? t("events.reports.ai.modeExec") : reportLabel,
        locale,
        row_count: rows.length,
        kpis,
        columns,
        rows: compactRows,
        portfolio,
      }),
    onSuccess: (result) => {
      setBullets(result.bullets);
      publish(result.bullets, includeInExport);
      toast.success(result.ai_generated ? t("events.reports.ai.applied") : t("events.reports.ai.fallback"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const markdown = bullets.map((b) => `- ${b}`).join("\n");

  const copy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success(t("events.reports.ai.copied"));
    } catch {
      toast.error(t("events.reports.ai.copyFailed"));
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            {t("events.reports.ai.title")}
          </p>
          <p className="text-xs text-muted-foreground">{t("events.reports.ai.hint")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" size="sm" variant={mode === "current" ? "default" : "outline"} onClick={() => setMode("current")}>
            {t("events.reports.ai.modeCurrent")}
          </Button>
          <Button type="button" size="sm" variant={mode === "executive" ? "default" : "outline"} onClick={() => setMode("executive")}>
            {t("events.reports.ai.modeExec")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setLocale((v) => (v === "ar" ? "en" : "ar"))}>
            {locale === "ar" ? t("events.reports.ai.ar") : t("events.reports.ai.en")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
            {t("events.reports.ai.generate")}
          </Button>
        </div>
      </div>

      {bullets.length ? (
        <div className="space-y-3">
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/60 p-3 text-xs">{markdown}</pre>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              <Copy className="h-3.5 w-3.5" />
              {t("events.reports.ai.copy")}
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includeInExport}
                onChange={(e) => {
                  setIncludeInExport(e.target.checked);
                  publish(bullets, e.target.checked);
                }}
              />
              {t("events.reports.ai.includePdf")}
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
}
