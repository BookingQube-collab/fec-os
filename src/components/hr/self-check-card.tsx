"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatReportingTime12h } from "@/lib/attendance-display";
import { getMySelfCheck, recordSelfCheck, type SelfCheckRecordResult } from "@/lib/attendance-hr/self-check-in.functions";
import { selfCheckButtons, type SelfCheckKind } from "@/lib/attendance-hr/self-check-in";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

const REASON_KEY: Record<Exclude<SelfCheckRecordResult, { recorded: true }>["reason"], string> = {
  not_linked: "hr.me.unlinkedHint",
  not_enabled: "hr.me.selfCheckNotAllowed",
  already_in: "hr.me.selfCheckAlreadyIn",
  already_out: "hr.me.selfCheckAlreadyOut",
  need_in: "hr.me.selfCheckNeedIn",
  no_location: "hr.me.selfCheckNoLocation",
  outside_geofence: "hr.me.selfCheckOutsideGeofence",
};

const actionClass = "min-h-11 w-full whitespace-normal px-4 text-center shadow-none disabled:opacity-100";

async function readGps(): Promise<{ latitude: number; longitude: number; accuracyMeters: number | null } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 30_000,
      });
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyMeters: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
    };
  } catch {
    return null;
  }
}

/** Check in / Check out for the signed-in employee when their profile allows it. */
export function SelfCheckCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "my-self-check" }),
    queryFn: () => getMySelfCheck(),
    staleTime: STALE.people,
  });

  const punch = useMutation({
    mutationFn: async (kind: SelfCheckKind) => {
      const gps = await readGps();
      return recordSelfCheck({
        kind,
        ...(gps
          ? {
              latitude: gps.latitude,
              longitude: gps.longitude,
              accuracyMeters: gps.accuracyMeters,
            }
          : {}),
      });
    },
    onSuccess: async (result) => {
      if (!result.recorded) {
        toast.error(t(REASON_KEY[result.reason]));
        return;
      }
      toast.success(
        result.kind === "in"
          ? t("hr.me.selfCheckInSavedAt", { location: result.locationLabel })
          : t("hr.me.selfCheckOutSavedAt", { location: result.locationLabel }),
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr({ view: "my-self-check" }) }),
        qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr({ view: "my-attendance" }) }),
      ]);
    },
    onError: (error) => toast.error((error as Error).message || t("hr.me.selfCheckFailed")),
  });

  if (state.isLoading) {
    return (
      <section className="hd-card hd-stack min-w-0 max-w-full" aria-busy="true">
        <div className="px-4 py-4">
          <p className="m-0 text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </section>
    );
  }
  if (state.isError) {
    return (
      <section className="hd-card hd-stack min-w-0 max-w-full">
        <div className="px-4 py-4">
          <p className="m-0 text-sm text-destructive">{t("hr.me.selfCheckFailed")}</p>
        </div>
      </section>
    );
  }
  if (!state.data?.enabled) return null;

  const buttons = selfCheckButtons(state.data.punchesToday);
  const checkedIn = state.data.checkedInAt ? formatReportingTime12h(state.data.checkedInAt) : "";
  const checkedOut = state.data.checkedOutAt ? formatReportingTime12h(state.data.checkedOutAt) : "";
  const status = checkedOut
    ? {
        text: state.data.checkedOutLocationLabel
          ? t("hr.me.checkedOutAtLocation", {
              time: checkedOut,
              location: state.data.checkedOutLocationLabel,
            })
          : t("hr.me.checkedOutAt", { time: checkedOut }),
        tone: "text-info",
      }
    : checkedIn
      ? {
          text: state.data.checkedInLocationLabel
            ? t("hr.me.checkedInAtLocation", {
                time: checkedIn,
                location: state.data.checkedInLocationLabel,
              })
            : t("hr.me.checkedInAt", { time: checkedIn }),
          tone: "text-success",
        }
      : null;

  return (
    <section className="hd-card hd-stack min-w-0 max-w-full">
      <div className="min-w-0 px-4 py-4">
        <h2 className="m-0 text-xs font-bold uppercase tracking-[0.08em]">{t("hr.me.selfCheckTitle")}</h2>
        <p className="mb-0 mt-1.5 text-sm leading-5 text-muted-foreground">{t("hr.me.selfCheckHint")}</p>
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className={cn(
              actionClass,
              buttons.checkIn
                ? "border-transparent bg-success text-white hover:bg-success/90 hover:text-white"
                : "border-success/30 bg-success/10 text-success hover:bg-success/10 hover:text-success",
            )}
            disabled={!buttons.checkIn || punch.isPending}
            onClick={() => punch.mutate("in")}
          >
            {buttons.checkIn ? null : <Check className="size-4" aria-hidden />}
            {t("hr.me.checkIn")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn(
              actionClass,
              buttons.checkOut
                ? "border-transparent bg-warning text-foreground hover:bg-warning/90 hover:text-foreground"
                : checkedOut
                  ? "border-info/25 bg-info/10 text-info hover:bg-info/10 hover:text-info"
                  : "border-border bg-muted/50 text-muted-foreground hover:bg-muted/50 hover:text-muted-foreground",
            )}
            disabled={!buttons.checkOut || punch.isPending}
            onClick={() => punch.mutate("out")}
          >
            {checkedOut ? <Check className="size-4" aria-hidden /> : null}
            {t("hr.me.checkOut")}
          </Button>
        </div>
        {status ? <p className={cn("mb-0 mt-3 text-sm font-semibold leading-5", status.tone)}>{status.text}</p> : null}
      </div>
    </section>
  );
}
