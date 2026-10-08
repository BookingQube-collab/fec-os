"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getChatAttachmentUrl } from "@/lib/chat.functions";
import { formatChatFileSize } from "@/lib/chat/attachment-rules";

export type AttachmentCardModel = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  scanStatus: string;
  url: string | null;
  refreshable: boolean;
};

function isImage(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp" || mimeType === "image/gif";
}

function isVideo(mimeType: string): boolean {
  return mimeType === "video/mp4" || mimeType === "video/webm" || mimeType === "video/quicktime";
}

export function AttachmentCard({ attachment, mine }: { attachment: AttachmentCardModel; mine: boolean }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(attachment.url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(attachment.url);
    setFailed(false);
  }, [attachment.id, attachment.url]);

  async function refresh() {
    if (!attachment.refreshable) {
      setFailed(true);
      return;
    }
    const result = await getChatAttachmentUrl({ attachmentId: attachment.id });
    if (!result.ok || !result.data.url) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setUrl(result.data.url);
  }

  const pending = attachment.scanStatus === "PENDING";
  const linkClass = "text-foreground underline";

  return (
    <div className="mt-2 space-y-1">
      {!url || failed ? (
        <p className="text-xs">
          <span className="font-medium">{attachment.filename}</span>
          <span className="ms-1 opacity-80">{formatChatFileSize(attachment.byteSize)}</span>
          <span className="mt-1 block">{t("chat.attachmentUnavailable")}</span>
        </p>
      ) : isImage(attachment.mimeType) ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={url}
            alt={attachment.filename}
            className="max-h-64 max-w-full rounded-lg object-contain"
            onError={() => {
              void refresh();
            }}
          />
        </a>
      ) : isVideo(attachment.mimeType) ? (
        <video
          src={url}
          controls
          preload="metadata"
          className="max-h-64 max-w-full rounded-lg"
          onError={() => {
            void refresh();
          }}
        />
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" download={attachment.filename} className={linkClass}>
          {t("chat.downloadFile", { name: attachment.filename })}
          <span className="ms-1">{formatChatFileSize(attachment.byteSize)}</span>
        </a>
      )}
      {pending && mine ? <p className="text-[11px] opacity-80">{t("chat.attachmentOnlyYou")}</p> : null}
    </div>
  );
}
