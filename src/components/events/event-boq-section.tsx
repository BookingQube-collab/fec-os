"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fileToBase64 } from "@/components/maintenance/photo-capture-upload";
import { parseCsv } from "@/lib/csv-parse";
import {
  buildEventBoqTemplateCsv,
  isBoqPdfName,
  isBoqSpreadsheetName,
  parseEventBoqImportRows,
} from "@/lib/events/boq-import";
import { EVENT_BOQ_ACCEPT, eventBoqGroups, resolveDocumentStatus } from "@/lib/events/documents";
import type { EventBoqLineRow, EventDocumentRow, EventOverview } from "@/lib/events/types";
import {
  deleteEventDocument,
  getEventDocumentUrl,
  listEventBoqLines,
  uploadDepartmentBoq,
  upsertEventDocument,
} from "@/lib/events.functions";
import { fmtQar } from "@/lib/currency";
import { cn } from "@/lib/utils";

async function readBoqSpreadsheet(file: File): Promise<Record<string, string>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || file.type === "text/csv") return parseCsv(await file.text());
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("empty");
    return parseCsv(XLSX.utils.sheet_to_csv(sheet));
  }
  throw new Error("unsupported");
}

function downloadBoqTemplate() {
  const blob = new Blob([buildEventBoqTemplateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "event-boq-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function EventBoqSection({
  eventId,
  documents,
  workstreams,
  canEdit,
  onChanged,
}: {
  eventId: string;
  documents: EventDocumentRow[];
  workstreams: EventOverview["workstreams"];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const { groups, unassigned } = useMemo(
    () => eventBoqGroups(documents, workstreams),
    [documents, workstreams],
  );
  const missing = groups.filter((group) => group.status === "missing").length;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("events.docType.boq")}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {missing > 0 ? (
            <Badge variant="destructive">{t("events.docs.boqMissingDepts", { n: missing })}</Badge>
          ) : groups.length ? (
            <Badge variant="success">{t("events.docs.boqAllIn")}</Badge>
          ) : null}
          <Button size="sm" variant="ghost" type="button" onClick={downloadBoqTemplate}>
            {t("events.docs.template")}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("events.docs.boqHint")}</p>
      <ul className="min-w-0 space-y-2">
        {groups.map((group) => (
          <DepartmentBoqRow
            key={group.code}
            eventId={eventId}
            title={ar ? group.title_ar : group.title_en}
            workstreamCode={group.code}
            status={group.status}
            lineCount={group.line_count}
            lineTotal={group.line_total}
            rows={group.rows}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        ))}
        {unassigned.map((doc) => (
          <DepartmentBoqRow
            key={doc.id}
            eventId={eventId}
            title={doc.title}
            workstreamCode={doc.workstream_code ?? "unassigned"}
            status={resolveDocumentStatus(doc)}
            lineCount={doc.line_count}
            lineTotal={doc.line_total}
            rows={[doc]}
            canEdit={canEdit}
            onChanged={onChanged}
            unassigned
          />
        ))}
      </ul>
    </div>
  );
}

