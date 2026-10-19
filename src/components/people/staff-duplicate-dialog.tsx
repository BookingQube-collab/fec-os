"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button } from "@/components/fec";
import { Checkbox } from "@/components/ui/checkbox";
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
  deleteDuplicateStaff,
  mergeStaffDuplicatePair,
  previewStaffDuplicatePair,
  searchStaffDuplicateCandidates,
  suggestStaffDuplicateCandidates,
  type StaffDuplicateCandidate,
  type StaffDuplicatePerson,
} from "@/lib/staff-duplicate-pair.functions";
import { cn } from "@/lib/utils";

type AnchorSummary = {
  fullName: string;
  employeeCode: string;
  jobTitle: string | null;
  locationLabel: string;
  employmentType?: string | null;
  status?: string | null;
};

function displayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (!letters) return trimmed;
  const upper = [...letters].filter((c) => c >= "A" && c <= "Z").length;
  if (upper / letters.length < 0.85) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s'-])(\S)/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function duplicateErrorMessage(message: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const match = /^duplicate:([a-z_]+)(?::(\d+))?$/.exec(message);
  if (!match) return message;
  const code = match[1];
  const count = Number(match[2] ?? "0");
  if (code === "has_punches") return t("people.staff.duplicate.hasPunches", { count });
  if (code === "punch_count_mismatch") return t("people.staff.duplicate.punchMismatch");
  if (code === "not_found") return t("people.staff.duplicate.notFound");
  if (code === "same_person") return t("people.staff.duplicate.samePerson");
  if (code === "linked_records") return t("people.staff.duplicate.linkedRecords");
  return t("people.staff.duplicate.failed");
}

function statusLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ").toUpperCase();
}

function typeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ");
}

function personMeta(person: Pick<StaffDuplicateCandidate, "jobTitle" | "employmentType" | "status" | "locationLabel">): string {
  const bits = [
    person.jobTitle,
    typeLabel(person.employmentType),
    statusLabel(person.status),
    person.locationLabel,
  ].filter(Boolean);
  return bits.join(" · ") || "—";
}

function CandidateButton({
  row,
  onSelect,
}: {
  row: StaffDuplicateCandidate;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-lg px-2 py-2 text-start hover:bg-muted"
      onClick={onSelect}
    >
      <div className="text-sm font-medium">{displayName(row.fullName)}</div>
      <div className="font-mono text-[11px] text-muted-foreground">{row.employeeCode}</div>
      <div className="text-xs text-muted-foreground">{personMeta(row)}</div>
    </button>
  );
}

function PersonCard({
  person,
  selected,
  onSelect,
  keepLabel,
  punchesLabel,
}: {
  person: StaffDuplicatePerson;
  selected: boolean;
  onSelect: () => void;
  keepLabel: string;
  punchesLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border p-3 text-start transition-colors",
        selected ? "border-foreground bg-muted/40" : "border-border hover:bg-muted/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{displayName(person.fullName)}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{person.employeeCode}</div>
          <div className="mt-1 text-xs text-muted-foreground">{personMeta(person)}</div>
        </div>
        <div className="shrink-0 text-end">
          <div className="text-lg font-semibold tabular-nums leading-none">{person.punchCount}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{punchesLabel}</div>
        </div>
      </div>
      <div className="mt-2 h-4 text-xs font-medium">{selected ? keepLabel : null}</div>
    </button>
  );
}

