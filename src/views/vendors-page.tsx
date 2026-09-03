"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid,
  LayoutList,
  Mail,
  Plus,
  Search,
  Settings2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PrModuleShell } from "@/components/procurement/pr-module-shell";
import {
  VendorComplianceMatrixTable,
  VendorEcosystemCard,
  VendorOnboardingCard,
} from "@/components/vendors/vendor-ecosystem-card";
import {
  VendorGraceExtensionDialog,
  VendorInviteDialog,
  VendorQuickCreateDialog,
  VendorRuleMatrixDialog,
} from "@/components/vendors/vendor-ecosystem-dialogs";
import { VendorDetailDialog } from "@/components/vendors/vendor-detail-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVendors } from "@/hooks/queries/useVendors";
import type { VendorListRow } from "@/lib/queries/vendors-api.core";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { extendVendorGrace } from "@/lib/vendors.functions";
import { useAppStore } from "@/stores/app-store";

type EcosystemTab = "directory" | "matrix" | "pipeline";
type StatusChip = "all" | "active" | "blocked" | "frozen";

function matchesStatusChip(v: VendorListRow, chip: StatusChip): boolean {
  if (chip === "all") return true;
  if (chip === "blocked") return v.compliance_status === "blocked";
  if (chip === "frozen") return !v.active;
  return v.active && v.compliance_status !== "blocked";
}

