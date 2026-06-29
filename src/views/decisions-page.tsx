"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Gavel, Loader2, MessageSquare, Plus, ThumbsDown, ThumbsUp, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  castVote,
  createDecision,
  generateDecisionSummary,
  getDecision,
  listDecisions,
  updateDecisionStatus,
} from "@/lib/decision.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtQar } from "@/lib/currency";

function Page() {
  const [view, setView] = useState<"list" | "new" | { id: string }>("list");
  if (typeof view === "object") return <DecisionDetail id={view.id} onBack={() => setView("list")} />;
  if (view === "new") return <NewDecision onBack={() => setView("list")} onCreated={(id) => setView({ id })} />;
  return <DecisionList onNew={() => setView("new")} onOpen={(id) => setView({ id })} />;
}

function DecisionList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
    const { data, isLoading } = useQuery({ queryKey: ["decisions"], queryFn: () => listDecisions() });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Decision Queue</h1>
          <p className="text-sm text-muted-foreground">Proposals, votes, and AI-assisted summaries for executive decisions.</p>
        </div>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" />Propose decision</Button>
      </div>
      {isLoading ? <Skeleton text="Loading…" /> : (data ?? []).length === 0 ? <Skeleton text="No decisions yet. Propose the first one." /> : (
        <div className="space-y-2">
          {(data ?? []).map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0 cursor-pointer flex-1" onClick={() => onOpen(d.id)}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{d.title}</span>
                  <Badge variant={d.priority === "critical" ? "destructive" : d.priority === "high" ? "default" : "outline"}>{d.priority}</Badge>
                  <Badge variant="secondary">{d.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Impact {fmtQar(Number(d.estimated_impact_aed ?? 0))} · Due {d.due_date ?? "—"} · By {(d.profiles as unknown as { display_name: string })?.display_name ?? "—"}
                </div>
              </div>
              <Button size="sm" onClick={() => onOpen(d.id)}>View</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewDecision({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
    const [form, setForm] = useState<{ title: string; description: string; priority: "low" | "medium" | "high" | "critical"; estimated_impact_aed: number; due_date: string }>({ title: "", description: "", priority: "medium", estimated_impact_aed: 0, due_date: "" });
  const mut = useMutation({
    mutationFn: () => createDecision(form),
    onSuccess: (r) => { toast.success("Decision proposed"); void qc.invalidateQueries({ queryKey: ["decisions"] }); onCreated(r.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-semibold text-foreground">Propose Decision</h1>
      </div>
      <form className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Open new branch in Doha" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Rationale, risks, and expected outcomes…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as "low" | "medium" | "high" | "critical" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["low", "medium", "high", "critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Estimated impact (QAR)</Label>
            <Input type="number" value={form.estimated_impact_aed} onChange={(e) => setForm((f) => ({ ...f, estimated_impact_aed: Number(e.target.value) }))} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Due date</Label>
          <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack} type="button">Cancel</Button>
          <Button type="submit" disabled={mut.isPending || !form.title.trim()}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Propose
          </Button>
        </div>
      </form>
    </div>
  );
}

function DecisionDetail({ id, onBack }: { id: string; onBack: () => void }) {
          const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["decision", id], queryFn: () => getDecision({ id }) });

  const voteMut = useMutation({
    mutationFn: (vote: "approve" | "reject" | "abstain" | "request_info") => castVote({ decision_id: id, vote }),
    onSuccess: () => { toast.success("Vote recorded"); void qc.invalidateQueries({ queryKey: ["decision", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (status: string) => updateDecisionStatus({ id, status: status as "proposed" | "reviewing" | "approved" | "rejected" | "implemented" | "cancelled" }),
    onSuccess: () => { toast.success("Status updated"); void qc.invalidateQueries({ queryKey: ["decision", id] }); void qc.invalidateQueries({ queryKey: ["decisions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const summaryMut = useMutation({
    mutationFn: () => generateDecisionSummary({ id }),
    onSuccess: () => { toast.success("Summary generated"); void qc.invalidateQueries({ queryKey: ["decision", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = data?.decision;
  const summary = data?.summary;
  const votes = data?.votes ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{d?.title ?? "Decision"}</h1>
            <p className="text-sm text-muted-foreground">{d?.description || "No description."}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => summaryMut.mutate()} disabled={summaryMut.isPending}>
            {summaryMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gavel className="mr-2 h-4 w-4" />}
            AI summary
          </Button>
          <Select value={d?.status} onValueChange={(v) => statusMut.mutate(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["proposed", "reviewing", "approved", "rejected", "implemented", "cancelled"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi label="Impact" value={fmtQar(Number(d?.estimated_impact_aed ?? 0))} />
        <Kpi label="Priority" value={d?.priority ?? "—"} />
        <Kpi label="Due" value={d?.due_date ?? "—"} />
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <VoteBadge label="Approve" count={summary.approve} icon={<ThumbsUp className="h-4 w-4" />} tone="text-rag-green" />
          <VoteBadge label="Reject" count={summary.reject} icon={<ThumbsDown className="h-4 w-4" />} tone="text-rag-red" />
          <VoteBadge label="Abstain" count={summary.abstain} icon={<X className="h-4 w-4" />} tone="text-muted-foreground" />
          <VoteBadge label="Request info" count={summary.request_info} icon={<MessageSquare className="h-4 w-4" />} tone="text-rag-amber" />
        </div>
      )}

      {d?.ai_summary && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground">AI Summary</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{d.ai_summary}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Cast your vote</h3>
        <div className="flex flex-wrap gap-2">
          {(["approve", "reject", "abstain", "request_info"] as const).map((v) => (
            <Button key={v} variant="outline" onClick={() => voteMut.mutate(v)} disabled={voteMut.isPending}>
              {v === "approve" && <ThumbsUp className="mr-2 h-4 w-4" />}
              {v === "reject" && <ThumbsDown className="mr-2 h-4 w-4" />}
              {v === "abstain" && <X className="mr-2 h-4 w-4" />}
              {v === "request_info" && <MessageSquare className="mr-2 h-4 w-4" />}
              {v}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Votes ({votes.length})</h3>
        <div className="space-y-2">
          {votes.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div className="flex items-center gap-2">
                {v.vote === "approve" && <CheckCircle2 className="h-4 w-4 text-rag-green" />}
                {v.vote === "reject" && <XCircle className="h-4 w-4 text-rag-red" />}
                {v.vote === "abstain" && <X className="h-4 w-4 text-muted-foreground" />}
                {v.vote === "request_info" && <MessageSquare className="h-4 w-4 text-rag-amber" />}
                <span className="text-sm">{(v.profiles as unknown as { display_name: string })?.display_name ?? "—"}</span>
              </div>
              <div className="text-xs text-muted-foreground">{v.note ?? "—"}</div>
            </div>
          ))}
          {votes.length === 0 && <div className="text-xs text-muted-foreground">No votes yet.</div>}
        </div>
      </div>
    </div>
  );
}

function VoteBadge({ label, count, icon, tone }: { label: string; count: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className={tone}>{icon}</span>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{count}</div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Skeleton({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export default Page;
