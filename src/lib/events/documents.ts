import type { DocumentStatus, DocumentType } from "@/lib/events/constants";
import type { EventDocumentRow, EventWorkstreamStatus } from "@/lib/events/types";
import { STANDARD_WORKSTREAMS, type WorkstreamCode } from "@/lib/events/workstreams";

export const EVENT_DOC_BUCKET = "event-documents";

export const EVENT_DOCUMENT_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
] as const;

export const EVENT_DOCUMENT_ACCEPT =
  ".pdf,.xlsx,.xls,.docx,.doc,.pptx,.csv,.png,.jpg,.jpeg,.webp,.gif";

export const EVENT_BOQ_ACCEPT = ".csv,.xlsx,.xls,.pdf";

export const DOCUMENT_KIND_ORDER: DocumentType[] = [
  "boq",
  "permit",
  "drawing",
  "floor_plan",
  "contract",
  "insurance",
  "photo",
  "manual",
  "other",
];

export const REQUIRED_EVENT_DOC_SEEDS: Array<{ doc_type: DocumentType; title: string }> = [
  { doc_type: "permit", title: "Venue permit" },
];

export const LEGACY_EVENT_BOQ_SEED: { doc_type: DocumentType; title: string } = {
  doc_type: "boq",
  title: "Bill of quantities",
};

export type EventBoqGroup = {
  code: WorkstreamCode | string;
  title_en: string;
  title_ar: string;
  wbs_id: string | null;
  rows: EventDocumentRow[];
  primary: EventDocumentRow | null;
  status: DocumentStatus;
  line_count: number;
  line_total: number;
};

export function documentWorkstreamCode(doc: Pick<EventDocumentRow, "workstream_code">): string | null {
  return doc.workstream_code ?? null;
}

export function boqLineTotals(docs: EventDocumentRow[] | undefined | null): { count: number; total: number } {
  return (docs ?? [])
    .filter((doc) => doc.doc_type === "boq")
    .reduce(
      (acc, doc) => ({ count: acc.count + (doc.line_count ?? 0), total: acc.total + (doc.line_total ?? 0) }),
      { count: 0, total: 0 },
    );
}

function groupStatus(rows: EventDocumentRow[]): DocumentStatus {
  if (rows.some((doc) => resolveDocumentStatus(doc) === "uploaded")) return "uploaded";
  if (rows.some((doc) => doc.status === "waived")) return "waived";
  return "missing";
}

export function eventBoqGroups(
  documents: EventDocumentRow[] | undefined | null,
  workstreams: EventWorkstreamStatus[] | undefined | null,
): { groups: EventBoqGroup[]; unassigned: EventDocumentRow[] } {
  const docs = (documents ?? []).filter((doc) => doc.doc_type === "boq");
  const byCode = new Map<string, EventDocumentRow[]>();
  const unassigned: EventDocumentRow[] = [];
  for (const doc of docs) {
    const code = documentWorkstreamCode(doc);
    if (!code) {
      unassigned.push(doc);
      continue;
    }
    const list = byCode.get(code) ?? [];
    list.push(doc);
    byCode.set(code, list);
  }

  const active = (workstreams ?? []).filter((ws) => ws.wbs_id);
  const seen = new Set<string>();
  const groups: EventBoqGroup[] = [];

  const pushGroup = (
    code: string,
    title_en: string,
    title_ar: string,
    wbs_id: string | null,
  ) => {
    if (seen.has(code)) return;
    seen.add(code);
    const rows = (byCode.get(code) ?? []).slice().sort((a, b) => Number(a.is_addendum) - Number(b.is_addendum));
    groups.push({
      code,
      title_en,
      title_ar,
      wbs_id,
      rows,
      primary: rows.find((row) => !row.is_addendum) ?? rows[0] ?? null,
      status: groupStatus(rows),
      line_count: rows.reduce((sum, row) => sum + (row.line_count ?? 0), 0),
      line_total: rows.reduce((sum, row) => sum + (row.line_total ?? 0), 0),
    });
  };

  for (const ws of active) {
    pushGroup(ws.code, ws.title_en, ws.title_ar, ws.wbs_id);
  }
  for (const ws of STANDARD_WORKSTREAMS) {
    if (!byCode.has(ws.code) || seen.has(ws.code)) continue;
    pushGroup(ws.code, ws.title_en, ws.title_ar, null);
  }
  for (const [code, rows] of byCode) {
    if (seen.has(code)) continue;
    const meta = STANDARD_WORKSTREAMS.find((ws) => ws.code === code);
    pushGroup(code, meta?.title_en ?? rows[0]?.workstream_title ?? code, meta?.title_ar ?? code, null);
  }

  return { groups, unassigned };
}

export function missingDepartmentBoqs(
  documents: EventDocumentRow[] | undefined | null,
  workstreams?: EventWorkstreamStatus[] | undefined | null,
): EventBoqGroup[] {
  const { groups } = eventBoqGroups(documents, workstreams);
  return groups.filter((group) => group.status === "missing");
}

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mimeFromFileName(fileName: string, fallback?: string | null): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? fallback ?? "application/pdf";
}

export function sanitizeEventFileName(name: string): string {
  const trimmed = name.trim().replace(/[/\\]+/g, "-");
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return (safe || "document").slice(0, 180);
}

export function hasDocumentFile(doc: Pick<EventDocumentRow, "file_path" | "url">): boolean {
  return Boolean(doc.file_path || doc.url);
}

export function resolveDocumentStatus(
  doc: Pick<EventDocumentRow, "status" | "file_path" | "url">,
): DocumentStatus {
  if (doc.status === "waived") return "waived";
  if (hasDocumentFile(doc)) return "uploaded";
  return "missing";
}

export function isMissingRequiredDoc(doc: EventDocumentRow): boolean {
  return Boolean(doc.required) && resolveDocumentStatus(doc) === "missing";
}

export function missingRequiredDocs(docs: EventDocumentRow[] | undefined | null): EventDocumentRow[] {
  return (docs ?? []).filter(isMissingRequiredDoc);
}

export function missingRequiredByType(
  docs: EventDocumentRow[] | undefined | null,
  docType: DocumentType,
): EventDocumentRow[] {
  return missingRequiredDocs(docs).filter((doc) => doc.doc_type === docType);
}
