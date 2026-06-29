"use client";



import { useMutation, useQueryClient } from "@tanstack/react-query";

import Link from "next/link";

import { useParams } from "next/navigation";

import { useRef, useState } from "react";

import { ArrowLeft, Camera, Hammer, Loader2, Pencil } from "lucide-react";

import { toast } from "sonner";



import {

  getSnagPhotoUrl,

  updateSnag,

  updateSnagStatus,

  uploadSnagPhoto,

} from "@/lib/snags.functions";

import { useSnag } from "@/hooks/queries/useSnags";

import { useFloorSupervisorView } from "@/hooks/use-floor-supervisor-view";

import { usePermission } from "@/hooks/use-permission";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from "@/components/ui/select";



const STATUSES = [

  "open",

  "assigned",

  "in_progress",

  "waiting_vendor",

  "waiting_approval",

  "resolved",

  "verified",

  "closed",

  "reopened",

] as const;



const CATEGORIES = [

  "civil", "electrical", "it", "safety", "branding", "flooring", "furniture",

  "game_machine", "cleaning", "mall", "documentation", "other",

] as const;



async function fileToBase64(file: File): Promise<string> {

  const buf = await file.arrayBuffer();

  let bin = "";

  const u8 = new Uint8Array(buf);

  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);

  return btoa(bin);

}



