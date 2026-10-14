"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ArcadeEmpty, ArcadeHero, arcadeCategoryName, arcadeStatusName } from "@/components/arcade/ui";
import { listArcadeFaults } from "@/lib/arcade-work.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeKnowledge({ title, body }: { title: string; body: string }) {
  return (
    <ArcadeHero title={title} subtitle={body} />
  );
}

export function ArcadeHistory() {
  const { t } = useTranslation();
  const faults = useQuery({
    queryKey: queryKeys.arcade.faults({ history: true }),
    queryFn: () => listArcadeFaults({ page: 1, pageSize: 50, status: "RESOLVED" }),
  });
  const closed = useQuery({
    queryKey: queryKeys.arcade.faults({ closed: true }),
    queryFn: () => listArcadeFaults({ page: 1, pageSize: 50, status: "CLOSED" }),
  });
  const rows = [...(faults.data?.rows ?? []), ...(closed.data?.rows ?? [])];
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.historyTitle")} subtitle={t("arcadeScreens.historyHint")} />
      <div className="arcade-list">
      {rows.map((row) => (
        <a key={row.id} href={`/arcade/faults/${row.id}`} className="arcade-row text-sm">{row.ticket_number} · {arcadeCategoryName(t, row.category)} · {arcadeStatusName(t, row.status)} · {row.description}</a>
      ))}
      </div>
      {rows.length === 0 && faults.isSuccess && closed.isSuccess ? <ArcadeEmpty title={t("arcadeFlow.historyNext")} /> : null}
    </div>
  );
}
