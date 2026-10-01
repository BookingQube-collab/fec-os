"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MobileListCard } from "@/components/layout/mobile-list-card";
import { ResponsiveDataView } from "@/components/layout/responsive-data-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
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
import { useStaff } from "@/hooks/queries/usePeople";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import {
  createTemporarySiteMove,
  deleteTemporarySiteMove,
  endTemporarySiteMove,
  listTemporarySiteMoves,
  updateTemporarySiteMove,
} from "@/lib/staff-temporary-moves.functions";
import type { TemporaryMovePhase, TemporarySiteMoveListRow } from "@/lib/staff-temporary-moves";

type Draft = {
  id?: string;
  staffId: string;
  toLocationId: string;
  startsOn: string;
  endsOn: string;
  note: string;
};

const emptyDraft = (): Draft => ({
  staffId: "",
  toLocationId: "",
  startsOn: "",
  endsOn: "",
  note: "",
});

function phaseVariant(phase: TemporaryMovePhase): "info" | "warning" | "muted" {
  if (phase === "active") return "info";
  if (phase === "scheduled") return "warning";
  return "muted";
}

export function TemporarySiteMovesPanel() {
  const { t } = useTranslation();
  const canEdit = usePermission("people.edit_roster");
  const qc = useQueryClient();
  const { data: staff = [] } = useStaff(null);
  const { data: sites = [] } = useSites();
  const moves = useQuery({
    queryKey: queryKeys.people.temporaryMoves(),
    queryFn: () => listTemporarySiteMoves(),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const homeId = useMemo(
    () => staff.find((row) => row.id === draft?.staffId)?.location_id ?? "",
    [staff, draft?.staffId],
  );
  const homeSite = sites.find((site) => site.id === homeId);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.temporaryMoves() });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "staff-directory"] });
  };

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      if (!value.staffId || !value.toLocationId || !value.startsOn || !value.endsOn) {
        throw new Error(t("people.temporaryMoves.required"));
      }
      if (value.startsOn > value.endsOn) {
        throw new Error(t("people.temporaryMoves.dateOrder"));
      }
      if (homeId && value.toLocationId === homeId) {
        throw new Error(t("people.temporaryMoves.sameSite"));
      }
      const payload = {
        staffId: value.staffId,
        toLocationId: value.toLocationId,
        startsOn: value.startsOn,
        endsOn: value.endsOn,
        note: value.note,
      };
      if (value.id) return updateTemporarySiteMove({ ...payload, id: value.id });
      return createTemporarySiteMove(payload);
    },
    onSuccess: () => {
      toast.success(t("people.temporaryMoves.saved"));
      setDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const endMove = useMutation({
    mutationFn: (id: string) => endTemporarySiteMove({ id }),
    onSuccess: (result) => {
      toast.success(result.removed ? t("people.temporaryMoves.removed") : t("people.temporaryMoves.ended"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTemporarySiteMove({ id }),
    onSuccess: () => {
      toast.success(t("people.temporaryMoves.removed"));
      setDeleteId(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = moves.data ?? [];
  const staffOptions = staff.map((row) => ({
    value: row.id,
    label: row.full_name,
    description: row.employee_code,
    keywords: `${row.full_name} ${row.employee_code}`,
  }));
  const siteOptions = sites
    .filter((site) => site.id !== homeId)
    .map((site) => ({
      value: site.id,
      label: formatLocationLabel(site.code, site.name),
      keywords: `${site.code} ${site.name}`,
    }));

  const openEdit = (row: TemporarySiteMoveListRow) => {
    setDraft({
      id: row.id,
      staffId: row.staff_id,
      toLocationId: row.to_location_id,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      note: row.note ?? "",
    });
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("people.temporaryMoves.title")}</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("people.temporaryMoves.subtitle")}</p>
        </div>
        {canEdit ? (
          <Button size="sm" className="shrink-0" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-3.5 w-3.5" />
            <span className="ms-1.5">{t("people.temporaryMoves.add")}</span>
          </Button>
        ) : null}
      </div>

      {moves.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("people.temporaryMoves.empty")}
        </div>
      ) : (
        <ResponsiveDataView
          mobile={
            <div className="space-y-2">
              {rows.map((row) => (
                <MobileListCard
                  key={row.id}
                  title={row.staff_name}
                  subtitle={[row.employee_code, row.home_label].filter(Boolean).join(" · ")}
                  meta={<Badge variant={phaseVariant(row.phase)}>{t(`people.temporaryMoves.phase.${row.phase}`)}</Badge>}
                >
                  <div className="space-y-2">
                    <div className="break-words">
                      <span className="text-muted-foreground">{t("people.temporaryMoves.temporarySite")}: </span>
                      {row.to_label}
                    </div>
                    <div className="tabular-nums">
                      {row.starts_on} – {row.ends_on}
                    </div>
                    {row.note ? <div className="break-words">{row.note}</div> : null}
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                          {t("common.edit")}
                        </Button>
                        {row.phase !== "ended" ? (
                          <Button size="sm" variant="secondary" onClick={() => endMove.mutate(row.id)}>
                            {t("people.temporaryMoves.end")}
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(row.id)}>
                          {t("common.delete")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </MobileListCard>
              ))}
            </div>
          }
          desktop={
            <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/95 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 text-left">{t("people.temporaryMoves.employee")}</th>
                    <th className="px-3 py-2.5 text-left">{t("people.temporaryMoves.home")}</th>
                    <th className="px-3 py-2.5 text-left">{t("people.temporaryMoves.temporarySite")}</th>
                    <th className="px-3 py-2.5 text-left">{t("people.temporaryMoves.dates")}</th>
                    <th className="px-3 py-2.5 text-left">{t("common.status")}</th>
                    {canEdit ? <th className="px-3 py-2.5 text-right">{t("people.actions")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{row.staff_name}</div>
                        {row.employee_code ? (
                          <div className="font-mono text-[11px] text-muted-foreground">{row.employee_code}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-sm">{row.home_label}</td>
                      <td className="px-3 py-2.5 text-sm">{row.to_label}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-sm tabular-nums">
                        {row.starts_on} – {row.ends_on}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={phaseVariant(row.phase)}>{t(`people.temporaryMoves.phase.${row.phase}`)}</Badge>
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="ms-1">{t("common.edit")}</span>
                            </Button>
                            {row.phase !== "ended" ? (
                              <Button size="sm" variant="ghost" onClick={() => endMove.mutate(row.id)}>
                                {t("people.temporaryMoves.end")}
                              </Button>
                            ) : null}
                            <Button size="sm" variant="ghost" onClick={() => setDeleteId(row.id)}>
                              {t("common.delete")}
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}

      <Dialog open={draft != null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? t("people.temporaryMoves.edit") : t("people.temporaryMoves.add")}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div>
                <Label>{t("people.temporaryMoves.employee")}</Label>
                <SearchableSelect
                  value={draft.staffId}
                  onValueChange={(staffId) => setDraft({ ...draft, staffId, toLocationId: "" })}
                  options={staffOptions}
                  placeholder={t("people.temporaryMoves.selectEmployee")}
                  emptyOption={{ value: "", label: t("people.temporaryMoves.selectEmployee") }}
                />
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">{t("people.staff.homeLocation")}</div>
                <div className="text-sm font-medium">
                  {homeSite ? formatLocationLabel(homeSite.code, homeSite.name) : "—"}
                </div>
              </div>
              <div>
                <Label>{t("people.temporaryMoves.temporarySite")}</Label>
                <SearchableSelect
                  value={draft.toLocationId}
                  onValueChange={(toLocationId) => setDraft({ ...draft, toLocationId })}
                  options={siteOptions}
                  placeholder={t("people.temporaryMoves.selectSite")}
                  emptyOption={{ value: "", label: t("people.temporaryMoves.selectSite") }}
                  disabled={!draft.staffId}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("people.temporaryMoves.starts")}</Label>
                  <Input
                    type="date"
                    value={draft.startsOn}
                    onChange={(event) => setDraft({ ...draft, startsOn: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>{t("people.temporaryMoves.ends")}</Label>
                  <Input
                    type="date"
                    value={draft.endsOn}
                    onChange={(event) => setDraft({ ...draft, endsOn: event.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>{t("people.temporaryMoves.note")}</Label>
                <Textarea
                  value={draft.note}
                  onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                  rows={3}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => draft && save.mutate(draft)} disabled={save.isPending || !draft}>
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("people.temporaryMoves.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("people.temporaryMoves.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove.mutate(deleteId)}
              disabled={remove.isPending}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