function SnagDetailPage() {

  const params = useParams();

  const id = params.id as string;

  const qc = useQueryClient();

  const floorView = useFloorSupervisorView();

  const canEdit = usePermission("snags.create");

  const canManage = usePermission("snags.manage");

  const photoRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);

  const [editForm, setEditForm] = useState({

    area: "",

    description: "",

    category: "other",

    severity: "medium",

    priority: "normal",

    targetDate: "",

  });



  const { data: snag, isLoading } = useSnag(id, { enabled: !!id });



  const statusMut = useMutation({

    mutationFn: (status: (typeof STATUSES)[number]) => updateSnagStatus({ id, status }),

    onSuccess: () => {

      toast.success("Status updated");

      void qc.invalidateQueries({ queryKey: ["snag", id] });

      void qc.invalidateQueries({ queryKey: ["snags"] });

    },

    onError: (e: Error) => toast.error(e.message),

  });



  const editMut = useMutation({

    mutationFn: () =>

      updateSnag({

        id,

        area: editForm.area.trim() || undefined,

        description: editForm.description,

        category: editForm.category as (typeof CATEGORIES)[number],

        ...(!floorView

          ? {

              severity: editForm.severity as "low" | "medium" | "high" | "critical",

              priority: editForm.priority as "low" | "normal" | "high" | "urgent",

              targetDate: editForm.targetDate || null,

            }

          : {}),

      }),

    onSuccess: () => {

      toast.success("Snag updated");

      setEditing(false);

      void qc.invalidateQueries({ queryKey: ["snag", id] });

      void qc.invalidateQueries({ queryKey: ["snags"] });

    },

    onError: (e: Error) => toast.error(e.message),

  });



  const photoMut = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await fileToBase64(file);
      return uploadSnagPhoto({
        snagId: id,
        photoType: "before",
        filename: file.name,
        dataBase64,
        contentType: file.type || "image/jpeg",
      });
    },
    onSuccess: () => {
      toast.success("Photo uploaded");
      void qc.invalidateQueries({ queryKey: ["snag", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function viewPhoto(path: string) {

    try {

      const { url } = await getSnagPhotoUrl({ path });

      window.open(url, "_blank");

    } catch (e) {

      toast.error((e as Error).message);

    }

  }



  function startEdit() {

    if (!snag) return;

    setEditForm({

      area: String(snag.area ?? ""),

      description: String(snag.description ?? ""),

      category: String(snag.category ?? "other"),

      severity: String(snag.severity ?? "medium"),

      priority: String(snag.priority ?? "normal"),

      targetDate: snag.target_date ? String(snag.target_date) : "",

    });

    setEditing(true);

  }



  if (isLoading) return <p className="text-muted-foreground">Loading snag…</p>;

  if (!snag) return <p className="text-muted-foreground">Snag not found.</p>;



  const photos = (snag.photos ?? []) as Array<{ id: string; photo_type: string; file_path: string; file_name?: string }>;



  return (

    <div className="space-y-6">

      <div className="flex items-center gap-3">

        <Button variant="ghost" size="icon" asChild>

          <Link href="/snags"><ArrowLeft className="h-4 w-4" /></Link>

        </Button>

        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">

          <Hammer className="h-5 w-5" />

        </div>

        <div className="flex-1">

          <h1 className="text-xl font-semibold">{snag.snag_number as string}</h1>

          <p className="text-xs text-muted-foreground">{String(snag.category)} · {String(snag.area ?? "—")}</p>

        </div>

        <Badge variant="outline" className="ml-auto">{snag.status as string}</Badge>

        {canEdit && !editing && (

          <Button variant="outline" size="sm" onClick={startEdit}>

            <Pencil className="mr-1 h-3.5 w-3.5" />Edit

          </Button>

        )}

      </div>



      {editing ? (

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">

          <div>

            <Label>Area</Label>

            <Input value={editForm.area} onChange={(e) => setEditForm((f) => ({ ...f, area: e.target.value }))} />

          </div>

          <div>

            <Label>Category</Label>

            <Select value={editForm.category} onValueChange={(v) => setEditForm((f) => ({ ...f, category: v }))}>

              <SelectTrigger><SelectValue /></SelectTrigger>

              <SelectContent>

                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}

              </SelectContent>

            </Select>

          </div>

          <div>

            <Label>Description</Label>

            <Textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} rows={4} />

          </div>

          {!floorView && (

            <div className="grid grid-cols-2 gap-3">

              <div>

                <Label>Severity</Label>

                <Select value={editForm.severity} onValueChange={(v) => setEditForm((f) => ({ ...f, severity: v }))}>

                  <SelectTrigger><SelectValue /></SelectTrigger>

                  <SelectContent>

                    {["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}

                  </SelectContent>

                </Select>

              </div>

              <div>

                <Label>Priority</Label>

                <Select value={editForm.priority} onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v }))}>

                  <SelectTrigger><SelectValue /></SelectTrigger>

                  <SelectContent>

                    {["low", "normal", "high", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}

                  </SelectContent>

                </Select>

              </div>

              <div className="col-span-2">

                <Label>Target date</Label>

                <Input type="date" value={editForm.targetDate} onChange={(e) => setEditForm((f) => ({ ...f, targetDate: e.target.value }))} />

              </div>

            </div>

          )}

          <div className="flex gap-2">

            <Button onClick={() => editMut.mutate()} disabled={editMut.isPending || !editForm.description.trim()}>

              {editMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}

              Save

            </Button>

            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>

          </div>

        </div>

      ) : (

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">

          <p className="text-sm">{snag.description as string}</p>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">

            <span>Severity: {snag.severity as string}</span>

            {!floorView && (

              <>

                <span>Priority: {snag.priority as string}</span>

                <span>Target: {(snag.target_date as string) ?? "—"}</span>

                <span>Risk: {snag.risk_score as number}</span>

              </>

            )}

          </div>

        </div>

      )}



      {(canEdit || canManage) && (

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">

          <div className="flex items-center justify-between">

            <h2 className="text-sm font-medium">Photos</h2>

            <Button variant="outline" size="sm" onClick={() => photoRef.current?.click()} disabled={photoMut.isPending}>

              {photoMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-1 h-3.5 w-3.5" />}

              Upload photo

            </Button>

            <input

              ref={photoRef}

              type="file"

              accept="image/jpeg,image/png,image/webp"

              className="hidden"

              onChange={(e) => {

                const f = e.target.files?.[0];

                if (f) photoMut.mutate(f);

                e.target.value = "";

              }}

            />

          </div>

          {photos.length === 0 ? (

            <p className="text-xs text-muted-foreground">No photos yet.</p>

          ) : (

            <ul className="space-y-2">

              {photos.map((p) => (

                <li key={p.id} className="flex items-center justify-between text-xs">

                  <span>{p.file_name ?? p.photo_type}</span>

                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => viewPhoto(p.file_path)}>

                    View

                  </Button>

                </li>

              ))}

            </ul>

          )}

        </div>

      )}



      {canManage && (

        <div className="flex items-center gap-2">

          <Select onValueChange={(v) => statusMut.mutate(v as (typeof STATUSES)[number])}>

            <SelectTrigger className="w-48"><SelectValue placeholder="Update status" /></SelectTrigger>

            <SelectContent>

              {STATUSES.map((s) => (

                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>

              ))}

            </SelectContent>

          </Select>

        </div>

      )}



      {snag.history?.length ? (

        <div className="rounded-lg border border-border bg-card p-4">

          <h2 className="text-sm font-medium mb-3">Status history</h2>

          <ul className="space-y-2 text-xs">

            {snag.history.map((h, i) => (

              <li key={i} className="flex justify-between border-b border-border/50 pb-2">

                <span>{String(h.to_status)}</span>

                <span className="text-muted-foreground">

                  {h.created_at ? new Date(String(h.created_at)).toLocaleString() : "—"}

                </span>

              </li>

            ))}

          </ul>

        </div>

      ) : null}

    </div>

  );

}



export default SnagDetailPage;


