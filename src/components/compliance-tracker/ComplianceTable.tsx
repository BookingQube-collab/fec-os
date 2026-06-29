"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, FolderOpen, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import type { ComplianceStatus, E3ComplianceItemRow } from "@/lib/compliance-tracker/constants";
import { searchFilter } from "@/lib/compliance-tracker/aggregations";
import { enrichItem, formatDisplayDate, statusBadgeStyle } from "@/lib/compliance-tracker/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortKey = keyof E3ComplianceItemRow | "computed_status" | "days_to_expiry";

type ComplianceTableProps = {
  rows: E3ComplianceItemRow[];
  searchKeys?: (keyof E3ComplianceItemRow)[];
  emptyMessage?: string;
  editable?: boolean;
  onEdit?: (row: E3ComplianceItemRow) => void;
  onDelete?: (row: E3ComplianceItemRow) => void;
};

export function ComplianceTable({
  rows,
  searchKeys = ["id", "location", "area", "category", "item", "vendor", "owner"],
  emptyMessage = "No compliance items match your filters.",
  editable = false,
  onEdit,
  onDelete,
}: ComplianceTableProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("expiry_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const enriched = useMemo(
    () => rows.map((r) => (r.computed_status ? r : enrichItem(r))),
    [rows],
  );

  const filtered = useMemo(
    () => searchFilter(enriched, search, searchKeys),
    [enriched, search, searchKeys],
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey as keyof typeof a];
      const bv = b[sortKey as keyof typeof b];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  }

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: "id", label: "ID" },
    { key: "location", label: "Location" },
    { key: "area", label: "Area" },
    { key: "category", label: "Category" },
    { key: "item", label: "Item", className: "min-w-[180px]" },
    { key: "vendor", label: "Vendor" },
    { key: "contract_start", label: "Contract Start" },
    { key: "contract_end", label: "Contract End" },
    { key: "last_service", label: "Last Service" },
    { key: "next_service", label: "Next Service" },
    { key: "issue_date", label: "Issue Date" },
    { key: "expiry_date", label: "Expiry Date" },
    { key: "frequency", label: "Frequency" },
    { key: "owner", label: "Owner" },
    { key: "remarks", label: "Remarks", className: "min-w-[140px]" },
    { key: "drive_link", label: "Document" },
    { key: "computed_status", label: "Status" },
    { key: "days_to_expiry", label: "Days to Expiry" },
  ];

  const colSpan = columns.length + (editable ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search table..."
          className="pl-9"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#0B1F3A] hover:bg-[#0B1F3A]">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`cursor-pointer whitespace-nowrap text-white ${col.className ?? ""}`}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  <SortIcon column={col.key} />
                </TableHead>
              ))}
              {editable ? (
                <TableHead className="whitespace-nowrap text-white">{t("e3Tracker.actions")}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => {
                const statusStyle = statusBadgeStyle(row.computed_status as ComplianceStatus);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.id}</TableCell>
                    <TableCell>{row.location}</TableCell>
                    <TableCell>{row.area}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{row.item}</TableCell>
                    <TableCell>{row.vendor}</TableCell>
                    <TableCell>{formatDisplayDate(row.contract_start)}</TableCell>
                    <TableCell>{formatDisplayDate(row.contract_end)}</TableCell>
                    <TableCell>{formatDisplayDate(row.last_service)}</TableCell>
                    <TableCell>{formatDisplayDate(row.next_service)}</TableCell>
                    <TableCell>{formatDisplayDate(row.issue_date)}</TableCell>
                    <TableCell>{formatDisplayDate(row.expiry_date)}</TableCell>
                    <TableCell>{row.frequency}</TableCell>
                    <TableCell>{row.owner}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{row.remarks ?? "—"}</TableCell>
                    <TableCell>
                      {row.drive_link ? (
                        <a
                          href={row.drive_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t("e3Tracker.openDocument")}
                          aria-label={t("e3Tracker.openDocument")}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#0B1F3A] hover:bg-[#F2F4F7] hover:text-[#E8821E]"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </a>
                      ) : editable ? (
                        <span className="text-xs text-muted-foreground">{t("e3Tracker.addLink")}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
                        style={statusStyle}
                      >
                        {row.computed_status}
                      </span>
                    </TableCell>
                    <TableCell>{row.days_to_expiry ?? "—"}</TableCell>
                    {editable ? (
                      <TableCell>
                        <CapabilityGate capability="compliance.edit_e3_tracker">
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={t("e3Tracker.editItem")}
                              aria-label={t("e3Tracker.editItem")}
                              onClick={() => onEdit?.(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title={t("common.delete")}
                              aria-label={t("common.delete")}
                              onClick={() => onDelete?.(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CapabilityGate>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
