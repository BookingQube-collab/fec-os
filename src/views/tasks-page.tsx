"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ListChecks, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  createTaskTemplate,
  spawnTaskInstance,
} from "@/lib/tasks.functions";
import { useTaskInstances, useTaskTemplates } from "@/hooks/queries/useTasks";
import { useSites } from "@/hooks/queries/useSites";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";
import { flushQueue, installAutoFlush, queueSize } from "@/lib/offline-queue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermission } from "@/hooks/use-permission";

function TasksPage() {
  const canGenerateAi = usePermission("tasks.generate_ai");
  const canComplete = usePermission("tasks.complete");
  const canSupervisor = canGenerateAi || canComplete;
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-xs text-muted-foreground">
            Opening / closing / hourly checklists with photo proof. Works offline.
          </p>
        </div>
        {canSupervisor ? (
          <Button variant="outline" size="sm" asChild>
            <Link href="/tasks/supervisor">
              <Sparkles className="mr-1 h-3 w-3" />
              Supervisor
            </Link>
          </Button>
        ) : null}
        <OfflineBadge />
      </header>
      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="new">New template</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="mt-4"><TodayInstances /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesList /></TabsContent>
        <TabsContent value="new" className="mt-4"><NewTemplateForm /></TabsContent>
      </Tabs>
    </div>
  );
}

function OfflineBadge() {
  const [size, setSize] = useState(0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    installAutoFlush();
    setSize(queueSize());
    setOnline(navigator.onLine);
    const onChange = () => setSize(queueSize());
    const onOnline = () => { setOnline(true); void flushQueue().then(onChange); };
    const onOffline = () => setOnline(false);
    window.addEventListener("fec-queue-changed", onChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void flushQueue().then(onChange);
    return () => {
      window.removeEventListener("fec-queue-changed", onChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  if (online && size === 0) return null;
  return (
    <Badge variant={online ? "outline" : "destructive"} className="text-xs">
      {online ? `Syncing ${size}` : `Offline · ${size} queued`}
    </Badge>
  );
}

function TodayInstances() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useTaskInstances(
    { locationId: locationId ?? null },
    { enabled: true },
  );
  if (isLoading) return <Skeleton text="Loading…" />;
  if (!data || data.length === 0) return <Skeleton text="No checklists yet. Spawn one from Templates." />;
  return (
    <div className="space-y-2">
      {data.map((inst) => (
        <Link
          key={inst.id}
          href={`/tasks/${inst.id}`}
          className="flex items-center justify-between rounded-lg border border-border bg-surface/30 px-4 py-3 hover:bg-surface/60"
        >
          <div>
            <div className="font-medium text-sm">{inst.title}</div>
            <div className="text-xs text-muted-foreground">
              {inst.due_at ? `due ${new Date(inst.due_at).toLocaleString()}` : "no due date"}
            </div>
          </div>
          <Badge variant={inst.status === "open" || inst.status === "overdue" ? "default" : "outline"} className="uppercase">
            {inst.status}
          </Badge>
        </Link>
      ))}
    </div>
  );
}

function TemplatesList() {
  const locationId = useAppStore((s) => s.currentLocationId);
      const qc = useQueryClient();
  const { data, isLoading } = useTaskTemplates(locationId ?? null);
  const spawnMut = useMutation({
    mutationFn: (template_id: string) => spawnTaskInstance({ template_id, due_at: new Date(Date.now() + 8 * 3600_000).toISOString() }),
    onSuccess: () => {
      toast.success("Checklist spawned");
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.instances({ locationId: locationId ?? null }) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <Skeleton text="Loading…" />;
  if (!data || data.length === 0) return <Skeleton text="No templates. Create one in the next tab." />;
  return (
    <div className="space-y-2">
      {data.map((t) => (
        <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-surface/30 px-4 py-3">
          <div>
            <div className="font-medium text-sm">{t.title}</div>
            <div className="text-xs text-muted-foreground">{t.kind} · {t.description ?? "—"}</div>
          </div>
          <Button size="sm" onClick={() => spawnMut.mutate(t.id)} disabled={spawnMut.isPending}>
            {spawnMut.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
            Spawn
          </Button>
        </div>
      ))}
    </div>
  );
}

type DraftItem = { label: string; requires_photo: boolean; required: boolean };

function NewTemplateForm() {
  const currentLoc = useAppStore((s) => s.currentLocationId);
      const qc = useQueryClient();
  const locsQ = useSites();
  const [form, setForm] = useState({
    location_id: currentLoc ?? "",
    title: "",
    kind: "opening",
    description: "",
  });
  const [items, setItems] = useState<DraftItem[]>([
    { label: "Unlock front gate", requires_photo: false, required: true },
    { label: "Inspect main attraction safety harnesses", requires_photo: true, required: true },
  ]);

  const mutation = useMutation({
    mutationFn: () =>
      createTaskTemplate({ location_id: form.location_id,
          title: form.title,
          kind: form.kind,
          description: form.description || undefined,
          items: items.filter((i) => i.label.trim().length > 0),
        }),
    onSuccess: () => {
      toast.success("Template created");
      setForm((f) => ({ ...f, title: "", description: "" }));
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.templates({ locationId: form.location_id || currentLoc }) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || form.title.length < 3) {
          toast.error("Branch and title required"); return;
        }
        if (items.filter((i) => i.label.trim()).length === 0) {
          toast.error("Add at least one item"); return;
        }
        mutation.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Branch" required>
          <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {(locsQ.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kind">
          <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["opening","closing","hourly","safety","custom"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Title" required>
        <Input value={form.title} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </Field>
      <Field label="Description">
        <Input value={form.description} maxLength={2000} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Items</Label>
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={it.label} maxLength={200} placeholder={`Item #${idx + 1}`}
              onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Checkbox checked={it.requires_photo}
                onCheckedChange={(v) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, requires_photo: !!v } : x))} />
              photo
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Checkbox checked={it.required}
                onCheckedChange={(v) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, required: !!v } : x))} />
              required
            </label>
            <Button type="button" size="sm" variant="ghost"
              onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}>×</Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline"
          onClick={() => setItems((arr) => [...arr, { label: "", requires_photo: false, required: true }])}>
          + Add item
        </Button>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save template
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

function Skeleton({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export default TasksPage;
