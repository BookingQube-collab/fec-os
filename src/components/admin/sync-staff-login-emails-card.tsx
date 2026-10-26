"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applyStaffLoginEmailSync,
  previewStaffLoginEmailSync,
} from "@/lib/admin.functions";
import { STAFF_LOGIN_EMAIL_SYNC_CONFIRMATION } from "@/lib/staff-login-email-sync";

export function SyncStaffLoginEmailsCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [previewWouldUpdate, setPreviewWouldUpdate] = useState<number | null>(null);
  const confirmed = phrase.trim() === STAFF_LOGIN_EMAIL_SYNC_CONFIRMATION;

  const previewMut = useMutation({
    mutationFn: async () => {
      const result = await previewStaffLoginEmailSync();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (result) => {
      setPreviewWouldUpdate(result.counts.update_auth);
      setOpen(true);
      if (result.counts.conflict_taken > 0) {
        toast.warning(
          t("adminLoginEmailSync.conflicts", { count: result.counts.conflict_taken }),
        );
      }
    },
    onError: (e: Error) => toast.error(e.message || t("adminLoginEmailSync.failed")),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const result = await applyStaffLoginEmailSync({ confirmation: phrase.trim() });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (result) => {
      toast.success(
        t("adminLoginEmailSync.success", {
          updated: result.counts.update_auth,
          matched: result.counts.skip_already_matched,
          conflicts: result.counts.conflict_taken,
          failed: result.counts.failed,
        }),
      );
      if (result.failures.length) {
        toast.warning(
          t("adminLoginEmailSync.partialFailures", { count: result.failures.length }),
        );
      }
      setOpen(false);
      setPhrase("");
      setPreviewWouldUpdate(null);
    },
    onError: (e: Error) => toast.error(e.message || t("adminLoginEmailSync.failed")),
  });

  const close = () => {
    if (applyMut.isPending) return;
    setOpen(false);
    setPhrase("");
  };

  const busy = previewMut.isPending || applyMut.isPending;

  return (
    <>
      <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="icon-well">
              <Mail className="h-4 w-4 stroke-[1.5]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{t("adminLoginEmailSync.title")}</p>
              <p className="text-xs text-muted-foreground">{t("adminLoginEmailSync.cardBody")}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => previewMut.mutate()}
          >
            {previewMut.isPending ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : null}
            {t("adminLoginEmailSync.open")}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
          else setOpen(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminLoginEmailSync.dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>{t("adminLoginEmailSync.explain")}</p>
                <p>
                  {t("adminLoginEmailSync.previewCount", {
                    count: previewWouldUpdate ?? 0,
                  })}
                </p>
                <p>{t("adminLoginEmailSync.prerequisite")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="login-email-sync-confirm">
              {t("adminLoginEmailSync.typeLabel", { phrase: STAFF_LOGIN_EMAIL_SYNC_CONFIRMATION })}
            </Label>
            <Input
              id="login-email-sync-confirm"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              disabled={applyMut.isPending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMut.isPending} onClick={close}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={!confirmed || applyMut.isPending}
              onClick={() => applyMut.mutate()}
            >
              {applyMut.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t("adminLoginEmailSync.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
