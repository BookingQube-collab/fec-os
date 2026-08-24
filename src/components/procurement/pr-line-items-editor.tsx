"use client";

import { Calculator, Loader2, Plus, Sparkles, Trash2, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtQar } from "@/lib/currency";
import { cn } from "@/lib/utils";

export const PR_LINE_CATEGORIES = [
  "fnb",
  "maintenance",
  "attractions",
  "it",
  "uniforms",
  "cleaning",
  "marketing",
  "services",
  "general",
] as const;

const UOM_OPTIONS = ["ea", "box", "lot", "set", "job", "pack", "kg", "L", "m", "roll"] as const;

export type PrLineDraft = {
  key: string;
  name: string;
  description: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
  preferred_vendor_id: string | null;
  remarks: string;
  item_id: string | null;
  price_source?: "quoted" | "history" | "estimated";
  previous_supplier_note?: string | null;
  previous_vendor_name?: string | null;
  previous_pr_number?: string | null;
  previous_supplied_on?: string | null;
};

export type PrLineVendorOption = { id: string; name: string };
export type PrCatalogOption = { id: string; sku: string | null; name: string; category: string; unit: string };

export function newPrLineKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyPrLine(): PrLineDraft {
  return {
    key: newPrLineKey(),
    name: "",
    description: "",
    category: "",
    qty: 1,
    unit: "ea",
    unit_price: 0,
    preferred_vendor_id: null,
    remarks: "",
    item_id: null,
    previous_supplier_note: null,
    previous_vendor_name: null,
    previous_pr_number: null,
    previous_supplied_on: null,
  };
}

/** Drop a description that is only a dump of the requester brief. Keep real specs. */
export function compactLineSpec(_name: string, description: string, notes: string): string {
  const spec = description.trim();
  if (!spec) return "";
  const brief = notes.trim();
  if (brief && spec.toLowerCase() === brief.toLowerCase()) return "";
  if (spec.length > 220 && brief && brief.toLowerCase().includes(spec.toLowerCase().slice(0, 48))) return "";
  return spec.slice(0, 240);
}

