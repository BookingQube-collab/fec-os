"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  E3_AREAS,
  E3_CATEGORIES,
  E3_FREQUENCIES,
  E3_LOCATIONS,
  E3_OWNERS,
  type E3ComplianceItemRow,
} from "@/lib/compliance-tracker/constants";
import { createE3ComplianceItem, updateE3ComplianceItem } from "@/lib/e3-compliance.functions";

type FormState = {
  id: string;
  location: string;
  area: string;
  category: string;
  item: string;
  vendor: string;
  contract_start: string;
  contract_end: string;
  last_service: string;
  next_service: string;
  issue_date: string;
  expiry_date: string;
  frequency: string;
  owner: string;
  remarks: string;
  drive_link: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  location: E3_LOCATIONS[0],
  area: E3_AREAS[0],
  category: E3_CATEGORIES[0],
  item: "",
  vendor: "",
  contract_start: "",
  contract_end: "",
  last_service: "",
  next_service: "",
  issue_date: "",
  expiry_date: "",
  frequency: E3_FREQUENCIES[0],
  owner: E3_OWNERS[0],
  remarks: "",
  drive_link: "",
};

function toFormState(item: E3ComplianceItemRow | null): FormState {
  if (!item) return { ...EMPTY_FORM };
  return {
    id: item.id,
    location: item.location,
    area: item.area,
    category: item.category,
    item: item.item,
    vendor: item.vendor,
    contract_start: item.contract_start ?? "",
    contract_end: item.contract_end ?? "",
    last_service: item.last_service ?? "",
    next_service: item.next_service ?? "",
    issue_date: item.issue_date ?? "",
    expiry_date: item.expiry_date ?? "",
    frequency: item.frequency,
    owner: item.owner,
    remarks: item.remarks ?? "",
    drive_link: item.drive_link ?? "",
  };
}

type E3ComplianceItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: E3ComplianceItemRow | null;
  onSaved: () => void;
};

export function E3ComplianceItemFormDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: E3ComplianceItemFormDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!item;
  const [form, setForm] = useState<FormState>(() => toFormState(item));

  useEffect(() => {
    if (open) setForm(toFormState(item));
  }, [open, item]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      return isEdit ? updateE3ComplianceItem(payload) : createE3ComplianceItem(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? t("e3Tracker.updateSuccess") : t("e3Tracker.createSuccess"));
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-[#0B1F3A]">
            {isEdit ? t("e3Tracker.editItem") : t("e3Tracker.addItem")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="e3-id">{t("e3Tracker.fields.id")}</Label>
            <Input
              id="e3-id"
              value={form.id}
              disabled={isEdit}
              placeholder="e.g. IP-KDS-FIRE-001"
              onChange={(e) => setField("id", e.target.value)}
            />
            {!isEdit ? (
              <p className="text-xs text-muted-foreground">{t("e3Tracker.fields.idHelp")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>{t("e3Tracker.fields.location")}</Label>
            <Select value={form.location} onValueChange={(v) => setField("location", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {E3_LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("e3Tracker.fields.area")}</Label>
            <Select value={form.area} onValueChange={(v) => setField("area", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {E3_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("e3Tracker.fields.category")}</Label>
            <Select value={form.category} onValueChange={(v) => setField("category", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {E3_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="e3-item">{t("e3Tracker.fields.item")}</Label>
            <Input
              id="e3-item"
              value={form.item}
              onChange={(e) => setField("item", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="e3-vendor">{t("e3Tracker.fields.vendor")}</Label>
            <Input
              id="e3-vendor"
              value={form.vendor}
              onChange={(e) => setField("vendor", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("e3Tracker.fields.frequency")}</Label>
            <Select value={form.frequency} onValueChange={(v) => setField("frequency", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {E3_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("e3Tracker.fields.owner")}</Label>
            <Select value={form.owner} onValueChange={(v) => setField("owner", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {E3_OWNERS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(
            [
              ["contract_start", "contractStart"],
              ["contract_end", "contractEnd"],
              ["last_service", "lastService"],
              ["next_service", "nextService"],
              ["issue_date", "issueDate"],
              ["expiry_date", "expiryDate"],
            ] as const
          ).map(([field, labelKey]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`e3-${field}`}>{t(`e3Tracker.fields.${labelKey}`)}</Label>
              <Input
                id={`e3-${field}`}
                type="date"
                value={form[field]}
                onChange={(e) => setField(field, e.target.value)}
              />
            </div>
          ))}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="e3-remarks">{t("e3Tracker.fields.remarks")}</Label>
            <Textarea
              id="e3-remarks"
              value={form.remarks}
              rows={2}
              onChange={(e) => setField("remarks", e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="e3-drive">{t("e3Tracker.fields.driveLink")}</Label>
            <Input
              id="e3-drive"
              type="url"
              value={form.drive_link}
              placeholder="https://drive.google.com/drive/folders/..."
              onChange={(e) => setField("drive_link", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("e3Tracker.fields.driveLinkHelp")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-[#0B1F3A] hover:bg-[#152a4a]"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
