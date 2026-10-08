"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Package } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listResignations, listTerminations } from "@/lib/hr-exit.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

type ReturnRow = {
  id: string;
  name: string | null;
  code: string | null;
  when: string | null;
  returned: boolean;
  source: "resignation" | "termination";
};

export default function HrEquipmentPage() {
  const { t } = useTranslation();
  const resignations = useQuery({
    queryKey: queryKeys.people.hrResignations({ status: "all", view: "assets" }),
    queryFn: () => listResignations({ status: "all" }),
    staleTime: STALE.people,
  });
  const terminations = useQuery({
    queryKey: queryKeys.people.hrTerminations({ status: "all", view: "assets" }),
    queryFn: () => listTerminations({ status: "all" }),
    staleTime: STALE.people,
  });

  const rows: ReturnRow[] = [
    ...(resignations.data ?? []).map((row) => ({
      id: `r-${row.id}`,
      name: row.staffName,
      code: row.employeeCode,
      when: row.approvedLwd ?? row.proposedLwd,
      returned: row.assetClearance,
      source: "resignation" as const,
    })),
    ...(terminations.data ?? []).map((row) => ({
      id: `t-${row.id}`,
      name: row.staffName,
      code: row.employeeCode,
      when: row.lastWorkingDate,
      returned: row.assetClearance,
      source: "termination" as const,
    })),
  ];
  const outstanding = rows.filter((row) => !row.returned);
  const returned = rows.filter((row) => row.returned);
  const loading = resignations.isLoading || terminations.isLoading;
  const failed = resignations.isError || terminations.isError;

  return (
    <CapabilityGate capability="hr.manage" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={Package}
          kicker={t("hrWorkspace.equipment.kicker")}
          title={t("hrWorkspace.equipment.title")}
          subtitle={t("hrWorkspace.equipment.subtitle")}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/inventory">{t("nav.inventory")}</Link>
            </Button>
          }
        >
          {loading ? (
            <FecLoader density="page" label={t("common.loading")} />
          ) : failed ? (
            <HrEmptyState message={t("hrWorkspace.loadFailed")} />
          ) : rows.length === 0 ? (
            <HrEmptyState message={t("hrWorkspace.equipment.empty")} icon={Package} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <ReturnColumn title={t("hrWorkspace.equipment.outstanding")} rows={outstanding} empty={t("hrWorkspace.equipment.noneOut")} />
              <ReturnColumn title={t("hrWorkspace.equipment.returned")} rows={returned} empty={t("hrWorkspace.equipment.noneBack")} />
            </div>
          )}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

function ReturnColumn({ title, rows, empty }: { title: string; rows: ReturnRow[]; empty: string }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="hr-list-row">
              <div className="min-w-0">
                <p className="font-medium">{row.name ?? t("hrWorkspace.unknownStaff")}</p>
                <p className="text-xs text-muted-foreground">{[row.code, row.when].filter(Boolean).join(" · ")}</p>
              </div>
              <Badge variant="outline">{t(`hrWorkspace.equipment.source.${row.source}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Denied() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <HrEmptyState message={t("hr.dashboard.noAccess")} />
    </HrShell>
  );
}
