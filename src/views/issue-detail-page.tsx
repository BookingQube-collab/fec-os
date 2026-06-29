"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

import { getIssue, updateIssueStatus, verifyIssue, addIssuePhoto, listIssuePhotos, softDeleteIssue } from "@/lib/issues.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityBadge, StatusBadge } from "@/views/issues-page";

const STATUSES = ["open", "assigned", "in_progress", "blocked", "resolved", "closed"] as const;

function IssueDetail() {
  const { id } = useParams() as { id: string };
              const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["issue", id],
    queryFn: () => getIssue({ id }),
  });
  const photosQuery = useQuery({
    queryKey: ["issue-photos", id],
    queryFn: () => listIssuePhotos({ id }),
  });
  const mutation = useMutation({
    mutationFn: (status: (typeof STATUSES)[number]) =>
      updateIssueStatus({ id, status }),
    onSuccess: () => {
      toast.success("Status updated");
      void qc.invalidateQueries({ queryKey: ["issue", id] });
      void qc.invalidateQueries({ queryKey: ["issues"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const verifyMut = useMutation({
    mutationFn: () => verifyIssue({ id }),
    onSuccess: () => {
      toast.success("Verified — you can now close the ticket");
      void qc.invalidateQueries({ queryKey: ["issue", id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: () => softDeleteIssue({ id }),
    onSuccess: () => toast.success("Ticket archived"),
    onError: (e) => toast.error((e as Error).message),
  });
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("ticket-photos").upload(path, file);
      if (upErr) throw upErr;
      await addIssuePhoto({ id, path, kind: "evidence" });
    },
    onSuccess: () => {
      toast.success("Photo uploaded");
      void qc.invalidateQueries({ queryKey: ["issue-photos", id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-sm text-rose-300">{(error as Error).message}</div>;
  if (!data) return null;

  const t = data.ticket;
  const verified = Boolean((t as { verified_at?: string | null }).verified_at);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/issues" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to issues
        </Link>
        <div className="flex items-center gap-2">
          {t.status === "resolved" && !verified && (
            <Button size="sm" variant="secondary" onClick={() => verifyMut.mutate()} disabled={verifyMut.isPending}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Verify fix
            </Button>
          )}
          <Select
            value={t.status}
            onValueChange={(v) => mutation.mutate(v as (typeof STATUSES)[number])}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} disabled={s === "closed" && !verified}>
                  {s}{s === "closed" && !verified ? " (verify first)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending} title="Archive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface/30 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={t.priority} />
          <StatusBadge status={t.status} />
          {verified && <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">verified</span>}
          {t.category ? <span className="text-xs text-muted-foreground">· {t.category}</span> : null}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t.title}</h1>
        {t.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">{t.description}</p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No description provided.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <InfoCard title="Branch">
          {data.location ? (
            <>
              <div className="text-sm font-medium">{data.location.name}</div>
              <div className="text-xs text-muted-foreground">{data.location.code} · {data.location.city}</div>
            </>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </InfoCard>
        <InfoCard title="Asset">
          {data.asset ? (
            <>
              <div className="text-sm font-medium">{data.asset.name}</div>
              <div className="text-xs text-muted-foreground">{data.asset.tag}{data.asset.category ? ` · ${data.asset.category}` : ""}</div>
            </>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </InfoCard>
        <InfoCard title="Created">
          <div className="text-sm">{new Date(t.created_at).toLocaleString()}</div>
        </InfoCard>
        <InfoCard title="SLA due">
          <div className="text-sm">{t.sla_due_at ? new Date(t.sla_due_at).toLocaleString() : "—"}</div>
        </InfoCard>
      </div>

      <div className="rounded-lg border border-border bg-surface/30 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Photo evidence</h2>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMut.mutate(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}>
            <ImagePlus className="mr-1 h-3.5 w-3.5" /> {uploadMut.isPending ? "Uploading…" : "Add photo"}
          </Button>
        </div>
        {photosQuery.data && photosQuery.data.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {photosQuery.data.map((p) => (
              <a key={p.path} href={p.url ?? "#"} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-border bg-background">
                {p.url ? <img src={p.url} alt="evidence" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full" />}
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No photos uploaded yet.</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface/30 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Work orders</h2>
        {data.work_orders.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No work orders linked to this ticket yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.work_orders.map((w) => (
              <li key={w.id} className="flex items-center justify-between rounded-md border border-border bg-background p-3 text-sm">
                <div>
                  <div className="font-medium">{w.title}</div>
                  <div className="text-[11px] text-muted-foreground">{w.kind} · {w.status}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {w.planned_end ? new Date(w.planned_end).toLocaleString() : "no due date"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface/30 p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default IssueDetail;
