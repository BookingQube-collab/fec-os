"use client";

import { Pencil, Trash2 } from "lucide-react";
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
}: {
  eventId?: string | null;
  roles: Array<EventRoleRow | EventRoleDraft>;
  canEdit: boolean;
  onChanged?: () => void;
  /** Create-flow: emit active drafts whenever local selection changes. */
  onDraftChange?: (drafts: EventRoleDraft[]) => void;
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

  useEffect(() => {
    if (!roles.length) return;
    setLocal(roles.map(toDraft));
  }, [roles]);

  const active = useMemo(() => local.filter((r) => r.is_active !== false), [local]);

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

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row || !canEdit) return;
    setPendingDelete(null);

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
      if (result.mode === "deactivated") {
        toast.success(
          t("events.roles.toasts.deactivatedInUse", {
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

  const customRows = local.filter(
    (r) => !DEFAULT_EVENT_ROLE_CATALOG.some((c) => c.code === r.code) && r.is_active !== false,
  );

  function renderLabourFields(
    kind: EventRoleKind,
    hours: number,
    dayRate: number | null,
    onHours: (v: number) => void,
    onDayRate: (v: number | null) => void,
    disabled: boolean,
  ) {
    if (kind !== "labour") return null;
    return (
      <>
        <Input
          type="number"
          min={1}
          max={24}
          step={0.5}
          className="h-8 w-24"
          disabled={disabled}
          value={hours}
          onChange={(e) => onHours(Number(e.target.value) || 10)}
          aria-label={t("events.roles.hoursPerDay")}
        />
        <Input
          type="number"
          min={0}
          step={1}
          className="h-8 w-28"
          disabled={disabled}
          placeholder={t("events.roles.dayRateOptional")}
          value={dayRate ?? ""}
          onChange={(e) =>
            onDayRate(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))
          }
          aria-label={t("events.roles.dayRate")}
        />
      </>
    );
  }

  function renderEditForm() {
    if (!editDraft) return null;
    return (
      <div className="mt-2 flex w-full flex-wrap items-end gap-2 border-t border-border/20 pt-2">
        <Input
          className="h-8 w-44"
          value={editDraft.name}
          disabled={busy}
          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
          aria-label={t("common.name")}
        />
        <Select
          value={editDraft.kind}
          onValueChange={(v) => setEditDraft({ ...editDraft, kind: v as EventRoleKind })}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shift">{t("events.roles.kinds.shift")}</SelectItem>
            <SelectItem value="labour">{t("events.roles.kinds.labour")}</SelectItem>
          </SelectContent>
        </Select>
        {renderLabourFields(
          editDraft.kind,
          editDraft.default_hours_per_day,
          editDraft.default_day_rate_qar,
          (v) => setEditDraft({ ...editDraft, default_hours_per_day: v }),
          (v) => setEditDraft({ ...editDraft, default_day_rate_qar: v }),
          busy,
        )}
        <Input
          type="number"
          min={0}
          step={1}
          className="h-8 w-20"
          disabled={busy}
          value={editDraft.sort_order}
          onChange={(e) =>
            setEditDraft({
              ...editDraft,
              sort_order: Math.max(0, Math.floor(Number(e.target.value) || 0)),
            })
          }
          aria-label={t("events.roles.sortOrder")}
          title={t("events.roles.sortOrder")}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={editDraft.is_active}
            disabled={busy}
            onCheckedChange={(v) => setEditDraft({ ...editDraft, is_active: Boolean(v) })}
          />
          {t("events.roles.active")}
        </label>
        <Button size="sm" disabled={busy || !editDraft.name.trim()} onClick={() => void saveEdit()}>
          {t("common.save")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={cancelEdit}>
          {t("common.cancel")}
        </Button>
      </div>
    );
  }

  function renderRowActions(row: RoleDraftState | undefined, enabled: boolean) {
    if (!canEdit || !row || !enabled) return null;
    const isEditing = editingCode === row.code;
    return (
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
          className="h-8 w-8 text-destructive hover:text-destructive"
          disabled={busy}
          aria-label={t("common.delete")}
          onClick={() => setPendingDelete(row)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{t("events.roles.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("events.roles.hint")}</p>
      </div>

      <div className="mb-4 space-y-2">
        {DEFAULT_EVENT_ROLE_CATALOG.map((cat) => {
          const row = local.find((r) => r.code === cat.code);
          const on = Boolean(row && row.is_active !== false);
          const isEditing = editingCode === cat.code && Boolean(editDraft);
          const displayKind = isEditing && editDraft ? editDraft.kind : (row?.kind ?? cat.kind);
          return (
            <div
              key={cat.code}
              className="rounded-xl border border-border/30 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={on}
                  disabled={!canEdit || busy || isEditing}
                  onCheckedChange={(v) => toggleCatalog(cat.code, Boolean(v))}
                  aria-label={cat.name}
                />
                <span className="min-w-[9rem] text-sm font-medium">{row?.name ?? cat.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {t(`events.roles.kinds.${displayKind}`)}
                </Badge>
                {!isEditing && on
                  ? renderLabourFields(
                      row?.kind ?? cat.kind,
                      row?.default_hours_per_day ?? 10,
                      row?.default_day_rate_qar ?? null,
                      (v) => updateRow(cat.code, { default_hours_per_day: v }),
                      (v) => updateRow(cat.code, { default_day_rate_qar: v }),
                      !canEdit || busy,
                    )
                  : null}
                {renderRowActions(row ?? { ...toDraft(cat), is_active: on }, on || Boolean(row))}
              </div>
              {isEditing ? renderEditForm() : null}
            </div>
          );
        })}
        {customRows.map((row) => {
          const isEditing = editingCode === row.code && Boolean(editDraft);
          return (
            <div
              key={row.code}
              className="rounded-xl border border-border/30 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-[9rem] text-sm font-medium">{row.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {t(`events.roles.kinds.${isEditing && editDraft ? editDraft.kind : row.kind}`)}
                </Badge>
                {!isEditing
                  ? renderLabourFields(
                      row.kind,
                      row.default_hours_per_day,
                      row.default_day_rate_qar,
                      (v) => updateRow(row.code, { default_hours_per_day: v }),
                      (v) => updateRow(row.code, { default_day_rate_qar: v }),
                      !canEdit || busy,
                    )
                  : null}
                {renderRowActions(row, true)}
              </div>
              {isEditing ? renderEditForm() : null}
            </div>
          );
        })}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            className="h-9 w-44"
            placeholder={t("events.roles.customName")}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <Select value={customKind} onValueChange={(v) => setCustomKind(v as EventRoleKind)}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shift">{t("events.roles.kinds.shift")}</SelectItem>
              <SelectItem value="labour">{t("events.roles.kinds.labour")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !customName.trim()}
            onClick={() => void addCustom()}
          >
            {t("events.roles.addCustom")}
          </Button>
          {eventId ? (
            <Button size="sm" disabled={busy || active.length === 0} onClick={() => void saveAll()}>
              {t("events.roles.save")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{t("events.roles.labourHint")}</p>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("events.roles.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("events.roles.deleteConfirm", { name: pendingDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
