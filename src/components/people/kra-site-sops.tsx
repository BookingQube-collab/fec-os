"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getKraSiteSop, getKraSiteSopFile } from "@/lib/kra-scorecard.functions";
import { expandSopCodes, type KraSiteSop } from "@/lib/kra-scorecard/model";

function SopReader({ sopId, open, onOpenChange }: { sopId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const detail = useQuery({
    queryKey: ["kra-site-sop", sopId],
    queryFn: () => getKraSiteSop({ id: sopId! }),
    enabled: open && Boolean(sopId),
  });

  async function download() {
    if (!sopId) return;
    const file = await getKraSiteSopFile({ id: sopId });
    window.open(file.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail.data?.title ?? t("kraScorecard.openSop")}</DialogTitle>
        </DialogHeader>
        {detail.isLoading ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}
        {detail.isError ? <p className="text-sm text-destructive">{(detail.error as Error).message}</p> : null}
        {detail.data?.fileName ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void download().catch((error: Error) => toast.error(error.message));
            }}
          >
            {t("kraScorecard.downloadSop")}
          </Button>
        ) : null}
        <div className="space-y-4">
          {(detail.data?.sections ?? []).map((section) => (
            <section key={section.id}>
              {section.heading ? <h3 className="mb-1 text-sm font-medium">{section.heading}</h3> : null}
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{section.content}</p>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function KraSiteSopList({ sops }: { sops: KraSiteSop[] }) {
  const { t } = useTranslation();
  const [sopId, setSopId] = useState<string | null>(null);
  if (!sops.length) return <p className="text-sm text-muted-foreground">{t("kraScorecard.sopEmpty")}</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("kraScorecard.locationSops")}</p>
      <div className="flex flex-wrap gap-1">
        {sops.map((sop) => (
          <Button key={sop.id} size="sm" variant="outline" onClick={() => setSopId(sop.id)}>
            {sop.code === "MANUAL" ? t("kraScorecard.siteManual") : sop.code}
          </Button>
        ))}
      </div>
      <SopReader sopId={sopId} open={Boolean(sopId)} onOpenChange={(open) => !open && setSopId(null)} />
    </div>
  );
}

export function KraSopCodeLinks({ reference, sops }: { reference: string; sops: KraSiteSop[] }) {
  const [sopId, setSopId] = useState<string | null>(null);
  const matches = expandSopCodes(reference)
    .map((code) => sops.find((sop) => sop.code === code))
    .filter((sop): sop is KraSiteSop => Boolean(sop));
  if (!matches.length) return <span>{reference}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span>{reference}</span>
      {matches.map((sop) => (
        <Button key={sop.id} size="sm" variant="link" className="h-auto px-1 py-0" onClick={() => setSopId(sop.id)}>
          {sop.code}
        </Button>
      ))}
      <SopReader sopId={sopId} open={Boolean(sopId)} onOpenChange={(open) => !open && setSopId(null)} />
    </span>
  );
}
