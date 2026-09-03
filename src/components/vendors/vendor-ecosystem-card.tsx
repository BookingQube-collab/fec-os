"use client";

import {
  Building2,
  CreditCard,
  FileStack,
  Globe2,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Star,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VendorListRow } from "@/lib/queries/vendors-api.core";
import { cn } from "@/lib/utils";

function complianceTone(status: string): "success" | "warning" | "destructive" | "muted" {
  if (status === "compliant" || status === "active") return "success";
  if (status === "blocked") return "destructive";
  if (status === "grace" || status === "warning" || status === "unassessed") return "warning";
  return "muted";
}

export function VendorEcosystemCard({
  vendor,
  onManageFiles,
  onComplianceCase,
  onExtendGrace,
  onView,
}: {
  vendor: VendorListRow;
  onManageFiles: () => void;
  onComplianceCase: () => void;
  onExtendGrace: () => void;
  onView: () => void;
}) {
  const { t } = useTranslation();
  const entityLabel =
    vendor.entity_type === "freelancer" ? t("vendors.ecosystem.freelancer") : t("vendors.ecosystem.company");
  const statusLabel = vendor.compliance_status.replace(/_/g, " ").toUpperCase();
  const location = vendor.address || vendor.location_names[0] || t("vendors.ecosystem.dohaDefault");
  const regId = vendor.cr_no || vendor.trade_license_no || t("vendors.ecosystem.pendingReg");

  return (
    <article className="pr-vendor-card rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <button type="button" className="truncate text-left text-base font-semibold hover:underline" onClick={onView}>
                {vendor.name}
              </button>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="uppercase">
                  {entityLabel}
                </Badge>
                <Badge variant={complianceTone(vendor.compliance_status)} className="uppercase">
                  {statusLabel}
                </Badge>
              </div>
            </div>
            <div className="text-end">
              <div className="inline-flex items-center gap-0.5 text-muted-foreground">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3 w-3" />
                ))}
              </div>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("vendors.ecosystem.unrated")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric icon={Mail} label={t("vendors.ecosystem.identity")} value={vendor.email || "—"} />
        <Metric icon={Phone} label={t("vendors.ecosystem.hotline")} value={vendor.phone || "—"} />
        <Metric icon={ShieldAlert} label={t("vendors.ecosystem.taxVat")} value={t("vendors.ecosystem.unregistered")} />
        <Metric icon={Globe2} label={t("vendors.ecosystem.regId")} value={regId} />
        <Metric icon={MapPin} label={t("vendors.ecosystem.baseOps")} value={location} />
        <Metric icon={CreditCard} label={t("vendors.ecosystem.bankIban")} value={t("vendors.ecosystem.bankMasked")} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onManageFiles}>
            <FileStack className="h-3.5 w-3.5" />
            {t("vendors.ecosystem.manageFiles")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onComplianceCase}>
            {t("vendors.ecosystem.complianceCases")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10"
            onClick={onExtendGrace}
          >
            {t("vendors.ecosystem.extendGrace")}
          </Button>
        </div>
        <Badge variant={vendor.active ? "success" : "muted"} className="uppercase">
          {vendor.active ? t("vendors.ecosystem.active") : t("vendors.ecosystem.frozen")}
        </Badge>
      </div>
    </article>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

export function VendorComplianceMatrixTable({
  rows,
  onOpen,
}: {
  rows: VendorListRow[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="pr-table-wrap overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-border/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="px-4 py-3 text-start">{t("vendors.ecosystem.matrix.vendor")}</th>
            <th className="px-4 py-3 text-start">{t("vendors.ecosystem.matrix.type")}</th>
            <th className="px-4 py-3 text-start">{t("vendors.ecosystem.matrix.engagement")}</th>
            <th className="px-4 py-3 text-start">{t("vendors.ecosystem.matrix.status")}</th>
            <th className="px-4 py-3 text-start">{t("vendors.ecosystem.matrix.score")}</th>
            <th className="px-4 py-3 text-start">{t("vendors.ecosystem.matrix.deadline")}</th>
            <th className="px-4 py-3 text-start">{t("vendors.ecosystem.matrix.cr")}</th>
            <th className="px-4 py-3 text-start">{t("vendors.ecosystem.matrix.qid")}</th>
            <th className="px-4 py-3 text-end">{t("vendors.ecosystem.matrix.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((vendor) => {
            const crOk = vendor.doc_types.some((d) => /cr|commercial/i.test(d)) || Boolean(vendor.cr_no);
            const qidOk = vendor.doc_types.some((d) => /qid|passport/i.test(d));
            const statusLabel =
              vendor.compliance_status === "unassessed"
                ? t("vendors.ecosystem.unassessed")
                : vendor.compliance_status === "grace"
                  ? t("vendors.ecosystem.legacyPending")
                  : vendor.compliance_status.replace(/_/g, " ");
            return (
              <tr key={vendor.id} className="border-b border-border/30 hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <p className="font-semibold">{vendor.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[vendor.contact_person, vendor.email].filter(Boolean).join(" • ")}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">
                    {vendor.entity_type === "freelancer" ? (
                      <UserRound className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    {vendor.entity_type === "freelancer"
                      ? t("vendors.ecosystem.freelancer")
                      : t("vendors.ecosystem.company")}
                  </Badge>
                </td>
                <td className="px-4 py-3">{vendor.engagement_type || t("vendors.ecosystem.permanent")}</td>
                <td className="px-4 py-3">
                  <Badge variant={complianceTone(vendor.compliance_status)} className="capitalize">
                    {statusLabel}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-semibold tabular-nums">{vendor.compliance_score}%</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {vendor.compliance_deadline
                    ? new Date(vendor.compliance_deadline).toLocaleDateString()
                    : t("vendors.ecosystem.noDeadline")}
                </td>
                <td className="px-4 py-3">{crOk ? "—" : t("vendors.ecosystem.missing")}</td>
                <td className="px-4 py-3">{vendor.entity_type === "freelancer" && !qidOk ? t("vendors.ecosystem.missing") : "—"}</td>
                <td className="px-4 py-3 text-end">
                  <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(vendor.id)}>
                    {t("vendors.list.view")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VendorOnboardingCard({
  vendor,
  onReview,
}: {
  vendor: VendorListRow;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const invited = vendor.onboarding_stage === "invited";
  return (
    <article className="rounded-2xl border border-border/40 bg-card p-4 shadow-elevated-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{vendor.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[vendor.contact_person, vendor.email].filter(Boolean).join(" • ")}
          </p>
        </div>
        <Badge variant={invited ? "info" : "secondary"} className="shrink-0 uppercase">
          {invited ? t("vendors.ecosystem.invited") : t("vendors.ecosystem.inProgress")}
        </Badge>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/40 pt-3 text-xs">
        <span className="text-muted-foreground">
          {vendor.entity_type === "freelancer" ? t("vendors.ecosystem.freelancer") : t("vendors.ecosystem.company")}
        </span>
        <Button type="button" size="sm" variant="link" className="h-auto p-0" onClick={onReview}>
          {t("vendors.ecosystem.reviewDraft")}
        </Button>
      </div>
    </article>
  );
}
