"use client";

import { Check, CircleAlert } from "lucide-react";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { fmtNumber } from "@/lib/currency";

type Summary = {
  prNumber: string;
  title: string;
  amount: number;
  requester: string;
  department: string;
};

export function PrApproveDialog({
  open,
  onOpenChange,
  summary,
  pending,
  onConfirm,
  overBudget,
  excessAmount,
  budgetIncreasePending,
  currentStepRole,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: Summary;
  pending: boolean;
  onConfirm: () => void;
  overBudget?: boolean;
  excessAmount?: number;
  budgetIncreasePending?: boolean;
  currentStepRole?: string | null;
}) {
  const { t } = useTranslation();
  const excess = Number(excessAmount || 0);
  const requestExcess = Boolean(overBudget && !budgetIncreasePending && currentStepRole === "dept_head");
  const approveIncrease = Boolean(
    overBudget && (budgetIncreasePending || currentStepRole === "gm" || currentStepRole === "ceo"),
  );
  const title = approveIncrease
    ? t("procurement.detail.confirmBudgetIncreaseTitle")
    : requestExcess
      ? t("procurement.detail.confirmExcessTitle")
      : t("procurement.detail.confirmApproveTitle");
  const body = approveIncrease
    ? t("procurement.detail.confirmBudgetIncreaseBody", { amount: fmtNumber(excess) })
    : requestExcess
      ? t("procurement.detail.confirmExcessBody", { amount: fmtNumber(excess) })
      : t("procurement.detail.confirmApproveBody");
  const confirm = approveIncrease
    ? t("procurement.detail.approveBudgetIncrease", { amount: fmtNumber(excess) })
    : requestExcess
      ? t("procurement.detail.approveAndRequestExcess", { amount: fmtNumber(excess) })
      : t("procurement.detail.confirmApprove");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="flex-row items-start gap-3 space-y-0">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">
            <Check className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1 font-medium text-muted-foreground">
              {summary.prNumber}
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="rounded-2xl bg-muted/70 px-4 py-3 text-sm">
          <Row label={t("procurement.detail.confirmTitle")} value={summary.title} />
          <Row label={t("procurement.detail.confirmAmount")} value={`${fmtNumber(summary.amount)} QAR`} />
          <Row
            label={t("procurement.list.requester")}
            value={`${summary.requester}${summary.department ? ` (${summary.department})` : ""}`}
          />
        </div>
        {overBudget ? (
          <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50">
            {t("procurement.detail.overBudgetBanner", { amount: fmtNumber(excess) })}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">{body}</p>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending}
            className="bg-emerald-800 text-white hover:bg-emerald-900"
            onClick={onConfirm}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PrCommentDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  destructive?: boolean;
  onConfirm: (comments: string) => void;
}) {
  const { t } = useTranslation();
  const [comments, setComments] = useState("");
  const tooShort = comments.trim().length < 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setComments("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="flex-row items-start gap-3 space-y-0">
          <span
            className={
              destructive
                ? "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-100 text-red-700"
                : "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800"
            }
          >
            <CircleAlert className="h-5 w-5" />
          </span>
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1">{description}</DialogDescription>
          </div>
        </DialogHeader>
        <Textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={4}
          placeholder={t("procurement.detail.reasonPlaceholder")}
        />
        {tooShort && comments.trim().length > 0 ? (
          <p className="text-xs text-destructive">{t("procurement.detail.commentsRequired")}</p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending || tooShort}
            onClick={() => onConfirm(comments.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[16rem] truncate text-end font-semibold text-foreground">{value || "—"}</span>
    </div>
  );
}
