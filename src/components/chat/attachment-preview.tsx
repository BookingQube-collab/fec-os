"use client";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { formatChatFileSize } from "@/lib/chat/attachment-rules";

export function AttachmentPreview({
  items,
  onRemove,
}: {
  items: Array<{
    clientAttachmentId: string;
    filename: string;
    byteSize: number;
    previewUrl: string | null;
  }>;
  onRemove: (clientAttachmentId: string) => void;
}) {
  const { t } = useTranslation();

  if (items.length === 0) return null;

  return (
    <ul className="mb-2 flex max-h-28 gap-2 overflow-x-auto" aria-label={t("chat.pendingAttachments")}>
      {items.map((item) => (
        <li key={item.clientAttachmentId} className="flex w-36 shrink-0 flex-col gap-1 rounded-lg border border-border p-2">
          {item.previewUrl ? (
            <img src={item.previewUrl} alt="" className="h-14 w-full rounded object-cover" />
          ) : null}
          <p className="truncate text-xs font-medium">{item.filename}</p>
          <p className="text-[11px] text-muted-foreground">{formatChatFileSize(item.byteSize)}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 px-2"
            aria-label={t("chat.removeAttachment", { name: item.filename })}
            onClick={() => onRemove(item.clientAttachmentId)}
          >
            {t("chat.removeFile")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
