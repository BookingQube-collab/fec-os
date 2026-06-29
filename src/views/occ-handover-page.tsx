"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, FileText, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { submitHandover } from "@/lib/occ.functions";
import type { HandoverDigest } from "@/lib/queries/occ.core";
import { useHandoverDigest, useHandovers } from "@/hooks/queries/useOcc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function HandoverPage() {
  const { locationId } = useParams() as { locationId: string };
      const { data, isLoading, error } = useHandoverDigest(locationId);
  const history = useHandovers(locationId);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-lg border border-border bg-surface" />;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-300">
        {(error as Error).message}
      </div>
    );
  }
  if (!data) return null;

  return <DigestView digest={data} history={history.data ?? []} />;
}

function DigestView({
  digest,
  history,
}: {
  digest: HandoverDigest;
  history: Array<{ id: string; signed_at: string; notes: string | null; from_user: string | null }>;
}) {
  const [notes, setNotes] = useState("");
    const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      submitHandover({
          locationId: digest.location.id,
          windowStart: digest.window_start,
          notes: notes || undefined,
          digest: {
            tickets_opened: digest.tickets_opened,
            tickets_closed: digest.tickets_closed,
            incidents: digest.incidents,
            work_orders_completed: digest.work_orders_completed,
            open_urgent: digest.open_urgent.length,
            open_high: digest.open_high.length,
          },
        }),
    onSuccess: () => {
      toast.success("Handover signed");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["occ", "handover", "history", digest.location.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/occ/branch/${digest.location.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Branch
        </Link>
        <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          Shift handover digest
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{digest.location.name}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Window: last 8 hours · generated {new Date(digest.generated_at).toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Tickets opened" value={digest.tickets_opened} />
        <Kpi label="Tickets closed" value={digest.tickets_closed} />
        <Kpi label="Incidents" value={digest.incidents} />
        <Kpi label="WOs completed" value={digest.work_orders_completed} />
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Open at handover
        </h3>
        {digest.open_urgent.length === 0 && digest.open_high.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing urgent or high-priority left open. Clean handover.</p>
        ) : (
          <div className="space-y-4">
            {digest.open_urgent.length > 0 && (
              <PriorityGroup label="Urgent" tone="red" items={digest.open_urgent} />
            )}
            {digest.open_high.length > 0 && (
              <PriorityGroup label="High" tone="amber" items={digest.open_high} />
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-5 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider">Sign off</h3>
        <Textarea
          placeholder="Notes for the incoming manager…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={() => window.print()} variant="outline" size="sm">Print</Button>
          <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="ml-1.5">{mut.isPending ? "Signing…" : "Sign handover"}</span>
          </Button>
        </div>
      </section>

      {history.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">Recent handovers</h3>
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="py-2 text-sm">
                <div className="text-xs text-muted-foreground">{new Date(h.signed_at).toLocaleString()}</div>
                {h.notes && <div className="mt-0.5">{h.notes}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function PriorityGroup({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "red" | "amber";
  items: Array<{ id: string; title: string; priority: string }>;
}) {
  const dot = tone === "red" ? "bg-rose-500" : "bg-amber-500";
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label} ({items.length})
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface-2">
        {items.map((t) => (
          <li key={t.id} className="px-3 py-2 text-sm">
            {t.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default HandoverPage;
