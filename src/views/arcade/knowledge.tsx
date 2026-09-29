"use client";

import { useQuery } from "@tanstack/react-query";

import { listArcadeFaults } from "@/lib/arcade-work.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeKnowledge({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function ArcadeHistory() {
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
    <div className="grid gap-2">
      <h1 className="text-xl font-semibold">Machine history</h1>
      <p className="text-sm text-muted-foreground">Resolved and closed repairs stay on the record. They are not deleted from here.</p>
      {rows.map((row) => (
        <a key={row.id} href={`/arcade/faults/${row.id}`} className="rounded border p-2 text-sm">{row.ticket_number} · {row.category} · {row.status} · {row.description}</a>
      ))}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No closed repairs yet.</p> : null}
    </div>
  );
}
