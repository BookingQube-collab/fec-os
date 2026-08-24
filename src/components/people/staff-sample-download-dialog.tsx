"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

export type SampleSiteOption = {
  id: string;
  code?: string | null;
  name?: string | null;
};

export function StaffSampleDownloadDialog({
  open,
  onOpenChange,
  title,
  description,
  locations,
  defaultLocationId,
  downloading,
  onConfirm,
  allowAll = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  locations: SampleSiteOption[];
  defaultLocationId?: string | null;
  downloading?: boolean;
  onConfirm: (locationId: string | null) => void | Promise<void>;
  allowAll?: boolean;
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<"all" | "one">(allowAll ? "all" : "one");
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");

  useEffect(() => {
    if (!open) return;
    setScope(allowAll ? "all" : "one");
    setLocationId(defaultLocationId ?? "");
  }, [open, allowAll, defaultLocationId]);

  const confirm = async () => {
    if (scope === "one" && !locationId) {
      toast.error(t("people.roster.sampleNeedLocation"));
      return;
    }
    await onConfirm(scope === "all" ? null : locationId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="staff-sample-scope">{t("people.roster.sampleScope")}</Label>
            <SearchableSelect
              id="staff-sample-scope"
              value={scope}
              onValueChange={(next) => setScope(next === "one" ? "one" : "all")}
              options={[
                ...(allowAll ? [{ value: "all", label: t("people.roster.sampleAll") }] : []),
                { value: "one", label: t("people.roster.sampleOne") },
              ]}
            />
          </div>
          {scope === "one" ? (
            <div className="space-y-1.5">
              <Label htmlFor="staff-sample-location">{t("people.roster.sampleLocation")}</Label>
              <SearchableSelect
                id="staff-sample-location"
                value={locationId}
                onValueChange={setLocationId}
                placeholder={t("people.roster.sampleSelectLocation")}
                emptyOption={{ value: "", label: t("people.roster.sampleSelectLocation") }}
                options={locations.map((site) => ({
                  value: site.id,
                  label: site.code ? `${site.code} — ${site.name ?? ""}`.trim() : site.name ?? site.id,
                  keywords: `${site.code ?? ""} ${site.name ?? ""}`,
                }))}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={downloading}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={downloading}>
            <Download className="h-4 w-4" />
            {downloading ? t("people.roster.sampleDownloading") : t("people.roster.downloadSample")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
