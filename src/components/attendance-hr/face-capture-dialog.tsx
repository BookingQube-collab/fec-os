"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { lumaFrameDelta, livenessPassed } from "@/lib/attendance-hr/liveness";

export type FaceCaptureResult = {
  dataUrl: string;
  livenessPassed: boolean;
};

function cameraErrorMessage(err: unknown, t: (key: string) => string): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return t("attendanceHr.field.cameraDenied");
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return t("attendanceHr.field.cameraMissing");
    }
  }
  return t("attendanceHr.field.cameraFailed");
}

function grabFrame(video: HTMLVideoElement): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function jpegFromVideo(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

export function FaceCaptureDialog({
  open,
  onOpenChange,
  onCaptured,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: (result: FaceCaptureResult) => void;
  title?: string;
  description?: string;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    let cancelled = false;
    setError(null);
    setReady(false);
    void (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("Camera API unavailable", "NotFoundError");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) setError(cameraErrorMessage(err, t));
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop, t]);

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    try {
      const frames: ImageData[] = [];
      for (let i = 0; i < 3; i += 1) {
        const frame = grabFrame(video);
        if (frame) frames.push(frame);
        if (i < 2) await new Promise((r) => window.setTimeout(r, 350));
      }
      const deltas: number[] = [];
      for (let i = 1; i < frames.length; i += 1) {
        deltas.push(lumaFrameDelta(frames[i - 1].data, frames[i].data));
      }
      const dataUrl = jpegFromVideo(video);
      onCaptured({ dataUrl, livenessPassed: livenessPassed(deltas) });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? t("attendanceHr.field.selfieTitle")}</DialogTitle>
          <DialogDescription>{description ?? t("attendanceHr.field.selfieHint")}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <video ref={videoRef} className="aspect-video w-full rounded-xl bg-black object-cover" playsInline muted />
        )}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={!ready || !!error || busy} onClick={() => void capture()}>
            {t("attendanceHr.field.capture")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
