"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { useAmcSchedules } from "@/hooks/queries/useAmcSchedules";
import { useTranslation } from "react-i18next";

import { translateAmcCategory, translateAmcStatus } from "@/lib/amc/constants";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AmcSchedulePage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useAmcSchedules({ locationId: locationId ?? null });
  const rows = data?.items;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t("amc.scheduleTitle")}</h1>
          <p className="text-xs text-muted-foreground">{t("amc.scheduleSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance/amc-dashboard">{t("amc.dashboard")}</Link>
        </Button>
      </header>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("amc.columns.planned")}</TableHead>
              <TableHead>{t("common.vendor")}</TableHead>
              <TableHead>{t("common.category")}</TableHead>
              <TableHead>{t("amc.columns.serviceNo")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("amc.noScheduled")}</TableCell></TableRow>
            ) : (
              rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.planned_date}</TableCell>
                  <TableCell>{s.vendor_name ?? "—"}</TableCell>
                  <TableCell>
                    {s.category ? translateAmcCategory(t, s.category) : "—"}
                  </TableCell>
                  <TableCell>#{s.service_number}</TableCell>
                  <TableCell><Badge variant="outline">{translateAmcStatus(t, s.status)}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default AmcSchedulePage;
