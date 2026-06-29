"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Link2Off,
  Search,
} from "lucide-react";

import { FilterRow, type FilterState } from "@/components/compliance-tracker/FilterRow";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useE3TrackerLicenseDocuments } from "@/hooks/queries/useE3TrackerQueries";
import { openDriveLink } from "@/lib/compliance-tracker/license-documents-resolver";
import type { ResolvedLicenseDocNode } from "@/lib/compliance-tracker/license-documents-types";
import { cn } from "@/lib/utils";

function StatsStrip({
  total,
  linked,
  missing,
}: {
  total: number;
  linked: number;
  missing: number;
}) {
  const { t } = useTranslation();
  const items = [
    { label: t("e3Tracker.licenseDocs.total"), value: total, color: "#0B1F3A" },
    { label: t("e3Tracker.licenseDocs.linked"), value: linked, color: "#1E7B45" },
    { label: t("e3Tracker.licenseDocs.missing"), value: missing, color: "#C0392B" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748B]">{item.label}</p>
          <p className="mt-1 font-display text-2xl font-semibold" style={{ color: item.color }}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function nodeMatchesSearch(node: ResolvedLicenseDocNode, term: string): boolean {
  const q = term.toLowerCase();
  if (node.label.toLowerCase().includes(q)) return true;
  return node.children?.some((child) => nodeMatchesSearch(child, term)) ?? false;
}

function TreeNode({
  node,
  depth,
  search,
  defaultOpen,
}: {
  node: ResolvedLicenseDocNode;
  depth: number;
  search: string;
  defaultOpen: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(defaultOpen || depth < 2);
  const isRtl = i18n.dir() === "rtl";
  const label = isRtl && node.labelAr ? node.labelAr : node.label;

  if (search && !nodeMatchesSearch(node, search)) return null;

  if (node.type === "document") {
    const hasLink = Boolean(node.driveLink);
    return (
      <button
        type="button"
        disabled={!hasLink}
        onClick={() => node.driveLink && openDriveLink(node.driveLink)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          hasLink
            ? "text-[#0B1F3A] hover:bg-[#F2F4F7] hover:text-[#E8821E]"
            : "cursor-default text-[#94A3B8]",
        )}
        style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
        title={
          hasLink
            ? t("e3Tracker.openDocument")
            : t("e3Tracker.licenseDocs.noLinkYet")
        }
      >
        {hasLink ? (
          <FileText className="h-4 w-4 shrink-0 text-[#E8821E]" />
        ) : (
          <Link2Off className="h-4 w-4 shrink-0" />
        )}
        <span className="flex-1 truncate">{label}</span>
        {node.sameAsRef ? (
          <span className="shrink-0 rounded bg-[#F2F4F7] px-1.5 py-0.5 text-[10px] font-medium text-[#64748B]">
            {t("e3Tracker.licenseDocs.sameAsAbove")}
          </span>
        ) : null}
        {hasLink ? <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" /> : null}
        {!hasLink ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#94A3B8]">
            {t("e3Tracker.licenseDocs.pending")}
          </span>
        ) : null}
      </button>
    );
  }

  const childCount = node.children?.length ?? 0;
  const linkedCount =
    node.children?.reduce((acc, child) => {
      if (child.type === "document") return acc + (child.driveLink ? 1 : 0);
      return acc + countLinked(child);
    }, 0) ?? 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-[#0B1F3A] hover:bg-[#F2F4F7]"
        style={{ paddingInlineStart: `${depth * 16 + 4}px` }}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#64748B]" />
        ) : (
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-[#64748B]", isRtl && "rotate-180")} />
        )}
        {open ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-[#E8821E]" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-[#0B1F3A]" />
        )}
        <span className="flex-1">{label}</span>
        {node.sameAsRef ? (
          <span className="shrink-0 rounded bg-[#F2F4F7] px-1.5 py-0.5 text-[10px] font-medium text-[#64748B]">
            {t("e3Tracker.licenseDocs.sameAsAbove")}
          </span>
        ) : null}
        {childCount > 0 ? (
          <span className="shrink-0 text-xs text-[#64748B]">
            {linkedCount}/{countDocuments(node)} {t("e3Tracker.licenseDocs.docsShort")}
          </span>
        ) : null}
      </button>
      {open && node.children?.length ? (
        <div className="border-s border-[#E2E8F0] ms-4">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              search={search}
              defaultOpen={depth < 1 || Boolean(search)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function countDocuments(node: ResolvedLicenseDocNode): number {
  if (node.type === "document") return 1;
  return node.children?.reduce((acc, child) => acc + countDocuments(child), 0) ?? 0;
}

function countLinked(node: ResolvedLicenseDocNode): number {
  if (node.type === "document") return node.driveLink ? 1 : 0;
  return node.children?.reduce((acc, child) => acc + countLinked(child), 0) ?? 0;
}

export function E3LicenseDocumentsBrowser() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterState>({ location: "All", field: "All" });
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useE3TrackerLicenseDocuments({
    location: filter.location,
    field: filter.field,
  });

  const tree = useMemo(() => data?.tree ?? [], [data?.tree]);
  const stats = data?.stats ?? { totalDocuments: 0, linkedDocuments: 0, missingDocuments: 0 };

  function handleFilterChange(next: FilterState) {
    setFilter(next);
  }

  return (
    <div className="space-y-4">
      <FilterRow value={filter} onChange={handleFilterChange} />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("e3Tracker.licenseDocs.searchPlaceholder")}
          className="border-[#E8A33D] bg-white ps-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t("e3Tracker.licenseDocs.loadError")}
        </p>
      ) : (
        <>
          <StatsStrip
            total={stats.totalDocuments}
            linked={stats.linkedDocuments}
            missing={stats.missingDocuments}
          />

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-2">
            {tree.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[#64748B]">
                {t("e3Tracker.licenseDocs.empty")}
              </p>
            ) : (
              tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  search={search.trim()}
                  defaultOpen={tree.length === 1}
                />
              ))
            )}
          </div>

          <p className="text-xs text-[#64748B]">
            {t("e3Tracker.licenseDocs.footerHint", {
              defaultValue:
                "Documents without a link still appear here. Add or update Google Drive links from Master Register to enable opening them.",
            })}
          </p>
        </>
      )}
    </div>
  );
}
