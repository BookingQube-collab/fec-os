"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ArcadeEmpty, StatusBadge } from "@/components/arcade/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FecLoader } from "@/components/fec";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { formatWorkingDuration, isArcadeVenueLocation, VENDOR_NOTE_PREFIX } from "@/lib/arcade/domain";
import { getArcadeContext, listArcadeMachines, uploadArcadeFile } from "@/lib/arcade.functions";
import { listArcadeSuppliers, requestSparePart } from "@/lib/arcade-supply.functions";
import { finishRepairJob, getRepairJob, setArcadeRepairState, startRepairJob } from "@/lib/arcade-work.functions";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/* Hallmark · repair picker · tone: utilitarian · anchor: existing violet accent
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: ink on accent wash
 */

const choiceClass = cn(
  "flex min-h-14 w-full min-w-0 touch-manipulation flex-wrap items-center gap-3 rounded-xl border-2 px-4 py-3 text-start",
  "transition-colors duration-150 motion-reduce:transition-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "active:translate-y-px motion-reduce:active:translate-y-0",
  "disabled:pointer-events-none disabled:opacity-50",
);

function ChoiceButton({
  pressed,
  title,
  status,
  disabled,
  onClick,
}: {
  pressed: boolean;
  title: string;
  status?: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        choiceClass,
        pressed ? "border-ring bg-accent text-foreground hover:bg-accent" : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      <span className="flex min-w-0 flex-1 basis-full flex-col items-start gap-1 sm:basis-0">
        <span className="w-full break-words text-base font-semibold leading-snug">{title}</span>
        {pressed ? <span className="text-sm font-medium">{t("arcadeSimple.selected")}</span> : null}
      </span>
      {status ? <span className="max-w-full shrink-0 basis-full sm:basis-auto"><StatusBadge status={status} /></span> : null}
    </button>
  );
}

