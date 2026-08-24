"use client";

import { useTranslation } from "react-i18next";

import { MediaThumbnail, useMediaPreview } from "@/components/maintenance/media-preview-lightbox";

const KIND_KEYS: Record<string, string> = {
  submission: "maintenanceMedia.submission",
  before: "maintenanceMedia.before",
  after: "maintenanceMedia.after",
  completion: "maintenanceMedia.completion",
};

type MaintenanceAttachment = {
  id: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  kind: string;
  created_at: string;
  url: string | null;
};

export function MaintenanceAttachmentsGallery({ attachments }: { attachments: MaintenanceAttachment[] }) {
  const { t } = useTranslation();
  const { openPreview, previewDialog } = useMediaPreview();

  if (!attachments.length) {
    return <p className="text-xs text-muted-foreground">{t("maintenanceMedia.noMedia")}</p>;
  }

  const grouped = attachments.reduce<Record<string, MaintenanceAttachment[]>>((acc, att) => {
    const key = att.kind || "other";
    acc[key] = [...(acc[key] ?? []), att];
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {previewDialog}
      {Object.entries(grouped).map(([kind, kindAttachments]) => (
        <div key={kind}>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {KIND_KEYS[kind] ? t(KIND_KEYS[kind]) : kind}
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {kindAttachments.map((att) => (
              <MediaThumbnail
                key={att.id}
                src={att.url ?? ""}
                alt={att.file_name ?? t("maintenanceMedia.attachment")}
                mimeType={att.mime_type}
                unavailable={!att.url}
                onPreview={() =>
                  openPreview({
                    src: att.url ?? "",
                    alt: att.file_name ?? t("maintenanceMedia.attachment"),
                    mimeType: att.mime_type,
                  })
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
