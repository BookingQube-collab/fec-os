"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { searchArcade } from "@/lib/arcade.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeSearch() {
  const [q, setQ] = useState("");
  const result = useQuery({
    queryKey: [...queryKeys.arcade.all, "search", q],
    queryFn: () => searchArcade({ q }),
    enabled: q.trim().length >= 2,
  });
  const data = result.data;
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Search</h1>
      <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="AR Car, asset ID, ticket, part, error code" />
      {data ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Group title="Machines" rows={data.machines.map((row) => ({ href: `/arcade/machines/${row.id}`, label: `${row.asset_code} · ${row.name}` }))} />
          <Group title="Faults" rows={data.faults.map((row) => ({ href: `/arcade/faults/${row.id}`, label: `${row.ticket_number} · ${row.description}` }))} />
          <Group title="Parts" rows={data.parts.map((row) => ({ href: "/arcade/parts", label: `${row.part_code} · ${row.name}` }))} />
          <Group title="Manuals" rows={data.documents.map((row) => ({ href: "/arcade/manuals", label: row.title }))} />
          <Group title="Supplier cases" rows={data.cases.map((row) => ({ href: `/arcade/support/${row.id}`, label: `${row.case_number} · ${row.problem}` }))} />
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: { href: string; label: string }[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No matches</p> : rows.map((row) => <Link key={row.href + row.label} href={row.href} className="block py-1 text-sm underline-offset-2 hover:underline">{row.label}</Link>)}
    </section>
  );
}
