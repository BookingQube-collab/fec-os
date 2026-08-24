"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function PrAiAssist({
  brief,
  onBriefChange,
  onGenerate,
  pending,
  hint,
  compact,
  generateLabel,
}: {
  brief: string;
  onBriefChange: (value: string) => void;
  onGenerate: () => void;
  pending?: boolean;
  hint?: string;
  compact?: boolean;
  generateLabel?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!compact);

  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            {t("procurement.wizard.ai.title")}
          </p>
          <p className="text-xs text-muted-foreground">{hint ?? t("procurement.wizard.ai.hint")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {compact ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? t("procurement.wizard.ai.hide") : t("procurement.wizard.ai.show")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onGenerate}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
            {generateLabel ?? t("procurement.wizard.ai.generate")}
          </Button>
        </div>
      </div>
      {open ? (
        <Textarea
          className="mt-3"
          rows={3}
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          placeholder={t("procurement.wizard.ai.placeholder")}
        />
      ) : null}
    </div>
  );
}
