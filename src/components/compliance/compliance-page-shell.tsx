"use client";

import type { ReactNode } from "react";

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

export function CompliancePageShell({ title, subtitle, filters, actions, children, onExportPdf, onExportExcel }: CompliancePageShellProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-white/80 bg-white/90 px-5 py-4 shadow-[0_8px_32px_rgba(99,102,241,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-[#111827]">{title}</h1>
            {subtitle && <p className="text-xs text-[#9CA3AF]">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <DownloadReportButton onPdf={onExportPdf} onExcel={onExportExcel} />
          </div>
        </div>
        {filters && <div className="mt-4 flex flex-wrap gap-2">{filters}</div>}
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

export function KpiStrip({ items }: { items: { label: string; value: string | number; tone?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((k) => (
        <Kpi key={k.label} {...k} />
      ))}
    </div>
  );
}
