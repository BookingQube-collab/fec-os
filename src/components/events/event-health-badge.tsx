"use client";

import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { EventRag } from "@/lib/events/constants";

const VARIANT: Record<EventRag, "success" | "warning" | "destructive" | "default"> = {
  green: "success",
  amber: "warning",
  red: "destructive",
  critical: "destructive",
};

export function EventHealthBadge({ rag }: { rag: EventRag | string }) {
  const { t } = useTranslation();
  const key: EventRag =
    rag === "green" || rag === "amber" || rag === "red" || rag === "critical" ? rag : "amber";
  return (
    <Badge variant={VARIANT[key]} className={key === "critical" ? "ring-1 ring-rag-red" : undefined}>
      {t(`events.rag.${key}`)}
    </Badge>
  );
}
