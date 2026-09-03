"use client";

import { BookOpen, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  "start",
  "roles",
  "workflow",
  "dashboard",
  "create",
  "approval",
  "after",
  "vendors",
  "analytics",
  "checklists",
  "troubleshoot",
  "security",
] as const;

export default function ProcurementGuidePage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        kicker={t("procurement.kicker")}
        title={t("procurement.guide.title")}
        subtitle={t("procurement.guide.subtitle")}
        actions={
          <Button asChild>
            <Link href="/procurement/requisitions/new">{t("procurement.newRequest")}</Link>
          </Button>
        }
      />

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map((id) => (
          <a
            key={id}
            href={`#pr-guide-${id}`}
            className="rounded-full border border-border/50 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            {t(`procurement.guide.nav.${id}`)}
          </a>
        ))}
      </nav>

      {SECTIONS.map((id) => (
        <section
          key={id}
          id={`pr-guide-${id}`}
          className="rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            {t(`procurement.guide.nav.${id}`)}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{t(`procurement.guide.${id}.title`)}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`procurement.guide.${id}.body`)}</p>
          <ol className="mt-4 space-y-2">
            {(Array.isArray(t(`procurement.guide.${id}.steps`, { returnObjects: true }))
              ? (t(`procurement.guide.${id}.steps`, { returnObjects: true }) as string[])
              : []
            ).map((step) => (
              <li key={step} className="flex gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {id === "dashboard" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/procurement">{t("nav.procurementDashboard")}</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/procurement/requisitions">{t("procurement.allPrs")}</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/procurement/approvals">{t("procurement.myQueue")}</Link>
              </Button>
            </div>
          ) : null}
          {id === "vendors" ? (
            <div className="mt-4">
              <Button size="sm" variant="outline" asChild>
                <Link href="/vendors">{t("nav.vendors")}</Link>
              </Button>
            </div>
          ) : null}
          {id === "analytics" ? (
            <div className="mt-4">
              <Button size="sm" variant="outline" asChild>
                <Link href="/procurement/analytics">{t("nav.procurementAnalytics")}</Link>
              </Button>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
