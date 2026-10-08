"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { chatPollIsExpired } from "@/lib/chat/poll-rules";
import { cn } from "@/lib/utils";

export type PollOptionView = {
  id: string;
  label: string;
  count: number | null;
  selected: boolean;
  voterNames: string[];
};

export type PollView = {
  id: string;
  allowMultiple: boolean;
  anonymous: boolean;
  expiresAt: string | null;
  options: PollOptionView[];
};

export function PollMessage({
  poll,
  question,
  pending,
  onVote,
}: {
  poll: PollView;
  question: string | null;
  pending: boolean;
  onVote: (optionIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const voted = poll.options.some((option) => option.selected);
  const closed = chatPollIsExpired(poll.expiresAt, Date.now());
  const locked = voted || closed || pending;
  const [picked, setPicked] = useState<string[]>(() => poll.options.filter((option) => option.selected).map((option) => option.id));
  const counts = poll.options.map((option) => option.count).filter((count): count is number => count != null);
  const max = counts.length > 0 ? Math.max(...counts, 1) : 0;

  function toggle(optionId: string) {
    if (locked) return;
    setPicked((current) => {
      if (!poll.allowMultiple) return current[0] === optionId ? [] : [optionId];
      return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
    });
  }

  return (
    <div className="mt-1 space-y-2">
      {question ? <p className="whitespace-pre-wrap break-words font-medium">{question}</p> : null}
      <p className="text-[11px] opacity-80">
        {poll.anonymous ? t("chat.pollAnonymousLabel") : t("chat.poll")}
        {poll.allowMultiple ? ` · ${t("chat.pollAllowMultiple")}` : ""}
        {closed ? ` · ${t("chat.pollClosed")}` : ""}
      </p>
      <div role="group" aria-label={question ?? t("chat.poll")} className="space-y-1">
        {poll.options.map((option) => {
          const on = locked ? option.selected : picked.includes(option.id);
          const width = option.count == null || max === 0 ? 0 : Math.round((option.count / max) * 100);
          return (
            <button
              key={option.id}
              type="button"
              disabled={locked}
              aria-pressed={on}
              className={cn(
                "relative w-full overflow-hidden rounded-lg border border-current/20 px-2 py-1.5 text-start text-xs disabled:opacity-80",
                on && "border-current/60",
              )}
              onClick={() => toggle(option.id)}
            >
              {option.count != null ? (
                <span aria-hidden className="absolute inset-y-0 start-0 bg-current/10" style={{ width: `${width}%` }} />
              ) : null}
              <span className="relative flex items-start justify-between gap-2">
                <span className="min-w-0 break-words">{option.label}</span>
                {option.count != null ? <span className="shrink-0 tabular-nums">{option.count}</span> : null}
              </span>
              {!poll.anonymous && option.voterNames.length > 0 ? (
                <span className="relative mt-0.5 block text-[11px] opacity-80">
                  {option.voterNames.slice(0, 5).join(", ")}
                  {option.voterNames.length > 5 ? ` +${option.voterNames.length - 5}` : ""}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {voted ? <p className="text-[11px] opacity-80">{t("chat.pollVoted")}</p> : null}
      {!locked ? (
        <Button
          type="button"
          size="sm"
          className="min-h-8"
          disabled={picked.length === 0 || (poll.allowMultiple ? false : picked.length !== 1)}
          onClick={() => onVote(picked)}
        >
          {t("chat.pollVote")}
        </Button>
      ) : null}
    </div>
  );
}
