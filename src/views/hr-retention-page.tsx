"use client";

import { useQuery } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { listEmployeeDocuments } from "@/lib/hr-documents.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

function qatarToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function HrRetentionPage() {
  const { t } = useTranslation();
  const documents = useQuery({
    queryKey: queryKeys.people.hrDocs({ scope: "retention", includeDeleted: true }),
    queryFn: () => listEmployeeDocuments({ includeDeleted: true }),
    staleTime: STALE.people,
  });

  const bands = useMemo(() => {
    const today = qatarToday();
    const horizon = addDays(today, 30);
    const overdue: NonNullable<typeof documents.data> = [];
    const due: NonNullable<typeof documents.data> = [];
    const removed: NonNullable<typeof documents.data> = [];
    for (const doc of documents.data ?? []) {
      if (doc.deletedAt) {
        removed.push(doc);
        continue;
      }
      if (!doc.expiryDate) continue;
      if (doc.expiryDate < today) overdue.push(doc);
      else if (doc.expiryDate <= horizon) due.push(doc);
    }
    return { overdue, due, removed };
  }, [documents.data]);

  const empty = bands.overdue.length + bands.due.length + bands.removed.length === 0;

  return (
    <CapabilityGate capability="hr.docs.manage" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={Archive}
          kicker={t("hrWorkspace.retention.kicker")}
          title={t("hrWorkspace.retention.title")}
          subtitle={t("hrWorkspace.retention.subtitle")}
        >
          {documents.isLoading ? (
            <FecLoader density="page" label={t("common.loading")} />
          ) : documents.isError ? (
            <HrEmptyState message={t("hrWorkspace.loadFailed")} />
          ) : empty ? (
            <HrEmptyState message={t("hrWorkspace.retention.empty")} icon={Archive} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <Band title={t("hrWorkspace.retention.overdue")} rows={bands.overdue} dateKey="expiry" />
              <Band title={t("hrWorkspace.retention.due")} rows={bands.due} dateKey="expiry" />
              <Band title={t("hrWorkspace.retention.removed")} rows={bands.removed} dateKey="deleted" />
            </div>
          )}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

function Band({
  title,
  rows,
  dateKey,
}: {
  title: string;
  rows: Array<{
    id: string;
    staffName: string | null;
    employeeCode: string | null;
    title: string | null;
    fileName: string | null;
    docType: string;
    expiryDate: string | null;
    deletedAt: string | null;
  }>;
  dateKey: "expiry" | "deleted";
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">
        {title}
        <span className="ms-2 tabular-nums text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hrWorkspace.retention.none")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((doc) => (
            <li key={doc.id} className="rounded-2xl border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium">{doc.title || doc.fileName || t(`hr.docs.types.${doc.docType}`)}</p>
              <p className="text-xs text-muted-foreground">
                {[doc.staffName, doc.employeeCode, dateKey === "expiry" ? doc.expiryDate : doc.deletedAt?.slice(0, 10)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
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
