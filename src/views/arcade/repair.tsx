"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FecLoader } from "@/components/fec";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { formatWorkingDuration, VENDOR_NOTE_PREFIX } from "@/lib/arcade/domain";
import { getArcadeContext, listArcadeMachines, uploadArcadeFile } from "@/lib/arcade.functions";
import { listArcadeSuppliers, requestSparePart } from "@/lib/arcade-supply.functions";
import { finishRepairJob, getRepairJob, setArcadeRepairState, startRepairJob } from "@/lib/arcade-work.functions";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ArcadeRepair() {
  const { t } = useTranslation();
  const sites = useSites();
  const canOperate = usePermission("arcade.operate");
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const [locationId, setLocationId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [note, setNote] = useState("");
  const [partName, setPartName] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [tick, setTick] = useState(0);
  const [finished, setFinished] = useState<{ hours: number; minutes: number } | null>(null);
  const machines = useQuery({
    queryKey: queryKeys.arcade.machines({ repair: locationId }),
    queryFn: () => listArcadeMachines({ locationId, page: 1, pageSize: 200 }),
    enabled: Boolean(locationId),
  });
  const job = useQuery({
    queryKey: [...queryKeys.arcade.all, "repair-job", locationId, machineId],
    queryFn: () => getRepairJob({ locationId, machineId }),
    enabled: Boolean(locationId && machineId),
  });
  const suppliers = useQuery({
    queryKey: [...queryKeys.arcade.all, "suppliers", "repair"],
    queryFn: () => listArcadeSuppliers({ page: 1, pageSize: 100 }),
  });
  const qc = useQueryClient();

  useEffect(() => {
    if (job.data?.phase !== "RUNNING") return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [job.data?.phase, job.data?.asOf]);

  const extra = job.data?.phase === "RUNNING" ? Math.max(0, Date.now() - Date.parse(job.data.asOf)) : 0;
  const shown = formatWorkingDuration((job.data?.workingMs ?? 0) + extra);
  void tick;

  const refresh = () => {
    setFinished(null);
    void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
  };
  const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.updateFailed"));
  const start = useMutation({
    mutationFn: () => startRepairJob({ locationId, machineId }),
    onSuccess: refresh,
    onError: fail,
  });
  const clock = useMutation({
    mutationFn: (action: "START" | "PAUSE") => setArcadeRepairState({ faultId: job.data?.fault?.id ?? "", action }),
    onSuccess: refresh,
    onError: fail,
  });
  const finish = useMutation({
    mutationFn: () => finishRepairJob({ faultId: job.data?.fault?.id ?? "", note, parts: partName || null }),
    onSuccess: (result) => {
      setFinished({ hours: result.hours, minutes: result.minutes });
      toast.success(t("arcadeSimple.finishedTime", { hours: result.hours, minutes: result.minutes }));
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
    },
    onError: fail,
  });
  const order = useMutation({
    mutationFn: async () => {
      const faultId = job.data?.fault?.id;
      if (!faultId) throw new Error(t("arcadeSimple.needJob"));
      if (!photo) throw new Error(t("arcadeSimple.photo"));
      if (!vendorId) throw new Error(t("arcadeSimple.supplier"));
      if (partName.trim().length < 2) throw new Error(t("arcadeSimple.partName"));
      const request = await requestSparePart({
        locationId,
        machineId,
        faultId,
        description: partName.trim(),
        qty: 1,
        notes: `${VENDOR_NOTE_PREFIX}${vendorId}`,
        technicianStaffId: context.data?.staff?.id ?? null,
      });
      const dataBase64 = await readBase64(photo);
      await uploadArcadeFile({
        entityType: "fault",
        entityId: faultId,
        kind: "photo",
        locationId,
        filename: photo.name || "part.jpg",
        contentType: photo.type || "image/jpeg",
        dataBase64,
      });
      return request;
    },
    onSuccess: () => {
      toast.success(t("arcadeSimple.partSaved"));
      setPartName("");
      setPhoto(null);
    },
    onError: fail,
  });

  const phase = job.data?.phase ?? "IDLE";
  const busy = start.isPending || clock.isPending || finish.isPending;
  const selectClass = "h-12 w-full rounded-md border bg-background px-3 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("arcadeSimple.repairTitle")}</h1>
        <p className="text-lg text-muted-foreground">{t("arcadeSimple.repairHint")}</p>
        {context.data?.isTechnician ? <p className="font-medium">{t("arcadeSimple.youTechnician")}</p> : null}
      </header>
      <label className="grid gap-2">
        <span className="text-xl font-medium">{t("arcadeSimple.pickLocation")}</span>
        <select className={selectClass} value={locationId} onChange={(event) => { setLocationId(event.target.value); setMachineId(""); setFinished(null); }}>
          <option value="">{t("arcadeScreens.selectSite")}</option>
          {(sites.data ?? []).map((site) => (
            <option key={site.id} value={site.id}>{venueTitle(site, site.name)}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        <span className="text-xl font-medium">{t("arcadeSimple.pickGame")}</span>
        <select className={selectClass} value={machineId} disabled={!locationId} onChange={(event) => { setMachineId(event.target.value); setFinished(null); }}>
          <option value="">{t("arcadeScreens.selectMachine")}</option>
          {(machines.data?.rows ?? []).map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
      </label>
      {machines.isError ? <p className="text-sm text-destructive">{machines.error instanceof Error ? machines.error.message : t("arcadeOps.failed")}</p> : null}
      {job.isLoading ? <FecLoader label={t("arcadeOps.loading")} /> : null}
      {job.isError ? <p className="text-sm text-destructive">{job.error instanceof Error ? job.error.message : t("arcadeOps.failed")}</p> : null}
      {machineId ? (
        <section className="grid gap-4 rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">{t("arcadeSimple.workingTime")}</p>
          <p className="text-5xl font-semibold tabular-nums tracking-tight">
            {shown.hours} h {String(shown.minutes).padStart(2, "0")} min
            {phase === "RUNNING" ? <span className="text-2xl text-muted-foreground"> {String(shown.seconds).padStart(2, "0")} s</span> : null}
          </p>
          {phase === "PAUSED" ? <p className="text-lg">{t("arcadeSimple.pausedTime")}</p> : null}
          {finished || phase === "FINISHED" ? (
            <p className="text-xl font-medium">
              {t("arcadeSimple.finishedTime", finished ?? { hours: shown.hours, minutes: shown.minutes })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {phase !== "RUNNING" && phase !== "PAUSED" ? (
              <Button type="button" className="h-12 px-6 text-base" disabled={!canOperate || busy} onClick={() => start.mutate()}>{t("arcadeSimple.start")}</Button>
            ) : null}
            {phase === "RUNNING" ? (
              <Button type="button" variant="outline" className="h-12 px-6 text-base" disabled={!canOperate || busy} onClick={() => clock.mutate("PAUSE")}>{t("arcadeSimple.pause")}</Button>
            ) : null}
            {phase === "PAUSED" ? (
              <Button type="button" className="h-12 px-6 text-base" disabled={!canOperate || busy} onClick={() => clock.mutate("START")}>{t("arcadeSimple.restart")}</Button>
            ) : null}
          </div>
          {phase === "RUNNING" || phase === "PAUSED" ? (
            <div className="grid gap-2">
              <label className="grid gap-2">
                <span className="text-lg font-medium">{t("arcadeSimple.whatFixed")}</span>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("arcadeSimple.whatFixedHint")} />
              </label>
              <Button type="button" className="h-12 w-fit px-6 text-base" disabled={!canOperate || busy || note.trim().length < 8} onClick={() => finish.mutate()}>
                {t("arcadeSimple.finish")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {job.data?.fault ? (
        <section className="grid gap-3 rounded-lg border p-5">
          <h2 className="text-2xl font-semibold">{t("arcadeSimple.partTitle")}</h2>
          <p className="text-muted-foreground">{t("arcadeSimple.partHint")}</p>
          <label className="grid gap-2">
            <span className="font-medium">{t("arcadeSimple.photo")}</span>
            <input
              className="text-base"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="grid gap-2">
            <span className="font-medium">{t("arcadeSimple.supplier")}</span>
            <select className={selectClass} value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
              <option value="">{t("arcadeSimple.supplier")}</option>
              {(suppliers.data?.rows ?? []).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
            {(suppliers.data?.rows.length ?? 0) === 0 && !suppliers.isLoading ? <p className="text-sm text-muted-foreground">{t("arcadeSimple.noSuppliers")}</p> : null}
          </label>
          <label className="grid gap-2">
            <span className="font-medium">{t("arcadeSimple.partName")}</span>
            <Input value={partName} onChange={(event) => setPartName(event.target.value)} />
          </label>
          <Button type="button" variant="outline" className="h-12 w-fit px-6" disabled={!canOperate || order.isPending} onClick={() => order.mutate()}>
            {t("arcadeSimple.orderPart")}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
