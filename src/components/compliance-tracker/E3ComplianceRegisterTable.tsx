"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { ComplianceTable } from "@/components/compliance-tracker/ComplianceTable";
import { E3ComplianceItemFormDialog } from "@/components/compliance-tracker/E3ComplianceItemFormDialog";
import { E3MasterRegisterActions } from "@/components/compliance-tracker/E3MasterRegisterActions";
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
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { deleteE3ComplianceItem } from "@/lib/e3-compliance.functions";
import type { E3ComplianceItemRow } from "@/lib/compliance-tracker/constants";
import { queryKeys } from "@/lib/query-keys";

type E3ComplianceRegisterTableProps = {
  rows: E3ComplianceItemRow[];
  emptyMessage?: string;
  searchKeys?: (keyof E3ComplianceItemRow)[];
  showBulkActions?: boolean;
};

export function E3ComplianceRegisterTable({
  rows,
  emptyMessage,
  searchKeys,
  showBulkActions = false,
}: E3ComplianceRegisterTableProps) {
  const { t } = useTranslation();
  const canEdit = usePermission("compliance.edit_e3_tracker");
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<E3ComplianceItemRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<E3ComplianceItemRow | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.e3ComplianceTracker.all });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteE3ComplianceItem({ id }),
    onSuccess: () => {
      toast.success(t("e3Tracker.deleteSuccess"));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: E3ComplianceItemRow) {
    setEditing(row);
    setFormOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        {showBulkActions ? <E3MasterRegisterActions /> : null}
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            className="bg-[#0B1F3A] hover:bg-[#152a4a]"
            onClick={openCreate}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("e3Tracker.addItem")}
          </Button>
        ) : null}
      </div>

      <ComplianceTable
        rows={rows}
        emptyMessage={emptyMessage}
        searchKeys={searchKeys}
        editable={canEdit}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
      />

      <E3ComplianceItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          invalidate();
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("e3Tracker.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("e3Tracker.deleteDescription", { id: deleteTarget?.id ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
