"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Flag, Plus, Settings2, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DepartmentMasterPanel } from "@/components/people/manage-departments-dialog";
import {
  FecButton as Button,
  FecLoader,
  FecModal as Dialog,
  FecModalContent as DialogContent,
  FecModalFooter as DialogFooter,
  FecModalHeader as DialogHeader,
  FecModalTitle as DialogTitle,
  FecModalTrigger as DialogTrigger,
} from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePeopleMasters } from "@/hooks/queries/useDepartments";
import {
  createPeopleMaster,
  deletePeopleMaster,
  renamePeopleMaster,
} from "@/lib/people.functions";
import type { PeopleMasterKind, PeopleMasterRow } from "@/lib/people-masters";
import type { DepartmentAudience } from "@/lib/department-audience";
import { queryKeys } from "@/lib/query-keys";

const KINDS: PeopleMasterKind[] = ["position", "gender", "nationality"];

export function ManagePeopleMastersDialog({
  trigger,
  audience,
}: {
  trigger?: React.ReactNode;
  /** When set, the department tab only edits that office. */
  audience?: DepartmentAudience;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="ghost">
            <Settings2 className="mr-1 h-3 w-3" />
            {t("people.masters.manage")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("people.masters.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("people.masters.hint")}</p>
        <Tabs defaultValue="department">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="department"><Building2 aria-hidden />{t("people.masters.department")}</TabsTrigger>
            {KINDS.map((kind) => {
              const Icon = kind === "position" ? Users : kind === "gender" ? UserRound : Flag;
              return (
              <TabsTrigger key={kind} value={kind}>
                <Icon aria-hidden />
                {t(`people.masters.${kind}`)}
              </TabsTrigger>
              );
            })}
          </TabsList>
          <TabsContent value="department" className="mt-3">
            <DepartmentMasterPanel audience={audience} active={open} />
          </TabsContent>
          {KINDS.map((kind) => (
            <TabsContent key={kind} value={kind} className="mt-3">
              <MasterNameList kind={kind} active={open} />
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MasterNameList({ kind, active }: { kind: PeopleMasterKind; active: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const masters = usePeopleMasters({ enabled: active });
  const rows = masters.data?.[kind === "position" ? "positions" : kind === "gender" ? "genders" : "nationalities"] ?? [];
  const [draft, setDraft] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.masters() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.jobTitles() });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "staff-directory"] });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "staff"] });
  };

  const createMut = useMutation({
    mutationFn: () => createPeopleMaster({ kind, name: draft.trim() }),
    onSuccess: () => {
      toast.success(t("people.masters.added"));
      setDraft("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const renameMut = useMutation({
    mutationFn: (payload: { id: string; name: string; previousName: string }) =>
      renamePeopleMaster({ kind, ...payload }),
    onSuccess: () => {
      toast.success(t("people.masters.renamed"));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePeopleMaster({ kind, id }),
    onSuccess: () => {
      toast.success(t("people.masters.deleted"));
      setPendingDeleteId(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`master-${kind}-new`}>
            {t("people.masters.newName")}
          </label>
          <Input
            id={`master-${kind}-new`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t(`people.masters.${kind}Placeholder`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                e.preventDefault();
                createMut.mutate();
              }
            }}
          />
        </div>
        <Button
          type="button"
          size="icon"
          aria-label={t("people.masters.add")}
          disabled={!draft.trim() || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          <Plus />
        </Button>
      </div>
      <div className="max-h-80 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{t("people.masters.name")}</th>
              <th className="px-3 py-2 text-end">{t("people.departments.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {masters.isLoading ? (
              <tr>
                <td colSpan={2} className="px-3 py-4 text-center">
                  <FecLoader size="sm" label={t("common.loading")} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">
                  {t("people.masters.empty")}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <MasterNameRow
                  key={`${row.id}-${row.name}`}
                  row={row}
                  pendingDelete={pendingDeleteId === row.id}
                  deletePending={deleteMut.isPending}
                  onRename={(name) => renameMut.mutate({ id: row.id, name, previousName: row.name })}
                  onAskDelete={() => {
                    if (row.usageCount > 0) {
                      toast.error(t("people.masters.deleteBlocked", { name: row.name, count: row.usageCount }));
                      return;
                    }
                    setPendingDeleteId(row.id);
                  }}
                  onConfirmDelete={() => deleteMut.mutate(row.id)}
                  onCancelDelete={() => setPendingDeleteId(null)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MasterNameRow({
  row,
  pendingDelete,
  deletePending,
  onRename,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  row: PeopleMasterRow;
  pendingDelete: boolean;
  deletePending: boolean;
  onRename: (name: string) => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">
        <Input
          key={`${row.id}-${row.name}`}
          defaultValue={row.name}
          className="h-8"
          aria-label={t("people.masters.name")}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== row.name) onRename(name);
          }}
        />
        {row.usageCount > 0 ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t("people.masters.usedBy", { count: row.usageCount })}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-2 text-end">
        {pendingDelete ? (
          <div className="flex justify-end gap-1">
            <Button type="button" size="sm" variant="destructive" disabled={deletePending} onClick={onConfirmDelete}>
              {t("people.masters.confirmDelete")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancelDelete}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={onAskDelete}>
            {t("people.departments.delete")}
          </Button>
        )}
      </td>
    </tr>
  );
}