function SelectedChoice({
  title,
  status,
  disabled,
  onChange,
}: {
  title: string;
  status?: string | null;
  disabled?: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-expanded={false}
      disabled={disabled}
      onClick={onChange}
      className={cn(choiceClass, "border-ring bg-accent text-foreground hover:bg-accent")}
    >
      <span className="flex min-w-0 flex-1 basis-full flex-col items-start gap-1 sm:basis-0">
        <span className="w-full break-words text-base font-semibold leading-snug">{title}</span>
        <span className="text-sm font-medium">{t("arcadeSimple.selected")}</span>
        {status ? <span className="max-w-full sm:hidden"><StatusBadge status={status} /></span> : null}
      </span>
      {status ? <span className="hidden max-w-full shrink-0 sm:inline-flex"><StatusBadge status={status} /></span> : null}
      <span className="inline-flex min-h-11 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground sm:w-auto">
        {t("arcadeSimple.change")}
      </span>
    </button>
  );
}

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
  const params = useSearchParams();
  const [locationId, setLocationId] = useState(() => params.get("locationId") ?? "");
  const [machineId, setMachineId] = useState(() => params.get("machineId") ?? "");
  const [note, setNote] = useState("");
  const [partName, setPartName] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [tick, setTick] = useState(0);
  const [finished, setFinished] = useState<{ hours: number; minutes: number } | null>(null);
  const [locationOpen, setLocationOpen] = useState(() => !params.get("locationId"));
  const [gameOpen, setGameOpen] = useState(() => !params.get("machineId"));
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
  const venues = (sites.data ?? [])
    .filter(isArcadeVenueLocation)
    .slice()
    .sort((a, b) => venueTitle(a, a.name).localeCompare(venueTitle(b, b.name), undefined, { sensitivity: "base" }));
  const selectedSite = venues.find((site) => site.id === locationId) ?? null;
  const games = machines.data?.rows ?? [];
  const selectedGame = games.find((row) => row.id === machineId) ?? null;
  const showLocationChoices = locationOpen || !selectedSite;
  const showGameChoices = Boolean(locationId) && (gameOpen || !selectedGame);
  const orderedGames = selectedGame ? [selectedGame, ...games.filter((row) => row.id !== selectedGame.id)] : games;

  const pickLocation = (id: string) => {
    if (id !== locationId) {
      setLocationId(id);
      setMachineId("");
      setFinished(null);
      setGameOpen(true);
    }
    setLocationOpen(false);
  };
  const pickGame = (id: string) => {
    if (id !== machineId) {
      setMachineId(id);
      setFinished(null);
    }
    setGameOpen(false);
  };

  return (
    <div className="phone-shell">
      <header className="phone-head">
        <p>{t("nav.arcade")}</p>
        <h1>{t("arcadeSimple.repairTitle")}</h1>
        <p>{t("arcadeSimple.repairHint")}</p>
      </header>
      {context.data?.isTechnician ? <p className="arcade-note">{t("arcadeSimple.youTechnician")}</p> : null}
      <section className="grid min-w-0 gap-3" aria-labelledby="repair-location-label" aria-busy={sites.isLoading}>
        <h2 id="repair-location-label" className="break-words text-xl font-medium">{t("arcadeSimple.pickLocation")}</h2>
        {sites.isLoading ? <FecLoader label={t("common.loading")} /> : null}
        {sites.isError ? (
          <div className="grid gap-2">
            <p className="text-sm text-destructive">{sites.error instanceof Error ? sites.error.message : t("arcadeOps.failed")}</p>
            <Button type="button" variant="outline" className="h-12 w-full px-6 text-base sm:w-fit" onClick={() => void sites.refetch()}>
              {t("common.tryAgain")}
            </Button>
          </div>
        ) : null}
        {!sites.isLoading && !sites.isError && venues.length === 0 ? (
          <ArcadeEmpty title={t("arcadeSimple.noLocations")} />
        ) : null}
        {showLocationChoices && venues.length > 0 ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {venues.map((site) => (
              <li key={site.id} className="min-w-0">
                <ChoiceButton
                  pressed={site.id === locationId}
                  title={venueTitle(site, site.name)}
                  disabled={busy}
                  onClick={() => pickLocation(site.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {!showLocationChoices && selectedSite ? (
          <SelectedChoice
            title={venueTitle(selectedSite, selectedSite.name)}
            disabled={busy}
            onChange={() => setLocationOpen(true)}
          />
        ) : null}
      </section>
      {locationId ? (
        <section className="grid min-w-0 gap-3" aria-labelledby="repair-game-label" aria-busy={machines.isLoading}>
          <h2 id="repair-game-label" className="break-words text-xl font-medium">{t("arcadeSimple.pickGame")}</h2>
          {machines.isLoading ? <FecLoader label={t("common.loading")} /> : null}
          {machines.isError ? (
            <div className="grid gap-2">
              <p className="text-sm text-destructive">{machines.error instanceof Error ? machines.error.message : t("arcadeOps.failed")}</p>
              <Button type="button" variant="outline" className="h-12 w-full px-6 text-base sm:w-fit" onClick={() => void machines.refetch()}>
                {t("common.tryAgain")}
              </Button>
            </div>
          ) : null}
          {!machines.isLoading && !machines.isError && games.length === 0 ? (
            <ArcadeEmpty title={t("arcadeSimple.noGames")} />
          ) : null}
          {showGameChoices && games.length > 0 ? (
            <ul className="grid grid-cols-1 gap-2">
              {orderedGames.map((row) => (
                <li key={row.id} className="min-w-0">
                  <ChoiceButton
                    pressed={row.id === machineId}
                    title={row.name}
                    status={row.status}
                    disabled={busy}
                    onClick={() => pickGame(row.id)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {!showGameChoices && selectedGame ? (
            <SelectedChoice
              title={selectedGame.name}
              status={selectedGame.status}
              disabled={busy}
              onChange={() => setGameOpen(true)}
            />
          ) : null}
        </section>
      ) : null}
      {job.isLoading ? <FecLoader label={t("common.loading")} /> : null}
      {job.isError ? <p className="text-sm text-destructive">{job.error instanceof Error ? job.error.message : t("arcadeOps.failed")}</p> : null}
      {machineId ? (
        <section className="phone-card">
          {selectedGame ? (
            <article className="phone-asset">
              <p className="cc-note">{t("arcadeScreens.asset")}</p>
              <strong className="break-words">{selectedGame.name}</strong>
              <dl>
                <div><dt>{t("arcadeScreens.assetId")}</dt><dd>{selectedGame.asset_code}</dd></div>
                {selectedSite ? <div><dt>{t("common.site")}</dt><dd>{venueTitle(selectedSite, selectedSite.name)}</dd></div> : null}
                {job.data?.fault?.ticket_number ? <div><dt>{t("arcadeOps.fault")}</dt><dd>{job.data.fault.ticket_number}</dd></div> : null}
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selectedGame.status} />
              </div>
              {job.data?.fault?.description ? <p className="text-sm text-muted-foreground">{job.data.fault.description}</p> : null}
              {job.data?.fault?.id ? <Link className="text-sm font-semibold text-[var(--af-primary)] underline-offset-2 hover:underline" href={`/arcade/faults/${job.data.fault.id}`}>{t("arcadeFlow.openWork")}</Link> : null}
            </article>
          ) : null}
          <p className="text-sm text-muted-foreground">{t("arcadeSimple.workingTime")}</p>
          <p className="flex flex-wrap items-baseline gap-x-2 text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
            {shown.hours} h {String(shown.minutes).padStart(2, "0")} min
            {phase === "RUNNING" ? <span className="text-2xl text-muted-foreground"> {String(shown.seconds).padStart(2, "0")} s</span> : null}
          </p>
          {phase === "PAUSED" ? <p className="text-lg">{t("arcadeSimple.pausedTime")}</p> : null}
          {finished || phase === "FINISHED" ? (
            <p className="text-xl font-medium">
              {t("arcadeSimple.finishedTime", finished ?? { hours: shown.hours, minutes: shown.minutes })}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {phase !== "RUNNING" && phase !== "PAUSED" ? (
              <Button type="button" className="arcade-cta phone-submit" disabled={!canOperate || busy} onClick={() => start.mutate()}>{t("arcadeSimple.start")}</Button>
            ) : null}
            {phase === "RUNNING" ? (
              <Button type="button" variant="outline" className="h-12 w-full px-6 text-base sm:w-auto" disabled={!canOperate || busy} onClick={() => clock.mutate("PAUSE")}>{t("arcadeSimple.pause")}</Button>
            ) : null}
            {phase === "PAUSED" ? (
              <Button type="button" className="arcade-cta phone-submit" disabled={!canOperate || busy} onClick={() => clock.mutate("START")}>{t("arcadeSimple.restart")}</Button>
            ) : null}
          </div>
          {phase === "RUNNING" || phase === "PAUSED" ? (
            <div className="grid gap-2">
              <label className="grid gap-2">
                <span className="text-lg font-medium">{t("arcadeSimple.whatFixed")}</span>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("arcadeSimple.whatFixedHint")} />
              </label>
                <Button type="button" className="arcade-cta phone-submit" disabled={!canOperate || busy || note.trim().length < 8} onClick={() => finish.mutate()}>
                {t("arcadeSimple.finish")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {job.data?.fault ? (
        <section className="phone-card">
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
          <Button type="button" variant="outline" className="h-12 w-full px-6 sm:w-fit" disabled={!canOperate || order.isPending} onClick={() => order.mutate()}>
            {t("arcadeSimple.orderPart")}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
