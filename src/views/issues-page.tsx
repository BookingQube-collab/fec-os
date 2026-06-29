"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertCircle, ChevronRight, Loader2, Plus, Sparkles, TicketCheck } from "lucide-react";
import { toast } from "sonner";

import {
  createIssue,
  listAssetsForLocation,
  updateIssueStatus,
  triageIssueWithAI,
} from "@/lib/issues.functions";
import { useIssues } from "@/hooks/queries/useIssues";
import { useSites } from "@/hooks/queries/useSites";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/app-store";
import { useFloorSupervisorView } from "@/hooks/use-floor-supervisor-view";
import { usePermission } from "@/hooks/use-permission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUSES = ["open", "assigned", "in_progress", "blocked", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const BOARD_COLUMNS: Array<(typeof STATUSES)[number]> = [
  "open",
  "assigned",
  "in_progress",
  "blocked",
  "resolved",
];

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    urgent: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    high: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    normal: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        styles[priority] ?? styles.low,
      )}
    >
      {priority}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function IssuesPage() {
  const [tab, setTab] = useState<"list" | "board" | "new">("list");
  const canCreate = usePermission("issues.create");
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <TicketCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Issue Tracker</h1>
            <p className="text-xs text-muted-foreground">
              Front-line and back-office tickets across the estate.
            </p>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
          {canCreate && (
            <TabsTrigger value="new">
              <Plus className="mr-1 h-3.5 w-3.5" /> New ticket
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="list" className="mt-4">
          <IssuesList />
        </TabsContent>
        <TabsContent value="board" className="mt-4">
          <IssuesBoard />
        </TabsContent>
        <TabsContent value="new" className="mt-4">
          <NewIssueForm onCreated={() => setTab("list")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useLocations() {
  return useSites();
}

function useIssuesRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("issues-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        void qc.invalidateQueries({ queryKey: queryKeys.issues.all });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

function IssuesList() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  useIssuesRealtime();
    const locsQ = useLocations();
  const issuesQ = useIssues({
    locationId: locationId ?? null,
    status: status === "all" ? null : status,
    priority: priority === "all" ? null : priority,
  });
  const { data, isLoading, error } = issuesQ;
  const items = data?.items ?? [];

  const locName = (id: string) => locsQ.data?.find((l) => l.id === id)?.code ?? "—";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Filter label="Status" value={status} onChange={setStatus} options={["all", ...STATUSES]} />
        <Filter label="Priority" value={priority} onChange={setPriority} options={["all", ...PRIORITIES]} />
        {locationId ? (
          <div className="text-xs text-muted-foreground">Filtered to current branch</div>
        ) : (
          <div className="text-xs text-muted-foreground">All branches</div>
        )}
      </div>
      {error ? (
        <Empty tone="error">{(error as Error).message}</Empty>
      ) : isLoading ? (
        <Empty>Loading tickets…</Empty>
      ) : items.length === 0 ? (
        <Empty>No tickets match these filters.</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Branch</th>
                <th className="px-3 py-2 text-left">Priority</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">SLA</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{t.title}</div>
                    {t.category ? (
                      <div className="text-[11px] text-muted-foreground">{t.category}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{locName(t.location_id)}</td>
                  <td className="px-3 py-2"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {t.sla_due_at ? new Date(t.sla_due_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/issues/${t.id}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IssuesBoard() {
  const locationId = useAppStore((s) => s.currentLocationId);
  useIssuesRealtime();
      const qc = useQueryClient();
  const boardQ = useIssues({ locationId: locationId ?? null });
  const { data, isLoading } = boardQ;
  const boardItems = data?.items ?? [];
  const mutation = useMutation({
    mutationFn: (input: { id: string; status: (typeof STATUSES)[number] }) =>
      updateIssueStatus(input),
    onSuccess: () => {
      toast.success("Ticket updated");
      void qc.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <Empty>Loading board…</Empty>;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {BOARD_COLUMNS.map((col) => {
        const items = boardItems.filter((t) => t.status === col);
        return (
          <div key={col} className="rounded-lg border border-border bg-surface/30 p-2">
            <div className="flex items-center justify-between px-1 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
              <span>{col.replace(/_/g, " ")}</span>
              <span>{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <div
                  key={t.id}
                  className="rounded-md border border-border bg-background p-2 text-xs shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/issues/${t.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {t.title}
                    </Link>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <Select
                    value={t.status}
                    onValueChange={(v) =>
                      mutation.mutate({ id: t.id, status: v as (typeof STATUSES)[number] })
                    }
                  >
                    <SelectTrigger className="mt-2 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                  Empty
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NewIssueForm({ onCreated }: { onCreated: () => void }) {
  const floorView = useFloorSupervisorView();
  const locsQ = useLocations();
  const currentLoc = useAppStore((s) => s.currentLocationId);
  const [form, setForm] = useState({
    location_id: currentLoc ?? "",
    title: "",
    description: "",
    priority: "normal" as (typeof PRIORITIES)[number],
    category: "",
    asset_id: "",
  });
        const qc = useQueryClient();
  const assetsQ = useQuery({
    queryKey: ["assets-for-location", form.location_id],
    queryFn: () =>
      form.location_id ? listAssetsForLocation({ locationId: form.location_id }) : Promise.resolve([]),
    enabled: !!form.location_id,
  });
  const mutation = useMutation({
    mutationFn: () =>
      createIssue({
          location_id: form.location_id,
          title: form.title,
          description: form.description || undefined,
          priority: form.priority,
          category: form.category || undefined,
          asset_id: form.asset_id || null,
        }),
    onSuccess: () => {
      toast.success("Ticket created");
      void qc.invalidateQueries({ queryKey: queryKeys.issues.all });
      onCreated();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const triageMut = useMutation({
    mutationFn: () => triageIssueWithAI({ title: form.title, description: form.description }),
    onSuccess: (s) => {
      setForm((f) => ({ ...f, priority: s.priority, category: f.category || s.category }));
      toast.success(`AI: ${s.priority} · ${s.category}${s.reasoning ? ` — ${s.reasoning}` : ""}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || form.title.length < 3) {
          toast.error("Branch and a meaningful title are required");
          return;
        }
        mutation.mutate();
      }}
    >
      <Field label="Branch" required>
        <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>
            {(locsQ.data ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Title" required>
        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} />
      </Field>
      {!floorView && (
        <div>
          <Button type="button" size="sm" variant="secondary" onClick={() => triageMut.mutate()} disabled={form.title.length < 3 || triageMut.isPending}>
            {triageMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            AI triage
          </Button>
        </div>
      )}
      {!floorView && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Priority">
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as never }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. HVAC, POS" />
          </Field>
        </div>
      )}
      {!floorView && (
        <Field label="Asset (optional)">
          <Select
            value={form.asset_id || "none"}
            onValueChange={(v) => setForm((f) => ({ ...f, asset_id: v === "none" ? "" : v }))}
            disabled={!form.location_id}
          >
            <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— none —</SelectItem>
              {(assetsQ.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.tag} · {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label="Description">
        <Textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={4}
          maxLength={4000}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create ticket
        </Button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label} {required ? <span className="text-rose-400">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Empty({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-8 text-center text-sm",
        tone === "error"
          ? "border-rose-500/40 bg-rose-500/5 text-rose-300"
          : "border-dashed border-border text-muted-foreground",
      )}
    >
      {tone === "error" ? <AlertCircle className="mr-2 inline h-4 w-4" /> : null}
      {children}
    </div>
  );
}

export default IssuesPage;
