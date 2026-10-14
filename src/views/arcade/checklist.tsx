"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ArcadeEmpty, StatusBadge } from "@/components/arcade/ui";
import { FecLoader } from "@/components/fec";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { isArcadeVenueLocation } from "@/lib/arcade/domain";
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
  const [locationTouched, setLocationTouched] = useState(false);
  useEffect(() => {
    if (locationTouched || locationId) return;
    const site = context.data?.staff?.location_id;
    if (site) setLocationId(site);
  }, [context.data?.staff?.location_id, locationId, locationTouched]);
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
    <div className="phone-shell">
      <header className="phone-head">
        <p>{t("nav.arcade")}</p>
        <h1>{t("arcadeSimple.checklistTitle")}</h1>
        <p>{t("arcadeSimple.checklistHint")}</p>
      </header>
      {context.data?.isSupervisor ? <p className="cc-note">{t("arcadeSimple.yourChecklist")}</p> : null}
      <label className="arcade-panel grid max-w-xl gap-2">
        <span className="font-medium">{t("arcadeSimple.pickLocation")}</span>
        <select
          className="arcade-select"
          value={locationId}
          onChange={(event) => {
            setLocationTouched(true);
            setLocationId(event.target.value);
          }}
        >
          <option value="">{t("arcadeScreens.selectSite")}</option>
          {(sites.data ?? []).filter(isArcadeVenueLocation).map((site) => (
            <option key={site.id} value={site.id}>{venueTitle(site, site.name)}</option>
          ))}
        </select>
      </label>
      {!locationId ? <ArcadeEmpty title={t("arcadeFlow.checklistPick")} /> : (
        <article className="phone-asset">
          <p className="cc-note">{t("arcadeScreens.asset")}</p>
          <strong>{venueTitle(sites.data?.find((site) => site.id === locationId), t("common.site"))}</strong>
          {list.data ? (
            <dl>
              <div>
                <dt>{t("arcadeFlow.checklist")}</dt>
                <dd>{t("arcadeFlow.checkProgress", { done: list.data.games.filter((game) => game.check).length, total: list.data.games.length })}</dd>
              </div>
            </dl>
          ) : null}
        </article>
      )}
      {!canOperate ? <p className="arcade-note">{t("arcadeSimple.lookOnly")}</p> : null}
      {list.isLoading ? <FecLoader label={t("arcadeOps.loading")} /> : null}
      {list.isError ? <p className="text-sm text-destructive">{list.error instanceof Error ? list.error.message : t("arcadeOps.failed")}</p> : null}
      {list.data ? (
        <section className="phone-card">
          <div className="phone-card__head">
            <h2>{t("arcadeFlow.checklist")}</h2>
            <span>{t("arcadeFlow.checkProgress", { done: list.data.games.filter((game) => game.check).length, total: list.data.games.length })}</span>
          </div>
          <div className="arcade-meter" aria-hidden="true">
            <div
              className="arcade-meter__bar arcade-meter__bar--ok"
              style={{ width: list.data.games.length === 0 ? "0%" : `${Math.round((list.data.games.filter((game) => game.check).length / list.data.games.length) * 100)}%` }}
            />
          </div>
          {list.data.supervisors.length > 0 ? (
            <p className="cc-note">
              {t("arcadeSimple.supervisor")}: {list.data.supervisors.map((person) => [person.name, person.title].filter(Boolean).join(" · ")).join(", ")}
            </p>
          ) : null}
          {list.data.games.length === 0 ? <ArcadeEmpty title={t("arcadeSimple.noGames")} /> : null}
          <ul>
            {list.data.games.map((game) => {
              const passed = game.check?.result === "PASS";
              const failed = game.check?.result === "FAIL";
              return (
                <li key={game.id} className="phone-row">
                  <span className={`phone-box${passed ? " is-on" : failed ? " is-bad" : ""}`} aria-hidden="true">
                    {passed || failed ? <CircleCheck /> : null}
                  </span>
                  <div className="grid min-w-0 gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{game.name}</p>
                      <StatusBadge status={passed ? "WORKING" : failed ? "DOWN" : game.status} />
                    </div>
                    {game.assetCode ? <p className="cc-note">{game.assetCode}</p> : null}
                    {game.check ? (
                      <p className="text-sm text-muted-foreground">
                        {passed ? t("arcadeSimple.checked") : t("arcadeSimple.notOk")}
                        {game.check.notes ? ` · ${game.check.notes}` : ""}
                      </p>
                    ) : (
                      <>
                        <Textarea
                          value={notes[game.id] ?? ""}
                          placeholder={t("arcadeSimple.note")}
                          onChange={(event) => setNotes({ ...notes, [game.id]: event.target.value })}
                        />
                        <Button type="button" className="arcade-cta phone-submit" disabled={!canOperate || mark.isPending} onClick={() => mark.mutate({ machineId: game.id, ok: true })}>
                          {t("arcadeSimple.checked")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="arcade-touch w-full"
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
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
