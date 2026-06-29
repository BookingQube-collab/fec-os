"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft, Camera, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  completeTaskItem,
  getTaskInstance,
  getTaskPhotoUrl,
  submitTaskInstance,
  uploadTaskPhoto,
} from "@/lib/tasks.functions";
import { enqueue, flushQueue } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

function InstancePage() {
  const { id } = useParams() as { id: string };
      const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["task-instance", id],
    queryFn: () => getTaskInstance({ id }),
    refetchInterval: 10_000,
  });
  const submitMut = useMutation({
    mutationFn: () => submitTaskInstance({ id }),
    onSuccess: () => {
      toast.success("Checklist submitted");
      void qc.invalidateQueries({ queryKey: ["task-instance", id] });
      void qc.invalidateQueries({ queryKey: ["task-instances"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading || !data) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  const locked = data.instance.status !== "open" && data.instance.status !== "overdue";
  const resultByItem = new Map(data.results.map((r) => [r.item_id, r]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/tasks" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{data.instance.title}</h1>
          <div className="text-xs text-muted-foreground">
            {data.instance.due_at ? `due ${new Date(data.instance.due_at).toLocaleString()}` : "no due date"}
          </div>
        </div>
        <Badge variant={locked ? "outline" : "default"} className="uppercase">{data.instance.status}</Badge>
      </div>

      <ul className="space-y-2">
        {data.items.map((it) => (
          <ItemRow
            key={it.id}
            instanceId={id}
            item={it}
            result={resultByItem.get(it.id)}
            locked={locked}
          />
        ))}
      </ul>

      {!locked ? (
        <div className="flex justify-end">
          <Button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
            {submitMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Submit checklist
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type Item = { id: string; label: string; requires_photo: boolean; required: boolean; position: number };
type Result = { item_id: string; checked: boolean; photo_path: string | null; note: string | null; completed_at: string | null };

function ItemRow({ instanceId, item, result, locked }: {
  instanceId: string; item: Item; result?: Result; locked: boolean;
}) {
        const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState(result?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["task-instance", instanceId] });

  async function toggle(checked: boolean) {
    if (locked) return;
    if (checked && item.requires_photo && !result?.photo_path) {
      toast.error("Photo proof required — tap the camera button first");
      return;
    }
    setBusy(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueue({
          kind: "complete",
          payload: { instance_id: instanceId, item_id: item.id, checked, note: note || undefined,
                     photo_path: result?.photo_path ?? undefined },
        });
        toast.success("Saved offline — will sync");
      } else {
        await completeTaskItem({ instance_id: instanceId, item_id: item.id, checked, note: note || undefined,
                                 photo_path: result?.photo_path ?? undefined });
        await refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function onPhotoPicked(file: File) {
    setBusy(true);
    try {
      const data_base64 = await fileToBase64(file);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueue({
          kind: "upload-and-complete",
          payload: {
            instance_id: instanceId, item_id: item.id,
            filename: file.name, data_base64, content_type: file.type || "image/jpeg",
            note: note || undefined,
          },
        });
        toast.success("Photo saved offline — will upload + check when online");
      } else {
        const { path } = await uploadTaskPhoto({ instance_id: instanceId, item_id: item.id,
          filename: file.name, data_base64, content_type: file.type || "image/jpeg",
        });
        await completeTaskItem({ instance_id: instanceId, item_id: item.id, checked: true,
                                 photo_path: path, note: note || undefined });
        toast.success("Item completed");
        void flushQueue();
        await refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function viewPhoto() {
    if (!result?.photo_path) return;
    const { url } = await getTaskPhotoUrl({ path: result.photo_path });
    setSignedUrl(url);
    window.open(url, "_blank");
  }

  const checked = !!result?.checked;

  return (
    <li className="rounded-lg border border-border bg-surface/30 p-3">
      <div className="flex items-start gap-3">
        <Checkbox checked={checked} disabled={locked || busy}
          onCheckedChange={(v) => toggle(!!v)} className="mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${checked ? "line-through text-muted-foreground" : "font-medium"}`}>
              {item.label}
            </span>
            {item.requires_photo ? <Badge variant="outline" className="text-[10px]">photo</Badge> : null}
            {!item.required ? <Badge variant="outline" className="text-[10px]">optional</Badge> : null}
          </div>
          {result?.completed_at ? (
            <div className="text-[11px] text-muted-foreground">done {new Date(result.completed_at).toLocaleTimeString()}</div>
          ) : null}
          {!locked ? (
            <Input
              value={note} placeholder="Note (optional)" maxLength={2000}
              className="mt-2 h-8 text-xs"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (!checked) return;
                void completeTaskItem({ instance_id: instanceId, item_id: item.id, checked: true, note, photo_path: result?.photo_path ?? undefined }).then(refresh);
              }}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          {!locked ? (
            <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhotoPicked(f); e.target.value = ""; }} />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Camera className="h-3 w-3" />
              </Button>
            </>
          ) : null}
          {result?.photo_path ? (
            <Button size="sm" variant="ghost" onClick={viewPhoto}>view</Button>
          ) : null}
        </div>
      </div>
      {signedUrl ? null : null}
    </li>
  );
}

export default InstancePage;
