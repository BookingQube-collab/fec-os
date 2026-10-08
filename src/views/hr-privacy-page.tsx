"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { listPrivacyRequests, logPrivacyRequest } from "@/lib/hr-workspace.functions";
import { listStaff } from "@/lib/people.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const KINDS = ["access", "correction", "erasure"] as const;

export default function HrPrivacyPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("access");
  const [detail, setDetail] = useState("");
  const [filter, setFilter] = useState<(typeof KINDS)[number] | "all">("all");

  const requests = useQuery({
    queryKey: queryKeys.people.hrPrivacy(),
    queryFn: () => listPrivacyRequests({}),
    staleTime: STALE.people,
  });
  const staff = useQuery({
    queryKey: queryKeys.people.staff(null),
    queryFn: () => listStaff({}),
    staleTime: STALE.people,
  });

  const log = useMutation({
    mutationFn: logPrivacyRequest,
    onSuccess: () => {
      toast.success(t("hrWorkspace.privacy.logged"));
      setDetail("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrPrivacy() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = requests.data ?? [];
    if (filter === "all") return all;
    return all.filter((row) => row.payload.kind === filter);
  }, [requests.data, filter]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!staffId || detail.trim().length < 3) {
      toast.error(t("hrWorkspace.privacy.required"));
      return;
    }
    log.mutate({ staffId, kind, detail: detail.trim() });
  };

  return (
    <CapabilityGate capability="hr.manage" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={Shield}
          kicker={t("hrWorkspace.privacy.kicker")}
          title={t("hrWorkspace.privacy.title")}
          subtitle={t("hrWorkspace.privacy.subtitle")}
        >
          <div className="flex flex-wrap gap-2">
            {(["all", ...KINDS] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {t(`hrWorkspace.privacy.kinds.${value}`)}
              </Button>
            ))}
          </div>

          <HrPanel className="space-y-4 p-5">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("hrWorkspace.staff")}</Label>
                  <SearchableSelect
                    value={staffId}
                    onValueChange={setStaffId}
                    aria-label={t("hrWorkspace.staff")}
                    options={(staff.data ?? []).map((row) => ({
                      value: row.id,
                      label: row.employee_code ? `${row.full_name} · ${row.employee_code}` : row.full_name,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("hrWorkspace.privacy.kind")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {KINDS.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={kind === value ? "default" : "outline"}
                        onClick={() => setKind(value)}
                      >
                        {t(`hrWorkspace.privacy.kinds.${value}`)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="privacy-detail">{t("hrWorkspace.privacy.detail")}</Label>
                <Textarea id="privacy-detail" value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} maxLength={2000} />
              </div>
              <Button type="submit" disabled={log.isPending}>
                {t("hrWorkspace.privacy.log")}
              </Button>
            </form>
          </HrPanel>

          {requests.isLoading ? (
            <FecLoader density="page" label={t("common.loading")} />
          ) : requests.isError ? (
            <HrEmptyState message={t("hrWorkspace.loadFailed")} />
          ) : rows.length === 0 ? (
            <HrEmptyState message={t("hrWorkspace.privacy.empty")} icon={Shield} />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {rows.map((row) => {
                const requestKind = typeof row.payload.kind === "string" ? row.payload.kind : "access";
                const detailText = typeof row.payload.detail === "string" ? row.payload.detail : "";
                return (
                  <li key={row.id} className={cn("flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between")}>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{detailText}</p>
                      <p className="text-xs text-muted-foreground">
                        {[row.staffName, row.employeeCode, row.effectiveOn].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge variant="outline">{t(`hrWorkspace.privacy.kinds.${requestKind}`, { defaultValue: requestKind })}</Badge>
                  </li>
                );
              })}
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
      <HrPanel>
        <HrEmptyState message={t("hr.dashboard.noAccess")} />
      </HrPanel>
    </HrShell>
  );
}
