"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { HR_WORKSPACE_MODULES } from "@/lib/hr-workspace";

export function HrWorkspaceMap() {
  const { t } = useTranslation();

  return (
    <section className="surface-card min-w-0 p-4 sm:p-5" aria-labelledby="hr-workspace-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("hr.workspace.kicker")}</p>
          <h2 id="hr-workspace-title" className="mt-1 text-base font-semibold tracking-tight">
            {t("hr.workspace.title")}
          </h2>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">{t("hr.workspace.hint")}</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b text-start text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 font-medium">{t("hr.workspace.module")}</th>
              <th className="px-2 py-2 font-medium">{t("hr.workspace.status")}</th>
              <th className="px-2 py-2 font-medium">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {HR_WORKSPACE_MODULES.map((mod) => (
              <tr key={mod.id} className="border-b last:border-0">
                <td className="px-2 py-2">
                  <span className="me-2 tabular-nums text-muted-foreground">{mod.id === "ac" ? "—" : mod.id}</span>
                  {t(mod.labelKey)}
                </td>
                <td className="px-2 py-2">
                  <Badge variant={mod.status === "later" ? "muted" : mod.status === "partial" ? "warning" : "success"}>
                    {t(`hr.workspace.statuses.${mod.status}`)}
                    {mod.phase ? ` · ${mod.phase}` : ""}
                  </Badge>
                </td>
                <td className="px-2 py-2">
                  {mod.href ? (
                    <Link href={mod.href} className="underline-offset-2 hover:underline">
                      {t("common.view")}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t("hr.workspace.notInThisPhase")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
