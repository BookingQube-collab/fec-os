"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtQar } from "@/lib/currency";
import { milestoneSum, newMilestoneKey, type PrMilestoneDraft } from "@/lib/procurement/milestones";

export function PrMilestoneEditor({
  rows,
  total,
  onChange,
}: {
  rows: PrMilestoneDraft[];
  total: number;
  onChange: (rows: PrMilestoneDraft[]) => void;
}) {
  const { t } = useTranslation();
  const sum = milestoneSum(rows);
  const delta = Math.round((sum - total) * 100) / 100;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{t("procurement.wizard.milestoneSchedule")}</p>
          <p className="text-xs text-muted-foreground">{t("procurement.wizard.milestoneHint")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...rows,
              {
                key: newMilestoneKey(),
                title: "",
                amount: 0,
                due_date: "",
                due_timing: "",
                conditions: "",
              },
            ])
          }
        >
          <Plus className="h-4 w-4" />
          {t("procurement.wizard.addMilestone")}
        </Button>
      </div>
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={row.key} className="grid gap-3 rounded-2xl border border-border/40 bg-muted/20 p-3 md:grid-cols-12">
            <div className="space-y-1.5 md:col-span-4">
              <Label>{t("procurement.wizard.milestoneTitle")}</Label>
              <Input
                value={row.title}
                onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r)))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t("procurement.wizard.milestoneAmount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={row.amount || ""}
                onChange={(e) =>
                  onChange(rows.map((r, i) => (i === idx ? { ...r, amount: Number(e.target.value) || 0 } : r)))
                }
              />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label>{t("procurement.wizard.milestoneDue")}</Label>
              <Input
                type="date"
                value={row.due_date}
                onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, due_date: e.target.value } : r)))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label>{t("procurement.wizard.milestoneTiming")}</Label>
              <Input
                value={row.due_timing}
                onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, due_timing: e.target.value } : r)))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-11">
              <Label>{t("procurement.wizard.milestoneConditions")}</Label>
              <Input
                value={row.conditions}
                onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, conditions: e.target.value } : r)))}
              />
            </div>
            <div className="flex items-end md:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length <= 1}
                onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                aria-label={t("procurement.wizard.removeMilestone")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className={delta === 0 ? "text-xs text-muted-foreground" : "text-xs text-amber-700 dark:text-amber-300"}>
        {t("procurement.wizard.milestoneTotal", { amount: fmtQar(sum), exposure: fmtQar(total) })}
        {delta !== 0 ? ` — ${t("procurement.wizard.milestoneMismatch")}` : ""}
      </p>
    </div>
  );
}