type PrLineItemsEditorProps = {
  lines: PrLineDraft[];
  vendors: PrLineVendorOption[];
  total: number;
  aiGenerated?: boolean;
  catalog?: PrCatalogOption[];
  freight?: number;
  onFreightChange?: (value: number) => void;
  variant?: "card" | "wizard";
  onSuggest?: () => void;
  suggestPending?: boolean;
  onChange: (idx: number, patch: Partial<PrLineDraft>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
};

const LINE_GRID =
  "grid gap-2 md:grid-cols-[minmax(0,1.7fr)_5rem_6rem_8.5rem_7rem_2.75rem]";

function Field({
  label,
  htmlFor,
  className,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  hint?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[10px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function formatPrCode(code: string): string {
  return /^pr[\s-]*/i.test(code.trim()) ? code.trim() : `PR ${code.trim()}`;
}

function PreviousSupplierChip({
  vendor,
  prNumber,
  suppliedOn,
}: {
  vendor: string;
  prNumber?: string | null;
  suppliedOn?: string | null;
}) {
  const { t } = useTranslation();
  const parts = [
    vendor,
    prNumber ? formatPrCode(prNumber) : null,
    suppliedOn || null,
  ].filter((p): p is string => Boolean(p));
  if (!parts.length) return null;
  return (
    <Badge variant="info" className="h-auto max-w-full whitespace-normal py-1 text-[10px] font-medium normal-case tracking-normal">
      {t("procurement.form.previouslySupplied")}: {parts.join(" · ")}
    </Badge>
  );
}

export function PrLineItemsEditor({
  lines,
  vendors,
  total,
  aiGenerated,
  catalog = [],
  freight = 0,
  onFreightChange,
  variant = "card",
  onSuggest,
  suggestPending,
  onChange,
  onAdd,
  onRemove,
}: PrLineItemsEditorProps) {
  const { t } = useTranslation();
  const namedCount = lines.filter((l) => l.name.trim()).length;
  const wizard = variant === "wizard";
  const grandTotal = total + Number(freight || 0);

  return (
    <section className={cn(!wizard && "space-y-3 rounded-2xl border border-border/40 bg-card p-4 shadow-elevated-xs sm:p-5")}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          !wizard &&
            "sticky top-0 z-20 -mx-1 rounded-2xl border border-border/40 bg-card/95 px-3 py-3 shadow-elevated-xs backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:px-4",
        )}
      >
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{wizard ? t("procurement.wizard.itemsTitle") : t("procurement.form.lines")}</h2>
          {wizard ? <p className="text-xs text-muted-foreground">{t("procurement.wizard.itemsSubtitle")}</p> : null}
          {!wizard ? (
            <Badge variant="secondary" className="mt-1 tabular-nums">
              {namedCount || lines.length}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!wizard ? (
            <p className="text-sm font-semibold tabular-nums">
              {t("procurement.form.prTotal")}: {fmtQar(total)}
            </p>
          ) : null}
          {onSuggest ? (
            <Button type="button" variant="outline" size="sm" disabled={suggestPending} onClick={onSuggest}>
              {suggestPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
              {t("procurement.wizard.suggestItems")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" />
            {wizard ? t("procurement.wizard.addItem") : t("procurement.form.addLine")}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {lines.map((line, idx) => {
          const lineTotal = Number(line.qty || 0) * Number(line.unit_price || 0);
          const unitOptions = UOM_OPTIONS.includes(line.unit as (typeof UOM_OPTIONS)[number])
            ? UOM_OPTIONS
            : ([line.unit || "ea", ...UOM_OPTIONS] as string[]);
          const categoryValue = PR_LINE_CATEGORIES.includes(line.category as (typeof PR_LINE_CATEGORIES)[number])
            ? line.category
            : line.category
              ? line.category
              : undefined;
          const priceHint =
            line.price_source === "history"
              ? t("procurement.form.priceHistory")
              : line.price_source === "estimated"
                ? t("procurement.form.priceEstimated")
                : line.price_source === "quoted"
                  ? t("procurement.form.priceQuoted")
                  : null;
          const previousVendor = line.previous_vendor_name?.trim() || null;

          return (
            <div key={line.key} className="rounded-xl border border-border/30 bg-background/40 p-3">
              <div className={LINE_GRID}>
                <Field
                  label={wizard ? t("procurement.wizard.itemDetails") : t("procurement.form.what")}
                  htmlFor={`pr-line-name-${line.key}`}
                >
                  {wizard && catalog.length ? (
                    <Select
                      value={line.item_id ?? "custom"}
                      onValueChange={(v) => {
                        if (v === "custom") {
                          onChange(idx, { item_id: null });
                          return;
                        }
                        const item = catalog.find((c) => c.id === v);
                        if (!item) return;
                        onChange(idx, {
                          item_id: item.id,
                          name: item.name,
                          category: item.category,
                          unit: item.unit,
                        });
                      }}
                    >
                      <SelectTrigger aria-label={t("procurement.wizard.catalogSearch")}>
                        <SelectValue placeholder={t("procurement.wizard.catalogSearch")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">{t("procurement.wizard.customItem")}</SelectItem>
                        {catalog.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.sku ? `${item.sku} — ${item.name}` : item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Input
                    id={`pr-line-name-${line.key}`}
                    className={wizard && catalog.length ? "mt-1.5" : undefined}
                    value={line.name}
                    placeholder={wizard ? t("procurement.wizard.catalogSearch") : t("procurement.form.name")}
                    onChange={(e) => onChange(idx, { name: e.target.value, item_id: null })}
                  />
                </Field>
                <Field label={wizard ? t("procurement.wizard.qty") : t("procurement.form.qty")} htmlFor={`pr-line-qty-${line.key}`}>
                  <Input
                    id={`pr-line-qty-${line.key}`}
                    type="number"
                    min={0.01}
                    step="0.01"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={line.qty}
                    onChange={(e) => onChange(idx, { qty: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t("procurement.form.uom")}>
                  <Select value={line.unit || "ea"} onValueChange={(v) => onChange(idx, { unit: v })}>
                    <SelectTrigger aria-label={t("procurement.form.uom")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label={wizard ? t("procurement.wizard.unitPrice") : t("procurement.form.unitPriceQar")}
                  htmlFor={`pr-line-price-${line.key}`}
                  hint={priceHint}
                >
                  <Input
                    id={`pr-line-price-${line.key}`}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={line.unit_price}
                    onChange={(e) => onChange(idx, { unit_price: Number(e.target.value), price_source: "quoted" })}
                  />
                </Field>
                <Field label={wizard ? t("procurement.wizard.subtotal") : t("procurement.form.lineTotal")}>
                  <div className="flex min-h-11 items-center rounded-full border border-transparent bg-muted/50 px-3.5 text-sm font-semibold tabular-nums">
                    {fmtQar(lineTotal)}
                  </div>
                </Field>
                <div className="flex items-end justify-end">
                  {lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => onRemove(idx)}
                      aria-label={t("procurement.form.removeLine")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="h-11 w-11" aria-hidden />
                  )}
                </div>
              </div>

              <div className={cn(LINE_GRID, "mt-1")}>
                <Input
                  id={`pr-line-spec-${line.key}`}
                  value={line.description}
                  aria-label={t("procurement.form.spec")}
                  placeholder={wizard ? t("procurement.wizard.additionalDetails") : t("procurement.form.specPlaceholder")}
                  className="min-h-9 text-sm text-muted-foreground"
                  onChange={(e) => onChange(idx, { description: e.target.value })}
                />
                <div className="hidden md:block md:col-span-5" />
              </div>

              <div className={cn("mt-2 grid gap-2 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]", wizard && "hidden")}>
                <Field label={t("procurement.form.category")}>
                  <Select
                    value={categoryValue}
                    onValueChange={(v) => onChange(idx, { category: v })}
                  >
                    <SelectTrigger className="font-medium" aria-label={t("procurement.form.category")}>
                      <SelectValue placeholder={t("procurement.form.category")} />
                    </SelectTrigger>
                    <SelectContent>
                      {line.category && !PR_LINE_CATEGORIES.includes(line.category as (typeof PR_LINE_CATEGORIES)[number]) ? (
                        <SelectItem value={line.category}>{line.category}</SelectItem>
                      ) : null}
                      {PR_LINE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {t(`procurement.form.categoryOptions.${c}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="min-w-0 space-y-1.5">
                  <Field label={t("procurement.form.vendor")}>
                    <Select
                      value={line.preferred_vendor_id ?? "none"}
                      onValueChange={(v) =>
                        onChange(idx, {
                          preferred_vendor_id: v === "none" ? null : v,
                        })
                      }
                    >
                      <SelectTrigger aria-label={t("procurement.form.vendor")}>
                        <SelectValue placeholder={t("procurement.form.selectVendor")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("procurement.form.selectVendor")}</SelectItem>
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {previousVendor ? (
                    <PreviousSupplierChip
                      vendor={previousVendor}
                      prNumber={line.previous_pr_number}
                      suppliedOn={line.previous_supplied_on}
                    />
                  ) : aiGenerated && line.name.trim() && !line.preferred_vendor_id ? (
                    <p className="text-[10px] text-muted-foreground">{t("procurement.form.noPreviousSupplier")}</p>
                  ) : null}
                  {!vendors.length ? (
                    <p className="text-[10px] text-muted-foreground">{t("procurement.form.noVendors")}</p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {wizard ? (
        <div className="mt-4 space-y-3 border-t border-border/40 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="uppercase tracking-wide text-muted-foreground">{t("procurement.wizard.lineSubtotal")}</span>
            <span className="font-semibold tabular-nums">{fmtQar(total)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="flex items-center gap-2 text-sm">
              <Truck className="h-4 w-4 text-muted-foreground" />
              {t("procurement.wizard.freight")}
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="max-w-[10rem] tabular-nums"
              value={freight || ""}
              placeholder={t("common.qar")}
              onChange={(e) => onFreightChange?.(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">{t("procurement.wizard.grandTotal")}</p>
                <p className="text-xs text-muted-foreground">{t("procurement.wizard.grandTotalHint")}</p>
              </div>
            </div>
            <p className="text-lg font-semibold tabular-nums">{fmtQar(grandTotal)}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
