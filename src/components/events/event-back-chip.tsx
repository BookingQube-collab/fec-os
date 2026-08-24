"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { lookupLinkedEvent } from "@/lib/events.functions";
import { queryKeys } from "@/lib/query-keys";

export function EventBackChip({ eventId }: { eventId?: string | null }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: [...queryKeys.events.all, "link", eventId ?? null],
    queryFn: () => lookupLinkedEvent({ eventId: eventId! }),
    enabled: Boolean(eventId),
  });
  if (!eventId || !q.data) return null;
  return (
    <Badge variant="outline" className="gap-1 font-medium">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("events.opsLink.chip")}</span>
      <Link href={`/events/${eventId}`} className="underline-offset-2 hover:underline">
        {q.data.label}
      </Link>
    </Badge>
  );
}
