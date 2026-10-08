"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { History } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import { listEmployeeDocuments } from "@/lib/hr-documents.functions";
import { listEmployeeTimeline } from "@/lib/hr-leave.functions";
import { listStaff } from "@/lib/people.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export default function HrServiceHistoryPage() {
  const { t } = useTranslation();
  const canDocs = usePermission("hr.docs.manage") || usePermission("hr.manage");
  const [query, setQuery] = useState("");
  const [staffId, setStaffId] = useState("");

  const staff = useQuery({
    queryKey: queryKeys.people.staff(null),
    queryFn: () => listStaff({}),
    staleTime: STALE.people,
  });
  const timeline = useQuery({
    queryKey: queryKeys.people.hrEmployeeTimeline({ staffId, scope: "service" }),
    queryFn: () => listEmployeeTimeline({ staffId, limit: 80 }),
    enabled: Boolean(staffId),
    staleTime: STALE.people,
  });
  const documents = useQuery({
    queryKey: queryKeys.people.hrDocs({ staffId, scope: "contracts" }),
    queryFn: () => listEmployeeDocuments({ staffId }),
    enabled: Boolean(staffId) && canDocs,
    staleTime: STALE.people,
  });

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (staff.data ?? []).filter((row) => {
      if (!needle) return true;
      return `${row.full_name} ${row.employee_code ?? ""}`.toLowerCase().includes(needle);
    });
  }, [staff.data, query]);

  const contracts = (documents.data ?? []).filter((doc) => doc.docType === "contract" && !doc.deletedAt);
  const selected = (staff.data ?? []).find((row) => row.id === staffId);

  return (
    <CapabilityGate capability="people.view_roster" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={History}
          kicker={t("hrWorkspace.history.kicker")}
          title={t("hrWorkspace.history.title")}
          subtitle={t("hrWorkspace.history.subtitle")}
          actions={
            selected ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/people/staff/${selected.id}`}>{t("hrWorkspace.history.openRecord")}</Link>
              </Button>
            ) : null
          }
        >
          <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <HrPanel className="space-y-3 p-4">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("hrWorkspace.history.search")}
                aria-label={t("hrWorkspace.history.search")}
              />
              {staff.isLoading ? (
                <FecLoader label={t("common.loading")} />
              ) : (
                <ul className="max-h-[32rem] space-y-1 overflow-auto">
                  {people.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setStaffId(row.id)}
                        className={
                          row.id === staffId
                            ? "w-full rounded-xl bg-primary px-3 py-2 text-start text-sm font-medium text-primary-foreground"
                            : "w-full rounded-xl px-3 py-2 text-start text-sm hover:bg-secondary/80"
                        }
                      >
                        <span className="block truncate">{row.full_name}</span>
                        {row.employee_code ? (
                          <span className="block truncate text-xs opacity-80">{row.employee_code}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </HrPanel>

            <div className="space-y-6">
              {!staffId ? (
                <HrEmptyState message={t("hrWorkspace.history.pick")} icon={History} />
              ) : timeline.isLoading ? (
                <FecLoader density="page" label={t("common.loading")} />
              ) : timeline.isError ? (
                <HrEmptyState message={t("hrWorkspace.loadFailed")} />
              ) : (
                <>
                  {canDocs ? (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">{t("hrWorkspace.history.contracts")}</h2>
                    {contracts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("hrWorkspace.history.noContracts")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {contracts.map((doc) => (
                          <li key={doc.id} className="hr-list-row">
                            <div>
                              <p className="font-medium">{doc.title || doc.fileName || t("hrWorkspace.history.contractFile")}</p>
                              <p className="text-xs text-muted-foreground">
                                {[doc.expiryDate ? t("hrWorkspace.history.ends", { date: doc.expiryDate }) : null, doc.verificationStatus]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  ) : null}
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">{t("hrWorkspace.history.timeline")}</h2>
                    {(timeline.data ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("hrWorkspace.history.noEvents")}</p>
                    ) : (
                      <ol className="relative space-y-0 border-s border-border ps-4">
                        {(timeline.data ?? []).map((event) => (
                          <li key={event.id} className="pb-4">
                            <p className="text-sm font-medium">
                              {t(`hrWorkspace.events.${event.eventType}`, {
                                defaultValue: event.eventType.replace(/_/g, " "),
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">{event.effectiveOn}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

function Denied() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <HrPanel>
        <HrEmptyState message={t("hr.dashboard.noAccess")} />
      </HrPanel>
    </HrShell>
  );
}
