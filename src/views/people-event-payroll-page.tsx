"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventFilters } from "@/components/people/people-event-filters";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import { listPayrollPeriods } from "@/lib/hr-payroll.functions";
import { listPeopleEventOptions } from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function uuidOrEmpty(v: string | null): string {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
}

export default function PeopleEventPayrollPage() {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();
  const [eventId, setEventId] = useState(() => uuidOrEmpty(searchParams.get("eventId")));
  const [locationId, setLocationId] = useState("");

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options", locationId || null],
    queryFn: () => listPeopleEventOptions({ locationId: locationId || null }),
    staleTime: STALE.events,
  });

  const periodsQ = useQuery({
    queryKey: queryKeys.people.hrPayrollPeriods({ periodKind: "event" }),
    queryFn: () => listPayrollPeriods({ status: "all", periodKind: "event" }),
    staleTime: STALE.people,
  });

  const events = eventsQ.data?.events ?? [];
  const eventById = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );

  const periods = useMemo(() => {
    const all = periodsQ.data ?? [];
    return all.filter((p) => {
      const kind = (p as { periodKind?: string }).periodKind;
      if (kind && kind !== "event") return false;
      const pid = (p as { eventId?: string | null }).eventId ?? null;
      if (eventId && pid !== eventId) return false;
      if (locationId && pid) {
        const ev = eventById.get(pid);
        if (ev && ev.locationId !== locationId) return false;
      }
      return true;
    });
  }, [periodsQ.data, eventId, locationId, eventById]);

  return (
    <CapabilityGate
      capability="payroll.view"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("peopleEvent.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Banknote}
          kicker={t("peopleEvent.kicker")}
          title={t("peopleEvent.payroll.title")}
          subtitle={t("peopleEvent.payroll.subtitle")}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/people/payroll">{t("peopleEvent.links.allPayroll")}</Link>
              </Button>
              {eventId ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/events/${eventId}/pay`}>
                    <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                    {t("peopleEvent.links.openEventPay")}
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        >
          <PeopleEventWorkforceTabs active="payroll" />
          <HrPanel delay={0}>
            <PeopleEventFilters
              events={events}
              eventId={eventId}
              locationId={locationId}
              onEventId={setEventId}
              onLocationId={setLocationId}
            />
            <p className="border-t border-border/40 px-4 pb-4 text-xs text-muted-foreground sm:px-5">
              {t("peopleEvent.payroll.hint")}
            </p>
          </HrPanel>

          <HrPanel delay={1}>
            <div className="hr-table-wrap p-2 sm:p-4">
              <table>
                <thead>
                  <tr>
                    <th>{t("hr.payroll.month")}</th>
                    <th>{t("peopleEvent.columns.event")}</th>
                    <th>{t("hr.payrollRuns.cycle")}</th>
                    <th>{t("hr.payroll.colStatus")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {periodsQ.isLoading ? (
                    <tr>
                      <td colSpan={5}>{t("common.loading")}</td>
                    </tr>
                  ) : periods.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <HrEmptyState
                          message={t("peopleEvent.payroll.empty")}
                          icon={Banknote}
                        />
                      </td>
                    </tr>
                  ) : (
                    periods.map((p) => {
                      const pid = (p as { eventId?: string | null }).eventId ?? null;
                      const ev = pid ? eventById.get(pid) : null;
                      return (
                        <tr key={p.id}>
                          <td className="font-medium">
                            {p.displayName ?? p.month}
                            <Badge variant="outline" className="ms-2 text-[10px]">
                              Event
                            </Badge>
                          </td>
                          <td className="text-sm">{ev?.name ?? (pid ? pid.slice(0, 8) : "—")}</td>
                          <td className="text-xs">
                            {formatPayrollRange(p.dateFrom, p.dateTo, i18n.language)}
                          </td>
                          <td>
                            <Badge variant={p.status === "locked" ? "secondary" : "outline"}>
                              {t(`hr.payrollRuns.status.${p.status}`, { defaultValue: p.status })}
                            </Badge>
                          </td>
                          <td className="text-end">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button asChild size="sm" variant="secondary">
                                <Link href={`/people/payroll/${p.id}`}>{t("common.view")}</Link>
                              </Button>
                              {pid ? (
                                <Button asChild size="sm" variant="ghost">
                                  <Link href={`/events/${pid}/pay`}>
                                    {t("peopleEvent.links.setup")}
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
