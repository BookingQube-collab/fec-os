"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { useStaff } from "@/hooks/queries/usePeople";
import { usePermission } from "@/hooks/use-permission";
import { expiryBand, qatarTodayYmd, type HrExpiryBand } from "@/lib/hr-expiry-bands";
import { formatLocationLabel } from "@/lib/locations/normalize";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

type DocKind = "qid" | "passport" | "contract" | "visa";

type DocRow = {
  staffId: string;
  name: string;
  code: string;
  location: string;
  locationCode: string | null;
  docType: DocKind;
  expiry: string | null;
  band: HrExpiryBand;
};

function bandLabel(band: HrExpiryBand): string {
  switch (band) {
    case "expired":
      return "Expired / Critical";
    case "0_30":
      return "Urgent ≤30 days";
    case "31_60":
      return "Watch ≤60 days";
    case "61_90":
      return "Upcoming ≤90 days";
    case "valid":
      return "Valid";
    default:
      return "Unknown";
  }
}

function bandVariant(band: HrExpiryBand): "destructive" | "warning" | "info" | "success" | "muted" | "outline" {
  if (band === "expired") return "destructive";
  if (band === "0_30") return "warning";
  if (band === "31_60" || band === "61_90") return "info";
  if (band === "valid") return "success";
  return "muted";
}

function collectDocs(staff: StaffRow[], today: string, canSensitive: boolean): DocRow[] {
  if (!canSensitive) return [];
  const rows: DocRow[] = [];
  for (const s of staff) {
    const location = formatLocationLabel(s.location_code, s.location_name);
    const base = {
      staffId: s.id,
      name: s.full_name,
      code: s.employee_code,
      location,
      locationCode: s.location_code,
    };
    const push = (docType: DocKind, expiry: string | null | undefined) => {
      const band = expiryBand(today, expiry);
      if (band === "valid" || band === "unknown") return;
      rows.push({ ...base, docType, expiry: expiry ?? null, band });
    };
    push("qid", s.qid_expiry);
    push("passport", s.passport_expiry);
    push("contract", s.contract_end);
    push("visa", s.visa_expiry);
  }
  const order: Record<HrExpiryBand, number> = {
    expired: 0,
    "0_30": 1,
    "31_60": 2,
    "61_90": 3,
    valid: 4,
    unknown: 5,
  };
  return rows.sort((a, b) => order[a.band] - order[b.band] || (a.expiry ?? "").localeCompare(b.expiry ?? ""));
}

const DOC_LABELS: Record<DocKind, string> = {
  qid: "QID",
  passport: "Passport",
  contract: "Contract",
  visa: "Work permit",
};

