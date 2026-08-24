"use client";



import { useMutation, useQueryClient } from "@tanstack/react-query";

import Link from "next/link";

import { useRef, useState } from "react";

import { Camera, Hammer, LayoutGrid, List, Loader2, Plus } from "lucide-react";

import { useTranslation } from "react-i18next";
import { toast } from "sonner";



import { createSnag, uploadSnagPhoto } from "@/lib/snags.functions";

import { useSnags, useSnagDashboard } from "@/hooks/queries/useSnags";

import { useSites } from "@/hooks/queries/useSites";

import { useAppStore } from "@/stores/app-store";

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

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {

  Dialog,

  DialogContent,

  DialogHeader,

  DialogTitle,

  DialogTrigger,

} from "@/components/ui/dialog";



const KANBAN_COLUMNS = ["open", "assigned", "in_progress", "waiting_vendor", "resolved"] as const;

const CATEGORIES = ["civil", "electrical", "it", "safety", "branding", "game_machine", "other"] as const;



async function fileToBase64(file: File): Promise<string> {

  const buf = await file.arrayBuffer();

  let bin = "";

  const u8 = new Uint8Array(buf);

  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);

  return btoa(bin);

}



function SnagsPage() {
  const { t } = useTranslation();

  const locationId = useAppStore((s) => s.currentLocationId);

  const qc = useQueryClient();

  const floorView = useFloorSupervisorView();

  const canCreate = usePermission("snags.create");

  const [openCreate, setOpenCreate] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);

  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const [form, setForm] = useState({

    locationId: "",

    area: "",

    category: "other",

    description: "",

    severity: "medium",

    priority: "normal",

  });



  const { data: snags, isLoading } = useSnags({ locationId: locationId ?? null });

  const { data: summary } = useSnagDashboard({ locationId: locationId ?? null });

  const locations = useSites();



  const createMut = useMutation({

    mutationFn: async () => {

      const loc = form.locationId || locationId || locations.data?.[0]?.id;

      if (!loc) throw new Error(t("snags.selectBranch"));

      const row = await createSnag({

        locationId: loc,

        area: form.area.trim() || undefined,

        category: form.category as (typeof CATEGORIES)[number],

        description: form.description,

        severity: form.severity as "low" | "medium" | "high" | "critical",

        priority: form.priority as "low" | "normal" | "high" | "urgent",

      });

      if (pendingPhoto) {

        await uploadSnagPhoto({

          snagId: row.id,

          photoType: "before",

          filename: pendingPhoto.name,

          dataBase64: await fileToBase64(pendingPhoto),

          contentType: pendingPhoto.type || "image/jpeg",

        });

      }

      return row;

    },

    onSuccess: (row) => {

      toast.success(pendingPhoto ? t("snags.createdWithPhoto") : t("snags.created"));

      setOpenCreate(false);

      setPendingPhoto(null);

      setForm({

        locationId: locationId ?? "",

        area: "",

        category: "other",

        description: "",

        severity: "medium",

        priority: "normal",

      });

      void qc.invalidateQueries({ queryKey: ["snags"] });

      window.location.href = `/snags/${row.id}`;

    },

    onError: (e: Error) => toast.error(e.message),

  });



  const resolvedLocationId = form.locationId || locationId || locations.data?.[0]?.id;



  return (

    <div className="space-y-6">

      <header className="flex items-center gap-3">

        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">

          <Hammer className="h-5 w-5" />

        </div>

        <div className="flex-1">

          <h1 className="text-xl font-semibold tracking-tight">{t("snags.title")}</h1>

          <p className="text-xs text-muted-foreground">{t("snags.subtitle")}</p>

        </div>

        {canCreate && (

          <Dialog

            open={openCreate}

            onOpenChange={(open) => {

              setOpenCreate(open);

              if (open) {

                setForm((f) => ({

                  ...f,

                  locationId: locationId ?? f.locationId ?? locations.data?.[0]?.id ?? "",

                }));

              } else {

                setPendingPhoto(null);

              }

            }}

          >

            <DialogTrigger asChild>

              <Button size="sm"><Plus className="mr-1 h-4 w-4" />{t("snags.new")}</Button>

            </DialogTrigger>

            <DialogContent className="max-w-md">

              <DialogHeader><DialogTitle>{t("snags.raise")}</DialogTitle></DialogHeader>

              <div className="space-y-3">

                <div>

                  <Label>{t("common.branch")} <span className="text-rose-400">*</span></Label>

                  <Select

                    value={resolvedLocationId ?? ""}

                    onValueChange={(v) => setForm((f) => ({ ...f, locationId: v }))}

                  >

                    <SelectTrigger><SelectValue placeholder={t("common.selectBranch")} /></SelectTrigger>

                    <SelectContent>

                      {(locations.data ?? []).map((l) => (

                        <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>

                      ))}

                    </SelectContent>

                  </Select>

                </div>

                <div>

                  <Label>{t("snags.area")}</Label>

                  <Input

                    value={form.area}

                    onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}

                    placeholder={t("snags.areaPlaceholder")}

                  />

                </div>

                <div>

                  <Label>{t("common.category")} <span className="text-rose-400">*</span></Label>

                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>

                    <SelectTrigger><SelectValue /></SelectTrigger>

                    <SelectContent>

                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`snags.categories.${c}`, { defaultValue: c.replace(/_/g, " ") })}</SelectItem>)}

                    </SelectContent>

                  </Select>

                </div>

                <div>

                  <Label>{t("common.description")} <span className="text-rose-400">*</span></Label>

                  <Textarea

                    value={form.description}

                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}

                    rows={4}

                    placeholder={t("snags.descPlaceholder")}

                  />

                </div>

                {!floorView && (

                  <div className="grid grid-cols-2 gap-3">

                    <div>

                      <Label>{t("common.severity")}</Label>

                      <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>

                        <SelectTrigger><SelectValue /></SelectTrigger>

                        <SelectContent>

                          {["low", "medium", "high", "critical"].map((s) => (

                            <SelectItem key={s} value={s}>{t(`snags.severity.${s}`)}</SelectItem>

                          ))}

                        </SelectContent>

                      </Select>

                    </div>

                    <div>

                      <Label>{t("common.priority")}</Label>

                      <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>

                        <SelectTrigger><SelectValue /></SelectTrigger>

                        <SelectContent>

                          {["low", "normal", "high", "urgent"].map((p) => (

                            <SelectItem key={p} value={p}>{t(`snags.priority.${p}`)}</SelectItem>

                          ))}

                        </SelectContent>

                      </Select>

                    </div>

                  </div>

                )}

                <div>

                  <Label>{t("snags.photo")}</Label>

                  <div className="mt-1 flex items-center gap-2">

                    <Button type="button" variant="outline" size="sm" onClick={() => photoRef.current?.click()}>

                      <Camera className="mr-1 h-4 w-4" />

                      {pendingPhoto ? pendingPhoto.name : t("snags.uploadPhoto")}

                    </Button>

                    {pendingPhoto && (

                      <Button type="button" variant="ghost" size="sm" onClick={() => setPendingPhoto(null)}>

                        {t("common.clear")}

                      </Button>

                    )}

                    <input

                      ref={photoRef}

                      type="file"

                      accept="image/jpeg,image/png,image/webp"

                      className="hidden"

                      onChange={(e) => {

                        const f = e.target.files?.[0];

                        if (f) setPendingPhoto(f);

                        e.target.value = "";

                      }}

                    />

                  </div>

                </div>

                <Button

                  onClick={() => createMut.mutate()}

                  disabled={!form.description.trim() || !resolvedLocationId || createMut.isPending}

                  className="w-full"

                >

                  {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}

                  {t("snags.create")}

                </Button>

              </div>

            </DialogContent>

          </Dialog>

        )}

      </header>



      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        <div className="rounded-lg border border-border bg-card p-4">

          <div className="text-xs text-muted-foreground">{t("snags.open")}</div>

          <div className="mt-1 text-2xl font-semibold">{summary?.total_open ?? "—"}</div>

        </div>

        <div className="rounded-lg border border-border bg-card p-4">

          <div className="text-xs text-muted-foreground">{t("snags.overdue")}</div>

          <div className="mt-1 text-2xl font-semibold rag-red">{summary?.total_overdue ?? "—"}</div>

        </div>

        <div className="rounded-lg border border-border bg-card p-4">

          <div className="text-xs text-muted-foreground">{t("snags.inProgress")}</div>

          <div className="mt-1 text-2xl font-semibold">{summary?.by_status?.in_progress ?? "—"}</div>

        </div>

      </div>



      <Tabs defaultValue="list">

        <TabsList>

          <TabsTrigger value="list"><List className="mr-1 h-4 w-4" />{t("snags.list")}</TabsTrigger>

          <TabsTrigger value="board"><LayoutGrid className="mr-1 h-4 w-4" />{t("snags.kanban")}</TabsTrigger>

          {canCreate && (

            <TabsTrigger value="new" onClick={() => setOpenCreate(true)}>

              <Plus className="mr-1 h-4 w-4" />{t("snags.new")}

            </TabsTrigger>

          )}

        </TabsList>



        <TabsContent value="list" className="rounded-lg border border-border bg-card">

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>{t("snags.id")}</TableHead>

                <TableHead>{t("common.category")}</TableHead>

                <TableHead>{t("common.description")}</TableHead>

                <TableHead>{t("common.severity")}</TableHead>

                <TableHead>{t("common.status")}</TableHead>

                <TableHead>{t("snags.daysOpen")}</TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {isLoading ? (

                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("common.loading")}</TableCell></TableRow>

              ) : !snags?.length ? (

                <TableRow>

                  <TableCell colSpan={6} className="text-center text-muted-foreground">

                    {t("snags.empty")}

                    {canCreate && (

                      <Button variant="link" size="sm" className="ml-1" onClick={() => setOpenCreate(true)}>

                        {t("snags.raiseOne")}

                      </Button>

                    )}

                  </TableCell>

                </TableRow>

              ) : (

                snags.map((s) => (

                  <TableRow key={s.id}>

                    <TableCell className="font-mono text-xs">

                      <Link href={`/snags/${s.id}`} className="text-primary hover:underline">{s.snag_number}</Link>

                    </TableCell>

                    <TableCell>{t(`snags.categories.${s.category}`, { defaultValue: s.category })}</TableCell>

                    <TableCell className="max-w-xs truncate">{s.description}</TableCell>

                    <TableCell><Badge variant="outline">{t(`snags.severity.${s.severity}`, { defaultValue: s.severity })}</Badge></TableCell>

                    <TableCell>

                      <Badge variant="outline" className={s.overdue ? "rag-red" : ""}>{t(`snags.status.${s.status}`, { defaultValue: s.status })}</Badge>

                    </TableCell>

                    <TableCell>{s.days_open}</TableCell>

                  </TableRow>

                ))

              )}

            </TableBody>

          </Table>

        </TabsContent>



        <TabsContent value="board">

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">

            {KANBAN_COLUMNS.map((col) => {

              const cards = (snags ?? []).filter((s) => s.status === col || (col === "resolved" && ["resolved", "verified", "closed"].includes(s.status)));

              return (

                <div key={col} className="rounded-lg border border-border bg-card/50 p-2">

                  <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">{t(`snags.status.${col}`)}</div>

                  <div className="space-y-2">

                    {cards.map((s) => (

                      <Link key={s.id} href={`/snags/${s.id}`} className="block rounded border border-border bg-card p-2 text-xs hover:border-primary/40">

                        <div className="font-mono text-primary">{s.snag_number}</div>

                        <div className="mt-1 line-clamp-2">{s.description}</div>

                      </Link>

                    ))}

                    {!cards.length && <p className="text-xs text-muted-foreground">{t("snags.emptyColumn")}</p>}

                  </div>

                </div>

              );

            })}

          </div>

        </TabsContent>



        <TabsContent value="new">

          {canCreate ? (

            <p className="text-sm text-muted-foreground">

              {t("snags.newHint")} <Button variant="link" className="h-auto p-0" onClick={() => setOpenCreate(true)}>{t("snags.new")}</Button>

            </p>

          ) : null}

        </TabsContent>

      </Tabs>

    </div>

  );

}



export default SnagsPage;


