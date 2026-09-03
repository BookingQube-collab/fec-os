"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function PrReviewPanel({
  roleLabel,
  universal,
  pending,
  onApprove,
  onReject,
  onRequestChanges,
}: {
  roleLabel: string;
  universal?: boolean;
  pending?: boolean;
  onApprove: (comments: string) => void;
  onReject: (comments: string) => void;
  onRequestChanges: (comments: string) => void;
}) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState("");

  return (
    <section className="pr-review-panel rounded-2xl border border-border/40 bg-card p-5 shadow-elevated-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t("procurement.detail.reviewingAs", { role: roleLabel })}</p>
          {universal ? (
            <Badge variant="secondary" className="mt-1.5">
              {t("procurement.detail.universalAccess")}
            </Badge>
          ) : null}
        </div>
        <p className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          {t("procurement.detail.actingOnStage", { stage: roleLabel })}
        </p>
      </div>
      <Textarea
        className="mt-4 min-h-28"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder={t("procurement.detail.feedbackPlaceholder")}
      />
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => onRequestChanges(feedback.trim())}
        >
          {t("procurement.detail.requestChanges")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={pending}
          onClick={() => onReject(feedback.trim())}
        >
          {t("procurement.detail.reject")}
        </Button>
        <Button
          type="button"
          className={cn("bg-emerald-700 text-white hover:bg-emerald-800")}
          disabled={pending}
          onClick={() => onApprove(feedback.trim())}
        >
          {t("procurement.detail.approveRequest")}
        </Button>
      </div>
    </section>
  );
}
