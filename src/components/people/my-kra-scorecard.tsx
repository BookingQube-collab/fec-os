"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { KraSiteSopList, KraSopCodeLinks } from "@/components/people/kra-site-sops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { acknowledgeMyKraScorecard, listMyKraScorecards } from "@/lib/kra-scorecard.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function MyKraScorecards() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const cards = useQuery({
    queryKey: queryKeys.people.kraMine(),
    queryFn: () => listMyKraScorecards(),
    staleTime: STALE.people,
  });
  const ack = useMutation({
    mutationFn: (id: string) => acknowledgeMyKraScorecard({ id, note }),
    onSuccess: () => {
      toast.success(t("kraScorecard.ack"));
      setNote("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.kraMine() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (cards.isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (cards.isError) return <p className="text-sm text-destructive">{(cards.error as Error).message}</p>;
  if (!cards.data?.length) return <p className="text-sm text-muted-foreground">{t("kraScorecard.myEmpty")}</p>;

  return (
    <div className="space-y-4">
      {cards.data.map((card) => (
        <article key={card.id} className="rounded-lg border border-border/70 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">
                {card.templateCode} · {card.brand}
              </p>
              <p className="text-xs text-muted-foreground">
                {card.reviewPeriod} · {card.role} · {card.assignedPost}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge>{card.score ?? "—"}</Badge>
              <Badge variant="muted">{card.classification}</Badge>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{card.baselineNote}</p>
          <div className="mt-3">
            <KraSiteSopList sops={card.sops} />
          </div>
          <ul className="mt-3 space-y-2">
            {card.lines.map((line) => (
              <li key={line.itemId} className="text-sm">
                <span className="font-medium">
                  {line.itemNo}. {line.title}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · <KraSopCodeLinks reference={line.sopReference} sops={card.sops} /> · {line.status} · {line.rowCheck}
                  {line.rating != null ? ` · ${line.rating}/5` : ""}
                </span>
                <p className="text-xs text-muted-foreground">{line.targetStandard}</p>
              </li>
            ))}
          </ul>
          {card.agreedAction ? <p className="mt-3 text-sm">{card.agreedAction}</p> : null}
          {card.employeeAckAt ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("kraScorecard.ack")}: {card.employeeAckNote}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">{t("kraScorecard.ackHint")}</p>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("kraScorecard.ackNote")} />
              <Button size="sm" disabled={ack.isPending} onClick={() => ack.mutate(card.id)}>
                {t("kraScorecard.ack")}
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
