"use client";

import { useTranslation } from "react-i18next";

import type { ChatCallHistoryItem } from "@/lib/chat.functions";

function formatWhen(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function CallHistory({
  items,
  error,
  currentUserId,
}: {
  items: ChatCallHistoryItem[];
  error: string | null;
  currentUserId: string | null;
}) {
  const { t, i18n } = useTranslation();

  return (
    <section aria-label={t("chat.callHistory")} className="space-y-2">
      <h3 className="text-sm font-medium">{t("chat.callHistory")}</h3>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!error && items.length === 0 ? <p className="text-xs text-muted-foreground">{t("chat.callHistoryEmpty")}</p> : null}
      {items.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {items.map((item) => {
            const when = formatWhen(item.startedAt, i18n.language);
            const who = item.startedBy === currentUserId ? t("chat.callYou") : t("chat.callOther");
            return (
              <li key={item.id} className="flex items-baseline justify-between gap-3">
                <span>
                  {t(`chat.callKind.${item.kind}`)} · {t(`chat.callStatus.${item.status}`, { defaultValue: item.status })} · {who}
                </span>
                {when ? <time dateTime={item.startedAt}>{when}</time> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
