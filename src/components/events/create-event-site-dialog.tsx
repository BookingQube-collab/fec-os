"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createLocationMaster, suggestLocationCode } from "@/lib/locations.functions";

type CreatedSite = {
  id: string;
  code: string;
  name: string;
};

export function CreateEventSiteDialog({
  open,
  onOpenChange,
  canCreate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCreate: boolean;
  onCreated: (site: CreatedSite) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCode("");
    setCodeTouched(false);
    setActive(true);
  }, [open]);

  useEffect(() => {
    if (!open || codeTouched) return;
    setCode(name.trim() ? suggestLocationCode(name) : "");
  }, [name, codeTouched, open]);

  const create = useMutation({
    mutationFn: () =>
      createLocationMaster({
        name: name.trim(),
        code: code.trim() || null,
        active,
        kind: "branch",
      }),
    onSuccess: (row) => {
      toast.success(t("events.builder.siteCreated", { name: row.name }));
      onCreated({ id: row.id, code: row.code, name: row.name });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("events.builder.siteCreateFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("events.builder.addSiteTitle")}</DialogTitle>
          <DialogDescription>
            {canCreate ? t("events.builder.addSiteHint") : t("events.builder.addSiteNoPermission")}
          </DialogDescription>
        </DialogHeader>

        {canCreate ? (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="event-site-name">{t("events.builder.siteName")}</Label>
              <Input
                id="event-site-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("events.builder.siteNamePlaceholder")}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-site-code">{t("events.builder.siteCode")}</Label>
              <Input
                id="event-site-code"
                value={code}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(e.target.value.toUpperCase());
                }}
                placeholder={t("events.builder.siteCodePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("events.builder.siteCodeHint")}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="event-site-active">{t("events.builder.siteActive")}</Label>
                <p className="text-xs text-muted-foreground">{t("events.builder.siteActiveHint")}</p>
              </div>
              <Switch id="event-site-active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/locations" className="font-medium text-foreground underline-offset-2 hover:underline">
              {t("events.builder.openLocationMaster")}
            </Link>
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={create.isPending} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          {canCreate ? (
            <Button
              type="button"
              disabled={create.isPending || !name.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t("common.saving") : t("events.builder.createSite")}
            </Button>
          ) : (
            <Button type="button" asChild>
              <Link href="/admin/locations">{t("events.builder.openLocationMaster")}</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
