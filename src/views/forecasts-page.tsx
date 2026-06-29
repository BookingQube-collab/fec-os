"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createForecast,
  deleteForecast,
  generateForecastCommentary,
  getForecast,
  listForecasts,
  updateForecast,
} from "@/lib/forecast.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtQar } from "@/lib/currency";

function Page() {
  const [view, setView] = useState<"list" | "new" | { id: string }>("list");
  if (typeof view === "object") return <ForecastDetail id={view.id} onBack={() => setView("list")} />;
  if (view === "new") return <NewForecast onBack={() => setView("list")} onCreated={(id) => setView({ id })} />;
  return <ForecastList onNew={() => setView("new")} onOpen={(id) => setView({ id })} />;
}

function ForecastList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
    const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["forecasts"], queryFn: () => listForecasts() });
  const del = useMutation({
    mutationFn: (id: string) => deleteForecast({ id }),
    onSuccess: () => { toast.success("Deleted"); void qc.invalidateQueries({ queryKey: ["forecasts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Forecast Scenarios</h1>
          <p className="text-sm text-muted-foreground">What-if builder with adjustable assumptions and AI commentary.</p>
        </div>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" />New scenario</Button>
      </div>
      {isLoading ? <Skeleton text="Loading…" /> : (data ?? []).length === 0 ? <Skeleton text="No forecasts yet. Create your first scenario." /> : (
        <div className="space-y-2">
          {(data ?? []).map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0 cursor-pointer" onClick={() => onOpen(f.id)}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{f.title}</span>
                  <Badge variant={f.status === "published" ? "default" : f.status === "archived" ? "secondary" : "outline"}>{f.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Revenue +{f.base_revenue_growth_pct}% · Margin {f.base_margin_pct}% · Footfall +{f.footfall_uplift_pct}% · {f.horizon_months}mo horizon
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => del.mutate(f.id)} disabled={del.isPending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
                <Button size="sm" onClick={() => onOpen(f.id)}>Open</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewForecast({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
    const [form, setForm] = useState({
    title: "",
    description: "",
    horizon_months: 12,
    base_revenue_growth_pct: 5,
    base_margin_pct: 20,
    footfall_uplift_pct: 0,
    opex_change_pct: 0,
    capex_plan_aed: 0,
  });
  const mut = useMutation({
    mutationFn: () => createForecast(form),
    onSuccess: (r) => { toast.success("Scenario created"); void qc.invalidateQueries({ queryKey: ["forecasts"] }); onCreated(r.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-semibold text-foreground">New Forecast Scenario</h1>
      </div>
      <form className="max-w-2xl space-y-5 rounded-lg border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Ramadan 2026 optimistic" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Context for this scenario…" />
        </div>
        <AssumptionSlider label="Revenue growth %" value={form.base_revenue_growth_pct} min={-50} max={100} step={1} onChange={(v) => setForm((f) => ({ ...f, base_revenue_growth_pct: v }))} />
        <AssumptionSlider label="Target margin %" value={form.base_margin_pct} min={0} max={60} step={1} onChange={(v) => setForm((f) => ({ ...f, base_margin_pct: v }))} />
        <AssumptionSlider label="Footfall uplift %" value={form.footfall_uplift_pct} min={-30} max={100} step={1} onChange={(v) => setForm((f) => ({ ...f, footfall_uplift_pct: v }))} />
        <AssumptionSlider label="OpEx change %" value={form.opex_change_pct} min={-20} max={50} step={1} onChange={(v) => setForm((f) => ({ ...f, opex_change_pct: v }))} />
        <div className="space-y-2">
          <Label>CapEx plan (QAR)</Label>
          <Input type="number" value={form.capex_plan_aed} onChange={(e) => setForm((f) => ({ ...f, capex_plan_aed: Number(e.target.value) }))} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack} type="button">Cancel</Button>
          <Button type="submit" disabled={mut.isPending || !form.title.trim()}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create scenario
          </Button>
        </div>
      </form>
    </div>
  );
}

function AssumptionSlider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
        <span className="text-sm font-medium">{value}%</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function ForecastDetail({ id, onBack }: { id: string; onBack: () => void }) {
        const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["forecast", id], queryFn: () => getForecast({ id }) });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ base_revenue_growth_pct: 0, base_margin_pct: 0, footfall_uplift_pct: 0, opex_change_pct: 0, capex_plan_aed: 0 });

  const updateMut = useMutation({
    mutationFn: (patch: typeof form) => updateForecast({ id, ...patch }),
    onSuccess: () => { toast.success("Updated"); setEditing(false); void qc.invalidateQueries({ queryKey: ["forecast", id] }); void qc.invalidateQueries({ queryKey: ["forecasts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const genMut = useMutation({
    mutationFn: () => generateForecastCommentary({ id }),
    onSuccess: () => { toast.success("Commentary generated"); void qc.invalidateQueries({ queryKey: ["forecast", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = data?.forecast;
  const results = data?.results ?? [];
  const totalRev = results.reduce((a, r) => a + Number(r.projected_revenue ?? 0), 0);
  const totalEbitda = results.reduce((a, r) => a + Number(r.projected_ebitda ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{f?.title ?? "Forecast"}</h1>
            <p className="text-sm text-muted-foreground">{f?.description || "No description."}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
            {genMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            AI commentary
          </Button>
          <Button variant="outline" onClick={() => { setForm({ base_revenue_growth_pct: f?.base_revenue_growth_pct ?? 0, base_margin_pct: f?.base_margin_pct ?? 20, footfall_uplift_pct: f?.footfall_uplift_pct ?? 0, opex_change_pct: f?.opex_change_pct ?? 0, capex_plan_aed: f?.capex_plan_aed ?? 0 }); setEditing(true); }}>Edit assumptions</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi label="Projected revenue" value={fmtQar(totalRev)} />
        <Kpi label="Projected EBITDA" value={fmtQar(totalEbitda)} />
        <Kpi label="Branches" value={`${results.length}`} />
      </div>

      {f?.ai_commentary && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground">AI Commentary</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{f.ai_commentary}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Projected revenue</TableHead>
              <TableHead className="text-right">Projected EBITDA</TableHead>
              <TableHead className="text-right">Margin %</TableHead>
              <TableHead className="text-right">Footfall</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {results.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.locations?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{fmtQar(Number(r.projected_revenue ?? 0))}</TableCell>
                <TableCell className="text-right">{fmtQar(Number(r.projected_ebitda ?? 0))}</TableCell>
                <TableCell className="text-right">{Number(r.projected_margin_pct ?? 0).toFixed(1)}%</TableCell>
                <TableCell className="text-right">{Math.round(Number(r.projected_footfall ?? 0)).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-medium">Edit assumptions</h3>
          <AssumptionSlider label="Revenue growth %" value={form.base_revenue_growth_pct} min={-50} max={100} step={1} onChange={(v) => setForm((f) => ({ ...f, base_revenue_growth_pct: v }))} />
          <AssumptionSlider label="Target margin %" value={form.base_margin_pct} min={0} max={60} step={1} onChange={(v) => setForm((f) => ({ ...f, base_margin_pct: v }))} />
          <AssumptionSlider label="Footfall uplift %" value={form.footfall_uplift_pct} min={-30} max={100} step={1} onChange={(v) => setForm((f) => ({ ...f, footfall_uplift_pct: v }))} />
          <AssumptionSlider label="OpEx change %" value={form.opex_change_pct} min={-20} max={50} step={1} onChange={(v) => setForm((f) => ({ ...f, opex_change_pct: v }))} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate(form)} disabled={updateMut.isPending}>
              {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Recalculate
            </Button>
          </div>
        </div>
      )}
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
