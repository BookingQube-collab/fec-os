"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, MoreHorizontal, RotateCcw, Undo2, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PrApproveDialog, PrCommentDialog } from "@/components/procurement/pr-action-dialogs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { actOnPurchaseRequisition } from "@/lib/procurement.functions";
import { queryKeys } from "@/lib/query-keys";

export type PrActionKind = "approve" | "reject" | "return";

export type PrActionTarget = {
  id: string;
  prNumber: string;
  title: string;
  amount: number;
  requester: string;
  department: string;
  canAct?: boolean;
  canReissue?: boolean;
  isOwner?: boolean;
  overBudget?: boolean;
  excessAmount?: number;
  budgetIncreasePending?: boolean;
  currentStepRole?: string | null;
};

const EMPTY_SUMMARY = {
  prNumber: "",
  title: "",
  amount: 0,
  requester: "",
  department: "",
};

export function usePrActions(options?: {
  onReissued?: (id: string, isOwner: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lastTarget = useRef<PrActionTarget | null>(null);
  const [dialog, setDialog] = useState<{ kind: PrActionKind; target: PrActionTarget } | null>(null);

  const act = useMutation({
    mutationFn: (vars: {
      id: string;
      action: "approve" | "reject" | "return" | "hold" | "resume" | "cancel" | "reissue";
      comments?: string | null;
    }) => actOnPurchaseRequisition(vars),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.procurement.all });
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      setDialog(null);
      if (vars.action === "reissue") {
        toast.success(t("procurement.detail.reissued"));
        options?.onReissued?.(vars.id, lastTarget.current?.isOwner ?? false);
        return;
      }
      toast.success(t(`procurement.detail.toast.${vars.action}`));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const summary = dialog
    ? {
        prNumber: dialog.target.prNumber,
        title: dialog.target.title,
        amount: dialog.target.amount,
        requester: dialog.target.requester,
        department: dialog.target.department,
      }
    : EMPTY_SUMMARY;

  return {
    pending: act.isPending,
    open: (kind: PrActionKind, target: PrActionTarget) => setDialog({ kind, target }),
    reissue: (target: PrActionTarget) => {
      lastTarget.current = target;
      act.mutate({ id: target.id, action: "reissue" });
    },
    cancel: (target: PrActionTarget, comments: string) => {
      act.mutate({ id: target.id, action: "cancel", comments });
    },
    dialogs: (
      <>
        <PrApproveDialog
          open={dialog?.kind === "approve"}
          onOpenChange={(open) => setDialog(open && dialog ? dialog : null)}
          summary={summary}
          pending={act.isPending}
          overBudget={dialog?.target.overBudget}
          excessAmount={dialog?.target.excessAmount}
          budgetIncreasePending={dialog?.target.budgetIncreasePending}
          currentStepRole={dialog?.target.currentStepRole}
          onConfirm={() => dialog && act.mutate({ id: dialog.target.id, action: "approve" })}
        />
        <PrCommentDialog
          open={dialog?.kind === "reject"}
          onOpenChange={(open) => setDialog(open && dialog ? dialog : null)}
          title={t("procurement.detail.confirmRejectTitle")}
          description={t("procurement.detail.confirmRejectBody")}
          confirmLabel={t("procurement.detail.confirmReject")}
          pending={act.isPending}
          destructive
          onConfirm={(comments) => dialog && act.mutate({ id: dialog.target.id, action: "reject", comments })}
        />
        <PrCommentDialog
          open={dialog?.kind === "return"}
          onOpenChange={(open) => setDialog(open && dialog ? dialog : null)}
          title={t("procurement.detail.confirmReturnTitle")}
          description={t("procurement.detail.confirmReturnBody")}
          confirmLabel={t("procurement.detail.confirmReturn")}
          pending={act.isPending}
          onConfirm={(comments) => dialog && act.mutate({ id: dialog.target.id, action: "return", comments })}
        />
      </>
    ),
  };
}

export function PrRowActions({
  href,
  reviseHref,
  canAct,
  canEdit,
  canReissue,
  pending,
  onApprove,
  onReject,
  onReturn,
  onReissue,
  extraMenu,
  compact,
}: {
  href: string;
  reviseHref?: string;
  canAct?: boolean;
  canEdit?: boolean;
  canReissue?: boolean;
  pending?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onReturn?: () => void;
  onReissue?: () => void;
  extraMenu?: ReactNode;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const showMenu = Boolean(canAct || canEdit || canReissue || extraMenu);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button size="sm" variant="outline" asChild>
        <Link href={href}>
          <Eye />
          {t("procurement.list.view")}
        </Link>
      </Button>
      {canAct ? (
        <>
          <Button
            size="sm"
            className="bg-emerald-700 text-white hover:bg-emerald-800"
            disabled={pending}
            onClick={onApprove}
          >
            {!compact ? <Check /> : null}
            {t("procurement.detail.approve")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={onReject}>
            {!compact ? <X /> : null}
            {t("procurement.detail.reject")}
          </Button>
        </>
      ) : null}
      {canEdit && reviseHref ? (
        <Button size="sm" asChild>
          <Link href={reviseHref}>{t("procurement.detail.revise")}</Link>
        </Button>
      ) : null}
      {canReissue && !canAct ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={onReissue}>
          <RotateCcw />
          {t("procurement.detail.reissue")}
        </Button>
      ) : null}
      {showMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t("procurement.list.actions")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={href}>
                <Eye />
                {t("procurement.list.open")}
              </Link>
            </DropdownMenuItem>
            {canAct ? (
              <>
                <DropdownMenuItem disabled={pending} onClick={onApprove}>
                  <Check />
                  {t("procurement.detail.approve")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={pending} onClick={onReject}>
                  <X />
                  {t("procurement.detail.reject")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={pending} onClick={onReturn}>
                  <Undo2 />
                  {t("procurement.list.sendBack")}
                </DropdownMenuItem>
              </>
            ) : null}
            {canEdit && reviseHref ? (
              <DropdownMenuItem asChild>
                <Link href={reviseHref}>{t("procurement.detail.revise")}</Link>
              </DropdownMenuItem>
            ) : null}
            {canReissue ? (
              <DropdownMenuItem disabled={pending} onClick={onReissue}>
                <RotateCcw />
                {t("procurement.detail.reissue")}
              </DropdownMenuItem>
            ) : null}
            {extraMenu ? (
              <>
                <DropdownMenuSeparator />
                {extraMenu}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
