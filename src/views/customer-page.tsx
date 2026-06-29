"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Briefcase, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { createComplaint, resolveComplaint, triageComplaintWithAI, updateComplaintStatus } from "@/lib/customer.functions";
import { useComplaints } from "@/hooks/queries/useCustomer";
import { useSites } from "@/hooks/queries/useSites";
import { useAppStore } from "@/stores/app-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUSES = ["new", "investigating", "resolved", "escalated", "dismissed"] as const;
const CHANNELS = ["walk_in", "phone", "email", "social", "survey"] as const;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;

function CustomerPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Briefcase className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Customer</h1>
          <p className="text-xs text-muted-foreground">Complaints intake, triage, and recovery.</p>
        </div>
      </header>
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Complaints</TabsTrigger>
          <TabsTrigger value="new">New complaint</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4"><ComplaintsList /></TabsContent>
        <TabsContent value="new" className="mt-4"><NewComplaintForm /></TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function ComplaintsList() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const [status, setStatus] = useState<string>("all");
          const qc = useQueryClient();
  const { data, isLoading } = useComplaints({
    locationId: locationId ?? null,
    status: status === "all" ? null : status,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => resolveComplaint({ id: openId!, resolution_notes: notes }),
    onSuccess: () => {
      toast.success("Complaint resolved");
      setOpenId(null); setNotes("");
      void qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const triageMutation = useMutation({
    mutationFn: (vars: { id: string; summary: string; channel: string }) => triageComplaintWithAI(vars),
    onSuccess: () => { toast.success("AI triage complete"); void qc.invalidateQueries({ queryKey: ["complaints"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "new" | "investigating" | "resolved" | "escalated" | "dismissed" }) => updateComplaintStatus(vars),
    onSuccess: () => { toast.success("Status updated"); void qc.invalidateQueries({ queryKey: ["complaints"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", ...STATUSES].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? <Empty>Loading complaints…</Empty> : !data?.length ? <Empty>No complaints in scope.</Empty> : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">Guest</th><th className="px-3 py-2 text-left">Channel</th><th className="px-3 py-2 text-left">Sev</th><th className="px-3 py-2 text-left">Summary</th><th className="px-3 py-2 text-left">Status</th><th /></tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 text-xs">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium">{c.guest_name ?? "Anonymous"}</div>
                    <div className="text-[11px] text-muted-foreground">{c.guest_contact ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{c.channel}</td>
                  <td className="px-3 py-2 text-xs uppercase">{c.severity}</td>
                  <td className="px-3 py-2">
                    <div>{c.summary}</div>
                    {c.ai_triage ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <Badge variant="outline" className="text-[10px] uppercase">{(c.ai_triage as { category?: string }).category ?? "—"}</Badge>
                        <Badge variant="outline" className="text-[10px] uppercase">{(c.ai_triage as { sentiment?: string }).sentiment ?? "—"}</Badge>
                        {((c.ai_triage as { suggested_actions?: string[] }).suggested_actions ?? []).slice(0, 2).map((a, i) => (
                          <span key={i} className="rounded bg-surface/60 px-1.5 py-0.5">{a}</span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2"><Badge variant="outline" className="uppercase text-[10px]">{c.status}</Badge></td>
                  <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                    {!c.ai_triage ? (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={triageMutation.isPending} onClick={() => triageMutation.mutate({ id: c.id, summary: c.summary, channel: c.channel })}>
                        <Sparkles className="mr-1 h-3 w-3" /> AI triage
                      </Button>
                    ) : null}
                    {c.status === "new" ? (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => statusMutation.mutate({ id: c.id, status: "investigating" })}>Investigate</Button>
                    ) : null}
                    {c.status !== "resolved" && c.status !== "dismissed" ? (
                      <>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setOpenId(c.id)}>Resolve</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => statusMutation.mutate({ id: c.id, status: "dismissed" })}>Dismiss</Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId ? (
        <div className="space-y-3 rounded-lg border border-border bg-surface/30 p-4">
          <h3 className="text-sm font-medium">Resolution notes</h3>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpenId(null)}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || notes.length < 3}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mark resolved
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NewComplaintForm() {
  const currentLoc = useAppStore((s) => s.currentLocationId);
      const qc = useQueryClient();
  const locsQ = useSites();
  const [form, setForm] = useState({
    location_id: currentLoc ?? "",
    guest_name: "",
    guest_contact: "",
    channel: "walk_in" as (typeof CHANNELS)[number],
    severity: "low" as (typeof SEVERITIES)[number],
    category: "",
    summary: "",
  });
  const mutation = useMutation({
    mutationFn: () => createComplaint({
        location_id: form.location_id,
        guest_name: form.guest_name || null,
        guest_contact: form.guest_contact || null,
        channel: form.channel,
        category: form.category || null,
        severity: form.severity,
        summary: form.summary,
      }),
    onSuccess: () => {
      toast.success("Complaint logged");
      void qc.invalidateQueries({ queryKey: ["complaints"] });
      setForm((f) => ({ ...f, guest_name: "", guest_contact: "", summary: "", category: "" }));
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || form.summary.length < 3) { toast.error("Branch and summary required"); return; }
        mutation.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Branch" required>
          <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {(locsQ.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Channel">
          <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v as never }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Guest name"><Input value={form.guest_name} onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))} /></Field>
        <Field label="Guest contact"><Input value={form.guest_contact} onChange={(e) => setForm((f) => ({ ...f, guest_contact: e.target.value }))} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Severity">
          <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v as never }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Category"><Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></Field>
      </div>
      <Field label="Summary" required>
        <Textarea rows={3} value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Log complaint
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

export default CustomerPage;