export function StaffDuplicateDialog({
  anchorId,
  otherId: initialOtherId,
  anchor,
  onClose,
  onDone,
}: {
  anchorId: string;
  otherId: string | null;
  anchor?: AnchorSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [otherId, setOtherId] = useState<string | null>(initialOtherId);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [deleteChecked, setDeleteChecked] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const suggestions = useQuery({
    queryKey: ["staff-duplicate-suggest", anchorId],
    queryFn: () => suggestStaffDuplicateCandidates({ anchorId }),
    enabled: !otherId,
  });

  const search = useQuery({
    queryKey: ["staff-duplicate-search", debounced, anchorId],
    queryFn: () => searchStaffDuplicateCandidates({ query: debounced, excludeId: anchorId }),
    enabled: debounced.length >= 2 && !otherId,
  });

  const preview = useQuery({
    queryKey: ["staff-duplicate-preview", anchorId, otherId],
    queryFn: () => previewStaffDuplicatePair({ leftId: anchorId, rightId: otherId! }),
    enabled: Boolean(otherId),
  });

  const suggestedKeepId = preview.data?.suggestedKeepId ?? null;
  const previewLeftId = preview.data?.left.id ?? null;
  const previewRightId = preview.data?.right.id ?? null;
  useEffect(() => {
    if (!suggestedKeepId) return;
    setKeepId(suggestedKeepId);
    setDeleteChecked(false);
  }, [suggestedKeepId, previewLeftId, previewRightId]);

  const people = preview.data ? [preview.data.left, preview.data.right] : [];
  const keep = people.find((person) => person.id === keepId) ?? null;
  const drop = people.find((person) => person.id !== keepId) ?? null;
  const copiedKeys = keepId && preview.data ? (preview.data.copiedFieldKeysByKeepId[keepId] ?? []) : [];
  const dropHasPunches = (drop?.punchCount ?? 0) > 0;

  const onError = (error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    toast.error(duplicateErrorMessage(message, t));
  };

  const mergeMut = useMutation({
    mutationFn: () => {
      if (!keep || !drop) throw new Error("duplicate:same_person");
      return mergeStaffDuplicatePair({ keepId: keep.id, dropId: drop.id });
    },
    onSuccess: () => {
      toast.success(t("people.staff.duplicate.mergeSuccess"));
      onDone();
    },
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!drop || drop.punchCount !== 0) throw new Error(`duplicate:has_punches:${drop?.punchCount ?? 0}`);
      return deleteDuplicateStaff({ id: drop.id, confirmedPunchCount: 0 });
    },
    onSuccess: () => {
      toast.success(t("people.staff.duplicate.deleteSuccess"));
      onDone();
    },
    onError,
  });

  const pending = mergeMut.isPending || deleteMut.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("people.staff.duplicate.title")}</DialogTitle>
          <DialogDescription>{t("people.staff.duplicate.description")}</DialogDescription>
        </DialogHeader>

        {!otherId ? (
          <div className="space-y-3">
            {anchor ? (
              <div className="rounded-xl border border-border px-3 py-2 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("people.staff.duplicate.thisEmployee")}
                </div>
                <div className="mt-1 font-medium">{displayName(anchor.fullName)}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{anchor.employeeCode}</div>
                <div className="text-xs text-muted-foreground">
                  {personMeta({
                    jobTitle: anchor.jobTitle,
                    employmentType: anchor.employmentType ?? null,
                    status: anchor.status ?? null,
                    locationLabel: anchor.locationLabel,
                  })}
                </div>
              </div>
            ) : null}

            {(suggestions.data ?? []).length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("people.staff.duplicate.suggestions")}
                </p>
                <p className="text-[11px] text-muted-foreground">{t("people.staff.duplicate.suggestionsHint")}</p>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {(suggestions.data ?? []).map((row) => (
                    <CandidateButton key={row.id} row={row} onSelect={() => setOtherId(row.id)} />
                  ))}
                </div>
              </div>
            ) : null}
            {suggestions.isFetching ? (
              <p className="text-sm text-muted-foreground">{t("people.staff.duplicate.suggestionsLoading")}</p>
            ) : null}

            <div>
              <Label htmlFor="duplicate-staff-search">{t("people.staff.duplicate.otherEmployee")}</Label>
              <Input
                id="duplicate-staff-search"
                className="mt-1.5"
                value={query}
                placeholder={t("people.staff.duplicate.search")}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{t("people.staff.duplicate.searchHint")}</p>
            </div>
            {debounced.length >= 2 ? (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {search.isFetching ? (
                  <p className="px-1 text-sm text-muted-foreground">{t("people.staff.duplicate.searching")}</p>
                ) : null}
                {(search.data ?? []).map((row) => (
                  <CandidateButton key={row.id} row={row} onSelect={() => setOtherId(row.id)} />
                ))}
                {search.isSuccess && (search.data ?? []).length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">{t("people.staff.duplicate.noMatches")}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {otherId && preview.isFetching ? (
          <p className="text-sm text-muted-foreground">{t("people.staff.duplicate.loading")}</p>
        ) : null}
        {otherId && preview.isError ? (
          <p className="text-sm text-destructive">
            {duplicateErrorMessage(preview.error instanceof Error ? preview.error.message : "", t)}
          </p>
        ) : null}

        {preview.data && keep && drop ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {people.map((person) => (
                <PersonCard
                  key={person.id}
                  person={person}
                  selected={person.id === keep.id}
                  onSelect={() => {
                    setKeepId(person.id);
                    setDeleteChecked(false);
                  }}
                  keepLabel={t("people.staff.duplicate.keep")}
                  punchesLabel={t("people.staff.duplicate.punchesLabel")}
                />
              ))}
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setOtherId(null);
                setKeepId(null);
                setDeleteChecked(false);
              }}
            >
              {t("people.staff.duplicate.changeOther")}
            </button>

            {preview.data.bothHavePunches ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                {t("people.staff.duplicate.bothHaveHistory")}
              </p>
            ) : null}

            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("people.staff.duplicate.fieldsTitle")}</p>
              {copiedKeys.length ? (
                <ul className="mt-1 list-disc ps-4 text-sm">
                  {copiedKeys.map((key) => (
                    <li key={key}>{t(`people.staff.duplicate.fields.${key}`, key)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t("people.staff.duplicate.fieldsNone")}</p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">{t("people.staff.duplicate.fieldsNote")}</p>
            </div>

            {dropHasPunches ? (
              <p className="text-sm text-muted-foreground">
                {t("people.staff.duplicate.deleteBlocked", { count: drop.punchCount })}
              </p>
            ) : (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={deleteChecked}
                  onCheckedChange={(checked) => setDeleteChecked(checked === true)}
                  aria-label={t("people.staff.duplicate.deleteConfirmLabel", {
                    name: displayName(drop.fullName),
                    code: drop.employeeCode,
                    count: drop.punchCount,
                  })}
                />
                <span>
                  {t("people.staff.duplicate.deleteConfirmLabel", {
                    name: displayName(drop.fullName),
                    code: drop.employeeCode,
                    count: drop.punchCount,
                  })}
                </span>
              </label>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          {preview.data && keep && drop ? (
            <>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || dropHasPunches || !deleteChecked}
                onClick={() => deleteMut.mutate()}
              >
                {deleteMut.isPending ? t("people.staff.duplicate.deleting") : t("people.staff.duplicate.delete")}
              </Button>
              <Button type="button" disabled={pending} onClick={() => mergeMut.mutate()}>
                {mergeMut.isPending ? t("people.staff.duplicate.merging") : t("people.staff.duplicate.merge")}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
