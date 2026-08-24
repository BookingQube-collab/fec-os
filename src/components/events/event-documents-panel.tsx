"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOCUMENT_TYPES } from "@/lib/events/constants";
import { EventBoqSection } from "@/components/events/event-boq-section";
import {
  DOCUMENT_KIND_ORDER,
  EVENT_DOCUMENT_ACCEPT,
  isMissingRequiredDoc,
  missingDepartmentBoqs,
  missingRequiredByType,
  missingRequiredDocs,
  resolveDocumentStatus,
} from "@/lib/events/documents";
import type { EventDocumentRow, EventOverview } from "@/lib/events/types";
import {
  deleteEventDocument,
  getEventDocumentUrl,
  uploadEventDocumentFile,
  upsertEventDocument,
} from "@/lib/events.functions";
import { fileToBase64 } from "@/components/maintenance/photo-capture-upload";
import { cn } from "@/lib/utils";

const NONE = "__none__";

function statusVariant(status: EventDocumentRow["status"]) {
  if (status === "missing") return "warning" as const;
  if (status === "uploaded") return "success" as const;
  return "outline" as const;
}

export function EventDocumentsPanel({
  eventId,
  documents,
  team,
  workstreams,
  canEdit,
  onChanged,
  variant = "full",
}: {
  eventId: string;
  documents: EventDocumentRow[];
  team?: EventOverview["team"];
  workstreams?: EventOverview["workstreams"];
  canEdit: boolean;
  onChanged: () => void;
  variant?: "full" | "compact";
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const missing = missingRequiredDocs(documents);
  const missingBoqDepts = missingDepartmentBoqs(documents, workstreams);
  const missingBoq = missingBoqDepts.length || missingRequiredByType(documents, "boq").length;
  const missingPermits = missingRequiredByType(documents, "permit").length;

  if (variant === "compact") {
    const compactMissing = [
      ...missingBoqDepts.map((group) => ({
        id: `boq-${group.code}`,
        title: t("events.home.priority.missingBoqDept", { dept: ar ? group.title_ar : group.title_en }),
      })),
      ...missing.filter((doc) => doc.doc_type !== "boq").map((doc) => ({ id: doc.id, title: doc.title })),
    ];
    return (
      <section className="min-w-0 rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("events.docs.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.docs.hint")}</p>
          </div>
          {compactMissing.length ? (
            <Badge variant="warning">{t("events.docs.missingCount", { n: compactMissing.length })}</Badge>
          ) : (
            <Badge variant="success">{t("events.docStatus.uploaded")}</Badge>
          )}
        </div>
        {compactMissing.length ? (
          <ul className="space-y-2 text-sm">
            {compactMissing.slice(0, 6).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{row.title}</span>
                <Badge variant="warning">{t("events.docStatus.missing")}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("events.docs.allIn")}</p>
        )}
        <Button size="sm" variant="outline" className="mt-3" asChild>
          <a href={`/events/${eventId}/scope#documents`}>{t("events.docs.openScope")}</a>
        </Button>
      </section>
    );
  }

  return (
    <section id="documents" className="min-w-0 space-y-4 rounded-2xl border border-border/40 bg-card p-4 scroll-mt-24">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t("events.docs.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.docs.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {missingBoq > 0 ? (
            <Badge variant="destructive">{t("events.scope.chip.boqMissing", { n: missingBoq })}</Badge>
          ) : null}
          {missingPermits > 0 ? (
            <Badge variant="warning">{t("events.scope.chip.permitsMissing", { n: missingPermits })}</Badge>
          ) : null}
          {!missing.length ? <Badge variant="success">{t("events.docs.allIn")}</Badge> : null}
        </div>
      </div>

      <EventBoqSection
        eventId={eventId}
        documents={documents}
        workstreams={workstreams ?? []}
        canEdit={canEdit}
        onChanged={onChanged}
      />

      {DOCUMENT_KIND_ORDER.filter((kind) => kind !== "boq").map((kind) => {
        const rows = documents
          .filter((doc) => doc.doc_type === kind)
          .sort((a, b) => Number(isMissingRequiredDoc(b)) - Number(isMissingRequiredDoc(a)));
        if (!rows.length) return null;
        return (
          <div key={kind} className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`events.docType.${kind}`)}
            </p>
            <ul className="min-w-0 space-y-2">
              {rows.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  eventId={eventId}
                  doc={doc}
                  team={team ?? []}
                  canEdit={canEdit}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {canEdit ? (
        <AddDocumentForm
          eventId={eventId}
          team={team ?? []}
          workstreams={workstreams ?? []}
          onChanged={onChanged}
        />
      ) : null}
    </section>
  );
}

function DocumentRow({
  eventId,
  doc,
  team,
  canEdit,
  onChanged,
}: {
  eventId: string;
  doc: EventDocumentRow;
  team: EventOverview["team"];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const status = resolveDocumentStatus(doc);
  const missing = isMissingRequiredDoc(doc);

  const assign = async (patch: { owner_staff_id?: string | null; wbs_id?: string | null; status?: EventDocumentRow["status"] }) => {
    setBusy(true);
    try {
      await upsertEventDocument({
        id: doc.id,
        eventId,
        title: doc.title,
        doc_type: doc.doc_type,
        notes: doc.notes,
        required: doc.required,
        owner_staff_id: patch.owner_staff_id !== undefined ? patch.owner_staff_id : doc.owner_staff_id,
        wbs_id: patch.wbs_id !== undefined ? patch.wbs_id : doc.wbs_id,
        status: patch.status,
      });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await uploadEventDocumentFile({
        id: doc.id,
        filename: file.name,
        data_base64: await fileToBase64(file),
        content_type: file.type || null,
      });
      toast.success(t("events.toasts.docUploaded"));
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const open = async () => {
    try {
      const result = await getEventDocumentUrl({ id: doc.id });
      if (!result.url) throw new Error(t("events.docs.noFile"));
      window.open(result.url, "_blank", "noopener,noreferrer");
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
            <p className="truncate text-sm font-medium">{doc.title}</p>
            <Badge variant={statusVariant(status)}>{t(`events.docStatus.${status}`)}</Badge>
            {doc.required ? <Badge variant="outline">{t("events.docs.required")}</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {doc.file_name ?? t("events.docs.noFile")}
            {doc.owner_name ? ` · ${doc.owner_name}` : ""}
            {doc.workstream_title ? ` · ${doc.workstream_title}` : ""}
            {doc.uploaded_by_name ? ` · ${t("events.docs.uploadedBy", { name: doc.uploaded_by_name })}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {canEdit && team.length ? (
            <Select
              value={doc.owner_staff_id ?? NONE}
              disabled={busy}
              onValueChange={(value) => void assign({ owner_staff_id: value === NONE ? null : value })}
            >
              <SelectTrigger className="h-8 w-[9.5rem] text-xs">
                <SelectValue placeholder={t("events.docs.assignTeam")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("events.docs.unassigned")}</SelectItem>
                {team.map((member) => (
                  <SelectItem key={member.staff_id} value={member.staff_id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {canEdit ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={EVENT_DOCUMENT_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                {doc.file_path ? t("events.docs.replace") : t("events.docs.upload")}
              </Button>
            </>
          ) : null}
          {doc.file_path || doc.url ? (
            <Button size="sm" variant="ghost" onClick={() => void open()}>
              {t("events.docs.open")}
            </Button>
          ) : null}
          {canEdit && missing ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void assign({ status: "waived" })}>
              {t("events.docs.waive")}
            </Button>
          ) : null}
          {canEdit && !doc.required ? (
            <Button
              size="sm"
              variant="ghost"
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
        </div>
      </div>
    </li>
  );
}

function AddDocumentForm({
  eventId,
  team,
  workstreams,
  onChanged,
}: {
  eventId: string;
  team: EventOverview["team"];
  workstreams: EventOverview["workstreams"];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<(typeof DOCUMENT_TYPES)[number]>("permit");
  const [owner, setOwner] = useState(NONE);
  const [wbs, setWbs] = useState(NONE);
  const [required, setRequired] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const workstreamOptions = useMemo(
    () => workstreams.filter((row) => row.wbs_id),
    [workstreams],
  );

  const save = async (asRequired: boolean) => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const selectedWs = workstreams.find((row) => row.wbs_id === wbs);
      const created = await upsertEventDocument({
        eventId,
        title: title.trim(),
        doc_type: docType,
        required: asRequired || required,
        owner_staff_id: owner === NONE ? null : owner,
        wbs_id: wbs === NONE ? null : wbs,
        workstream_code: docType === "boq" ? (selectedWs?.code ?? null) : undefined,
        is_addendum: docType === "boq" ? Boolean(selectedWs) : undefined,
      });
      if (file) {
        await uploadEventDocumentFile({
          id: created.id,
          filename: file.name,
          data_base64: await fileToBase64(file),
          content_type: file.type || null,
        });
      }
      setTitle("");
      setFile(null);
      setRequired(false);
      if (fileRef.current) fileRef.current.value = "";
      onChanged();
      toast.success(t("events.toasts.docSaved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("events.docs.add")}</p>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Input
          className="min-w-[12rem] flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("events.docs.titlePlaceholder")}
        />
        <Select value={docType} onValueChange={(value) => setDocType(value as typeof docType)}>
          <SelectTrigger className="w-[9.5rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES.map((kind) => (
              <SelectItem key={kind} value={kind}>{t(`events.docType.${kind}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-[10rem]"><SelectValue placeholder={t("events.docs.assignTeam")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("events.docs.unassigned")}</SelectItem>
            {team.map((member) => (
              <SelectItem key={member.staff_id} value={member.staff_id}>
                {member.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {workstreamOptions.length ? (
          <Select value={wbs} onValueChange={setWbs}>
            <SelectTrigger className="w-[11rem]"><SelectValue placeholder={t("events.docs.workstream")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("events.docs.unassigned")}</SelectItem>
              {workstreamOptions.map((row) => (
                <SelectItem key={row.wbs_id!} value={row.wbs_id!}>
                  {row.title_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          {t("events.docs.required")}
        </label>
        <input
          ref={fileRef}
          type="file"
          accept={EVENT_DOCUMENT_ACCEPT}
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button size="sm" variant="outline" type="button" onClick={() => fileRef.current?.click()}>
          {file ? file.name : t("events.docs.chooseFile")}
        </Button>
        <Button size="sm" disabled={busy || title.trim().length < 2} onClick={() => void save(false)}>
          {t("events.docs.add")}
        </Button>
        <Button size="sm" variant="outline" disabled={busy || title.trim().length < 2} onClick={() => void save(true)}>
          {t("events.docs.addRequired")}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("events.docs.fileHint")}</p>
    </div>
  );
}
