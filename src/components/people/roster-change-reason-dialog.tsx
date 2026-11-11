"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { Textarea } from "@/components/ui/textarea";
import { ROSTER_CHANGE_REASON_MIN } from "@/lib/attendance-hr/roster-audit";

export type RosterChangeReasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => void;
};

export function RosterChangeReasonDialog({
  open,
  onOpenChange,
  pending = false,
  title,
  description,
  confirmLabel,
  onConfirm,
}: RosterChangeReasonDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < ROSTER_CHANGE_REASON_MIN;

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? t("people.roster.changeReasonTitle")}</DialogTitle>
          <DialogDescription>
            {description ?? t("people.roster.changeReasonHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="roster-change-reason">{t("people.roster.changeReasonLabel")}</Label>
          <Textarea
            id="roster-change-reason"
            rows={3}
            value={reason}
            maxLength={500}
            disabled={pending}
            placeholder={t("people.roster.changeReasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
          {tooShort ? (
            <p className="text-xs text-destructive">{t("people.roster.changeReasonTooShort")}</p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending || trimmed.length < ROSTER_CHANGE_REASON_MIN}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmLabel ?? t("people.roster.changeReasonConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
