"use client";

import { RotateCcw, Shield, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function PrReviewPanel({
  roleLabel,
  stageOptions,
  universal,
  pending,
  onApprove,
  onReject,
  onRequestChanges,
}: {
  roleLabel: string;
  stageOptions?: Array<{ id: string; label: string }>;
  universal?: boolean;
  pending?: boolean;
  onApprove: (comments: string) => void;
  onReject: (comments: string) => void;
  onRequestChanges: (comments: string) => void;
}) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState("");
  const [stageId, setStageId] = useState(stageOptions?.[0]?.id ?? "current");
  const activeStage = stageOptions?.find((s) => s.id === stageId)?.label ?? roleLabel;

  return (
    <section className="pr-review-panel rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Shield className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">
              {universal
                ? t("procurement.detail.reviewingUniversal", { role: roleLabel })
                : t("procurement.detail.reviewingAs", { role: roleLabel })}
            </p>
          </div>
        </div>
        {stageOptions && stageOptions.length > 1 ? (
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger className="h-9 w-auto min-w-[12rem] rounded-full text-xs">
              <SelectValue placeholder={t("procurement.detail.selectStage")} />
            </SelectTrigger>
            <SelectContent>
              {stageOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {t("procurement.detail.actingOnStage", { stage: opt.label })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("procurement.detail.actingOnStage", { stage: activeStage })}
          </p>
        )}
      </div>
      <Textarea
        className="mt-4 min-h-28"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder={t("procurement.detail.feedbackPlaceholderReject")}
      />
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => onRequestChanges(feedback.trim())}>
          <RotateCcw className="h-4 w-4" />
          {t("procurement.detail.requestChanges")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={pending}
          onClick={() => onReject(feedback.trim())}
        >
          <X className="h-4 w-4" />
          {t("procurement.detail.reject")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "border-emerald-500/50 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
            "dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20",
          )}
          disabled={pending}
          onClick={() => onApprove(feedback.trim())}
        >
          {t("procurement.detail.approveRequest")}
        </Button>
      </div>
    </section>
  );
}
