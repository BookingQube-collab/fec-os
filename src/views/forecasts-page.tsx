"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
    const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["forecasts"], queryFn: () => listForecasts() });
  const del = useMutation({
    mutationFn: (id: string) => deleteForecast({ id }),
    onSuccess: () => { toast.success(t("forecasts.deleted")); void qc.invalidateQueries({ queryKey: ["forecasts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("forecasts.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("forecasts.subtitle")}</p>
        </div>
        <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" />{t("forecasts.new")}</Button>
      </div>
      {isLoading ? <Skeleton text={t("common.loading")} /> : (data ?? []).length === 0 ? <Skeleton text={t("forecasts.empty")} /> : (
        <div className="space-y-2">
          {(data ?? []).map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0 cursor-pointer" onClick={() => onOpen(f.id)}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{f.title}</span>
                  <Badge variant={f.status === "published" ? "default" : f.status === "archived" ? "secondary" : "outline"}>{t(`forecasts.status.${f.status}`, { defaultValue: f.status })}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("forecasts.summary", { rev: f.base_revenue_growth_pct, margin: f.base_margin_pct, footfall: f.footfall_uplift_pct, months: f.horizon_months })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => del.mutate(f.id)} disabled={del.isPending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
                <Button size="sm" onClick={() => onOpen(f.id)}>{t("forecasts.open")}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewForecast({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
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
    onSuccess: (r) => { toast.success(t("forecasts.created")); void qc.invalidateQueries({ queryKey: ["forecasts"] }); onCreated(r.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-semibold text-foreground">{t("forecasts.newTitle")}</h1>
      </div>
      <form className="max-w-2xl space-y-5 rounded-lg border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
        <div className="space-y-2">
          <Label>{t("forecasts.titleLabel")}</Label>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("forecasts.titlePlaceholder")} maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label>{t("common.description")}</Label>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("forecasts.descPlaceholder")} />
        </div>
        <AssumptionSlider label={t("forecasts.revenueGrowth")} value={form.base_revenue_growth_pct} min={-50} max={100} step={1} onChange={(v) => setForm((f) => ({ ...f, base_revenue_growth_pct: v }))} />
        <AssumptionSlider label={t("forecasts.targetMargin")} value={form.base_margin_pct} min={0} max={60} step={1} onChange={(v) => setForm((f) => ({ ...f, base_margin_pct: v }))} />
        <AssumptionSlider label={t("forecasts.footfall")} value={form.footfall_uplift_pct} min={-30} max={100} step={1} onChange={(v) => setForm((f) => ({ ...f, footfall_uplift_pct: v }))} />
        <AssumptionSlider label={t("forecasts.opex")} value={form.opex_change_pct} min={-20} max={50} step={1} onChange={(v) => setForm((f) => ({ ...f, opex_change_pct: v }))} />
        <div className="space-y-2">
          <Label>{t("forecasts.capex", { qar: t("common.qar") })}</Label>
          <Input type="number" value={form.capex_plan_aed} onChange={(e) => setForm((f) => ({ ...f, capex_plan_aed: Number(e.target.value) }))} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack} type="button">{t("common.cancel")}</Button>
          <Button type="submit" disabled={mut.isPending || !form.title.trim()}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("forecasts.create")}
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
  const { t } = useTranslation();
        const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["forecast", id], queryFn: () => getForecast({ id }) });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ base_revenue_growth_pct: 0, base_margin_pct: 0, footfall_uplift_pct: 0, opex_change_pct: 0, capex_plan_aed: 0 });

  const updateMut = useMutation({
    mutationFn: (patch: typeof form) => updateForecast({ id, ...patch }),
    onSuccess: () => { toast.success(t("forecasts.updated")); setEditing(false); void qc.invalidateQueries({ queryKey: ["forecast", id] }); void qc.invalidateQueries({ queryKey: ["forecasts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const genMut = useMutation({
    mutationFn: () => generateForecastCommentary({ id }),
    onSuccess: () => { toast.success(t("forecasts.commentaryGenerated")); void qc.invalidateQueries({ queryKey: ["forecast", id] }); },
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
            <h1 className="text-2xl font-semibold text-foreground">{f?.title ?? t("nav.forecasts")}</h1>
            <p className="text-sm text-muted-foreground">{f?.description || t("forecasts.noDescription")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
            {genMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {t("forecasts.aiCommentary")}
          </Button>
          <Button variant="outline" onClick={() => { setForm({ base_revenue_growth_pct: f?.base_revenue_growth_pct ?? 0, base_margin_pct: f?.base_margin_pct ?? 20, footfall_uplift_pct: f?.footfall_uplift_pct ?? 0, opex_change_pct: f?.opex_change_pct ?? 0, capex_plan_aed: f?.capex_plan_aed ?? 0 }); setEditing(true); }}>{t("forecasts.editAssumptions")}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi label={t("forecasts.projectedRevenue")} value={fmtQar(totalRev)} />
        <Kpi label={t("forecasts.projectedEbitda")} value={fmtQar(totalEbitda)} />
        <Kpi label={t("forecasts.branches")} value={`${results.length}`} />
      </div>

      {f?.ai_commentary && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground">{t("forecasts.aiTitle")}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{f.ai_commentary}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.branch")}</TableHead>
              <TableHead className="text-right">{t("forecasts.projectedRevenue")}</TableHead>
              <TableHead className="text-right">{t("forecasts.projectedEbitda")}</TableHead>
              <TableHead className="text-right">{t("forecasts.marginPct")}</TableHead>
              <TableHead className="text-right">{t("forecasts.footfall")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("common.loading")}</TableCell></TableRow>}
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
          <h3 className="text-sm font-medium">{t("forecasts.editAssumptions")}</h3>
          <AssumptionSlider label={t("forecasts.revenueGrowth")} value={form.base_revenue_growth_pct} min={-50} max={100} step={1} onChange={(v) => setForm((f) => ({ ...f, base_revenue_growth_pct: v }))} />
          <AssumptionSlider label={t("forecasts.targetMargin")} value={form.base_margin_pct} min={0} max={60} step={1} onChange={(v) => setForm((f) => ({ ...f, base_margin_pct: v }))} />
          <AssumptionSlider label={t("forecasts.footfall")} value={form.footfall_uplift_pct} min={-30} max={100} step={1} onChange={(v) => setForm((f) => ({ ...f, footfall_uplift_pct: v }))} />
          <AssumptionSlider label={t("forecasts.opex")} value={form.opex_change_pct} min={-20} max={50} step={1} onChange={(v) => setForm((f) => ({ ...f, opex_change_pct: v }))} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => updateMut.mutate(form)} disabled={updateMut.isPending}>
              {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("forecasts.recalculate")}
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
