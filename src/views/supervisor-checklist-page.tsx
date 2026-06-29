"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ListChecks, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  generateSupervisorChecklist,
  getTodaysSupervisorChecklists,
} from "@/lib/tasks.functions";
import { useSites } from "@/hooks/queries/useSites";
import { useAppStore } from "@/stores/app-store";
import { usePermission } from "@/hooks/use-permission";
import { flushQueue, installAutoFlush, queueSize } from "@/lib/offline-queue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TODAY = () => new Date().toISOString().slice(0, 10);

function SupervisorChecklistPage() {
  const canGenerate = usePermission("tasks.generate_ai");

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      <header className="flex items-center gap-3">
        <Link href="/tasks" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Supervisor checklist</h1>
          <p className="text-xs text-muted-foreground">Complete today&apos;s branch checklist · works offline</p>
        </div>
        <OfflineBadge />
      </header>

      <Tabs defaultValue="today">
        <TabsList className={`grid w-full ${canGenerate ? "grid-cols-2" : "grid-cols-1"}`}>
          <TabsTrigger value="today" className="text-sm">My daily checklist</TabsTrigger>
          {canGenerate ? (
            <TabsTrigger value="generate" className="text-sm">
              <Sparkles className="mr-1 h-3 w-3" />
              Generate with AI
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="today" className="mt-4">
          <TodayChecklist />
        </TabsContent>
        {canGenerate ? (
          <TabsContent value="generate" className="mt-4">
            <GenerateChecklistForm />
          </TabsContent>
        ) : null}
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
      {online ? `Syncing ${size}` : `Offline · ${size}`}
    </Badge>
  );
}

function TodayChecklist() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const locsQ = useSites();
  const branch = (locsQ.data ?? []).find((l) => l.id === locationId);

  const { data, isLoading } = useQuery({
    queryKey: ["supervisor-checklists-today", { locationId, date: TODAY() }],
    queryFn: () => getTodaysSupervisorChecklists({ locationId: locationId!, date: TODAY() }),
    enabled: !!locationId,
    refetchInterval: 15_000,
  });

  if (!locationId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Select your branch in the top bar to see today&apos;s checklist.
      </div>
    );
  }

  if (isLoading) return <Skeleton text="Loading today's checklist…" />;

  const open = (data ?? []).filter((c) => c.status === "open" || c.status === "overdue");
  const done = (data ?? []).filter((c) => c.status !== "open" && c.status !== "overdue");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface/30 px-4 py-3">
        <div className="text-xs text-muted-foreground">Branch · {TODAY()}</div>
        <div className="font-medium">{branch ? `${branch.code} — ${branch.name}` : "Your branch"}</div>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No checklist for today yet.</p>
          <GenerateShortcut />
        </div>
      ) : null}

      {open.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">To complete</h2>
          {open.map((inst) => (
            <ChecklistCard key={inst.id} inst={inst} primary />
          ))}
        </section>
      ) : null}

      {done.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Submitted</h2>
          {done.map((inst) => (
            <ChecklistCard key={inst.id} inst={inst} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ChecklistCard({
  inst,
  primary,
}: {
  inst: {
    id: string;
    title: string;
    status: string;
    kind: string;
    due_at: string | null;
    submitted_at: string | null;
  };
  primary?: boolean;
}) {
  const isOpen = inst.status === "open" || inst.status === "overdue";
  return (
    <Link
      href={`/tasks/${inst.id}`}
      className={`flex items-center justify-between rounded-xl border px-4 py-4 transition-colors ${
        primary
          ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
          : "border-border bg-surface/30 hover:bg-surface/60"
      }`}
    >
      <div className="min-w-0 flex-1 pr-3">
        <div className="truncate font-medium text-sm">{inst.title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground capitalize">
          {inst.kind.replace("_", " ")}
          {inst.due_at ? ` · due ${new Date(inst.due_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      </div>
      {isOpen ? (
        <span className="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Open
        </span>
      ) : (
        <Badge variant="outline" className="shrink-0 gap-1 uppercase">
          <CheckCircle2 className="h-3 w-3" />
          {inst.status}
        </Badge>
      )}
    </Link>
  );
}

function GenerateShortcut() {
  const canGenerate = usePermission("tasks.generate_ai");
  if (!canGenerate) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Switch to the <strong>Generate with AI</strong> tab to create today&apos;s checklist.
    </p>
  );
}

function GenerateChecklistForm() {
  const router = useRouter();
  const locationId = useAppStore((s) => s.currentLocationId);
  const qc = useQueryClient();
  const locsQ = useSites();

  const [form, setForm] = useState({
    location_id: locationId ?? "",
    kind: "daily" as "opening" | "daily" | "closing" | "supervisor_ops",
    date: TODAY(),
  });

  useEffect(() => {
    if (locationId && !form.location_id) setForm((f) => ({ ...f, location_id: locationId }));
  }, [locationId, form.location_id]);

  const mutation = useMutation({
    mutationFn: () =>
      generateSupervisorChecklist({
        location_id: form.location_id,
        kind: form.kind,
        date: form.date,
        spawn_instance: true,
      }),
    onSuccess: (result) => {
      if (result.used_ai) {
        toast.success("AI checklist generated");
      } else {
        toast.info(result.ai_note ?? "Default checklist created (AI unavailable)");
      }
      void qc.invalidateQueries({ queryKey: ["supervisor-checklists-today"] });
      void qc.invalidateQueries({ queryKey: ["task-instances"] });
      if (result.instance_id) {
        router.push(`/tasks/${result.instance_id}`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-surface/30 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id) {
          toast.error("Select a branch");
          return;
        }
        mutation.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        AI tailors opening, daily, closing, and supervisor ops checklists for each Qatar FEC branch type
        (driving school, inflatables, urban arena, creative play, carousel).
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Branch</Label>
        <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>
            {(locsQ.data ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Checklist type</Label>
        <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as typeof form.kind }))}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="opening">Opening</SelectItem>
            <SelectItem value="daily">Daily ops</SelectItem>
            <SelectItem value="closing">Closing</SelectItem>
            <SelectItem value="supervisor_ops">Supervisor ops</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Requires LOVABLE_API_KEY or OPENAI_API_KEY in server env.
        Without a key, branch-specific defaults are used.
      </div>

      <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        Generate &amp; start checklist
      </Button>
    </form>
  );
}

function Skeleton({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export default SupervisorChecklistPage;
