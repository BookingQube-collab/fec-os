"use client";

import { useTranslation } from "react-i18next";

import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { cn } from "@/lib/utils";

export type MeLeaveEntitlementCardProps = {
  loading?: boolean;
  leaveTypeLabel?: string;
  allottedDays?: number | null;
  accruedDays?: number | null;
  usedDays?: number | null;
  remainingDays?: number | null;
  monthsAccrued?: number | null;
  monthlyAccrual?: number | null;
  fullYearDays?: number | null;
  hireDate?: string | null;
  tierCode?: string | null;
  eligible?: boolean | null;
  className?: string;
};

function tierKey(code: string | null | undefined): string {
  if (code === "management") return "hr.leave.tierManagement";
  if (code === "5y_plus") return "hr.leave.tier5yPlus";
  return "hr.leave.tierUnder5y";
}

/** Surfaces hire_date / 21·28·30 accrual entitlement on employee leave apply. */
export function MeLeaveEntitlementCard({
  loading,
  leaveTypeLabel,
  allottedDays,
  accruedDays,
  usedDays,
  remainingDays,
  monthsAccrued,
  monthlyAccrual,
  fullYearDays,
  hireDate,
  tierCode,
  eligible,
  className,
}: MeLeaveEntitlementCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-xs", className)}>
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  const stats = [
    {
      label: t("hr.leave.entitlementAllotted", { defaultValue: "Allotted" }),
      value: allottedDays ?? "—",
    },
    {
      label: t("hr.leave.entitlementAccrued", { defaultValue: "Accrued YTD" }),
      value: accruedDays ?? "—",
    },
    {
      label: t("hr.leave.entitlementUsed", { defaultValue: "Used" }),
      value: usedDays ?? "—",
    },
    {
      label: t("hr.leave.entitlementRemaining", { defaultValue: "Remaining" }),
      value: remainingDays ?? "—",
    },
  ];

  return (
    <div className={cn("space-y-2 rounded-xl border border-border/60 bg-muted/15 px-3 py-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {t("hr.leave.entitlementTitle", { defaultValue: "Your annual entitlement" })}
            {leaveTypeLabel ? (
              <span className="ms-1 font-normal text-muted-foreground">· {leaveTypeLabel}</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {eligible === false
              ? t("hr.leave.entitlementIneligible", {
                  defaultValue: "Not eligible yet — annual leave accrues from your joining date.",
                })
              : t(tierKey(tierCode), {
                  defaultValue: "Entitlement from joining date and role tier.",
                })}
          </p>
        </div>
        {hireDate ? (
          <p className="text-xs text-muted-foreground">
            {t("hr.leave.entitlementHire", {
              hire: formatWorkDateDdMmYyyy(hireDate),
              defaultValue: "Joined {{hire}}",
            })}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((row) => (
          <div key={row.label} className="rounded-lg bg-background/70 px-2.5 py-2">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{row.label}</p>
            <p className="text-base font-semibold tabular-nums">{row.value}</p>
          </div>
        ))}
      </div>

      {typeof accruedDays === "number" && typeof monthsAccrued === "number" && hireDate ? (
        <p className="text-xs text-muted-foreground">
          {t("hr.leave.accrualHint", {
            accrued: accruedDays,
            months: monthsAccrued,
            hire: formatWorkDateDdMmYyyy(hireDate),
          })}
        </p>
      ) : null}
      {typeof fullYearDays === "number" && typeof monthlyAccrual === "number" && tierCode ? (
        <p className="text-xs text-muted-foreground">
          {t("hr.leave.accrualTierHint", {
            tier: tierCode,
            fullYear: fullYearDays,
            monthly: monthlyAccrual,
          })}
        </p>
      ) : null}
    </div>
  );
}
