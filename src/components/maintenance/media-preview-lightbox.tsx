"use client";

import { useCallback, useState } from "react";
import { Film, Play, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type MediaPreviewItem = {
  src: string;
  alt?: string;
  mimeType?: string | null;
};

export function isVideoMime(mimeType?: string | null) {
  return mimeType?.startsWith("video/") ?? false;
}

export function base64ToDataUrl(mimeType: string, contentBase64: string) {
  return `data:${mimeType};base64,${contentBase64}`;
}

export function useMediaPreview() {
  const [item, setItem] = useState<MediaPreviewItem | null>(null);
  const [open, setOpen] = useState(false);

  const openPreview = useCallback((next: MediaPreviewItem) => {
    setItem(next);
    setOpen(true);
  }, []);

  const previewDialog = (
    <MediaPreviewLightbox open={open} onOpenChange={setOpen} item={item} />
  );

  return { openPreview, previewDialog };
}

export function MediaPreviewLightbox({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MediaPreviewItem | null;
}) {
  if (!item) return null;

  const video = isVideoMime(item.mimeType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[min(92vw,56rem)] gap-0 overflow-hidden border-0 p-0 sm:rounded-lg">
        <DialogTitle className="sr-only">{item.alt ?? "Media preview"}</DialogTitle>
        <div className="flex max-h-[85vh] items-center justify-center bg-black">
          {video ? (
            <video
              key={item.src}
              src={item.src}
              controls
              autoPlay
              playsInline
              className="max-h-[85vh] w-full object-contain"
            />
          ) : (
            <img
              src={item.src}
              alt={item.alt ?? "Preview"}
              className="max-h-[85vh] w-full object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type MediaThumbnailProps = {
  src: string;
  alt?: string;
  mimeType?: string | null;
  onPreview?: () => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
  className?: string;
  unavailable?: boolean;
};

export function MediaThumbnail({
  src,
  alt,
  mimeType,
  onPreview,
  onRemove,
  removeDisabled,
  className,
  unavailable,
}: MediaThumbnailProps) {
  const video = isVideoMime(mimeType);

  if (unavailable || !src) {
    return (
      <div
        className={cn(
          "flex aspect-square items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground",
          className,
        )}
      >
        Unavailable
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-md border border-border bg-background", className)}>
      <button
        type="button"
        className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onPreview}
        aria-label={alt ? `View ${alt}` : "View media"}
      >
        {video ? (
          <div className="relative aspect-square w-full bg-muted">
            <video src={src} className="aspect-square h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
              <Play className="h-7 w-7 text-white drop-shadow-md" fill="currentColor" />
            </div>
          </div>
        ) : mimeType && !mimeType.startsWith("image/") ? (
          <div className="flex aspect-square flex-col items-center justify-center gap-1 bg-muted p-2 text-muted-foreground">
            <Film className="h-6 w-6" />
            <span className="line-clamp-2 text-center text-[10px]">{alt ?? "File"}</span>
          </div>
        ) : (
          <img src={src} alt={alt ?? "Preview"} className="aspect-square w-full object-cover" />
        )}
      </button>
      {onRemove && (
        <Button
          type="button"
          size="icon"
          variant="destructive"
          className="absolute right-1 top-1 h-6 w-6"
          disabled={removeDisabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <span className="sr-only">Remove</span>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
