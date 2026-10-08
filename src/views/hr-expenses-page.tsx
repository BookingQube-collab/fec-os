"use client";

import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { listExpenseAdjustments } from "@/lib/hr-workspace.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

const qar = new Intl.NumberFormat("en-QA", { style: "currency", currency: "QAR", maximumFractionDigits: 2 });

export default function HrExpensesPage() {
  const { t } = useTranslation();
  const rows = useQuery({
    queryKey: queryKeys.people.hrExpenses(),
    queryFn: () => listExpenseAdjustments({}),
    staleTime: STALE.people,
  });

  return (
    <CapabilityGate capability="payroll.view" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={Receipt}
          kicker={t("hrWorkspace.expenses.kicker")}
          title={t("hrWorkspace.expenses.title")}
          subtitle={t("hrWorkspace.expenses.subtitle")}
        >
          {rows.isLoading ? (
            <FecLoader density="page" label={t("common.loading")} />
          ) : rows.isError ? (
            <HrEmptyState message={t("hrWorkspace.loadFailed")} />
          ) : (rows.data ?? []).length === 0 ? (
            <HrEmptyState message={t("hrWorkspace.expenses.empty")} icon={Receipt} />
          ) : (
            <ul className="space-y-2">
              {(rows.data ?? []).map((row) => (
                <li key={row.id} className="hr-list-row">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{row.reason || t(`hrWorkspace.expenses.types.${row.adjType}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[row.staffName, row.employeeCode, row.documentRef, row.createdAt.slice(0, 10)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-medium tabular-nums">{qar.format(row.amountQar)}</p>
                    <Badge variant="outline">{row.status || t(`hrWorkspace.expenses.types.${row.adjType}`)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </HrSection>
      </HrShell>
    </CapabilityGate>
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
