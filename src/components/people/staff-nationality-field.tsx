"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import { usePermission } from "@/hooks/use-permission";
import { createPeopleMaster } from "@/lib/people.functions";
import { alignMasterValue, masterLabelKey, missingMasterName } from "@/lib/people-masters";
import { queryKeys } from "@/lib/query-keys";

/**
 * Nationality picker on Add/Edit employee. A missing name is saved with the
 * same master-list action as Manage lists, then selected here.
 */
export function StaffNationalityField({
  value,
  names,
  onChange,
  disabled,
  ready = true,
}: {
  value: string;
  names: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Masters have loaded, so a typed name can be checked against the saved list. */
  ready?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canEdit = usePermission("people.edit_roster");
  const selected = alignMasterValue(value, names);

  const options = useMemo(() => {
    const known = names.some((name) => masterLabelKey(name) === masterLabelKey(selected));
    const list = selected && !known ? [selected, ...names] : names;
    return list.map((name) => ({ value: name, label: name }));
  }, [names, selected]);

  const resolveCreateOption = useCallback(
    (query: string) => (canEdit && ready ? missingMasterName(query, names) : null),
    [canEdit, names, ready],
  );

  const onCreateOption = useCallback(
    async (name: string) => {
      try {
        await createPeopleMaster({ kind: "nationality", name });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add nationality");
        void queryClient.invalidateQueries({ queryKey: queryKeys.people.masters() });
        throw error;
      }
      onChange(name);
      toast.success(t("people.masters.added"));
      void queryClient.invalidateQueries({ queryKey: queryKeys.people.masters() });
    },
    [onChange, queryClient, t],
  );

  return (
    <div>
      <Label>{t("people.staff.nationality")}</Label>
      <SearchableSelect
        value={selected}
        onValueChange={onChange}
        disabled={disabled}
        placeholder={t("people.staff.nationalityUnset")}
        emptyOption={{ value: "", label: t("people.staff.nationalityUnset") }}
        options={options}
        resolveCreateOption={resolveCreateOption}
        onCreateOption={onCreateOption}
        createOptionLabel={(name) => t("people.masters.addNamed", { name })}
      />
    </div>
  );
}
