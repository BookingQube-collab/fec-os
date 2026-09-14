"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { EnterDataPanel } from "@/components/weekly-review/enter-data-panel";
import { InfographicsPanel } from "@/components/weekly-review/infographics-panel";
import { PresentPanel } from "@/components/weekly-review/present-panel";
import { WeeklyReviewDataTools } from "@/components/weekly-review/data-tools";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { useSites } from "@/hooks/queries/useSites";
import {
  useCreateWeeklyReview,
  useSaveWeeklyReview,
  useWeeklyReviewList,
  useWeeklyReviewPack,
} from "@/hooks/queries/useWeeklyReview";
import type { ReviewPack } from "@/lib/weekly-review/model";
import { summarizePack } from "@/lib/weekly-review/model";
import { formatReviewDates } from "@/lib/weekly-review/constants";

type Mode = "present" | "enter" | "infographics";

export default function WeeklyReviewPage() {
  const { t } = useTranslation();
  const canView = usePermission("weekly_review.view");
  const canEdit = usePermission("weekly_review.edit");
  const { roles } = useAuth();
  const { data: sites = [] } = useSites();
  const listQ = useWeeklyReviewList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("present");
  const [draft, setDraft] = useState<ReviewPack | null>(null);
  const saveTimer = useRef<number>(0);

  const list = listQ.data ?? [];
  const activeId = selectedId ?? list[0]?.review.id ?? null;
  const packQ = useWeeklyReviewPack(activeId);
  const createMut = useCreateWeeklyReview();
  const saveMut = useSaveWeeklyReview(activeId);

  useEffect(() => {
    if (packQ.data) setDraft(packQ.data);
  }, [packQ.data]);

  const locationFilter = useMemo(() => {
    if (canEdit) return null;
    const ids = roles.flatMap((r) => r.location_ids ?? []);
    return ids.length ? ids : null;
  }, [canEdit, roles]);

  const persist = (pack: ReviewPack, status?: ReviewPack["review"]["status"]) => {
    if (!canEdit) return;
    saveMut.mutate(
      {
        notes: pack.review.notes,
        week_label: pack.review.week_label,
        week_start: pack.review.week_start,
        week_end: pack.review.week_end,
        meeting_date: pack.review.meeting_date,
        status: status ?? pack.review.status,
        decisions: pack.decisions,
        aggregators: pack.aggregators,
        corporate: pack.corporate,
        social: pack.social,
        loyalty: pack.loyalty,
        actions: pack.actions,
        incidents: pack.incidents,
      },
      {
        onSuccess: () => toast.success(t("weeklyReview.saved")),
        onError: (e) => toast.error(e instanceof Error ? e.message : t("common.tryAgain")),
      },
    );
  };

  const onChange = (next: ReviewPack) => {
    setDraft(next);
    if (!canEdit) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(next), 600);
  };

  const startWeek = async () => {
    try {
      const { id } = await createMut.mutateAsync();
      setSelectedId(id);
      setMode("enter");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.tryAgain"));
    }
  };

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("weeklyReports.noAccess")}</p>;
  }

  return (
    <div className="weekly-review-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={activeId ?? undefined} onValueChange={setSelectedId}>
            <SelectTrigger className="w-56" aria-label={t("weeklyReview.week")}>
              <SelectValue placeholder={t("weeklyReview.week")} />
            </SelectTrigger>
            <SelectContent>
              {list.map((item) => (
                <SelectItem key={item.review.id} value={item.review.id}>
                  {item.review.week_label} ({formatReviewDates(item.review.week_start, item.review.week_end)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit ? (
            <Button type="button" onClick={() => void startWeek()} disabled={createMut.isPending}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("weeklyReview.startWeek")}
            </Button>
          ) : null}
          <WeeklyReviewDataTools
            pack={draft}
            sites={sites}
            canEdit={canEdit}
            onApplied={(next) => {
              const withSummary = { ...next, summary: summarizePack(next, next.summary) };
              onChange(withSummary);
              setMode("infographics");
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          {mode === "present" ? (
            <Button type="button" variant="outline" onClick={() => window.print()}>
              {t("weeklyReview.exportPdf")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={mode === "present" ? "default" : "outline"}
            onClick={() => {
              setMode("present");
              if (canEdit && draft) persist(draft, "presented");
            }}
          >
            {t("weeklyReview.present")}
          </Button>
          {canEdit ? (
            <Button
              type="button"
              variant={mode === "enter" ? "default" : "outline"}
              onClick={() => setMode("enter")}
            >
              {t("weeklyReview.enter")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={mode === "infographics" ? "default" : "outline"}
            onClick={() => setMode("infographics")}
          >
            {t("weeklyReview.infographics.nav")}
          </Button>
        </div>
      </div>

      {listQ.isLoading || (activeId && packQ.isLoading && !draft) ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : !draft ? (
        <p className="text-sm text-muted-foreground">{t("weeklyReview.empty")}</p>
      ) : mode === "enter" ? (
        <EnterDataPanel pack={draft} sites={sites} canEdit={canEdit} onChange={onChange} />
      ) : mode === "infographics" ? (
        <InfographicsPanel pack={draft} sites={sites} locationFilter={locationFilter} />
      ) : (
        <PresentPanel
          pack={draft}
          sites={sites}
          list={list}
          locationFilter={locationFilter}
          onEnter={canEdit ? () => setMode("enter") : undefined}
        />
      )}
    </div>
  );
}
