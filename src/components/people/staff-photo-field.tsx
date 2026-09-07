"use client";

import { ImagePlus, Trash2, User } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { compressStaffPhotoFile } from "@/lib/staff-photo-client";
import { staffPhotoUrl } from "@/lib/staff-photo";

export type StaffPhotoDraft = {
  /** New compressed data URL to upload on save */
  dataUrl: string | null;
  /** User chose to clear existing DB photo */
  remove: boolean;
};

type StaffPhotoFieldProps = {
  staffId?: string | null;
  hasPhoto?: boolean;
  photoUpdatedAt?: string | null;
  draft: StaffPhotoDraft;
  onChange: (next: StaffPhotoDraft) => void;
  disabled?: boolean;
};

export function StaffPhotoField({
  staffId,
  hasPhoto = false,
  photoUpdatedAt = null,
  draft,
  onChange,
  disabled,
}: StaffPhotoFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const showExisting = Boolean(staffId && hasPhoto && !draft.remove && !draft.dataUrl);
  const previewSrc = draft.dataUrl
    ?? (showExisting ? staffPhotoUrl(staffId!, photoUpdatedAt) : undefined);

  async function onFile(file: File | undefined) {
    if (!file || disabled) return;
    setBusy(true);
    try {
      const dataUrl = await compressStaffPhotoFile(file);
      onChange({ dataUrl, remove: false });
    } catch (e) {
      toast.error((e as Error).message || t("people.staff.photoInvalid"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{t("people.staff.photo")}</Label>
      <div className="flex items-center gap-3">
        <Avatar className="h-16 w-16 border border-border">
          {previewSrc ? <AvatarImage src={previewSrc} alt="" /> : null}
          <AvatarFallback className="bg-muted">
            <User className="h-6 w-6 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={disabled || busy}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            {busy ? t("people.staff.photoProcessing") : t("people.staff.photoUpload")}
          </Button>
          {(previewSrc || hasPhoto) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled || busy}
              onClick={() => onChange({ dataUrl: null, remove: true })}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("people.staff.photoRemove")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("people.staff.photoHint")}</p>
    </div>
  );
}

type StaffAvatarProps = {
  staffId: string;
  name: string;
  hasPhoto?: boolean;
  photoUpdatedAt?: string | null;
  className?: string;
};

export function StaffAvatar({
  staffId,
  name,
  hasPhoto,
  photoUpdatedAt,
  className,
}: StaffAvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Avatar className={className ?? "h-9 w-9 border border-border"}>
      {hasPhoto ? (
        <AvatarImage src={staffPhotoUrl(staffId, photoUpdatedAt)} alt={name} />
      ) : null}
      <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
        {initials || <User className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
