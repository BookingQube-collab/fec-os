"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { fileToBase64, PhotoCaptureUpload } from "@/components/maintenance/photo-capture-upload";
import { SignaturePad } from "@/components/maintenance/signature-pad";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { completeMaintenanceRequest } from "@/lib/maintenance-requests.functions";
import { queryKeys } from "@/lib/query-keys";

type CloseMaintenanceRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  requestNumber?: string;
  initialNotes?: string;
  onCompleted?: () => void;
};

export function CloseMaintenanceRequestDialog({
  open,
  onOpenChange,
  requestId,
  requestNumber,
  initialNotes = "",
  onCompleted,
}: CloseMaintenanceRequestDialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [notes, setNotes] = useState(initialNotes);
  const [completedByName, setCompletedByName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    setNotes(initialNotes);
    setCompletedByName(profile?.display_name ?? "");
    setSignature(null);
    setPhotos([]);
  }, [open, initialNotes, profile?.display_name]);

  const completeMut = useMutation({
    mutationFn: async () => {
      if (!completedByName.trim()) {
        throw new Error(t("maintenanceRequests.close.nameRequired"));
      }
      if (!signature) {
        throw new Error(t("maintenanceRequests.close.signatureRequired"));
      }
      if (!photos.length) {
        throw new Error(t("maintenanceRequests.close.photosRequired"));
      }

      const photoPayload = await Promise.all(
        photos.map(async (file) => ({
          file_name: file.name,
          file_base64: await fileToBase64(file),
          mime_type: file.type || "image/jpeg",
        })),
      );

      return completeMaintenanceRequest({
        id: requestId,
        completed_by_name: completedByName.trim(),
        progress_notes: notes.trim() || null,
        signature_data_url: signature,
        photos: photoPayload,
      });
    },
    onSuccess: () => {
      toast.success(t("maintenanceRequests.close.success"));
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
      void qc.invalidateQueries({ queryKey: ["maintenance-request-detail", requestId] });
      void qc.invalidateQueries({ queryKey: ["dailyOps", "maintenance"] });
      void qc.invalidateQueries({ queryKey: ["dailyOps", "kpis"] });
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("maintenanceRequests.close.title")}</DialogTitle>
          <DialogDescription>
            {requestNumber
              ? t("maintenanceRequests.close.descriptionWithNumber", { number: requestNumber })
              : t("maintenanceRequests.close.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("maintenanceRequests.close.completedBy")} <span className="text-rose-400">*</span>
            </Label>
            <Input
              value={completedByName}
              onChange={(e) => setCompletedByName(e.target.value)}
              placeholder={t("maintenanceRequests.close.completedByPlaceholder")}
              disabled={completeMut.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("maintenanceRequests.close.notes")}
            </Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("maintenanceRequests.close.notesPlaceholder")}
              disabled={completeMut.isPending}
            />
          </div>

          <PhotoCaptureUpload
            label={`${t("maintenanceRequests.close.photos")} *`}
            files={photos}
            onChange={setPhotos}
            acceptVideos
            disabled={completeMut.isPending}
            uploading={completeMut.isPending}
          />

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("maintenanceRequests.close.signature")} <span className="text-rose-400">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">{t("maintenanceRequests.close.signatureHint")}</p>
            <SignaturePad onChange={setSignature} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={completeMut.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={completeMut.isPending}
            onClick={() => completeMut.mutate()}
          >
            {completeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("maintenanceRequests.close.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
