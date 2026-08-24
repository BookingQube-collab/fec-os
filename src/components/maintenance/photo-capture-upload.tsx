"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MediaThumbnail, useMediaPreview } from "@/components/maintenance/media-preview-lightbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type PhotoCaptureUploadProps = {
  label?: string;
  disabled?: boolean;
  uploading?: boolean;
  /** Allow video files from gallery picker (camera remains image-only) */
  acceptVideos?: boolean;
  /** Accumulate files for batch upload on submit */
  files?: File[];
  onChange?: (files: File[]) => void;
  /** Upload each file immediately (detail / workflow stages) */
  onUpload?: (file: File) => Promise<void>;
};

function isAcceptedMedia(file: File, acceptVideos: boolean) {
  if (file.type.startsWith("image/")) return true;
  return acceptVideos && file.type.startsWith("video/");
}

function canUseGetUserMedia() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

async function requestCameraStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

function cameraErrorMessage(err: unknown, t: (key: string) => string): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return t("maintenanceMedia.cameraDenied");
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return t("maintenanceMedia.cameraMissing");
    }
    if (err.name === "NotReadableError") {
      return t("maintenanceMedia.cameraBusy");
    }
  }
  return t("maintenanceMedia.cameraFailed");
}

export function PhotoCaptureUpload({
  label,
  disabled,
  uploading,
  acceptVideos = false,
  files = [],
  onChange,
  onUpload,
}: PhotoCaptureUploadProps) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t("maintenanceMedia.photos");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const pendingMode = !!onChange && !onUpload;
  const { openPreview, previewDialog } = useMediaPreview();

  const stopCameraStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const closeCamera = useCallback(() => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraError(null);
  }, [stopCameraStream]);

  useEffect(() => {
    if (!pendingMode) return;
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files, pendingMode]);

  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;

    const startCamera = async () => {
      setCameraError(null);
      setCameraReady(false);

      try {
        const stream = await requestCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (!cancelled) setCameraReady(true);
        }
      } catch (err) {
        if (!cancelled) setCameraError(cameraErrorMessage(err, t));
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraOpen, stopCameraStream, t]);

  const addCapturedFile = async (file: File) => {
    if (onUpload) {
      await onUpload(file);
      return;
    }

    if (onChange) {
      onChange([...files, file]);
    }
  };

  const handlePicked = async (picked: FileList | null) => {
    if (!picked?.length) return;
    const media = Array.from(picked).filter((f) => isAcceptedMedia(f, acceptVideos));
    if (!media.length) return;

    if (onUpload) {
      for (const file of media) {
        await onUpload(file);
      }
      return;
    }

    if (onChange) {
      onChange([...files, ...media]);
    }
  };

  const handleTakePhotoClick = () => {
    if (canUseGetUserMedia()) {
      setCameraOpen(true);
      return;
    }
    cameraRef.current?.click();
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) return;

    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    closeCamera();
    await addCapturedFile(file);
  };

  const removeAt = (idx: number) => {
    onChange?.(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{resolvedLabel}</Label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            void handlePicked(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept={acceptVideos ? "image/*,video/*" : "image/*"}
          multiple
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            void handlePicked(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || uploading}
          onClick={handleTakePhotoClick}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t("maintenanceMedia.takePhoto")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => galleryRef.current?.click()}
        >
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
          {t("maintenanceMedia.uploadFiles")}
        </Button>
      </div>

      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          if (!open) closeCamera();
        }}
      >
        <DialogContent className="max-w-md gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t("maintenanceMedia.takePhoto")}</DialogTitle>
            <DialogDescription>{t("maintenanceMedia.cameraHint")}</DialogDescription>
          </DialogHeader>

          {cameraError ? (
            <Alert variant="destructive">
              <AlertDescription>{cameraError}</AlertDescription>
            </Alert>
          ) : (
            <div className="relative overflow-hidden rounded-md border border-border bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="aspect-[4/3] w-full object-cover"
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeCamera}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={!cameraReady || !!cameraError} onClick={() => void capturePhoto()}>
              <Camera className="mr-1.5 h-4 w-4" />
              {t("maintenanceMedia.capture")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewDialog}

      {pendingMode && files.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file, idx) => (
            <MediaThumbnail
              key={`${file.name}-${idx}`}
              src={previews[idx] ?? ""}
              alt={file.name}
              mimeType={file.type}
              onPreview={() =>
                openPreview({
                  src: previews[idx] ?? "",
                  alt: file.name,
                  mimeType: file.type,
                })
              }
              onRemove={() => removeAt(idx)}
              removeDisabled={disabled || uploading}
            />
          ))}
        </div>
      )}
      {pendingMode && files.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("maintenanceMedia.filesSelected", { count: files.length })}
        </p>
      )}
    </div>
  );
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
