"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { FecLoader } from "@/components/fec";
import StatusMark, { type StatusMarkStatus } from "@/components/react-bits/status-mark";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { documentPreviewKind, type DocumentPreviewKind } from "@/lib/hr/document-preview-kind";
import { getEmployeeDocumentUrl } from "@/lib/hr-documents.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type StaffDocumentPreviewDoc = {
  id: string;
  staffName: string | null;
  docType: string;
  fileName: string | null;
  fileMime: string | null;
};

export function documentStatusMark(status: string): StatusMarkStatus {
  if (status === "approved") return "done";
  if (status === "rejected") return "failed";
  if (status === "expired" || status === "superseded") return "cancelled";
  return "pending";
}

export function verificationStatusMark(status: string): StatusMarkStatus {
  if (status === "verified") return "done";
  if (status === "rejected") return "failed";
  return "pending";
}

export function useStaffDocumentPreviewUrl(id: string | null) {
  return useQuery({
    queryKey: queryKeys.people.hrDocPreview(id ?? "none"),
    queryFn: () => getEmployeeDocumentUrl({ id: id as string, purpose: "preview" }),
    enabled: Boolean(id),
    staleTime: 7 * 60 * 1000,
    refetchInterval: 8 * 60 * 1000,
  });
}

function pdfFrameSrc(url: string, chrome: boolean) {
  const hash = chrome ? "toolbar=1&navpanes=0" : "toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH";
  return `${url}#${hash}`;
}

function FilePreviewFace({
  kind,
  fileName,
  compact,
}: {
  kind: DocumentPreviewKind;
  fileName: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const label = kind === "pdf" ? t("hr.docs.previewPdf") : t("hr.docs.previewFile");
  return (
    <div className={cn("flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/70 px-3 text-center", compact ? "py-3" : "py-10")}>
      <FileText className={compact ? "h-7 w-7 text-foreground" : "h-10 w-10 text-foreground"} aria-hidden />
      <span className="text-xs font-semibold">{label}</span>
      <span className="line-clamp-2 max-w-full text-[11px] text-muted-foreground">{fileName}</span>
    </div>
  );
}

export function StaffDocumentThumbnail({
  doc,
  className,
}: {
  doc: Pick<StaffDocumentPreviewDoc, "id" | "fileName" | "fileMime">;
  className?: string;
}) {
  const { t } = useTranslation();
  const preview = useStaffDocumentPreviewUrl(doc.id);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [doc.id, preview.data?.url]);
  const kind = documentPreviewKind(doc.fileMime, doc.fileName);
  const fileName = doc.fileName ?? t("hr.docs.previewFile");
  const url = preview.data?.url;
  const showImage = kind === "image" && url && !broken;
  const showPdf = kind === "pdf" && url;

  return (
    <span className={cn("relative block h-36 w-full overflow-hidden rounded-xl border border-border bg-muted sm:h-32 sm:w-44", className)}>
      {preview.isPending ? (
        <span className="flex h-full items-center justify-center overflow-hidden px-2">
          <FecLoader density="chip" label={t("hr.docs.previewLoading")} className="[&_.ll-text]:sr-only" />
        </span>
      ) : null}
      {preview.isError ? (
        <span className="flex h-full items-center px-3 text-center text-[11px] text-muted-foreground">
          {t("hr.docs.previewUnavailable")}
        </span>
      ) : null}
      {showImage ? (
        <img
          src={url}
          alt={fileName}
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : null}
      {showPdf ? (
        <iframe
          title={fileName}
          src={pdfFrameSrc(url, false)}
          className="pointer-events-none h-[165%] w-[165%] origin-top-left scale-[0.6] border-0 rtl:origin-top-right"
          referrerPolicy="no-referrer"
        />
      ) : null}
      {!preview.isPending && !preview.isError && !showImage && !showPdf ? (
        <FilePreviewFace kind={broken ? "file" : kind} fileName={fileName} compact />
      ) : null}
      {showPdf ? (
        <span className="pointer-events-none absolute bottom-2 start-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-semibold">
          {t("hr.docs.previewPdf")}
        </span>
      ) : null}
    </span>
  );
}

export function StaffDocumentLightbox({
  doc,
  open,
  onOpenChange,
  actions,
}: {
  doc: StaffDocumentPreviewDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const preview = useStaffDocumentPreviewUrl(open && doc ? doc.id : null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [doc?.id, preview.data?.url]);
  const kind = doc ? documentPreviewKind(doc.fileMime, doc.fileName) : "file";
  const fileName = doc?.fileName ?? t("hr.docs.previewFile");
  const title = doc
    ? `${doc.staffName ?? "—"} · ${t(`hr.docs.types.${doc.docType}`)}`
    : t("hr.docs.previewTitle");
  const url = preview.data?.url;
  const showImage = kind === "image" && url && !broken;
  const showPdf = kind === "pdf" && url;

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
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("hr.docs.previewUnavailable")}</p>
          ) : null}
          {showImage ? (
            <img
              src={url}
              alt={fileName}
              className="max-h-[70vh] w-full object-contain"
              referrerPolicy="no-referrer"
              onError={() => setBroken(true)}
            />
          ) : null}
          {showPdf ? (
            <iframe
              title={fileName}
              src={pdfFrameSrc(url, true)}
              className="h-[min(70vh,40rem)] w-full border-0 bg-card"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {!preview.isPending && !preview.isError && !showImage && !showPdf ? (
            <FilePreviewFace kind={broken ? "file" : kind} fileName={fileName} />
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </DialogContent>
    </Dialog>
  );
}

export function StaffDocumentOpenButton({
  label,
  onOpen,
  children,
}: {
  label: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="flex w-full min-w-0 flex-1 flex-col gap-3 text-start sm:flex-row sm:items-center" onClick={onOpen} aria-label={label}>
      {children}
    </button>
  );
}
