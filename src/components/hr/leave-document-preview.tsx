"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { FecLoader } from "@/components/fec";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { documentPreviewKind } from "@/lib/hr/document-preview-kind";
import { getLeaveDocumentUrl } from "@/lib/hr-leave.functions";
import { queryKeys } from "@/lib/query-keys";

export type LeaveDocumentPreviewTarget = {
  leaveId: string;
  fileName: string | null;
  /** Shown in the dialog title; falls back to medical document label. */
  title?: string | null;
};

function pdfFrameSrc(url: string) {
  return `${url}#toolbar=1&navpanes=0`;
}

export function useLeaveDocumentPreviewUrl(leaveId: string | null) {
  return useQuery({
    queryKey: queryKeys.people.leaveDocPreview(leaveId ?? "none"),
    queryFn: async () => {
      const result = await getLeaveDocumentUrl({ leaveId: leaveId as string, purpose: "preview" });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: Boolean(leaveId),
    staleTime: 7 * 60 * 1000,
    refetchInterval: 8 * 60 * 1000,
  });
}

/** In-page modal for leave supporting docs (PDF + images). Does not navigate away. */
export function LeaveDocumentLightbox({
  doc,
  open,
  onOpenChange,
}: {
  doc: LeaveDocumentPreviewTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const preview = useLeaveDocumentPreviewUrl(open && doc ? doc.leaveId : null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [doc?.leaveId, preview.data?.url]);

  const fileName = doc?.fileName ?? preview.data?.fileName ?? t("hr.docs.previewFile");
  const kind = documentPreviewKind(null, fileName);
  const title = doc?.title?.trim() || t("hr.leave.sickDocument");
  const url = preview.data?.url;
  const showImage = kind === "image" && url && !broken;
  const showPdf = kind === "pdf" && url;
  const showFallback = !preview.isPending && !preview.isError && !showImage && !showPdf;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[min(94vw,56rem)] gap-4 overflow-y-auto">
        <DialogHeader className="pe-8 text-start">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{fileName}</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-2xl border border-border bg-muted">
          {preview.isPending ? (
            <div className="flex min-h-48 items-center justify-center p-6">
              <FecLoader density="page" label={t("hr.docs.previewLoading")} />
            </div>
          ) : null}
          {preview.isError ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("hr.docs.previewUnavailable")}
            </p>
          ) : null}
          {showImage ? (
            <div className="max-h-[70vh] overflow-auto">
              <img
                src={url}
                alt={fileName}
                className="mx-auto max-h-[70vh] w-full object-contain"
                referrerPolicy="no-referrer"
                onError={() => setBroken(true)}
              />
            </div>
          ) : null}
          {showPdf ? (
            <iframe
              title={fileName}
              src={pdfFrameSrc(url)}
              className="h-[min(70vh,40rem)] w-full border-0 bg-card"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {showFallback ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <FileText className="h-10 w-10 text-foreground" aria-hidden />
              <span className="text-xs font-semibold">
                {broken ? t("hr.docs.previewUnavailable") : t("hr.docs.previewFile")}
              </span>
              <span className="line-clamp-2 max-w-full text-[11px] text-muted-foreground">{fileName}</span>
            </div>
          ) : null}
        </div>
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("hr.leave.openDocumentNewTab", { defaultValue: "Open in new tab" })}
              </a>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
