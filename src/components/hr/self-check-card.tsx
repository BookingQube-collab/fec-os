"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatPunchTime12h } from "@/lib/attendance-display";
import { getMySelfCheck, recordSelfCheck, type SelfCheckRecordResult } from "@/lib/attendance-hr/self-check-in.functions";
import { selfCheckButtons, type SelfCheckKind } from "@/lib/attendance-hr/self-check-in";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

const REASON_KEY: Record<Exclude<SelfCheckRecordResult, { recorded: true }>["reason"], string> = {
  not_linked: "hr.me.unlinkedHint",
  not_enabled: "hr.me.selfCheckNotAllowed",
  already_in: "hr.me.selfCheckAlreadyIn",
  already_out: "hr.me.selfCheckAlreadyOut",
  need_in: "hr.me.selfCheckNeedIn",
  no_location: "hr.me.selfCheckNoLocation",
};

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
    mutationFn: (kind: SelfCheckKind) => recordSelfCheck({ kind }),
    onSuccess: async (result) => {
      if (!result.recorded) {
        toast.error(t(REASON_KEY[result.reason]));
        return;
      }
      toast.success(result.kind === "in" ? t("hr.me.selfCheckInSaved") : t("hr.me.selfCheckOutSaved"));
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr({ view: "my-self-check" }) }),
        qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr({ view: "my-attendance" }) }),
      ]);
    },
    onError: (error) => toast.error((error as Error).message || t("hr.me.selfCheckFailed")),
  });

  if (state.isLoading) return <p className="hd-note">{t("common.loading")}</p>;
  if (state.isError) return <p className="hd-note">{t("hr.me.selfCheckFailed")}</p>;
  if (!state.data?.enabled) return null;

  const buttons = selfCheckButtons(state.data.punchesToday);
  const checkedIn = state.data.checkedInAt ? formatPunchTime12h(state.data.checkedInAt) : "";
  const checkedOut = state.data.checkedOutAt ? formatPunchTime12h(state.data.checkedOutAt) : "";

  return (
    <section className="hd-card hd-stack">
      <div className="hd-card__head">
        <h2 className="hd-card__title">{t("hr.me.selfCheckTitle")}</h2>
      </div>
      <div className="hd-section">
        <p className="hd-hint">{t("hr.me.selfCheckHint")}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={!buttons.checkIn || punch.isPending}
            onClick={() => punch.mutate("in")}
          >
            {t("hr.me.checkIn")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={!buttons.checkOut || punch.isPending}
            onClick={() => punch.mutate("out")}
          >
            {t("hr.me.checkOut")}
          </Button>
        </div>
        {checkedIn ? <p className="hd-note">{t("hr.me.checkedInAt", { time: checkedIn })}</p> : null}
        {checkedOut ? <p className="hd-note">{t("hr.me.checkedOutAt", { time: checkedOut })}</p> : null}
      </div>
    </section>
  );
}
