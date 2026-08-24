"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManageDepartmentsDialog } from "@/components/people/manage-departments-dialog";
import { formatDepartmentTreeLabel, sortDepartmentsTree } from "@/lib/departments";
import { fmtNumber } from "@/lib/currency";
import { upsertDepartmentBudget } from "@/lib/people.functions";
import { getProcurementConfig, saveProcurementConfig } from "@/lib/procurement.functions";
import { queryKeys } from "@/lib/query-keys";

type BandDraft = {
  id: string;
  band_code: string;
  label: string;
  min_amount: number;
  max_amount: number | null;
  require_dept_head: boolean;
  require_gm: boolean;
  require_ceo: boolean;
};

export default function ProcurementConfigPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: queryKeys.procurement.config(),
    queryFn: () => getProcurementConfig(),
  });

  const [bands, setBands] = useState<BandDraft[]>([]);
  const [variancePct, setVariancePct] = useState(15);
  const [forceVariance, setForceVariance] = useState(true);
  const [forceBudget, setForceBudget] = useState(true);

  useEffect(() => {
    if (!cfg.data) return;
    setBands(
      cfg.data.bands.map((b) => ({
        id: b.id,
        band_code: b.band_code,
        label: b.label,
        min_amount: Number(b.min_amount),
        max_amount: b.max_amount == null ? null : Number(b.max_amount),
        require_dept_head: b.require_dept_head,
        require_gm: b.require_gm,
        require_ceo: b.require_ceo,
      })),
    );
    setVariancePct(Number(cfg.data.settings.price_variance_pct_threshold));
    setForceVariance(cfg.data.settings.force_ceo_on_price_variance);
    setForceBudget(cfg.data.settings.force_ceo_on_budget_exception);
  }, [cfg.data]);

  const save = useMutation({
    mutationFn: saveProcurementConfig,
    onSuccess: () => {
      toast.success(t("procurement.config.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.procurement.config() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("procurement.kicker")}
        title={t("procurement.config.title")}
        subtitle={t("procurement.config.subtitle")}
      />

      <CapabilityGate
        capability="procurement.configure"
        fallback={<p className="text-sm text-muted-foreground">Admin only.</p>}
      >
        <div className="space-y-4 rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
          {bands.map((band, idx) => (
            <div key={band.id} className="grid gap-3 rounded-xl border border-border/30 p-4 md:grid-cols-4">
              <div className="md:col-span-4 font-medium">
                {t("procurement.config.band")}: {band.label} ({band.band_code})
              </div>
              <div>
                <Label>{t("procurement.config.min")}</Label>
                <Input
                  type="number"
                  value={band.min_amount}
                  onChange={(e) =>
                    setBands((prev) =>
                      prev.map((b, i) => (i === idx ? { ...b, min_amount: Number(e.target.value) } : b)),
                    )
                  }
                />
              </div>
              <div>
                <Label>{t("procurement.config.max")}</Label>
                <Input
                  type="number"
                  value={band.max_amount ?? ""}
                  placeholder={t("procurement.config.unbounded")}
                  onChange={(e) =>
                    setBands((prev) =>
                      prev.map((b, i) =>
                        i === idx
                          ? { ...b, max_amount: e.target.value === "" ? null : Number(e.target.value) }
                          : b,
                      ),
                    )
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={band.require_dept_head}
                  onCheckedChange={(v) =>
                    setBands((prev) =>
                      prev.map((b, i) => (i === idx ? { ...b, require_dept_head: Boolean(v) } : b)),
                    )
                  }
                />
                {t("procurement.config.deptHead")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={band.require_gm}
                  onCheckedChange={(v) =>
                    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, require_gm: Boolean(v) } : b)))
                  }
                />
                {t("procurement.config.gm")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={band.require_ceo}
                  onCheckedChange={(v) =>
                    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, require_ceo: Boolean(v) } : b)))
                  }
                />
                {t("procurement.config.ceo")}
              </label>
              <p className="text-sm text-muted-foreground">{t("procurement.config.finance")}: always</p>
            </div>
          ))}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>{t("procurement.config.variancePct")}</Label>
              <Input type="number" value={variancePct} onChange={(e) => setVariancePct(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={forceVariance} onCheckedChange={(v) => setForceVariance(Boolean(v))} />
              {t("procurement.config.forceCeoVariance")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={forceBudget} onCheckedChange={(v) => setForceBudget(Boolean(v))} />
              {t("procurement.config.forceCeoBudget")}
            </label>
          </div>

          <div className="space-y-3 border-t border-border/40 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">{t("procurement.config.deptBudgets")}</h3>
                <p className="text-xs text-muted-foreground">{t("procurement.config.deptBudgetsHint")}</p>
              </div>
              <ManageDepartmentsDialog />
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/30">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("procurement.list.dept")}</th>
                    <th className="px-3 py-2 text-start">{t("procurement.config.year")}</th>
                    <th className="px-3 py-2 text-start">{t("procurement.config.budgetQar")}</th>
                    <th className="px-3 py-2 text-start">{t("procurement.config.spent")}</th>
                    <th className="px-3 py-2 text-start">{t("procurement.config.remaining")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortDepartmentsTree(cfg.data?.department_budgets ?? []).map((row) => (
                    <tr key={row.department_id} className="border-t border-border/30">
                      <td className="px-3 py-2">
                        {formatDepartmentTreeLabel(row.name, row.depth)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.year}</td>
                      <td className="px-3 py-2">
                        <Input
                          key={`${row.department_id}-${row.amount ?? "none"}`}
                          type="number"
                          min={0}
                          className="h-8 w-32"
                          defaultValue={row.amount ?? ""}
                          placeholder="0"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === "") return;
                            const amount = Number(raw);
                            if (!Number.isFinite(amount) || amount < 0) return;
                            if (amount === (row.amount ?? -1)) return;
                            void upsertDepartmentBudget({
                              departmentId: row.department_id,
                              year: row.year,
                              amount,
                            })
                              .then(() => {
                                toast.success(t("people.departments.budgetSaved"));
                                void qc.invalidateQueries({ queryKey: queryKeys.procurement.config() });
                                void qc.invalidateQueries({ queryKey: queryKeys.procurement.options() });
                              })
                              .catch((err: Error) => toast.error(err.message));
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 tabular-nums">{fmtNumber(row.spent)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.remaining == null ? "—" : fmtNumber(row.remaining)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                bands: bands.map((b) => ({
                  id: b.id,
                  min_amount: b.min_amount,
                  max_amount: b.max_amount,
                  require_dept_head: b.require_dept_head,
                  require_gm: b.require_gm,
                  require_ceo: b.require_ceo,
                })),
                settings: {
                  price_variance_pct_threshold: variancePct,
                  force_ceo_on_price_variance: forceVariance,
                  force_ceo_on_budget_exception: forceBudget,
                },
              })
            }
          >
            {t("common.save")}
          </Button>
        </div>
      </CapabilityGate>
    </div>
  );
}
