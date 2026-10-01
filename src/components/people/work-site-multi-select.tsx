"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatLocationLabel } from "@/lib/locations/normalize";

export type WorkSiteOption = {
  id: string;
  code: string;
  name: string;
  status?: string;
};

/**
 * Extra dedicated branches for one employee. Home stays outside this list.
 * Options are real location rows, never attendance punch sites.
 */
export function WorkSiteMultiSelect({
  sites,
  homeLocationId,
  value,
  onChange,
  disabled,
  onOpenChange,
}: {
  sites: WorkSiteOption[];
  homeLocationId: string;
  /** Extra work-site ids. Home is not included. */
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  const choices = useMemo(() => {
    const selected = new Set(value);
    return sites
      .filter((site) => site.id !== homeLocationId && (site.status === "active" || !site.status || selected.has(site.id)))
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [homeLocationId, sites, value]);

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of choices) {
      map.set(site.id, formatLocationLabel(site.code, site.name));
    }
    return map;
  }, [choices]);

  const selected = value.filter((id) => labelById.has(id));

  return (
    <div className="space-y-2">
      <SearchableSelect
        multiple
        values={selected}
        onValuesChange={onChange}
        disabled={disabled}
        onOpenChange={onOpenChange}
        aria-label={t("people.staff.dedicatedSites")}
        placeholder={t("people.staff.dedicatedSitesPlaceholder")}
        selectedCountLabel={(count) => t("people.staff.dedicatedSitesCount", { count })}
        options={choices.map((site) => ({
          value: site.id,
          label: formatLocationLabel(site.code, site.name),
          keywords: `${site.code} ${site.name}`,
        }))}
      />
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => {
            const label = labelById.get(id) ?? id;
            return (
              <Badge key={id} variant="outline" className="gap-1 pe-1 text-[10px]">
                {label}
                <button
                  type="button"
                  className="rounded-sm hover:bg-muted"
                  onClick={() => onChange(selected.filter((siteId) => siteId !== id))}
                  disabled={disabled}
                  aria-label={t("people.staff.removeDedicatedSite", { site: label })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
