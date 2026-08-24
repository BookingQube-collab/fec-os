"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useLocationAreas } from "@/hooks/queries/useLocationAreas";
import { createLocationArea, updateLocationArea } from "@/lib/location-areas.functions";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SiteOption = { id: string; code: string; name: string };

export function ManageLocationAreasDialog({
  sites,
  defaultLocationId,
  trigger,
}: {
  sites: SiteOption[];
  defaultLocationId?: string;
  trigger?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocationId || sites[0]?.id || "");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  useEffect(() => {
    if (defaultLocationId) setLocationId(defaultLocationId);
  }, [defaultLocationId]);

  const { data: areas = [], isLoading } = useLocationAreas(locationId || null, {
    enabled: open && !!locationId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.locationAreas.all });
  };

  const createMut = useMutation({
    mutationFn: () =>
      createLocationArea({
        location_id: locationId,
        name: newName.trim(),
        code: newCode.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("locationAreas.added"));
      setNewName("");
      setNewCode("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: {
      id: string;
      name?: string;
      code?: string | null;
      is_active?: boolean;
      sortOrder?: number;
    }) => updateLocationArea(payload),
    onSuccess: () => {
      toast.success(t("locationAreas.updated"));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="outline">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            {t("locationAreas.manage")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("locationAreas.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("locationAreas.hint")}</p>

          <div>
            <Label className="text-xs">{t("locationAreas.branch")}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder={t("locationAreas.selectBranch")} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <div className="space-y-2">
              <Label className="text-xs">{t("locationAreas.newArea")}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("locationAreas.namePlaceholder")}
                disabled={!locationId}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("locationAreas.code")}</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder={t("locationAreas.codeOptional")}
                className="w-24"
                disabled={!locationId}
              />
            </div>
            <Button
              type="button"
              size="icon"
              aria-label={t("locationAreas.newArea")}
              onClick={() => createMut.mutate()}
              disabled={!locationId || !newName.trim() || createMut.isPending}
            >
              <Plus />
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">{t("locationAreas.name")}</th>
                  <th className="px-3 py-2 text-left">{t("locationAreas.code")}</th>
                  <th className="px-3 py-2 text-center">{t("locationAreas.active")}</th>
                </tr>
              </thead>
              <tbody>
                {!locationId ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("locationAreas.selectBranch")}
                    </td>
                  </tr>
                ) : isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("locationAreas.loading")}
                    </td>
                  </tr>
                ) : !areas.length ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("locationAreas.empty")}
                    </td>
                  </tr>
                ) : (
                  [...areas]
                    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
                    .map((a) => (
                      <tr key={a.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <Input
                            defaultValue={a.name}
                            className="h-8"
                            onBlur={(e) => {
                              const name = e.target.value.trim();
                              if (name && name !== a.name) updateMut.mutate({ id: a.id, name });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            defaultValue={a.code ?? ""}
                            className="h-8 w-24"
                            onBlur={(e) => {
                              const code = e.target.value.trim().toUpperCase() || null;
                              if (code !== (a.code ?? null)) updateMut.mutate({ id: a.id, code });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Checkbox
                            checked={a.is_active}
                            onCheckedChange={(v) => updateMut.mutate({ id: a.id, is_active: !!v })}
                          />
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
