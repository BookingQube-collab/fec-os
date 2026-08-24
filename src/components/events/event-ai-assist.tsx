"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function EventAiAssist({
  brief,
  onBriefChange,
  onGenerate,
  pending,
  hint,
  compact,
  generateLabel,
  title,
  extraAction,
}: {
  brief: string;
  onBriefChange: (value: string) => void;
  onGenerate: () => void;
  pending?: boolean;
  hint?: string;
  compact?: boolean;
  generateLabel?: string;
  title?: string;
  extraAction?: { label: string; onClick: () => void; pending?: boolean };
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!compact);

  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            {title ?? t("events.builder.ai.title")}
          </p>
          <p className="text-xs text-muted-foreground">{hint ?? t("events.builder.ai.hint")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {compact ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? t("events.builder.ai.hide") : t("events.builder.ai.show")}
            </Button>
          ) : null}
          {extraAction ? (
            <Button type="button" variant="ghost" size="sm" disabled={pending || extraAction.pending} onClick={extraAction.onClick}>
              {extraAction.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
              {extraAction.label}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onGenerate}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
            {generateLabel ?? t("events.builder.ai.generate")}
          </Button>
        </div>
      </div>
      {open ? (
        <Textarea
          className="mt-3"
          rows={3}
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          placeholder={t("events.builder.ai.placeholder")}
        />
      ) : null}
    </div>
  );
}
