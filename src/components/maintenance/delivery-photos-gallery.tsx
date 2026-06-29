"use client";

import { MediaThumbnail, useMediaPreview } from "@/components/maintenance/media-preview-lightbox";

const STAGE_LABELS: Record<string, string> = {
  request: "Request",
  dispatch: "Dispatch",
  verification: "Verification",
};

type DeliveryPhoto = {
  id: string;
  file_path: string;
  created_at: string;
  stage: string;
  url: string | null;
};

export function DeliveryPhotosGallery({ photos }: { photos: DeliveryPhoto[] }) {
  const { openPreview, previewDialog } = useMediaPreview();

  if (!photos.length) {
    return <p className="text-xs text-muted-foreground">No photos uploaded yet.</p>;
  }

  const grouped = photos.reduce<Record<string, DeliveryPhoto[]>>((acc, photo) => {
    const key = photo.stage || "other";
    acc[key] = [...(acc[key] ?? []), photo];
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {previewDialog}
      {Object.entries(grouped).map(([stage, stagePhotos]) => (
        <div key={stage}>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {STAGE_LABELS[stage] ?? stage}
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {stagePhotos.map((p) => (
              <MediaThumbnail
                key={p.id}
                src={p.url ?? ""}
                alt="Delivery photo"
                mimeType="image/jpeg"
                unavailable={!p.url}
                onPreview={() =>
                  openPreview({
                    src: p.url ?? "",
                    alt: "Delivery photo",
                    mimeType: "image/jpeg",
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
