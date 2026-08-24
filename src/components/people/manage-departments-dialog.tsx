"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  createMasterDepartment,
  listDepartmentBudgets,
  updateMasterDepartment,
  upsertDepartmentBudget,
} from "@/lib/people.functions";
import { departmentBudgetYear } from "@/lib/procurement/department-budget";
import { sortDepartmentsTree } from "@/lib/departments";
import { useMasterDepartments } from "@/hooks/queries/useDepartments";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

export function ManageDepartmentsDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: departments = [], isLoading } = useMasterDepartments();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newParentId, setNewParentId] = useState<string>(NONE);
  const year = departmentBudgetYear();
  const budgetsQuery = useQuery({
    queryKey: [...queryKeys.people.departments(), "budgets", year],
    queryFn: () => listDepartmentBudgets({ year }),
    enabled: open,
  });

  const tree = useMemo(() => sortDepartmentsTree(departments), [departments]);
  const budgetByDept = useMemo(
    () => new Map((budgetsQuery.data ?? []).map((row) => [row.department_id, row.amount])),
    [budgetsQuery.data],
  );
  const parents = useMemo(
    () => departments.filter((d) => d.active && !d.parent_id).sort((a, b) => a.name.localeCompare(b.name)),
    [departments],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.departments() });
    void qc.invalidateQueries({ queryKey: queryKeys.procurement.config() });
    void qc.invalidateQueries({ queryKey: queryKeys.procurement.options() });
  };

  const createMut = useMutation({
    mutationFn: () =>
      createMasterDepartment({
        name: newName.trim(),
        code: newCode.trim() || undefined,
        parentId: newParentId === NONE ? null : newParentId,
      }),
    onSuccess: () => {
      toast.success(t("people.departments.added"));
      setNewName("");
      setNewCode("");
      setNewParentId(NONE);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: {
      id: string;
      name?: string;
      code?: string | null;
      active?: boolean;
      parentId?: string | null;
    }) => updateMasterDepartment(payload),
    onSuccess: () => {
      toast.success(t("people.departments.updated"));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const budgetMut = useMutation({
    mutationFn: (payload: { departmentId: string; amount: number }) =>
      upsertDepartmentBudget({ ...payload, year }),
    onSuccess: () => {
      toast.success(t("people.departments.budgetSaved"));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="ghost">
            <Settings2 className="mr-1 h-3 w-3" />
            {t("people.departments.manage")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("people.departments.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2">
            <div className="space-y-2">
              <Label className="text-xs">{t("people.departments.newName")}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("people.departments.newNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("people.departments.code")}</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder={t("people.departments.codeOptional")}
                className="w-24"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("people.departments.parent")}</Label>
              <Select value={newParentId} onValueChange={setNewParentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("people.departments.topLevel")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("people.departments.topLevel")}</SelectItem>
                  {parents.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="icon"
              aria-label={t("people.departments.add")}
              onClick={() => createMut.mutate()}
              disabled={!newName.trim() || createMut.isPending}
            >
              <Plus />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("people.departments.budgetHint", { year })}</p>

          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">{t("people.departments.name")}</th>
                  <th className="px-3 py-2 text-left">{t("people.departments.code")}</th>
                  <th className="px-3 py-2 text-left">{t("people.departments.budgetQar")}</th>
                  <th className="px-3 py-2 text-center">{t("people.departments.active")}</th>
                  <th className="px-3 py-2 text-end">{t("people.departments.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : (
                  tree.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Input
                          defaultValue={d.name}
                          className="h-8"
                          style={{ paddingInlineStart: `${0.75 + d.depth * 0.9}rem` }}
                          onBlur={(e) => {
                            const name = e.target.value.trim();
                            if (name && name !== d.name) updateMut.mutate({ id: d.id, name });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          defaultValue={d.code ?? ""}
                          className="h-8 w-24"
                          onBlur={(e) => {
                            const code = e.target.value.trim().toUpperCase() || null;
                            if (code !== (d.code ?? null)) updateMut.mutate({ id: d.id, code });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          key={`${d.id}-${budgetByDept.get(d.id) ?? "none"}`}
                          type="number"
                          min={0}
                          className="h-8 w-28"
                          defaultValue={budgetByDept.get(d.id) ?? ""}
                          placeholder="0"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === "") return;
                            const amount = Number(raw);
                            if (!Number.isFinite(amount) || amount < 0) return;
                            if (amount === (budgetByDept.get(d.id) ?? -1)) return;
                            budgetMut.mutate({ departmentId: d.id, amount });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Checkbox
                          checked={d.active}
                          onCheckedChange={(v) => updateMut.mutate({ id: d.id, active: !!v })}
                        />
                      </td>
                      <td className="px-3 py-2 text-end">
                        {!d.parent_id ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setNewParentId(d.id);
                              setNewName("");
                            }}
                          >
                            {t("people.departments.addChild")}
                          </Button>
                        ) : null}
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
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