export function PeopleDocumentsExpiryPanel() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canSensitive = usePermission("hr.profile.view_sensitive") || usePermission("people.view_salary");
  const { data: staff = [], isLoading } = useStaff(locationId ?? null, { includeArchived: true });
  const today = qatarTodayYmd();

  const [docType, setDocType] = useState<string>("");
  const [loc, setLoc] = useState("");
  const [band, setBand] = useState("");
  const [q, setQ] = useState("");

  const allDocs = useMemo(() => collectDocs(staff, today, canSensitive), [staff, today, canSensitive]);

  const locations = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of allDocs) {
      if (d.locationCode) map.set(d.locationCode, d.location);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allDocs]);

  const buckets = useMemo(() => {
    let expired = 0;
    let urgent = 0;
    let watch = 0;
    let upcoming = 0;
    for (const d of allDocs) {
      if (d.band === "expired") expired += 1;
      else if (d.band === "0_30") urgent += 1;
      else if (d.band === "31_60") watch += 1;
      else if (d.band === "61_90") upcoming += 1;
    }
    return { expired, urgent, watch, upcoming, total: allDocs.length };
  }, [allDocs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allDocs.filter((d) => {
      if (docType && d.docType !== docType) return false;
      if (loc && d.locationCode !== loc) return false;
      if (band && d.band !== band) return false;
      if (needle) {
        const blob = `${d.name} ${d.code}`.toLowerCase();
        if (!blob.includes(needle)) return false;
      }
      return true;
    });
  }, [allDocs, docType, loc, band, q]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t("people.staff.loading")}
      </div>
    );
  }

  if (!canSensitive) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t(
          "people.documents.needPermission",
          "Document expiry details require HR sensitive-profile or salary view permission.",
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold">{t("people.documents.title", "Documents & expiry")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "people.documents.subtitle",
            "QID, passport, contract, and work permit dates from employee profiles. Click a row to open the profile.",
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button type="button" className={cn("text-start", !band && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setBand("")}>
          <TintedKpiCard title={t("people.documents.needsAttention", "Needs attention")} value={buckets.total} tint="sky" compact />
        </button>
        <button type="button" className={cn("text-start", band === "expired" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setBand((b) => (b === "expired" ? "" : "expired"))}>
          <TintedKpiCard title="Expired / Critical" value={buckets.expired} tint="red" compact />
        </button>
        <button type="button" className={cn("text-start", band === "0_30" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setBand((b) => (b === "0_30" ? "" : "0_30"))}>
          <TintedKpiCard title="Urgent ≤30 days" value={buckets.urgent} tint="amber" compact />
        </button>
        <button type="button" className={cn("text-start", band === "31_60" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setBand((b) => (b === "31_60" ? "" : "31_60"))}>
          <TintedKpiCard title="Watch ≤60 days" value={buckets.watch} tint="amber" compact />
        </button>
        <button type="button" className={cn("text-start", band === "61_90" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setBand((b) => (b === "61_90" ? "" : "61_90"))}>
          <TintedKpiCard title="Upcoming ≤90 days" value={buckets.upcoming} tint="slate" compact />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder={t("people.staff.search", "Search name or code")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SearchableSelect
          value={docType}
          onValueChange={setDocType}
          placeholder={t("people.documents.docType", "Document type")}
          emptyOption={{ value: "", label: t("people.documents.allTypes", "All document types") }}
          options={(Object.keys(DOC_LABELS) as DocKind[]).map((k) => ({ value: k, label: DOC_LABELS[k] }))}
          triggerClassName="h-10 w-full font-normal"
          className="w-full"
        />
        <SearchableSelect
          value={loc}
          onValueChange={setLoc}
          placeholder={t("people.staff.allLocations")}
          emptyOption={{ value: "", label: t("people.staff.allLocations") }}
          options={locations.map(([code, label]) => ({ value: code, label, keywords: `${code} ${label}` }))}
          triggerClassName="h-10 w-full font-normal"
          className="w-full"
        />
        <SearchableSelect
          value={band}
          onValueChange={setBand}
          placeholder={t("people.documents.status", "Expiry status")}
          emptyOption={{ value: "", label: t("people.documents.allStatuses", "All statuses") }}
          options={[
            { value: "expired", label: "Expired / Critical" },
            { value: "0_30", label: "Urgent ≤30 days" },
            { value: "31_60", label: "Watch ≤60 days" },
            { value: "61_90", label: "Upcoming ≤90 days" },
          ]}
          triggerClassName="h-10 w-full font-normal"
          className="w-full"
        />
      </div>

      {!filtered.length ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("people.documents.empty", "No documents in the selected expiry window.")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-surface/80 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left">{t("people.staff.employeeCol", "Employee")}</th>
                <th className="px-3 py-2.5 text-left">{t("people.staff.employeeCode", "Employee code")}</th>
                <th className="px-3 py-2.5 text-left">{t("people.staff.location")}</th>
                <th className="px-3 py-2.5 text-left">{t("people.documents.docType", "Document")}</th>
                <th className="px-3 py-2.5 text-left">{t("people.documents.expiryDate", "Expiry date")}</th>
                <th className="px-3 py-2.5 text-left">{t("people.documents.status", "Status")}</th>
                <th className="px-3 py-2.5 text-right">{t("people.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={`${d.staffId}-${d.docType}`} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2.5 font-medium">{d.name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{d.code}</td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">{d.location}</td>
                  <td className="px-3 py-2.5">{DOC_LABELS[d.docType]}</td>
                  <td className="px-3 py-2.5 tabular-nums">{d.expiry ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={bandVariant(d.band)}>{bandLabel(d.band)}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/people/staff/${d.staffId}?tab=documents`}>
                        {t("people.staff.viewProfile", "Open")}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
