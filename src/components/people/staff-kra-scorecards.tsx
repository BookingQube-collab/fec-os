"use client";

import { FecLoader } from "@/components/fec";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listKraScorecards } from "@/lib/kra-scorecard.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useQuery } from "@tanstack/react-query";

export function StaffKraScorecards({ staffId }: { staffId: string }) {
  const { t } = useTranslation();
  const cards = useQuery({
    queryKey: queryKeys.people.kraScorecards(),
    queryFn: () => listKraScorecards(),
    staleTime: STALE.people,
  });
  const mine = (cards.data?.reviews ?? []).filter((row) => row.staffId === staffId);

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{t("kraScorecard.title")}</h2>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/people/kra?staff=${staffId}`}>{t("kraScorecard.assign")}</Link>
        </Button>
      </div>
      {cards.isLoading ? <FecLoader density="chip" label={t("common.loading")} /> : null}
      {!cards.isLoading && mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("kraScorecard.empty")}</p>
      ) : null}
      <div className="space-y-2">
        {mine.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <p className="font-medium">
                {row.templateCode} · {row.reviewPeriod}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.role} · {row.assignedPost}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="muted">{row.score ?? "—"} · {row.classification}</Badge>
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/people/kra/reviews/${row.id}`}>{t("kraScorecard.open")}</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
