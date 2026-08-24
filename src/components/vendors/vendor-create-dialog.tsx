"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import { createVendor } from "@/lib/vendors.functions";
import { VENDOR_CATEGORIES, type VendorCategory } from "@/lib/vendors/constants";

const EMPTY = {
  name: "",
  category: "other" as VendorCategory,
  contactPerson: "",
  phone: "",
  email: "",
  paymentTerms: "",
};

export function VendorCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);

  const create = useMutation({
    mutationFn: () =>
      createVendor({
        name: form.name.trim(),
        category: form.category,
        contactPerson: form.contactPerson.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
        branchCoverage: [],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.vendors.all });
      toast.success(t("vendors.create.success"));
      setForm(EMPTY);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || t("vendors.create.error")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setForm(EMPTY);
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="space-y-0 border-b border-border/50 px-6 py-5 text-start">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{t("vendors.create.title")}</DialogTitle>
              <DialogDescription className="mt-1.5">
                {t("vendors.create.subtitle")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="vendor-name">
              {t("vendors.create.name")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vendor-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("vendors.create.namePlaceholder")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("vendors.create.category")}</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as VendorCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_CATEGORIES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`vendors.category.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor-terms">{t("vendors.create.paymentTerms")}</Label>
              <Input
                id="vendor-terms"
                value={form.paymentTerms}
                onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                placeholder={t("vendors.create.paymentPlaceholder")}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vendor-contact">{t("vendors.create.contact")}</Label>
              <Input
                id="vendor-contact"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder={t("vendors.create.contactPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor-phone">{t("vendors.create.phone")}</Label>
              <Input
                id="vendor-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder={t("vendors.create.phonePlaceholder")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendor-email">{t("vendors.create.email")}</Label>
            <Input
              id="vendor-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={t("vendors.create.emailPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter className="border-t border-border/50 px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!form.name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {t("vendors.create.submit")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
