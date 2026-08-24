"use client";

import { useTranslation } from "react-i18next";

export function EventSourceBanner() {
  const { t } = useTranslation();
  return (
    <p className="rounded-xl border border-border/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {t("events.sourceOfTruth")}
    </p>
  );
}
