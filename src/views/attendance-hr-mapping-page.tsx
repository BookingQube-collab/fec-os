"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { PageHeader } from "@/components/layout/page-header";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useSites } from "@/hooks/queries/useSites";
import {
  getAttendanceHrBootstrap,
  listAttendanceHrMappings,
  mapAttendanceBiometricUser,
  mapAttendanceBiometricUsers,
  removeAttendanceBiometricUser,
  unmapAttendanceBiometricUser,
} from "@/lib/attendance-hr.functions";
import { CANONICAL_LOCATION_CODES, rosterSheetLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

type MergeFilter = "all" | "mapped" | "unmapped";

type MappingRow = {
  id: string;
  location_id?: string | null;
  biometric_user_id: string;
  device_name?: string | null;
  previous_device_name?: string | null;
  full_name?: string | null;
  staff_id?: string | null;
};

type StaffOption = {
  id: string;
  full_name: string;
  employee_code: string;
  qid?: string | null;
  location_id?: string | null;
  is_roaming?: boolean | null;
  work_location_ids?: string[] | null;
};

function staffAvailableAtLocation(s: StaffOption, locationId: string | null) {
  if (!locationId) return true;
  if (s.location_id === locationId) return true;
  if (s.is_roaming) return true;
  return Boolean(s.work_location_ids?.includes(locationId));
}

function isMultiSiteStaff(s: StaffOption) {
  return Boolean(s.is_roaming) || (s.work_location_ids?.length ?? 0) > 1;
}

function StaffSearchSelect({
  value,
  staff,
  disabled,
  onChange,
}: {
  value: string;
  staff: StaffOption[];
  disabled?: boolean;
  onChange: (staffId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <SearchableSelect
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      placeholder={t("attendanceHr.mapping.unmapped")}
      emptyOption={{ value: "", label: t("attendanceHr.mapping.unmapped") }}
      triggerClassName="h-auto min-h-10 min-w-56 max-w-80 px-3 font-normal"
      options={staff.map((s) => ({
        value: s.id,
        label: s.full_name,
        description: `${s.employee_code}${s.qid ? ` · ${s.qid}` : ""}`,
        keywords: `${s.full_name} ${s.employee_code} ${s.qid ?? ""}`,
        suffix: isMultiSiteStaff(s) ? (
          <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("attendanceHr.mapping.multiSite")}
          </span>
        ) : null,
      }))}
    />
  );
}

export default function AttendanceHrMappingPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const setCurrentLocationId = useAppStore((s) => s.setCurrentLocationId);
  const qc = useQueryClient();
  const [staffByRow, setStaffByRow] = useState<Record<string, string>>({});
  const [removeTarget, setRemoveTarget] = useState<MappingRow | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, true>>({});
  const [mergeFilter, setMergeFilter] = useState<MergeFilter>("all");
  const { data: sites } = useSites();
  const mappingQueryKey = queryKeys.people.attendanceHr({ view: "map", locationId });
  const attendanceHrRootKey = [...queryKeys.people.all, "attendance-hr"] as const;
  const bootstrap = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap" }),
    queryFn: () => getAttendanceHrBootstrap(),
    staleTime: STALE.people,
  });
  const q = useQuery({
    queryKey: mappingQueryKey,
    queryFn: () => listAttendanceHrMappings({ locationId: locationId || null, unmatchedOnly: false }),
    staleTime: STALE.people,
  });
  const locationOptions = useMemo(() => {
    const byCode = new Map<string, { id: string; code: string; name: string }>();
    for (const site of sites ?? []) {
      if (site.status === "active") {
        byCode.set(site.code, { id: site.id, code: site.code, name: site.name });
      }
    }
    for (const site of bootstrap.data?.sites ?? []) {
      const loc = site.location as { id?: string; code?: string; name?: string; status?: string } | null;
      if (!loc?.id || !loc.code || (loc.status && loc.status !== "active")) continue;
      if (!byCode.has(loc.code)) {
        byCode.set(loc.code, { id: loc.id, code: loc.code, name: loc.name ?? loc.code });
      }
    }
    const ordered = CANONICAL_LOCATION_CODES.flatMap((code) => {
      const loc = byCode.get(code);
      return loc ? [loc] : [];
    });
    if (locationId) {
      const current =
        [...byCode.values()].find((loc) => loc.id === locationId) ??
        (sites ?? []).find((site) => site.id === locationId);
      if (current && !ordered.some((loc) => loc.id === current.id)) {
        ordered.push({ id: current.id, code: current.code, name: current.name });
      }
    }
    return ordered;
  }, [sites, bootstrap.data?.sites, locationId]);
  const siteById = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const site of sites ?? []) {
      map.set(site.id, { code: site.code, name: site.name });
    }
    for (const loc of locationOptions) {
      if (!map.has(loc.id)) map.set(loc.id, { code: loc.code, name: loc.name });
    }
    return map;
  }, [sites, locationOptions]);
  const rows = useMemo(() => (q.data ?? []) as unknown as MappingRow[], [q.data]);
  const mappedCount = rows.filter((row) => Boolean(row.staff_id)).length;
  const unmappedCount = rows.length - mappedCount;
  const visibleRows = useMemo(() => {
    if (mergeFilter === "mapped") return rows.filter((row) => Boolean(row.staff_id));
    if (mergeFilter === "unmapped") return rows.filter((row) => !row.staff_id);
    return rows;
  }, [rows, mergeFilter]);
  const staff = useMemo(() => {
    const all = (bootstrap.data?.staff ?? []) as StaffOption[];
    const keepIds = new Set<string>();
    for (const row of rows) {
      const selected = staffByRow[row.id] ?? String(row.staff_id ?? "");
      if (selected) keepIds.add(selected);
    }
    return all.filter((s) => staffAvailableAtLocation(s, locationId || null) || keepIds.has(s.id));
  }, [bootstrap.data?.staff, locationId, rows, staffByRow]);
  const pendingMaps = useMemo(
    () =>
      rows
        .map((row) => {
          const staffId = staffByRow[row.id] ?? String(row.staff_id ?? "");
          const original = String(row.staff_id ?? "");
          return { mappingId: row.id, staffId, changed: Boolean(staffId) && staffId !== original };
        })
        .filter((row) => row.changed)
        .map(({ mappingId, staffId }) => ({ mappingId, staffId })),
    [rows, staffByRow],
  );

  const patchMappings = (updater: (current: MappingRow[]) => MappingRow[]) => {
    qc.setQueryData<MappingRow[]>(mappingQueryKey, (old) => (old ? updater(old) : old));
  };

  const markBusy = (ids: string[], busy: boolean) => {
    setBusyIds((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (busy) next[id] = true;
        else delete next[id];
      }
      return next;
    });
  };

  const clearRowDraft = (mappingId: string) => {
    setStaffByRow((s) => {
      if (!(mappingId in s)) return s;
      const next = { ...s };
      delete next[mappingId];
      return next;
    });
  };

  const syncMappingsInBackground = () => {
    void qc.invalidateQueries({ queryKey: attendanceHrRootKey });
  };

  const mapMut = useMutation({
    mutationFn: (p: { mappingId: string; staffId: string }) => mapAttendanceBiometricUser(p),
    onMutate: async (vars) => {
      markBusy([vars.mappingId], true);
      await qc.cancelQueries({ queryKey: mappingQueryKey });
      const previous = qc.getQueryData<MappingRow[]>(mappingQueryKey);
      patchMappings((current) =>
        current.map((row) => (row.id === vars.mappingId ? { ...row, staff_id: vars.staffId } : row)),
      );
      return { previous };
    },
    onSuccess: (_ok, vars) => {
      clearRowDraft(vars.mappingId);
      toast.success(t("attendanceHr.mapping.mappedToast"));
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(mappingQueryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: (_data, _err, vars) => {
      markBusy([vars.mappingId], false);
      syncMappingsInBackground();
    },
  });
  const unmapMut = useMutation({
    mutationFn: (p: { mappingId: string }) => unmapAttendanceBiometricUser(p),
    onMutate: async (vars) => {
      markBusy([vars.mappingId], true);
      await qc.cancelQueries({ queryKey: mappingQueryKey });
      const previous = qc.getQueryData<MappingRow[]>(mappingQueryKey);
      patchMappings((current) =>
        current.map((row) => (row.id === vars.mappingId ? { ...row, staff_id: null } : row)),
      );
      setStaffByRow((s) => ({ ...s, [vars.mappingId]: "" }));
      return { previous };
    },
    onSuccess: () => toast.success(t("attendanceHr.mapping.unmappedToast")),
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(mappingQueryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: (_data, _err, vars) => {
      markBusy([vars.mappingId], false);
      syncMappingsInBackground();
    },
  });
  const removeMut = useMutation({
    mutationFn: (p: { mappingId: string }) => removeAttendanceBiometricUser(p),
    onMutate: async (vars) => {
      markBusy([vars.mappingId], true);
      await qc.cancelQueries({ queryKey: mappingQueryKey });
      const previous = qc.getQueryData<MappingRow[]>(mappingQueryKey);
      patchMappings((current) => current.filter((row) => row.id !== vars.mappingId));
      clearRowDraft(vars.mappingId);
      setRemoveTarget(null);
      return { previous };
    },
    onSuccess: () => toast.success(t("attendanceHr.mapping.removedToast")),
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(mappingQueryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: (_data, _err, vars) => {
      markBusy([vars.mappingId], false);
      syncMappingsInBackground();
    },
  });

  const saveAllMut = useMutation({
    mutationFn: (mappings: Array<{ mappingId: string; staffId: string }>) =>
      mapAttendanceBiometricUsers({ mappings }),
    onMutate: async (mappings) => {
      const ids = mappings.map((item) => item.mappingId);
      markBusy(ids, true);
      await qc.cancelQueries({ queryKey: mappingQueryKey });
      const previous = qc.getQueryData<MappingRow[]>(mappingQueryKey);
      const staffById = new Map(mappings.map((item) => [item.mappingId, item.staffId]));
      patchMappings((current) =>
        current.map((row) => {
          const staffId = staffById.get(row.id);
          return staffId ? { ...row, staff_id: staffId } : row;
        }),
      );
      return { previous, ids };
    },
    onSuccess: (result, mappings, ctx) => {
      const failed = result.failed.length;
      if (failed === 0) {
        toast.success(t("attendanceHr.mapping.saveAllToast", { saved: result.saved }));
      } else if (result.saved > 0) {
        toast.warning(t("attendanceHr.mapping.saveAllToastPartial", { saved: result.saved, failed }));
      } else {
        toast.error(t("attendanceHr.mapping.saveAllToastFailed", { failed }));
      }
      const failedIds = new Set(result.failed.map((f) => f.mappingId));
      if (failedIds.size && ctx?.previous) {
        const previousById = new Map(ctx.previous.map((row) => [row.id, row]));
        patchMappings((current) =>
          current.map((row) => (failedIds.has(row.id) ? (previousById.get(row.id) ?? row) : row)),
        );
      }
      setStaffByRow((prev) => {
        const next = { ...prev };
        for (const item of mappings) {
          if (!failedIds.has(item.mappingId)) delete next[item.mappingId];
        }
        return next;
      });
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(mappingQueryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: (_data, _err, _vars, ctx) => {
      if (ctx?.ids) markBusy(ctx.ids, false);
      syncMappingsInBackground();
    },
  });

  const anyBusy = Object.keys(busyIds).length > 0;

  const applyStaffChoice = (row: MappingRow, staffId: string) => {
    if (busyIds[row.id]) return;
    const saved = String(row.staff_id ?? "");
    if (staffId === saved) {
      clearRowDraft(row.id);
      return;
    }
    setStaffByRow((s) => ({ ...s, [row.id]: staffId }));
    if (staffId) mapMut.mutate({ mappingId: row.id, staffId });
    else unmapMut.mutate({ mappingId: row.id });
  };

  const saveAll = () => {
    if (pendingMaps.length === 0) {
      toast.message(t("attendanceHr.mapping.saveAllEmpty"));
      return;
    }
    saveAllMut.mutate(pendingMaps);
  };

  const renderSaveAllButton = () => (
    <Button size="sm" disabled={saveAllMut.isPending || anyBusy || pendingMaps.length === 0} onClick={saveAll}>
      {saveAllMut.isPending
        ? t("common.saving")
        : pendingMaps.length > 0
          ? t("attendanceHr.mapping.saveAllCount", { count: pendingMaps.length })
          : t("attendanceHr.mapping.saveAll")}
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        kicker={t("attendanceHr.mapping.kicker")}
        title={t("attendanceHr.mapping.title")}
        subtitle={t("attendanceHr.mapping.subtitle")}
        actions={<CapabilityGate capability="attendance.map_users">{renderSaveAllButton()}</CapabilityGate>}
      />
      <AttendanceHrNav />

      <NeumorphicCard className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {t("attendanceHr.mapping.location")}
          </Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("attendanceHr.mapping.location")}>
            <button
              type="button"
              className={cn("filter-chip", !locationId && "filter-chip-active")}
              aria-pressed={!locationId}
              onClick={() => setCurrentLocationId(null)}
            >
              {t("common.allLocations")}
            </button>
            {locationOptions.map((site) => (
              <button
                key={site.id}
                type="button"
                title={rosterSheetLabel(site.code, site.name)}
                className={cn("filter-chip", locationId === site.id && "filter-chip-active")}
                aria-pressed={locationId === site.id}
                onClick={() => setCurrentLocationId(site.id)}
              >
                {site.code}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("attendanceHr.mapping.mergeStatus")}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("attendanceHr.mapping.mergeStatus")}>
            {(
              [
                { id: "all" as const, label: t("attendanceHr.mapping.mergeAll"), count: rows.length },
                { id: "mapped" as const, label: t("attendanceHr.mapping.mergeMapped"), count: mappedCount },
                { id: "unmapped" as const, label: t("attendanceHr.mapping.mergeUnmapped"), count: unmappedCount },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={cn("filter-chip", mergeFilter === chip.id && "filter-chip-active")}
                aria-pressed={mergeFilter === chip.id}
                onClick={() => setMergeFilter(chip.id)}
              >
                {chip.label} ({chip.count})
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("attendanceHr.mapping.showingSummary", {
            shown: rows.length,
            mapped: mappedCount,
            unmapped: unmappedCount,
          })}
        </p>
      </NeumorphicCard>

      <NeumorphicCard className="overflow-x-auto p-0">
        <CapabilityGate capability="attendance.map_users">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {t("attendanceHr.mapping.pendingCount", { count: pendingMaps.length })}
            </p>
            {renderSaveAllButton()}
          </div>
        </CapabilityGate>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2">{t("attendanceHr.mapping.userId")}</th>
              <th>{t("attendanceHr.mapping.nameOnDevice")}</th>
              <th>{t("attendanceHr.mapping.location")}</th>
              <th>{t("common.status")}</th>
              <th>{t("attendanceHr.mapping.employee")}</th>
              <th className="px-4 py-2">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  {t("common.loading")}
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  {mergeFilter === "mapped"
                    ? t("attendanceHr.mapping.emptyMapped")
                    : mergeFilter === "unmapped"
                      ? t("attendanceHr.mapping.emptyUnmapped")
                      : t("attendanceHr.mapping.empty")}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const id = row.id;
                const selectedStaff = staffByRow[id] ?? String(row.staff_id ?? "");
                const mapped = Boolean(row.staff_id);
                const busy = Boolean(busyIds[id]);
                const site = row.location_id ? siteById.get(row.location_id) : undefined;
                return (
                  <tr key={id} aria-busy={busy} className="border-t border-border/50">
                    <td className="px-4 py-2 font-mono">{String(row.biometric_user_id)}</td>
                    <td>
                      <div>{String(row.device_name ?? row.full_name ?? "—")}</div>
                      {row.previous_device_name &&
                      row.device_name &&
                      row.previous_device_name !== row.device_name ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("attendanceHr.mapping.deviceNameChanged", {
                            from: row.previous_device_name,
                            to: row.device_name,
                          })}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {site ? site.code : "—"}
                    </td>
                    <td>
                      <Badge variant={mapped ? "success" : "muted"}>
                        {mapped ? t("attendanceHr.mapping.mapped") : t("attendanceHr.mapping.unmapped")}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2">
                      <StaffSearchSelect
                        value={selectedStaff}
                        staff={staff}
                        disabled={busy}
                        onChange={(staffId) => applyStaffChoice(row, staffId)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <CapabilityGate capability="attendance.map_users">
                        <div className="flex flex-wrap items-center gap-2">
                          {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                          <Button
                            size="sm"
                            disabled={busy || !selectedStaff || selectedStaff === String(row.staff_id ?? "")}
                            onClick={() => mapMut.mutate({ mappingId: id, staffId: selectedStaff })}
                          >
                            {t("attendanceHr.mapping.saveMap")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !mapped}
                            onClick={() => unmapMut.mutate({ mappingId: id })}
                          >
                            {t("attendanceHr.mapping.unmap")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setRemoveTarget(row)}
                          >
                            {t("attendanceHr.mapping.removeName")}
                          </Button>
                        </div>
                      </CapabilityGate>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </NeumorphicCard>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && !removeMut.isPending && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attendanceHr.mapping.removeNameTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("attendanceHr.mapping.removeNameBody", {
                userId: removeTarget?.biometric_user_id ?? "",
                name: removeTarget?.device_name ?? removeTarget?.full_name ?? "—",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMut.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                const id = removeTarget?.id;
                if (id) removeMut.mutate({ mappingId: id });
              }}
            >
              {removeMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {removeMut.isPending ? t("common.saving") : t("attendanceHr.mapping.removeNameConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
