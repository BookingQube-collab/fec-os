"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  createMasterDepartment,
  deleteMasterDepartment,
  listDepartmentBudgets,
  updateMasterDepartment,
  upsertDepartmentBudget,
} from "@/lib/people.functions";
import { departmentBudgetYear } from "@/lib/procurement/department-budget";
import type { DepartmentAudience } from "@/lib/department-audience";
import { sortDepartmentsTree } from "@/lib/departments";
import { useMasterDepartments, usePeopleMasters } from "@/hooks/queries/useDepartments";
import { queryKeys } from "@/lib/query-keys";
import {
  FecButton as Button,
  FecFormSection,
  FecLoader,
  FecModal as Dialog,
  FecModalContent as DialogContent,
  FecModalFooter as DialogFooter,
  FecModalHeader as DialogHeader,
  FecModalTitle as DialogTitle,
  FecModalTrigger as DialogTrigger,
} from "@/components/fec";
import { Checkbox } from "@/components/ui/checkbox";
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

export function DepartmentMasterPanel({
  audience,
  active = true,
}: {
  /** When set, the panel only edits that office. Head office stays separate from FEC sites. */
  audience?: DepartmentAudience;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: departments = [], isLoading } = useMasterDepartments();
  const masters = usePeopleMasters({ enabled: active });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newParentId, setNewParentId] = useState<string>(NONE);
  const [newAudience, setNewAudience] = useState<DepartmentAudience>(audience ?? "fec");
  const [audienceFilter, setAudienceFilter] = useState<"all" | DepartmentAudience>(audience ?? "all");
  const year = departmentBudgetYear();
  const budgetsQuery = useQuery({
    queryKey: [...queryKeys.people.departments(), "budgets", year],
    queryFn: () => listDepartmentBudgets({ year }),
    enabled: active,
  });
  const usageById = useMemo(
    () => new Map((masters.data?.departmentUsage ?? []).map((row) => [row.id, row.usageCount])),
    [masters.data?.departmentUsage],
  );

  const visibleDepartments = useMemo(
    () => departments.filter((department) => audienceFilter === "all" || department.audience === audienceFilter),
    [departments, audienceFilter],
  );
  const tree = useMemo(() => sortDepartmentsTree(visibleDepartments), [visibleDepartments]);
  const budgetByDept = useMemo(
    () => new Map((budgetsQuery.data ?? []).map((row) => [row.department_id, row.amount])),
    [budgetsQuery.data],
  );
  const parents = useMemo(
    () =>
      visibleDepartments
        .filter((d) => d.active && !d.parent_id && (d.audience ?? newAudience) === newAudience)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [visibleDepartments, newAudience],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.departments() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.masters() });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "staff-directory"] });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "staff"] });
    void qc.invalidateQueries({ queryKey: queryKeys.procurement.config() });
    void qc.invalidateQueries({ queryKey: queryKeys.procurement.options() });
  };

  const createMut = useMutation({
    mutationFn: () =>
        createMasterDepartment({
          name: newName.trim(),
          code: newCode.trim() || undefined,
          parentId: newParentId === NONE ? null : newParentId,
          audience: audience ?? newAudience,
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

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMasterDepartment({ id }),
    onSuccess: () => {
      toast.success(t("people.departments.deleted"));
      setPendingDeleteId(null);
      invalidate();
      void qc.invalidateQueries({ queryKey: queryKeys.people.masters() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
        <div className="space-y-4">
          <FecFormSection description={t("people.departments.budgetHint", { year })}>
            {audience ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {audience === "ho" ? t("people.departments.audienceHo") : t("people.departments.audienceFec")}
              </p>
            ) : (
              <div className="mb-2 flex flex-wrap gap-2">
                {(["all", "ho", "fec"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={audienceFilter === value ? "default" : "secondary"}
                    onClick={() => {
                      setAudienceFilter(value);
                      if (value !== "all") setNewAudience(value);
                    }}
                  >
                    {t(
                      value === "all"
                        ? "people.departments.audienceAll"
                        : value === "ho"
                          ? "people.departments.audienceHo"
                          : "people.departments.audienceFec",
                    )}
                  </Button>
                ))}
              </div>
            )}
            <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_6rem_9rem_minmax(0,1fr)_auto]">
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
            {audience ? null : (
              <div className="space-y-2">
                <Label className="text-xs">{t("people.departments.audience")}</Label>
                <Select value={newAudience} onValueChange={(value) => setNewAudience(value as DepartmentAudience)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ho">{t("people.departments.audienceHo")}</SelectItem>
                    <SelectItem value="fec">{t("people.departments.audienceFec")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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
          </FecFormSection>

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
                    <td colSpan={5} className="px-3 py-4 text-center"><FecLoader size="sm" label={t("common.loading")} /></td>
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
                        {audienceFilter === "all" ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {d.audience === "ho"
                              ? t("people.departments.audienceHo")
                              : t("people.departments.audienceFec")}
                          </p>
                        ) : null}
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
                        <div className="flex flex-col items-end gap-1">
                          {(usageById.get(d.id) ?? 0) > 0 ? (
                            <p className="text-[10px] text-muted-foreground">
                              {t("people.masters.usedBy", { count: usageById.get(d.id) ?? 0 })}
                            </p>
                          ) : null}
                          {!d.parent_id ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setNewParentId(d.id);
                                setNewName("");
                                if (d.audience === "ho" || d.audience === "fec") setNewAudience(d.audience);
                              }}
                            >
                              {t("people.departments.addChild")}
                            </Button>
                          ) : null}
                          {pendingDeleteId === d.id ? (
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={deleteMut.isPending}
                                onClick={() => deleteMut.mutate(d.id)}
                              >
                                {t("people.masters.confirmDelete")}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDeleteId(null)}>
                                {t("common.cancel")}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const usage = usageById.get(d.id) ?? 0;
                                if (masters.isSuccess && usage > 0) {
                                  toast.error(t("people.masters.deleteBlocked", { name: d.name, count: usage }));
                                  return;
                                }
                                const children = departments.filter((row) => row.parent_id === d.id).length;
                                if (children > 0) {
                                  toast.error(
                                    t("people.departments.deleteBlockedChildren", { name: d.name, count: children }),
                                  );
                                  return;
                                }
                                setPendingDeleteId(d.id);
                              }}
                            >
                              {t("people.departments.delete")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
  );
}

export function ManageDepartmentsDialog({
  trigger,
  audience,
}: {
  trigger?: React.ReactNode;
  /** When set, the dialog only edits that office. Head office stays separate from FEC sites. */
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
            {t("people.departments.manage")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("people.departments.title")}</DialogTitle>
        </DialogHeader>
        <DepartmentMasterPanel audience={audience} active={open} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
