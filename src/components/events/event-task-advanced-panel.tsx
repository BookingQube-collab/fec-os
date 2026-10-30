"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fileToBase64 } from "@/components/maintenance/photo-capture-upload";
import { EVENT_DOCUMENT_ACCEPT } from "@/lib/events/documents";
import type {
  EventTaskAttachmentRow,
  EventTaskHistoryRow,
} from "@/lib/events/types";
import {
  deleteEventTaskAttachment,
  getEventTaskAttachmentUrl,
  getEventTaskDetail,
  setEventTaskWatching,
  uploadEventTaskAttachment,
} from "@/lib/events.functions";

export function EventTaskAdvancedPanel({
  eventId,
  taskId,
  canEdit,
}: {
  eventId: string;
  taskId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [watching, setWatching] = useState(false);
  const [history, setHistory] = useState<EventTaskHistoryRow[]>([]);
  const [attachments, setAttachments] = useState<EventTaskAttachmentRow[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const detail = await getEventTaskDetail({ taskId });
      setHistory(detail.history);
      setAttachments(detail.attachments);
      setWatching(detail.watching);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when task opens
  }, [taskId]);

  const onUpload = async (file: File | null) => {
    if (!file || !canEdit) return;
    setBusy(true);
    try {
      const data_base64 = await fileToBase64(file);
      await uploadEventTaskAttachment({
        taskId,
        filename: file.name,
        data_base64,
        content_type: file.type || null,
      });
      toast.success(t("events.plan.attachmentUploaded"));
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onOpenAttachment = async (id: string) => {
    try {
      const { url } = await getEventTaskAttachmentUrl({ id });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDeleteAttachment = async (id: string) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      await deleteEventTaskAttachment({ id });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onToggleWatch = async () => {
    if (!canEdit) return;
    setBusy(true);
    try {
      const res = await setEventTaskWatching({ eventId, taskId, watching: !watching });
      setWatching(res.watching);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-border/40 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{t("events.plan.advanced")}</Label>
        {canEdit ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onToggleWatch()}>
            {watching ? t("events.plan.unwatch") : t("events.plan.watch")}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>{t("events.plan.attachments")}</Label>
        {loading ? (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        ) : attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("events.plan.noAttachments")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {attachments.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="truncate text-start underline-offset-2 hover:underline"
                  onClick={() => void onOpenAttachment(row.id)}
                >
                  {row.title}
                </button>
                {canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onDeleteAttachment(row.id)}
                  >
                    {t("common.delete")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept={EVENT_DOCUMENT_ACCEPT}
              className="hidden"
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {t("events.plan.uploadAttachment")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>{t("events.plan.history")}</Label>
        {loading ? (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("events.plan.noHistory")}</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {history.map((row) => (
              <li key={row.id} className="rounded-md bg-secondary/40 px-2 py-1">
                <span className="text-muted-foreground">{row.created_at.slice(0, 16).replace("T", " ")} · </span>
                <span className="font-medium">{row.change_type}</span>
                {row.field_name ? ` · ${row.field_name}` : ""}
                {row.old_value || row.new_value
                  ? `: ${row.old_value ?? "—"} → ${row.new_value ?? "—"}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