function DepartmentBoqRow({
  eventId,
  title,
  workstreamCode,
  status,
  lineCount,
  lineTotal,
  rows,
  canEdit,
  onChanged,
  unassigned,
}: {
  eventId: string;
  title: string;
  workstreamCode: string;
  status: EventDocumentRow["status"];
  lineCount: number;
  lineTotal: number;
  rows: EventDocumentRow[];
  canEdit: boolean;
  onChanged: () => void;
  unassigned?: boolean;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const addendumRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [lines, setLines] = useState<EventBoqLineRow[]>([]);
  const missing = status === "missing";
  const primary = rows.find((row) => !row.is_addendum) ?? rows[0] ?? null;

  const runUpload = async (file: File, opts: { documentId?: string; isAddendum?: boolean }) => {
    setBusy(true);
    try {
      let parsed: ReturnType<typeof parseEventBoqImportRows>["rows"] | undefined;
      if (isBoqSpreadsheetName(file.name)) {
        const preview = parseEventBoqImportRows(await readBoqSpreadsheet(file));
        if (preview.errors.length && !preview.rows.length) {
          throw new Error(t("events.docs.parseError", { n: preview.errors.length }));
        }
        parsed = preview.rows;
        if (preview.errors.length) {
          toast.error(t("events.docs.parsePartial", { n: preview.errors.length }));
        }
      } else if (!isBoqPdfName(file.name)) {
        throw new Error(t("events.docs.unsupportedBoq"));
      }

      await uploadDepartmentBoq({
        eventId,
        workstream_code: workstreamCode,
        document_id: opts.documentId,
        is_addendum: opts.isAddendum,
        filename: file.name,
        data_base64: await fileToBase64(file),
        content_type: file.type || null,
        lines: parsed,
      });
      toast.success(
        parsed?.length
          ? t("events.toasts.boqUploaded", { n: parsed.length })
          : t("events.toasts.boqPdfOnly"),
      );
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (addendumRef.current) addendumRef.current.value = "";
      setReplaceId(null);
    }
  };

  const openFile = async (doc: EventDocumentRow) => {
    try {
      const result = await getEventDocumentUrl({ id: doc.id });
      if (!result.url) throw new Error(t("events.docs.noFile"));
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleLines = async (doc: EventDocumentRow) => {
    if (openDoc === doc.id) {
      setOpenDoc(null);
      return;
    }
    try {
      const result = await listEventBoqLines({ eventId, documentId: doc.id });
      setLines(result.lines);
      setOpenDoc(doc.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <li
      className={cn(
        "min-w-0 rounded-xl border px-3 py-2.5",
        missing ? "border-rag-amber/50 bg-rag-amber/5" : "border-border/40",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-medium">{title}</p>
            <Badge variant={status === "missing" ? "warning" : status === "uploaded" ? "success" : "outline"}>
              {t(`events.docStatus.${status}`)}
            </Badge>
            {unassigned ? <Badge variant="outline">{t("events.docs.unassigned")}</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {lineCount
              ? t("events.docs.lineSummary", { n: lineCount, amount: fmtQar(lineTotal) })
              : primary?.file_name ?? t("events.docs.noFile")}
            {primary?.file_name && lineCount ? ` · ${primary.file_name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {canEdit ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={EVENT_BOQ_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void runUpload(file, { documentId: replaceId ?? primary?.id, isAddendum: false });
                }}
              />
              <input
                ref={addendumRef}
                type="file"
                accept={EVENT_BOQ_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void runUpload(file, { isAddendum: true });
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy || workstreamCode === "unassigned"}
                onClick={() => {
                  setReplaceId(primary?.id ?? null);
                  fileRef.current?.click();
                }}
              >
                {primary?.file_path ? t("events.docs.replace") : t("events.docs.upload")}
              </Button>
              {status === "uploaded" || rows.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || workstreamCode === "unassigned"}
                  onClick={() => {
                    addendumRef.current?.click();
                  }}
                >
                  {t("events.docs.addendum")}
                </Button>
              ) : null}
            </>
          ) : null}
          {canEdit && missing && primary ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                try {
                  await upsertEventDocument({
                    id: primary.id,
                    eventId,
                    title: primary.title,
                    doc_type: "boq",
                    notes: primary.notes,
                    required: primary.required,
                    status: "waived",
                    workstream_code: primary.workstream_code,
                  });
                  onChanged();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {t("events.docs.waive")}
            </Button>
          ) : null}
        </div>
      </div>
      {rows.length ? (
        <ul className="mt-2 space-y-1.5">
          {rows.map((doc) => (
            <li key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">
                {doc.is_addendum ? `${t("events.docs.addendum")}: ` : ""}
                {doc.file_name ?? doc.title}
                {doc.line_count ? ` · ${t("events.docs.lineCount", { n: doc.line_count })}` : ""}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {doc.line_count ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void toggleLines(doc)}>
                    {openDoc === doc.id ? t("events.docs.hideLines") : t("events.docs.viewLines")}
                  </Button>
                ) : null}
                {doc.file_path || doc.url ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void openFile(doc)}>
                    {t("events.docs.open")}
                  </Button>
                ) : null}
                {canEdit && (doc.is_addendum || unassigned) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await deleteEventDocument({ id: doc.id });
                        onChanged();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {openDoc && lines.length ? (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-2 py-1">{t("events.docs.colDesc")}</th>
                <th className="px-2 py-1">{t("events.docs.colQty")}</th>
                <th className="px-2 py-1">{t("events.docs.colUnit")}</th>
                <th className="px-2 py-1">{t("events.docs.colRate")}</th>
                <th className="px-2 py-1">{t("events.docs.colAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.slice(0, 12).map((line) => (
                <tr key={line.id}>
                  <td className="px-2 py-1">{line.description}</td>
                  <td className="px-2 py-1 tabular-nums">{line.qty}</td>
                  <td className="px-2 py-1">{line.unit ?? "—"}</td>
                  <td className="px-2 py-1 tabular-nums">{line.rate ?? "—"}</td>
                  <td className="px-2 py-1 tabular-nums">{fmtQar(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length > 12 ? (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">
              {t("events.docs.moreLines", { n: lines.length - 12 })}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
