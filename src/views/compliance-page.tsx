"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  closeIncident,
  listAuditsWithFindings,
  listIncidents,
  listMallRequests,
  listObligations,
  updateFindingStatus,
  updateObligationStatus,
  respondMallRequest,
} from "@/lib/compliance.functions";
import { useAppStore } from "@/stores/app-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

function CompliancePage() {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Compliance</h1>
          <p className="text-xs text-muted-foreground">Incidents, audits & findings, obligations, and mall requests.</p>
        </div>
      </header>
      <Tabs defaultValue="incidents">
        <TabsList>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="audits">Audits</TabsTrigger>
          <TabsTrigger value="obligations">Obligations</TabsTrigger>
          <TabsTrigger value="mall">Mall</TabsTrigger>
        </TabsList>
        <TabsContent value="incidents" className="mt-4"><IncidentsTab /></TabsContent>
        <TabsContent value="audits" className="mt-4"><AuditsTab /></TabsContent>
        <TabsContent value="obligations" className="mt-4"><ObligationsTab /></TabsContent>
        <TabsContent value="mall" className="mt-4"><MallTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useLoc() { return useAppStore((s) => s.currentLocationId); }
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function IncidentsTab() {
  const locationId = useLoc();
      const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["incidents", locationId], queryFn: () => listIncidents({ locationId: locationId ?? null }) });
  const [openId, setOpenId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState("");
  const [actions, setActions] = useState("");
  const mutation = useMutation({
    mutationFn: () => closeIncident({ id: openId!, root_cause: rootCause, actions }),
    onSuccess: () => {
      toast.success("Incident closed");
      setOpenId(null); setRootCause(""); setActions("");
      void qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (isLoading) return <Empty>Loading incidents…</Empty>;
  if (!data?.length) return <Empty>No incidents recorded.</Empty>;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Severity</th><th className="px-3 py-2 text-left">Summary</th><th className="px-3 py-2 text-left">Status</th><th /></tr>
          </thead>
          <tbody>
            {data.map((i) => (
              <tr key={i.id} className="border-t border-border hover:bg-surface/40">
                <td className="px-3 py-2 text-xs">{new Date(i.occurred_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-xs uppercase">{i.category}</td>
                <td className="px-3 py-2 text-xs">{i.severity}</td>
                <td className="px-3 py-2">{i.summary}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="uppercase text-[10px]">{i.status}</Badge></td>
                <td className="px-3 py-2 text-right">
                  {i.status !== "closed" ? (
                    <Button size="sm" variant="outline" onClick={() => setOpenId(i.id)}>RCA & close</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId ? (
        <div className="space-y-3 rounded-lg border border-border bg-surface/30 p-4">
          <h3 className="text-sm font-medium">Close incident</h3>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Root cause</Label>
            <Textarea rows={2} value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Corrective actions</Label>
            <Textarea rows={3} value={actions} onChange={(e) => setActions(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpenId(null)}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || rootCause.length < 3 || actions.length < 3}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Close incident
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AuditsTab() {
  const locationId = useLoc();
      const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["audits", locationId], queryFn: () => listAuditsWithFindings({ locationId: locationId ?? null }) });
  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: "open" | "in_remediation" | "closed" | "accepted_risk" }) =>
      updateFindingStatus(vars),
    onSuccess: () => { toast.success("Finding updated"); void qc.invalidateQueries({ queryKey: ["audits"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (isLoading) return <Empty>Loading audits…</Empty>;
  if (!data?.audits.length) return <Empty>No audits recorded.</Empty>;
  const findingsByAudit = new Map<string, typeof data.findings>();
  for (const f of data.findings) {
    const arr = findingsByAudit.get(f.audit_id) ?? [];
    arr.push(f);
    findingsByAudit.set(f.audit_id, arr);
  }
  return (
    <div className="space-y-3">
      {data.audits.map((a) => {
        const fs = findingsByAudit.get(a.id) ?? [];
        const open = fs.filter((f) => f.status !== "closed").length;
        return (
          <div key={a.id} className="rounded-lg border border-border bg-surface/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium uppercase">{a.audit_type}</div>
                <div className="text-xs text-muted-foreground">{a.conducted_on}</div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {a.score != null ? <span className="tabular-nums">Score {a.score}</span> : null}
                <Badge variant={open > 0 ? "destructive" : "outline"} className="uppercase text-[10px]">{open} open</Badge>
              </div>
            </div>
            {a.summary ? <p className="mt-2 text-xs text-muted-foreground">{a.summary}</p> : null}
            {fs.length ? (
              <ul className="mt-3 space-y-1">
                {fs.map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
                    <div>
                      <div className="font-medium">{f.title}</div>
                      {f.detail ? <div className="text-muted-foreground">{f.detail}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="uppercase text-[10px]">{f.severity}</Badge>
                      <Badge variant="outline" className="uppercase text-[10px]">{f.status}</Badge>
                      {f.status !== "closed" ? (
                        <>
                          {f.status === "open" ? (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => mutation.mutate({ id: f.id, status: "in_remediation" })}>Start</Button>
                          ) : null}
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => mutation.mutate({ id: f.id, status: "closed" })}>Close</Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ObligationsTab() {
  const locationId = useLoc();
      const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["obligations", locationId], queryFn: () => listObligations({ locationId: locationId ?? null }) });
  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) => updateObligationStatus(vars),
    onSuccess: () => { toast.success("Obligation updated"); void qc.invalidateQueries({ queryKey: ["obligations"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (isLoading) return <Empty>Loading obligations…</Empty>;
  if (!data?.length) return <Empty>No obligations registered.</Empty>;
  const now = Date.now();
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-3 py-2 text-left">Title</th><th className="px-3 py-2 text-left">Authority</th><th className="px-3 py-2 text-left">Due</th><th className="px-3 py-2 text-left">Status</th><th /></tr>
        </thead>
        <tbody>
          {data.map((o) => {
            const overdue = o.due_on && new Date(o.due_on).getTime() < now && o.status !== "closed";
            return (
              <tr key={o.id} className="border-t border-border hover:bg-surface/40">
                <td className="px-3 py-2 font-medium">{o.title}</td>
                <td className="px-3 py-2 text-xs">{o.authority ?? "—"}</td>
                <td className={`px-3 py-2 text-xs ${overdue ? "text-rose-400" : "text-muted-foreground"}`}>{o.due_on ?? "—"}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="uppercase text-[10px]">{o.status}</Badge></td>
                <td className="px-3 py-2 text-right">
                  {o.status !== "closed" ? (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => mutation.mutate({ id: o.id, status: "closed" })} disabled={mutation.isPending}>Mark complete</Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MallTab() {
  const locationId = useLoc();
      const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["mall_requests", locationId], queryFn: () => listMallRequests({ locationId: locationId ?? null }) });
  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) => respondMallRequest(vars),
    onSuccess: () => { toast.success("Mall request updated"); void qc.invalidateQueries({ queryKey: ["mall_requests"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (isLoading) return <Empty>Loading mall requests…</Empty>;
  if (!data?.length) return <Empty>No mall requests on file.</Empty>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-3 py-2 text-left">Subject</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Due</th><th className="px-3 py-2 text-left">Status</th><th /></tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.id} className="border-t border-border hover:bg-surface/40">
              <td className="px-3 py-2 font-medium">{m.subject}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{m.category ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{m.response_due_at ? new Date(m.response_due_at).toLocaleDateString() : "—"}</td>
              <td className="px-3 py-2"><Badge variant="outline" className="uppercase text-[10px]">{m.status}</Badge></td>
              <td className="px-3 py-2 text-right space-x-1">
                {m.status !== "responded" && m.status !== "closed" ? (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => mutation.mutate({ id: m.id, status: "responded" })} disabled={mutation.isPending}>Respond</Button>
                ) : null}
                {m.status !== "closed" ? (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => mutation.mutate({ id: m.id, status: "closed" })} disabled={mutation.isPending}>Close</Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CompliancePage;
