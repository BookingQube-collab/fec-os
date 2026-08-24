"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { useAmcRenewals } from "@/hooks/queries/useAmcRenewals";
import { useTranslation } from "react-i18next";

import { translateAmcCategory, translateAmcStatus } from "@/lib/amc/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AmcRenewalsPage() {
  const { t } = useTranslation();
  const { data: renewals, isLoading } = useAmcRenewals(30);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t("amc.renewalsTitle")}</h1>
          <p className="text-xs text-muted-foreground">{t("amc.renewalsSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance/amc-dashboard">{t("amc.dashboard")}</Link>
        </Button>
      </header>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.site")}</TableHead>
              <TableHead>{t("common.category")}</TableHead>
              <TableHead>{t("common.vendor")}</TableHead>
              <TableHead>{t("amc.columns.endDate")}</TableHead>
              <TableHead>{t("amc.columns.daysLeft")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
            ) : !renewals?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("amc.noRenewals")}</TableCell></TableRow>
            ) : (
              renewals.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.location_code}</TableCell>
                  <TableCell>{translateAmcCategory(t, r.category)}</TableCell>
                  <TableCell>
                    <Link href={`/compliance/amc-contracts/${r.id}`} className="text-primary hover:underline">{r.vendor_name}</Link>
                  </TableCell>
                  <TableCell>{r.contract_end_date}</TableCell>
                  <TableCell className={r.days_left <= 30 ? "text-amber-400 font-medium" : ""}>{r.days_left}</TableCell>
                  <TableCell><Badge variant="outline">{translateAmcStatus(t, r.status)}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default AmcRenewalsPage;
