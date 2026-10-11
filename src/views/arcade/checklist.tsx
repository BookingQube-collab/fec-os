"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { StatusBadge } from "@/components/arcade/ui";
import { FecLoader } from "@/components/fec";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { getArcadeContext } from "@/lib/arcade.functions";
import { getDailyChecklist, markDailyGameCheck } from "@/lib/arcade-work.functions";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeChecklist() {
  const { t } = useTranslation();
  const sites = useSites();
  const canOperate = usePermission("arcade.operate");
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: [...queryKeys.arcade.all, "checklist", locationId],
    queryFn: () => getDailyChecklist({ locationId }),
    enabled: Boolean(locationId),
  });
  const qc = useQueryClient();
  const mark = useMutation({
    mutationFn: (input: { machineId: string; ok: boolean }) =>
      markDailyGameCheck({
        locationId,
        machineId: input.machineId,
        ok: input.ok,
        note: notes[input.machineId] ?? "",
      }),
    onSuccess: (result) => {
      if (result.alreadyChecked) toast.message(t("arcadeSimple.alreadyChecked"));
      else if (result.faultTicket) toast.success(t("arcadeSimple.faultOpened", { ticket: result.faultTicket }));
      else toast.success(t("arcadeSimple.savedCheck"));
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.updateFailed")),
  });

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("arcadeSimple.checklistTitle")}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{t("arcadeSimple.checklistHint")}</p>
        {context.data?.isSupervisor ? <p className="text-base font-medium">{t("arcadeSimple.yourChecklist")}</p> : null}
      </header>
      <label className="grid max-w-xl gap-2">
        <span className="text-xl font-medium">{t("arcadeSimple.pickLocation")}</span>
        <select
          className="h-12 rounded-md border bg-background px-3 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
        >
          <option value="">{t("arcadeScreens.selectSite")}</option>
          {(sites.data ?? []).map((site) => (
            <option key={site.id} value={site.id}>{venueTitle(site, site.name)}</option>
          ))}
        </select>
      </label>
      {!canOperate ? <p className="text-sm text-muted-foreground">{t("arcadeSimple.lookOnly")}</p> : null}
      {list.isLoading ? <FecLoader label={t("arcadeOps.loading")} /> : null}
      {list.isError ? <p className="text-sm text-destructive">{list.error instanceof Error ? list.error.message : t("arcadeOps.failed")}</p> : null}
      {list.data ? (
        <section className="grid gap-4">
          <div>
            <h2 className="text-lg font-medium">{t("arcadeSimple.supervisor")}</h2>
            {list.data.supervisors.length === 0 ? <p className="text-muted-foreground">{t("arcadeSimple.noSupervisor")}</p> : (
              <ul className="mt-1 grid gap-1">
                {list.data.supervisors.map((person) => (
                  <li key={person.id} className="text-lg">{person.name}{person.title ? ` · ${person.title}` : ""}{person.phone ? ` · ${person.phone}` : ""}</li>
                ))}
              </ul>
            )}
          </div>
          <h2 className="text-xl font-medium">{t("arcadeSimple.pickGame")}</h2>
          {list.data.games.length === 0 ? <p className="text-muted-foreground">{t("arcadeSimple.noGames")}</p> : null}
          <ul className="grid gap-3">
            {list.data.games.map((game) => (
              <li key={game.id} className="grid gap-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xl font-semibold">{game.name}</p>
                  <StatusBadge status={game.check?.result === "PASS" ? "WORKING" : game.check?.result === "FAIL" ? "DOWN" : game.status} />
                </div>
                {game.check ? (
                  <p className="text-sm text-muted-foreground">
                    {game.check.result === "PASS" ? t("arcadeSimple.checked") : t("arcadeSimple.notOk")}
                    {game.check.notes ? ` · ${game.check.notes}` : ""}
                  </p>
                ) : (
                  <>
                    <Textarea
                      value={notes[game.id] ?? ""}
                      placeholder={t("arcadeSimple.note")}
                      onChange={(event) => setNotes({ ...notes, [game.id]: event.target.value })}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" disabled={!canOperate || mark.isPending} onClick={() => mark.mutate({ machineId: game.id, ok: true })}>
                        {t("arcadeSimple.checked")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canOperate || mark.isPending}
                        onClick={() => {
                          if (!(notes[game.id] ?? "").trim()) {
                            toast.error(t("arcadeSimple.noteNeeded"));
                            return;
                          }
                          mark.mutate({ machineId: game.id, ok: false });
                        }}
                      >
                        {t("arcadeSimple.notOk")}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
