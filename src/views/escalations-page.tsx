"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  acknowledgeEscalation,
  deleteEscalationRule,
  listActiveEscalations,
  listEscalationRules,
  runEscalationSweep,
  upsertEscalationRule,
} from "@/lib/escalations.functions";
import { useSites } from "@/hooks/queries/useSites";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ROLES = ["duty_manager","branch_gm","regional_ops","coo","ceo"] as const;
const PRIORITIES = ["low","normal","high","urgent"] as const;

function EscalationsPage() {
                const qc = useQueryClient();

  const rulesQ = useQuery({ queryKey: ["esc-rules"], queryFn: () => listEscalationRules() });
  const locsQ = useSites();
  const activeQ = useQuery({ queryKey: ["esc-active"], queryFn: () => listActiveEscalations(), refetchInterval: 30000 });

  useEffect(() => {
    const ch = supabase
      .channel("escalations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, () => {
        void qc.invalidateQueries({ queryKey: ["esc-active"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);

  const sweepMut = useMutation({
    mutationFn: () => runEscalationSweep(),
    onSuccess: (r) => {
      toast.success(`Sweep complete — ${r.created} new escalation(s)`);
      void qc.invalidateQueries({ queryKey: ["esc-active"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deleteEscalationRule({ id }),
    onSuccess: () => { toast.success("Rule removed"); void qc.invalidateQueries({ queryKey: ["esc-rules"] }); },
  });
  const ackMut = useMutation({
    mutationFn: (id: string) => acknowledgeEscalation({ id }),
    onSuccess: () => { toast.success("Acknowledged"); void qc.invalidateQueries({ queryKey: ["esc-active"] }); },
  });

  const [form, setForm] = useState({
    name: "",
    location_id: "" as string,
    scope_priority: "" as string,
    scope_category: "",
    minutes_after_sla: 15,
    target_role: "branch_gm" as (typeof ROLES)[number],
    bump_priority: true,
    level: 1 as number,
    enabled: true,
  });
  const createMut = useMutation({
    mutationFn: () =>
      upsertEscalationRule({
          name: form.name,
          location_id: form.location_id || null,
          scope_priority: (form.scope_priority || null) as never,
          scope_category: form.scope_category || null,
          minutes_after_sla: form.minutes_after_sla,
          target_role: form.target_role,
          bump_priority: form.bump_priority,
          level: form.level,
          enabled: form.enabled,
        }),
    onSuccess: () => {
      toast.success("Rule saved");
      setForm((f) => ({ ...f, name: "" }));
      void qc.invalidateQueries({ queryKey: ["esc-rules"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Escalation engine</h1>
          <p className="text-sm text-muted-foreground">SLA-breach detection, auto-escalation, and on-duty alerts.</p>
        </div>
        <Button onClick={() => sweepMut.mutate()} disabled={sweepMut.isPending}>
          {sweepMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Run sweep now
        </Button>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {activeQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (activeQ.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-border bg-surface/30 p-6 text-sm text-muted-foreground">
              No active escalations. Tickets within SLA.
            </div>
          ) : (
            <ul className="space-y-2">
              {(activeQ.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded-lg border border-border bg-surface/30 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <span className="font-medium">{e.title}</span>
                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] uppercase text-rose-300">L{e.level}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{e.severity}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{e.detail}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{e.status}</span>
                    {e.status === "open" && (
                      <Button size="sm" variant="secondary" onClick={() => ackMut.mutate(e.id)}>Acknowledge</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="rules" className="mt-4 space-y-4">
          <form
            className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface/30 p-4 md:grid-cols-4"
            onSubmit={(e) => { e.preventDefault(); if (form.name.length < 2) { toast.error("Name required"); return; } createMut.mutate(); }}
          >
            <div className="md:col-span-2">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Urgent to BGM after 15m" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Branch</Label>
              <Select value={form.location_id || "all"} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(locsQ.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Scope priority</Label>
              <Select value={form.scope_priority || "any"} onValueChange={(v) => setForm((f) => ({ ...f, scope_priority: v === "any" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Category</Label>
              <Input value={form.scope_category} onChange={(e) => setForm((f) => ({ ...f, scope_category: e.target.value }))} placeholder="any" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Minutes after SLA</Label>
              <Input type="number" min={0} value={form.minutes_after_sla} onChange={(e) => setForm((f) => ({ ...f, minutes_after_sla: Number(e.target.value) }))} />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Target role</Label>
              <Select value={form.target_role} onValueChange={(v) => setForm((f) => ({ ...f, target_role: v as never }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Level (1-3)</Label>
              <Input type="number" min={1} max={3} value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={form.bump_priority} onCheckedChange={(v) => setForm((f) => ({ ...f, bump_priority: v }))} />
                <span className="text-xs">Bump priority</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
                <span className="text-xs">Enabled</span>
              </div>
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add rule
              </Button>
            </div>
          </form>

          <ul className="space-y-2">
            {(rulesQ.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-surface/30 p-3 text-sm">
                <div>
                  <div className="font-medium">{r.name} <span className="ml-1 text-[10px] uppercase text-muted-foreground">L{r.level}</span></div>
                  <div className="text-xs text-muted-foreground">
                    {r.scope_priority ?? "any priority"} · {r.scope_category ?? "any category"} · +{r.minutes_after_sla}m → {r.target_role}
                    {r.bump_priority ? " · bump" : ""} {r.enabled ? "" : " · disabled"}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeMut.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
            {(rulesQ.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">No rules yet — add one above.</div>}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default EscalationsPage;
