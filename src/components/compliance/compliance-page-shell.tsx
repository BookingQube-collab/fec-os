"use client";

import type { ReactNode } from "react";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { DownloadReportButton } from "@/components/reports/download-report-button";

interface CompliancePageShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  onExportPdf: () => void;
  onExportExcel: () => void;
}

export function CompliancePageShell({
  title,
  subtitle,
  filters,
  actions,
  children,
  onExportPdf,
  onExportExcel,
}: CompliancePageShellProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-border/60 bg-card px-4 py-3.5 shadow-elevated-sm md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title text-[1.35rem] font-medium">{title}</h1>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <DownloadReportButton onPdf={onExportPdf} onExcel={onExportExcel} />
          </div>
        </div>
        {filters && <div className="mt-3 flex flex-wrap gap-2">{filters}</div>}
      </div>
      {children}
    </div>
  );
}

function toneToTint(tone?: string): KpiTint {
  if (!tone) return "sky";
  if (tone.includes("emerald") || tone.includes("green")) return "green";
  if (tone.includes("rose") || tone.includes("red") || tone.includes("danger")) return "red";
  if (tone.includes("orange")) return "orange";
  if (tone.includes("amber") || tone.includes("warning")) return "amber";
  return "sky";
}

export function KpiStrip({ items }: { items: { label: string; value: string | number; tone?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-6">
      {items.map((k) => (
        <TintedKpiCard key={k.label} title={k.label} value={k.value} tint={toneToTint(k.tone)} compact />
      ))}
    </div>
  );
}
