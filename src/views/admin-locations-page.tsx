"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import {
  FecButton as Button,
  FecLoader,
  FecModal as Dialog,
  FecModalContent as DialogContent,
  FecModalFooter as DialogFooter,
  FecModalHeader as DialogHeader,
  FecModalTitle as DialogTitle,
  FecPageHeader,
} from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermission } from "@/hooks/use-permission";
import {
  listLocationMaster,
  setLocationActive,
  updateLocationMaster,
  type LocationMasterRow,
} from "@/lib/locations.functions";
import { isOperationalLocationStatus } from "@/lib/locations/status";
import { queryKeys } from "@/lib/query-keys";

function Forbidden() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {t("locationMaster.forbidden")}
    </div>
  );
}

function statusVariant(status: string): "success" | "warning" | "info" | "muted" {
  if (status === "active") return "success";
  if (status === "maintenance") return "warning";
  if (status === "pre_launch") return "info";
  return "muted";
}

function statusLabel(t: (key: string) => string, status: string) {
  if (status === "active") return t("locationMaster.active");
  if (status === "closed") return t("locationMaster.inactive");
  if (status === "maintenance") return t("locationMaster.maintenance");
  if (status === "pre_launch") return t("locationMaster.preLaunch");
  return status;
}

type Draft = {
  id: string;
  code: string;
  name: string;
  city: string;
  region: string;
  country: string;
  timezone: string;
  launchedOn: string;
  glaSqm: string;
  active: boolean;
};

function draftFromRow(row: LocationMasterRow): Draft {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    city: row.city,
    region: row.region ?? "",
    country: row.country,
    timezone: row.timezone,
    launchedOn: row.launched_on ?? "",
    glaSqm: row.gla_sqm == null ? "" : String(row.gla_sqm),
    active: isOperationalLocationStatus(row.status),
  };
}

export default function AdminLocationsPage() {
  return (
    <CapabilityGate capability="admin.view" fallback={<Forbidden />}>
      <LocationMasterView />
    </CapabilityGate>
  );
}

function LocationMasterView() {
  const { t } = useTranslation();
  const canEdit = usePermission("branches.edit");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const locations = useQuery({
    queryKey: queryKeys.sites.master(),
    queryFn: () => listLocationMaster(),
  });

  const refreshSites = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.sites.all });
  };

  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => setLocationActive(input),
    onMutate: async (input) => {
      setPendingId(input.id);
      await qc.cancelQueries({ queryKey: queryKeys.sites.master() });
      const previous = qc.getQueryData<LocationMasterRow[]>(queryKeys.sites.master());
      qc.setQueryData<LocationMasterRow[]>(queryKeys.sites.master(), (rows) =>
        rows?.map((row) =>
          row.id === input.id ? { ...row, status: input.active ? "active" : "closed" } : row,
        ),
      );
      return { previous };
    },
    onSuccess: async (_row, input) => {
      toast.success(input.active ? t("locationMaster.activated") : t("locationMaster.deactivated"));
      await refreshSites();
    },
    onError: (error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.sites.master(), context.previous);
      toast.error(error instanceof Error ? error.message : t("locationMaster.saveFailed"));
    },
    onSettled: () => setPendingId(null),
  });

  const save = useMutation({
    mutationFn: (input: Draft) => {
      const gla = input.glaSqm.trim();
      const glaSqm = gla === "" ? null : Number(gla);
      if (glaSqm != null && !Number.isFinite(glaSqm)) {
        throw new Error(t("locationMaster.glaInvalid"));
      }
      return updateLocationMaster({
        id: input.id,
        code: input.code,
        name: input.name,
        city: input.city,
        region: input.region,
        country: input.country,
        timezone: input.timezone,
        launchedOn: input.launchedOn.trim() ? input.launchedOn : null,
        glaSqm,
        active: input.active,
      });
    },
    onSuccess: async () => {
      toast.success(t("locationMaster.saved"));
      setDraft(null);
      await refreshSites();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("locationMaster.saveFailed")),
  });

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = locations.data ?? [];
    if (!needle) return list;
    return list.filter((row) =>
      [row.code, row.name, row.city, row.region, row.country].some((value) =>
        (value ?? "").toLowerCase().includes(needle),
      ),
    );
  }, [locations.data, query]);

  return (
    <div className="space-y-5">
      <FecPageHeader
        icon={Building2}
        kicker={t("locationMaster.kicker")}
        title={t("locationMaster.title")}
        subtitle={t("locationMaster.subtitle")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("locationMaster.search")}
          aria-label={t("locationMaster.search")}
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          {t("locationMaster.count", { count: rows.length })}
        </p>
      </div>

      {locations.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : locations.isError ? (
        <p className="text-sm text-destructive">
          {locations.error instanceof Error ? locations.error.message : t("locationMaster.loadFailed")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("locationMaster.code")}</TableHead>
                <TableHead>{t("locationMaster.name")}</TableHead>
                <TableHead>{t("locationMaster.city")}</TableHead>
                <TableHead>{t("locationMaster.region")}</TableHead>
                <TableHead>{t("locationMaster.status")}</TableHead>
                <TableHead>{t("locationMaster.activeOnSite")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t("locationMaster.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const operational = isOperationalLocationStatus(row.status);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.city}</TableCell>
                      <TableCell>{row.region || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>{statusLabel(t, row.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={operational}
                          disabled={!canEdit || pendingId === row.id || toggle.isPending}
                          aria-label={t("locationMaster.toggle", { code: row.code })}
                          onCheckedChange={(active) => toggle.mutate({ id: row.id, active })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={!canEdit}
                          aria-label={t("locationMaster.edit", { code: row.code })}
                          onClick={() => setDraft(draftFromRow(row))}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={draft != null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("locationMaster.editTitle")}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="loc-code">{t("locationMaster.code")}</Label>
                <Input
                  id="loc-code"
                  value={draft.code}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-name">{t("locationMaster.name")}</Label>
                <Input
                  id="loc-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-city">{t("locationMaster.city")}</Label>
                <Input
                  id="loc-city"
                  value={draft.city}
                  onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-region">{t("locationMaster.region")}</Label>
                <Input
                  id="loc-region"
                  value={draft.region}
                  onChange={(event) => setDraft({ ...draft, region: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-country">{t("locationMaster.country")}</Label>
                <Input
                  id="loc-country"
                  value={draft.country}
                  onChange={(event) => setDraft({ ...draft, country: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-tz">{t("locationMaster.timezone")}</Label>
                <Input
                  id="loc-tz"
                  value={draft.timezone}
                  onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-launched">{t("locationMaster.launchedOn")}</Label>
                <Input
                  id="loc-launched"
                  type="date"
                  value={draft.launchedOn}
                  onChange={(event) => setDraft({ ...draft, launchedOn: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-gla">{t("locationMaster.gla")}</Label>
                <Input
                  id="loc-gla"
                  inputMode="decimal"
                  value={draft.glaSqm}
                  onChange={(event) => setDraft({ ...draft, glaSqm: event.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">{t("locationMaster.activeOnSite")}</p>
                  <p className="text-xs text-muted-foreground">{t("locationMaster.activeHint")}</p>
                </div>
                <Switch
                  checked={draft.active}
                  aria-label={t("locationMaster.activeOnSite")}
                  onCheckedChange={(active) => setDraft({ ...draft, active })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!draft || save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
