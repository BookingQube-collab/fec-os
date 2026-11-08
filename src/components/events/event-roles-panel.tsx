/* Hallmark · pre-emit critique: P4 H5 E4 S4 R5 V4 — redesign-in-place, People HR tokens */
"use client";

import { Clock3, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteEventRole,
  getEventRoleUsage,
  replaceEventRoles,
  upsertEventRole,
} from "@/lib/event-roles.functions";
import {
  DEFAULT_EVENT_ROLE_CATALOG,
  slugifyEventRoleCode,
  type EventRoleDraft,
  type EventRoleKind,
  type EventRoleRow,
} from "@/lib/events/event-roles";
import { cn } from "@/lib/utils";

type RoleDraftState = EventRoleDraft & { id?: string };

type EditDraft = {
  code: string;
  name: string;
  kind: EventRoleKind;
  default_hours_per_day: number;
  default_day_rate_qar: number | null;
  sort_order: number;
  is_active: boolean;
};

type DeleteUsage = {
  assignmentCount: number;
  slotCount: number;
  inUse: boolean;
};

function toDraft(role: EventRoleRow | EventRoleDraft): RoleDraftState {
  return {
    id: "id" in role ? role.id : undefined,
    code: role.code,
    name: role.name,
    kind: role.kind,
    default_hours_per_day: role.default_hours_per_day,
    default_day_rate_qar: role.default_day_rate_qar,
    sort_order: role.sort_order,
    is_active: role.is_active !== false,
  };
}

function toEditDraft(row: RoleDraftState): EditDraft {
  return {
    code: row.code,
    name: row.name,
    kind: row.kind,
    default_hours_per_day: row.default_hours_per_day,
    default_day_rate_qar: row.default_day_rate_qar,
    sort_order: row.sort_order,
    is_active: row.is_active !== false,
  };
}

