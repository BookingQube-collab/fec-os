"use client";

import Link from "next/link";
import { Archive } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HR_EXTRA_PAGES } from "@/lib/people/hr-extras";

export default function PeopleExtrasPage() {
  const { t } = useTranslation();
  const rows = HR_EXTRA_PAGES;

  return (
    <CapabilityGate
      capability="people.view_roster"
      fallback={
        <p className="text-sm text-muted-foreground">{t("people.extras.noAccess")}</p>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Archive}
          kicker={t("nav.departments.people")}
          title={t("people.extras.title")}
          subtitle={t("people.extras.subtitle")}
        />
        <NeumorphicCard className="space-y-3 p-5">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("people.extras.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("people.extras.colTitle")}</TableHead>
                    <TableHead>{t("people.extras.colPath")}</TableHead>
                    <TableHead>{t("people.extras.colReason")}</TableHead>
                    <TableHead>{t("people.extras.colCanonical")}</TableHead>
                    <TableHead className="text-right">{t("people.extras.open")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="align-top">
                        <p className="font-medium">{t(row.titleKey)}</p>
                        <Badge variant={row.visibility === "hidden" ? "warning" : "outline"} className="mt-1">
                          {row.visibility === "hidden"
                            ? t("people.extras.hidden")
                            : t("people.extras.visibleElsewhere")}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top font-mono text-xs">{row.path}</TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">{t(row.reasonKey)}</TableCell>
                      <TableCell className="align-top">
                        <Link href={row.canonicalPath} className="text-sm font-medium underline-offset-4 hover:underline">
                          {t(row.canonicalKey)}
                        </Link>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={row.path}>{t("people.extras.open")}</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}
