"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadCallCenterMediaAudio } from "@/lib/call-center/call-center.functions";
import type { CallCenterAudioKind } from "@/lib/call-center/media-audio";

type Props = {
  kind: CallCenterAudioKind;
  label: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read audio file."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] ?? "" : result;
      if (!base64) {
        reject(new Error("Could not read audio file."));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

export function CallCenterAudioUrlField({ kind, label, value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPickFile(file: File | undefined) {
    if (!file || disabled) return;
    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const result = await uploadCallCenterMediaAudio({
        kind,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        dataBase64,
      });
      if (!result.ok) throw new Error(result.error);
      onChange(result.data.url);
      toast.success(t("callCenter.audioUploaded"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.audioUploadFailed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          disabled={disabled || uploading}
          className="min-w-0 flex-1"
        />
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/m4a,.mp3,.wav,.m4a"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" aria-hidden />
          {uploading ? t("callCenter.audioUploading") : t("callCenter.uploadAudio")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("callCenter.audioUploadHint")}</p>
    </div>
  );
}