export function EventRolesPanel({
  eventId,
  roles,
  canEdit,
  onChanged,
  onDraftChange,
  className,
}: {
  eventId?: string | null;
  roles: Array<EventRoleRow | EventRoleDraft>;
  canEdit: boolean;
  onChanged?: () => void;
  /** Create-flow: emit active drafts whenever local selection changes. */
  onDraftChange?: (drafts: EventRoleDraft[]) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<RoleDraftState[]>(() =>
    (roles.length ? roles : DEFAULT_EVENT_ROLE_CATALOG).map(toDraft),
  );
  const [customName, setCustomName] = useState("");
  const [customKind, setCustomKind] = useState<EventRoleKind>("shift");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoleDraftState | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<DeleteUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  useEffect(() => {
    if (!roles.length) return;
    setLocal(roles.map(toDraft));
  }, [roles]);

  const active = useMemo(() => local.filter((r) => r.is_active !== false), [local]);
  const shiftActiveCount = useMemo(
    () => active.filter((r) => r.kind === "shift").length,
    [active],
  );
  const labourActiveCount = useMemo(
    () => active.filter((r) => r.kind === "labour").length,
    [active],
  );

  const catalogByKind = useMemo(() => {
    const shift = DEFAULT_EVENT_ROLE_CATALOG.filter((c) => c.kind === "shift");
    const labour = DEFAULT_EVENT_ROLE_CATALOG.filter((c) => c.kind === "labour");
    return { shift, labour };
  }, []);

  const customRows = useMemo(
    () =>
      local.filter(
        (r) =>
          !DEFAULT_EVENT_ROLE_CATALOG.some((c) => c.code === r.code) && r.is_active !== false,
      ),
    [local],
  );
  const customShift = customRows.filter((r) => r.kind === "shift");
  const customLabour = customRows.filter((r) => r.kind === "labour");

  function pushLocal(next: RoleDraftState[]) {
    setLocal(next);
    onDraftChange?.(
      next
        .filter((r) => r.is_active !== false)
        .map((r, i) => ({
          code: r.code,
          name: r.name,
          kind: r.kind,
          default_hours_per_day: r.default_hours_per_day,
          default_day_rate_qar: r.default_day_rate_qar,
          sort_order: i,
          is_active: true,
        })),
    );
  }

  async function saveAll() {
    if (!canEdit || !eventId) return;
    setBusy(true);
    try {
      await replaceEventRoles({
        eventId,
        roles: active.map((r, i) => ({
          code: r.code,
          name: r.name,
          kind: r.kind,
          default_hours_per_day: r.default_hours_per_day,
          default_day_rate_qar: r.default_day_rate_qar,
          sort_order: i,
          is_active: true,
        })),
      });
      setEditingCode(null);
      setEditDraft(null);
      onChanged?.();
      toast.success(t("events.roles.toasts.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleCatalog(code: string, on: boolean) {
    const existing = local.find((r) => r.code === code);
    if (existing) {
      pushLocal(local.map((r) => (r.code === code ? { ...r, is_active: on } : r)));
      return;
    }
    if (!on) return;
    const cat = DEFAULT_EVENT_ROLE_CATALOG.find((c) => c.code === code);
    if (!cat) return;
    pushLocal([...local, { ...toDraft(cat), is_active: true }]);
  }

  async function addCustom() {
    const name = customName.trim();
    if (!name) return;
    const draft: RoleDraftState = {
      code: slugifyEventRoleCode(name),
      name,
      kind: customKind,
      default_hours_per_day: 10,
      default_day_rate_qar: null,
      sort_order: local.length,
      is_active: true,
    };
    if (!eventId) {
      pushLocal([...local, draft]);
      setCustomName("");
      return;
    }
    setBusy(true);
    try {
      await upsertEventRole({
        eventId,
        name: draft.name,
        kind: draft.kind,
        default_hours_per_day: draft.default_hours_per_day,
        default_day_rate_qar: draft.default_day_rate_qar,
        sort_order: draft.sort_order,
      });
      setCustomName("");
      onChanged?.();
      toast.success(t("events.roles.toasts.added"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateRow(code: string, patch: Partial<RoleDraftState>) {
    pushLocal(local.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  }

  function startEdit(row: RoleDraftState) {
    if (!canEdit || busy) return;
    setEditingCode(row.code);
    setEditDraft(toEditDraft(row));
  }

  function cancelEdit() {
    setEditingCode(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!canEdit || !editDraft || !editingCode) return;
    const name = editDraft.name.trim();
    if (!name) {
      toast.error(t("events.roles.nameRequired"));
      return;
    }
    const row = local.find((r) => r.code === editingCode);
    if (!row) return;

    const patch: Partial<RoleDraftState> = {
      name,
      kind: editDraft.kind,
      default_hours_per_day: editDraft.default_hours_per_day,
      default_day_rate_qar: editDraft.kind === "labour" ? editDraft.default_day_rate_qar : null,
      sort_order: editDraft.sort_order,
      is_active: editDraft.is_active,
    };

    if (!eventId || !row.id) {
      pushLocal(local.map((r) => (r.code === editingCode ? { ...r, ...patch } : r)));
      cancelEdit();
      return;
    }

    setBusy(true);
    try {
      await upsertEventRole({
        eventId,
        id: row.id,
        code: row.code,
        name: patch.name!,
        kind: patch.kind!,
        default_hours_per_day: patch.default_hours_per_day,
        default_day_rate_qar: patch.default_day_rate_qar,
        sort_order: patch.sort_order,
        is_active: patch.is_active,
      });
      cancelEdit();
      onChanged?.();
      toast.success(t("events.roles.toasts.updated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function requestDelete(row: RoleDraftState) {
    if (!canEdit || busy) return;
    setPendingDelete(row);
    setDeleteUsage(null);
    if (!eventId || !row.id) {
      setDeleteUsage({ assignmentCount: 0, slotCount: 0, inUse: false });
      return;
    }
    setUsageLoading(true);
    try {
      const usage = await getEventRoleUsage({ eventId, id: row.id });
      setDeleteUsage({
        assignmentCount: usage.assignmentCount,
        slotCount: usage.slotCount,
        inUse: usage.inUse,
      });
    } catch (e) {
      toast.error((e as Error).message);
      setPendingDelete(null);
    } finally {
      setUsageLoading(false);
    }
  }

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row || !canEdit) return;
    setPendingDelete(null);
    setDeleteUsage(null);

    if (!eventId || !row.id) {
      if (DEFAULT_EVENT_ROLE_CATALOG.some((c) => c.code === row.code)) {
        pushLocal(local.map((r) => (r.code === row.code ? { ...r, is_active: false } : r)));
      } else {
        pushLocal(local.filter((r) => r.code !== row.code));
      }
      if (editingCode === row.code) cancelEdit();
      return;
    }

    setBusy(true);
    try {
      const result = await deleteEventRole({ eventId, id: row.id });
      if (editingCode === row.code) cancelEdit();
      onChanged?.();
      if (result.inUse) {
        toast.success(
          t("events.roles.toasts.deletedInUse", {
            name: result.name,
            assignments: result.assignmentCount,
            slots: result.slotCount,
          }),
        );
      } else {
        toast.success(t("events.roles.toasts.deleted", { name: result.name }));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function renderEditForm() {
    if (!editDraft) return null;
    return (
      <div className="mt-3 grid gap-3 rounded-xl border border-border/25 bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("common.name")}
          <Input
            className="h-9"
            value={editDraft.name}
            disabled={busy}
            onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("events.roles.kindLabel")}
          <Select
            value={editDraft.kind}
            onValueChange={(v) => setEditDraft({ ...editDraft, kind: v as EventRoleKind })}
            disabled={busy}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shift">{t("events.roles.kinds.shift")}</SelectItem>
              <SelectItem value="labour">{t("events.roles.kinds.labour")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {editDraft.kind === "labour" ? (
          <>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("events.roles.hoursPerDay")}
              <Input
                type="number"
                min={1}
                max={24}
                step={0.5}
                className="h-9"
                disabled={busy}
                value={editDraft.default_hours_per_day}
                onChange={(e) =>
                  setEditDraft({
                    ...editDraft,
                    default_hours_per_day: Number(e.target.value) || 10,
                  })
                }
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("events.roles.dayRate")}
              <Input
                type="number"
                min={0}
                step={1}
                className="h-9"
                disabled={busy}
                placeholder={t("events.roles.dayRateOptional")}
                value={editDraft.default_day_rate_qar ?? ""}
                onChange={(e) =>
                  setEditDraft({
                    ...editDraft,
                    default_day_rate_qar:
                      e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
          </>
        ) : (
          <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
            {t("events.roles.sortOrder")}
            <Input
              type="number"
              min={0}
              step={1}
              className="h-9 w-full max-w-[8rem]"
              disabled={busy}
              value={editDraft.sort_order}
              onChange={(e) =>
                setEditDraft({
                  ...editDraft,
                  sort_order: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                })
              }
            />
          </label>
        )}
        {editDraft.kind === "labour" ? (
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("events.roles.sortOrder")}
            <Input
              type="number"
              min={0}
              step={1}
              className="h-9"
              disabled={busy}
              value={editDraft.sort_order}
              onChange={(e) =>
                setEditDraft({
                  ...editDraft,
                  sort_order: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                })
              }
            />
          </label>
        ) : null}
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <label className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={editDraft.is_active}
              disabled={busy}
              onCheckedChange={(v) => setEditDraft({ ...editDraft, is_active: Boolean(v) })}
            />
            {t("events.roles.active")}
          </label>
          <div className="ms-auto flex gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={cancelEdit}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={busy || !editDraft.name.trim()}
              onClick={() => void saveEdit()}
            >
              {t("common.save")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderRoleRow({
    row,
    catalog,
    selected,
  }: {
    row: RoleDraftState;
    catalog?: boolean;
    selected: boolean;
  }) {
    const isEditing = editingCode === row.code && Boolean(editDraft);
    const kind = isEditing && editDraft ? editDraft.kind : row.kind;
    const isLabour = kind === "labour";

    return (
      <div
        key={row.code}
        className={cn(
          "rounded-xl border px-3 py-2.5 transition-colors",
          selected
            ? "border-border/40 bg-card"
            : "border-transparent bg-muted/15 opacity-80",
          isEditing && "border-primary/35 bg-card",
        )}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {catalog ? (
            <Checkbox
              checked={selected}
              disabled={!canEdit || busy || isEditing}
              onCheckedChange={(v) => toggleCatalog(row.code, Boolean(v))}
              aria-label={row.name}
            />
          ) : (
            <span
              className={cn(
                "inline-flex h-4 w-4 shrink-0 rounded-full",
                isLabour ? "bg-primary/50" : "bg-foreground/35",
              )}
              aria-hidden
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{row.name}</span>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 text-[10px] font-medium",
                  isLabour
                    ? "border-primary/35 text-primary"
                    : "border-border/50 text-muted-foreground",
                )}
              >
                {isLabour ? (
                  <Wallet className="h-3 w-3" aria-hidden />
                ) : (
                  <Clock3 className="h-3 w-3" aria-hidden />
                )}
                {t(`events.roles.kinds.${kind}`)}
              </Badge>
            </div>
            {selected && isLabour && !isEditing ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.default_day_rate_qar == null
                  ? t("events.roles.metaHours", { hours: row.default_hours_per_day })
                  : `${t("events.roles.metaHours", { hours: row.default_hours_per_day })} · ${t(
                      "events.roles.metaDayRate",
                      { rate: row.default_day_rate_qar },
                    )}`}
              </p>
            ) : null}
            {selected && !isLabour && !isEditing ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{t("events.roles.shiftHint")}</p>
            ) : null}
          </div>

          {canEdit && (selected || !catalog) ? (
            <div className="ms-auto flex items-center gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={busy}
                aria-label={t("common.edit")}
                onClick={() => (isEditing ? cancelEdit() : startEdit(row))}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={busy}
                aria-label={t("common.delete")}
                onClick={() => void requestDelete(row)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
        </div>

        {selected && isLabour && !isEditing && canEdit ? (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-border/20 pt-2 ps-7">
            <label className="space-y-1 text-[11px] text-muted-foreground">
              {t("events.roles.hoursPerDay")}
              <Input
                type="number"
                min={1}
                max={24}
                step={0.5}
                className="h-8 w-24"
                disabled={busy}
                value={row.default_hours_per_day}
                onChange={(e) =>
                  updateRow(row.code, { default_hours_per_day: Number(e.target.value) || 10 })
                }
              />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              {t("events.roles.dayRate")}
              <Input
                type="number"
                min={0}
                step={1}
                className="h-8 w-28"
                disabled={busy}
                placeholder={t("events.roles.dayRateOptional")}
                value={row.default_day_rate_qar ?? ""}
                onChange={(e) =>
                  updateRow(row.code, {
                    default_day_rate_qar:
                      e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
          </div>
        ) : null}

        {isEditing ? renderEditForm() : null}
      </div>
    );
  }

  function renderKindSection(kind: EventRoleKind) {
    const catalog = kind === "shift" ? catalogByKind.shift : catalogByKind.labour;
    const customs = kind === "shift" ? customShift : customLabour;
    const Icon = kind === "labour" ? Wallet : Clock3;
    const count = kind === "shift" ? shiftActiveCount : labourActiveCount;

    return (
      <section
        key={kind}
        className="space-y-2"
        aria-labelledby={`event-roles-${kind}-heading`}
      >
        <div className="flex items-center gap-2 px-0.5">
          <Icon
            className={cn("h-4 w-4", kind === "labour" ? "text-primary" : "text-muted-foreground")}
            aria-hidden
          />
          <h3
            id={`event-roles-${kind}-heading`}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {t(`events.roles.sections.${kind}`)}
          </h3>
          <span className="text-[11px] tabular-nums text-muted-foreground/80">
            {t("events.roles.sectionCount", { count })}
          </span>
        </div>
        <div className="space-y-1.5">
          {catalog.map((cat) => {
            const row = local.find((r) => r.code === cat.code);
            const selected = Boolean(row && row.is_active !== false);
            const display = row ?? toDraft(cat);
            return renderRoleRow({
              row: { ...display, kind: row?.kind ?? cat.kind },
              catalog: true,
              selected,
            });
          })}
          {customs.map((row) => renderRoleRow({ row, selected: true }))}
        </div>
      </section>
    );
  }

  return (
    <section className={cn("space-y-4", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{t("events.roles.title")}</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">{t("events.roles.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
            <Clock3 className="h-3 w-3" aria-hidden />
            {t("events.roles.summary.shift", { count: shiftActiveCount })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-foreground">
            <Wallet className="h-3 w-3" aria-hidden />
            {t("events.roles.summary.labour", { count: labourActiveCount })}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {renderKindSection("shift")}
        {renderKindSection("labour")}
      </div>

      {canEdit ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("events.roles.addSection")}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1 space-y-1 text-xs text-muted-foreground">
              {t("events.roles.customName")}
              <Input
                className="h-9"
                placeholder={t("events.roles.customNamePlaceholder")}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addCustom();
                  }
                }}
              />
            </label>
            <label className="w-36 space-y-1 text-xs text-muted-foreground">
              {t("events.roles.kindLabel")}
              <Select
                value={customKind}
                onValueChange={(v) => setCustomKind(v as EventRoleKind)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shift">{t("events.roles.kinds.shift")}</SelectItem>
                  <SelectItem value="labour">{t("events.roles.kinds.labour")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5"
              disabled={busy || !customName.trim()}
              onClick={() => void addCustom()}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t("events.roles.addCustom")}
            </Button>
            {eventId ? (
              <Button
                size="sm"
                className="h-9"
                disabled={busy || active.length === 0}
                onClick={() => void saveAll()}
              >
                {t("events.roles.save")}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("events.roles.labourHint")}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("events.roles.labourHint")}</p>
      )}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteUsage(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("events.roles.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{t("events.roles.deleteConfirm", { name: pendingDelete?.name ?? "" })}</p>
                {usageLoading ? (
                  <p>{t("events.roles.deleteUsageLoading")}</p>
                ) : deleteUsage?.inUse ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                    {t("events.roles.deleteInUseWarning", {
                      name: pendingDelete?.name ?? "",
                      assignments: deleteUsage.assignmentCount,
                      slots: deleteUsage.slotCount,
                    })}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy || usageLoading}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || usageLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {t("events.roles.deletePermanently")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
