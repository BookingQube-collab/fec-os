"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermission } from "@/hooks/use-permission";
import { adjustPayrollLine, listStaffPayrollLines } from "@/lib/hr-payroll.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function StaffPayrollPanel({ staffId }: { staffId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canAdjust = usePermission("payroll.finance");
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [earn, setEarn] = useState("");
  const [deduct, setDeduct] = useState("");
  const [notes, setNotes] = useState("");

  const lines = useQuery({
    queryKey: queryKeys.people.hrStaffPayrollLines(staffId),
    queryFn: () => listStaffPayrollLines({ staffId }),
    staleTime: STALE.people,
    enabled: Boolean(staffId),
  });

  const adjust = useMutation({
    mutationFn: () => {
      if (!adjustId) throw new Error(t("hr.payrollRuns.error"));
      return adjustPayrollLine({
        lineId: adjustId,
        otherEarningsQar: earn.trim() ? Number(earn) : null,
        otherDeductionsQar: deduct.trim() ? Number(deduct) : null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(t("people.profile.payrollAdjusted"));
      setAdjustId(null);
      setEarn("");
      setDeduct("");
      setNotes("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrStaffPayrollLines(staffId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (lines.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("people.staff.loading")}</p>;
  }
  if (lines.isError) {
    return <p className="text-sm text-destructive">{(lines.error as Error).message}</p>;
  }
  if (!lines.data?.length) {
    return <p className="text-sm text-muted-foreground">{t("people.profile.payrollNoLines")}</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {t("hr.payrollRuns.lines")}
      </h3>
      <ul className="space-y-2">
        {lines.data.map((line) => (
          <li key={line.lineId} className="rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {line.month || line.dateFrom}
                  {line.dateFrom && line.dateTo ? ` · ${line.dateFrom} → ${line.dateTo}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("hr.payrollRuns.gross")}: {line.grossQar.toLocaleString()} · {t("hr.payrollRuns.net")}:{" "}
                  {line.netQar.toLocaleString()}
                  {line.paymentMethod ? ` · ${line.paymentMethod.replace(/_/g, " ")}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {t(`hr.payrollRuns.status.${line.status}`, { defaultValue: line.status.replace(/_/g, " ") })}
                </Badge>
                {canAdjust && !line.locked ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setAdjustId(adjustId === line.lineId ? null : line.lineId);
                      setNotes(line.notes ?? "");
                      setEarn("");
                      setDeduct("");
                    }}
                  >
                    {t("people.profile.payrollAdjust")}
                  </Button>
                ) : null}
              </div>
            </div>
            {adjustId === line.lineId ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>{t("people.profile.payrollOtherEarnings")}</Label>
                  <Input value={earn} onChange={(e) => setEarn(e.target.value)} inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <Label>{t("people.profile.payrollOtherDeductions")}</Label>
                  <Input value={deduct} onChange={(e) => setDeduct(e.target.value)} inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <Label>{t("people.profile.reason")}</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <div className="sm:col-span-3">
                  <Button size="sm" disabled={adjust.isPending} onClick={() => adjust.mutate()}>
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
