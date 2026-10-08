"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { FecSkeleton } from "@/components/fec";
import { formatEnglishTime } from "@/lib/hr-assist/time";
import type { AssistItem, AssistResult } from "@/lib/hr-assist/types";
import { cn } from "@/lib/utils";

const HrReviewEmbedContext = createContext(false);

export function HrReviewEmbed({ children }: { children: ReactNode }) {
  return <HrReviewEmbedContext.Provider value={true}>{children}</HrReviewEmbedContext.Provider>;
}

function useAssistValues(values: Record<string, string | number>) {
  const { t, i18n } = useTranslation();
  const arabic = i18n.language?.startsWith("ar") ?? false;
  const out: Record<string, string | number> = { ...values };
  if (!String(out.staffName ?? "").trim()) out.staffName = t("hrAssist.unnamed");
  if (out.weekdayIndex != null) out.weekday = t(`hrAssist.weekdays.${out.weekdayIndex}`);
  const start = typeof out.start === "string" ? out.start : "";
  const end = typeof out.end === "string" ? out.end : "";
  if (start) out.startLabel = arabic ? start : formatEnglishTime(start);
  if (end) out.endLabel = arabic ? end : formatEnglishTime(end);
  if (start && end) out.shiftLabel = `${out.startLabel}–${out.endLabel}`;
  else if (!out.shiftLabel) out.shiftLabel = t("hrAssist.shiftUnspecified");
  if (typeof out.actualInHm === "string" && out.actualInHm) {
    out.actualInLabel = arabic ? out.actualInHm : formatEnglishTime(out.actualInHm);
  } else if (!out.actualInLabel) out.actualInLabel = "—";
  if (typeof out.actualOutHm === "string" && out.actualOutHm) {
    out.actualOutLabel = arabic ? out.actualOutHm : formatEnglishTime(out.actualOutHm);
  } else if (!out.actualOutLabel) out.actualOutLabel = "—";
  if (!out.site) out.site = t("hrAssist.unknownSite");
  if (typeof out.leaveType === "string") {
    out.leaveTypeLabel = t(`hr.leave.types.${out.leaveType}`, { defaultValue: out.leaveType });
  }
  if (typeof out.leaveStatus === "string") {
    out.leaveStatusLabel = t(`hr.leave.status.${out.leaveStatus}`, { defaultValue: out.leaveStatus });
  }
  if (!out.windowPrefix) out.windowPrefix = "";
  if (out.detailCode) {
    const attendanceKey = `hrAssist.attendance.impossible_timestamp.detail.${out.detailCode}`;
    const payrollKey = `hrAssist.payroll.reconcile.detail.${out.detailCode}`;
    const attendance = t(attendanceKey, out);
    out.detail = attendance === attendanceKey ? t(payrollKey, out) : attendance;
  }
  return out;
}

function ReviewItem({ item, onDismiss }: { item: AssistItem; onDismiss?: (id: string) => void }) {
  const { t } = useTranslation();
  const embedded = useContext(HrReviewEmbedContext);
  const values = useAssistValues(item.values);
  return (
    <article className={cn("text-start", embedded ? "rounded-xl bg-background px-3 py-2" : "rounded-2xl border border-border/70 px-3 py-3")}>
      <h3 className="text-sm font-medium">{t(item.titleKey, values)}</h3>
      <p className="mt-2 text-sm">
        <span className="font-medium text-foreground">{t("hrAssist.why")}. </span>
        {t(item.whyKey, values)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("hrAssist.evidence")}. </span>
        {t(item.evidenceKey, values)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("hrAssist.actionLabel")}. </span>
        {t(item.actionKey, values)}
      </p>
      {item.href ? (
        <Link href={item.href} className="mt-2 inline-block text-xs font-medium underline">
          {t(item.linkKey ?? "hrAssist.corrections")}
        </Link>
      ) : null}
      {onDismiss ? (
        <button type="button" className="mt-2 block text-xs font-medium underline" onClick={() => onDismiss(item.id)}>
          {t("hrAssist.dismiss")}
        </button>
      ) : null}
    </article>
  );
}

export function HrReviewPanel({
  title,
  hint,
  queryState,
  result,
  emptyLabel,
  footerHref,
  footerLabel,
  onDismiss,
}: {
  title: string;
  hint: string;
  queryState: "loading" | "error" | "ready";
  result?: AssistResult | null;
  emptyLabel: string;
  footerHref?: string;
  footerLabel?: string;
  onDismiss?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const embedded = useContext(HrReviewEmbedContext);
  return (
    <section className={cn("text-start", embedded ? "space-y-2" : "space-y-3 rounded-2xl border border-border/70 bg-card p-5")}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      {queryState === "loading" ? (
        <div className="space-y-2" aria-busy="true">
          <FecSkeleton className="h-16 rounded-2xl" />
          <p className="text-xs text-muted-foreground">{t("hrAssist.loading")}</p>
        </div>
      ) : null}
      {queryState === "error" ? (
        <p className="rounded-2xl border border-dashed border-border/80 px-3 py-3 text-sm text-muted-foreground">{t("hrAssist.error")}</p>
      ) : null}
      {queryState === "ready" && result?.status === "insufficient" ? (
        <p className="rounded-2xl border border-dashed border-border/80 px-3 py-3 text-sm text-muted-foreground">{t("hrAssist.insufficient")}</p>
      ) : null}
      {queryState === "ready" && result?.status === "empty" ? (
        <p className="rounded-2xl border border-dashed border-border/80 px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : null}
      {queryState === "ready" && result?.status === "ok" ? (
        <div className="space-y-2">
          {result.items.map((item) => (
            <ReviewItem key={item.id} item={item} onDismiss={onDismiss} />
          ))}
        </div>
      ) : null}
      {footerHref && footerLabel ? (
        <Link href={footerHref} className="inline-block text-xs font-medium underline">
          {footerLabel}
        </Link>
      ) : null}
    </section>
  );
}
