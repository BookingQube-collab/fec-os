"use client";

import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";

import { useAmcContracts } from "@/hooks/queries/useAmcContracts";
import { useTranslation } from "react-i18next";

import { translateAmcCategory, translateAmcStatus } from "@/lib/amc/constants";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { fmtQar } from "@/lib/currency";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AmcContractsPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useAmcContracts({ locationId: locationId ?? null });
  const contracts = data?.items;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t("amc.contractsTitle")}</h1>
            <p className="text-xs text-muted-foreground">{t("amc.contractsSubtitle")}</p>
          </div>
        </div>
        <Button size="sm" asChild>
          <Link href="/compliance/amc-contracts/new"><Plus className="mr-1 h-4 w-4" />{t("amc.newContract")}</Link>
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
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("amc.columns.outstanding")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
            ) : !contracts?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("amc.noContracts")}</TableCell></TableRow>
            ) : (
              contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{formatLocationLabel(c.location_code, c.location_name)}</TableCell>
                  <TableCell>{translateAmcCategory(t, c.category)}</TableCell>
                  <TableCell>
                    <Link href={`/compliance/amc-contracts/${c.id}`} className="text-primary hover:underline">{c.vendor_name}</Link>
                  </TableCell>
                  <TableCell>{c.contract_end_date}</TableCell>
                  <TableCell><Badge variant="outline">{translateAmcStatus(t, c.status)}</Badge></TableCell>
                  <TableCell className="text-right">{fmtQar(c.outstanding_amount)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default AmcContractsPage;