export default function VendorsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [tab, setTab] = useState<EcosystemTab>("directory");
  const [chip, setChip] = useState<StatusChip>("all");
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [quickOpen, setQuickOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [graceVendor, setGraceVendor] = useState<VendorListRow | null>(null);

  const list = useVendors({
    locationId: locationId ?? null,
    includeInactive: true,
    page: 1,
    pageSize: 200,
  });

  const graceMut = useMutation({
    mutationFn: (vars: { id: string; extensionDays: number; reason: string }) => extendVendorGrace(vars),
    onSuccess: () => {
      toast.success(t("vendors.ecosystem.graceExtended"));
      void qc.invalidateQueries({ queryKey: queryKeys.vendors.all });
      setGraceVendor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vendors = list.data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (entityFilter !== "all" && v.entity_type !== entityFilter) return false;
      if (!matchesStatusChip(v, chip)) return false;
      if (!q) return true;
      const hay = [v.name, v.email, v.phone, v.contact_person, v.cr_no, v.trade_license_no, v.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vendors, search, entityFilter, chip]);

  const directoryRows = useMemo(
    () => filtered.filter((v) => v.onboarding_stage === "approved" || v.compliance_status === "compliant"),
    [filtered],
  );
  const matrixRows = filtered;
  const pipelineRows = useMemo(
    () =>
      filtered.filter(
        (v) => v.onboarding_stage === "invited" || v.onboarding_stage === "in_progress",
      ),
    [filtered],
  );

  const chipCounts = useMemo(() => {
    const counts = { all: vendors.length, active: 0, blocked: 0, frozen: 0 };
    for (const v of vendors) {
      if (matchesStatusChip(v, "active")) counts.active += 1;
      if (matchesStatusChip(v, "blocked")) counts.blocked += 1;
      if (matchesStatusChip(v, "frozen")) counts.frozen += 1;
    }
    return counts;
  }, [vendors]);

  const activeRows =
    tab === "directory" ? directoryRows : tab === "matrix" ? matrixRows : pipelineRows;

  return (
    <PrModuleShell>
      <div className="space-y-6">
        <PageHeader
          title={t("vendors.pageTitle")}
          subtitle={t("vendors.ecosystem.subtitle")}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border/60 bg-card p-1">
                <Button
                  type="button"
                  size="icon"
                  variant={view === "cards" ? "default" : "ghost"}
                  className="h-9 w-9"
                  onClick={() => setView("cards")}
                  aria-label={t("vendors.viewCards")}
                >
                  <LayoutGrid />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={view === "list" ? "default" : "ghost"}
                  className="h-9 w-9"
                  onClick={() => setView("list")}
                  aria-label={t("vendors.viewList")}
                >
                  <LayoutList />
                </Button>
              </div>
              <CapabilityGate capability="vendors.manage">
                <Button size="sm" onClick={() => setQuickOpen(true)}>
                  <Plus />
                  {t("vendors.ecosystem.quickCreate")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRulesOpen(true)}>
                  <Settings2 />
                  {t("vendors.ecosystem.ruleMatrix")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                  <Mail />
                  {t("vendors.ecosystem.invite")}
                </Button>
              </CapabilityGate>
            </div>
          }
        />

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["directory", t("vendors.ecosystem.approvedDirectory"), directoryRows.length],
              ["matrix", t("vendors.ecosystem.complianceMatrix"), matrixRows.length],
              ["pipeline", t("vendors.ecosystem.onboardingPipeline"), pipelineRows.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold",
                tab === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              {label}
              <span className="rounded-full bg-background/20 px-1.5 py-0.5 tabular-nums">{count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("vendors.ecosystem.searchPlaceholder")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab !== "pipeline" ? (
              <>
                {(
                  [
                    ["all", chipCounts.all],
                    ["active", chipCounts.active],
                    ["blocked", chipCounts.blocked],
                    ["frozen", chipCounts.frozen],
                  ] as const
                ).map(([key, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setChip(key)}
                    className={cn(
                      "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold uppercase tracking-wide",
                      chip === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 bg-card text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {t(`vendors.ecosystem.chip.${key}`)}
                    {key !== "all" ? ` ${count}` : count ? ` ${count}` : ""}
                  </button>
                ))}
              </>
            ) : null}
            {tab === "matrix" ? (
              <>
                <Select value={entityFilter} onValueChange={setEntityFilter}>
                  <SelectTrigger className="h-9 w-auto min-w-36 rounded-full">
                    <SelectValue placeholder={t("vendors.ecosystem.allEntityTypes")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("vendors.ecosystem.allEntityTypes")}</SelectItem>
                    <SelectItem value="company">{t("vendors.ecosystem.company")}</SelectItem>
                    <SelectItem value="freelancer">{t("vendors.ecosystem.freelancer")}</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>
        </div>

        {list.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-2xl bg-muted/70" />
            ))}
          </div>
        ) : tab === "matrix" ? (
          activeRows.length ? (
            <VendorComplianceMatrixTable rows={activeRows} onOpen={setDetailId} />
          ) : (
            <EmptyState />
          )
        ) : tab === "pipeline" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("vendors.ecosystem.pipelineTitle")}</h2>
              <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                {t("vendors.ecosystem.inviteAnother")}
              </Button>
            </div>
            {activeRows.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {activeRows.map((vendor) => (
                  <VendorOnboardingCard key={vendor.id} vendor={vendor} onReview={() => setDetailId(vendor.id)} />
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
            <section className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">{t("vendors.ecosystem.gatewayTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("vendors.ecosystem.gatewayHint")}</p>
            </section>
          </div>
        ) : activeRows.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {activeRows.map((vendor) => (
              <VendorEcosystemCard
                key={vendor.id}
                vendor={vendor}
                onView={() => setDetailId(vendor.id)}
                onManageFiles={() => setDetailId(vendor.id)}
                onComplianceCase={() => setDetailId(vendor.id)}
                onExtendGrace={() => setGraceVendor(vendor)}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}

        <VendorQuickCreateDialog open={quickOpen} onOpenChange={setQuickOpen} />
        <VendorInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
        <VendorRuleMatrixDialog open={rulesOpen} onOpenChange={setRulesOpen} />
        <VendorGraceExtensionDialog
          open={Boolean(graceVendor)}
          onOpenChange={(open) => !open && setGraceVendor(null)}
          vendorName={graceVendor?.name ?? ""}
          currentDeadline={graceVendor?.compliance_deadline ?? null}
          onConfirm={(days, reason) => {
            if (!graceVendor) return;
            graceMut.mutate({ id: graceVendor.id, extensionDays: days, reason });
          }}
        />
        <VendorDetailDialog vendorId={detailId} onOpenChange={(open) => !open && setDetailId(null)} />
      </div>
    </PrModuleShell>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-border/40 bg-card px-6 py-14 text-center shadow-elevated-xs">
      <p className="text-sm font-semibold">{t("vendors.list.emptyTitle")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("vendors.list.emptyHint")}</p>
    </div>
  );
}
