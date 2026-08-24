"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtQar } from "@/lib/currency";
import { queryKeys } from "@/lib/query-keys";
import { getVendor } from "@/lib/vendors.functions";

type VendorDetail = {
  id: string;
  name: string;
  category: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  cr_no: string | null;
  trade_license_no: string | null;
  amc_status: string | null;
  payment_terms: string | null;
  notes: string | null;
  status: string | null;
  active: boolean;
  contacts: Array<{
    id: string;
    name: string;
    role?: string | null;
    phone?: string | null;
    email?: string | null;
  }>;
  contracts: Array<{
    id: string;
    title: string;
    end_date: string | null;
    status: string;
    value_amount?: number | null;
    currency?: string | null;
  }>;
  followups: Array<{ id: string; title: string; due_date: string; status: string }>;
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

export function VendorDetailDialog({
  vendorId,
  onOpenChange,
}: {
  vendorId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const detail = useQuery({
    queryKey: queryKeys.vendors.detail(vendorId ?? ""),
    queryFn: () => getVendor({ id: vendorId! }) as Promise<VendorDetail>,
    enabled: Boolean(vendorId),
  });
  const vendor = detail.data;

  return (
    <Dialog open={Boolean(vendorId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{vendor?.name ?? t("vendors.detail.title")}</DialogTitle>
          <DialogDescription>
            {vendor
              ? [t(`vendors.category.${vendor.category}`, { defaultValue: vendor.category }), vendor.cr_no]
                  .filter(Boolean)
                  .join(" · ")
              : t("common.loading")}
          </DialogDescription>
        </DialogHeader>
        {detail.isLoading || !vendor ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant={vendor.active ? "success" : "muted"}>
                {vendor.active ? t("vendors.status.active") : t("vendors.status.inactive")}
              </Badge>
              {vendor.amc_status ? <Badge variant="outline">{vendor.amc_status}</Badge> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("vendors.detail.contact")} value={vendor.contact_person} />
              <Field label={t("vendors.detail.phone")} value={vendor.phone} />
              <Field label={t("vendors.detail.email")} value={vendor.email} />
              <Field label={t("vendors.create.paymentTerms")} value={vendor.payment_terms} />
              <Field label={t("vendors.detail.cr")} value={vendor.cr_no} />
              <Field label={t("vendors.detail.license")} value={vendor.trade_license_no} />
              <Field label={t("vendors.detail.address")} value={vendor.address} />
            </div>
            {vendor.notes ? <Field label={t("vendors.detail.notes")} value={vendor.notes} /> : null}
            <div>
              <p className="text-sm font-semibold">{t("vendors.detail.contracts")}</p>
              {vendor.contracts.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{t("vendors.detail.noContracts")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {vendor.contracts.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border/50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.end_date ? `${t("vendors.detail.ends")} ${c.end_date}` : "—"}
                        </p>
                      </div>
                      <div className="text-end">
                        <Badge variant="outline">{c.status}</Badge>
                        {c.value_amount != null ? (
                          <p className="mt-1 text-xs font-semibold tabular-nums">
                            {fmtQar(Number(c.value_amount))}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">{t("vendors.detail.followups")}</p>
              {vendor.followups.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{t("vendors.detail.noFollowups")}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {vendor.followups.map((f) => (
                    <li key={f.id} className="flex justify-between gap-3">
                      <span>{f.title}</span>
                      <span className="text-xs text-muted-foreground">{f.due_date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
