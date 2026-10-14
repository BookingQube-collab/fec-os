"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ArcadeEmpty, ArcadeHero } from "@/components/arcade/ui";
import { Input } from "@/components/ui/input";
import { searchArcade } from "@/lib/arcade.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeSearch() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const result = useQuery({
    queryKey: [...queryKeys.arcade.all, "search", q],
    queryFn: () => searchArcade({ q }),
    enabled: q.trim().length >= 2,
  });
  const data = result.data;
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.searchTitle")} subtitle={t("arcadeScreens.searchHint")} />
      <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("arcadeScreens.searchHint")} className="max-w-xl bg-card" />
      {q.trim().length < 2 ? <ArcadeEmpty title={t("arcadeFlow.searchStart")} /> : null}
      {data ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Group title={t("arcadeScreens.groupMachines")} empty={t("arcadeScreens.noMatches")} rows={data.machines.map((row) => ({ href: `/arcade/machines/${row.id}`, label: `${row.asset_code} · ${row.name}` }))} />
          <Group title={t("arcadeScreens.groupFaults")} empty={t("arcadeScreens.noMatches")} rows={data.faults.map((row) => ({ href: `/arcade/faults/${row.id}`, label: `${row.ticket_number} · ${row.description}` }))} />
          <Group title={t("arcadeScreens.groupParts")} empty={t("arcadeScreens.noMatches")} rows={data.parts.map((row) => ({ href: "/arcade/parts", label: `${row.part_code} · ${row.name}` }))} />
          <Group title={t("arcadeScreens.groupManuals")} empty={t("arcadeScreens.noMatches")} rows={data.documents.map((row) => ({ href: "/arcade/manuals", label: row.title }))} />
          <Group title={t("arcadeScreens.groupCases")} empty={t("arcadeScreens.noMatches")} rows={data.cases.map((row) => ({ href: `/arcade/support/${row.id}`, label: `${row.case_number} · ${row.problem}` }))} />
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, empty, rows }: { title: string; empty: string; rows: { href: string; label: string }[] }) {
  return (
    <section className="arcade-panel">
      <h2 className="arcade-panel__title">{title}</h2>
      {rows.length === 0 ? <p className="arcade-panel__hint">{empty}</p> : (
        <div className="arcade-list mt-3">
          {rows.map((row) => <Link key={row.href + row.label} href={row.href} className="arcade-row text-sm">{row.label}</Link>)}
        </div>
      )}
    </section>
  );
}
