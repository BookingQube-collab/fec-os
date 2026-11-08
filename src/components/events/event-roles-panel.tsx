"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { replaceEventRoles, upsertEventRole } from "@/lib/event-roles.functions";
import {
  DEFAULT_EVENT_ROLE_CATALOG,
  slugifyEventRoleCode,
  type EventRoleDraft,
  type EventRoleKind,
  type EventRoleRow,
} from "@/lib/events/event-roles";

type RoleDraftState = EventRoleDraft & { id?: string };

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

  const customRows = local.filter(
    (r) => !DEFAULT_EVENT_ROLE_CATALOG.some((c) => c.code === r.code) && r.is_active !== false,
  );

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
          return (
            <div
              key={cat.code}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border/30 px-3 py-2"
            >
              <Checkbox
                checked={on}
                disabled={!canEdit || busy}
                onCheckedChange={(v) => toggleCatalog(cat.code, Boolean(v))}
                aria-label={cat.name}
              />
              <span className="min-w-[9rem] text-sm font-medium">{cat.name}</span>
              <Badge variant="outline" className="text-[10px]">
                {t(`events.roles.kinds.${cat.kind}`)}
              </Badge>
              {cat.kind === "labour" && on ? (
                <>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    className="h-8 w-24"
                    disabled={!canEdit || busy}
                    value={row?.default_hours_per_day ?? 10}
                    onChange={(e) =>
                      updateRow(cat.code, {
                        default_hours_per_day: Number(e.target.value) || 10,
                      })
                    }
                    aria-label={t("events.roles.hoursPerDay")}
                  />
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="h-8 w-28"
                    disabled={!canEdit || busy}
                    placeholder={t("events.roles.dayRateOptional")}
                    value={row?.default_day_rate_qar ?? ""}
                    onChange={(e) =>
                      updateRow(cat.code, {
                        default_day_rate_qar:
                          e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    aria-label={t("events.roles.dayRate")}
                  />
                </>
              ) : null}
            </div>
          );
        })}
        {customRows.map((row) => (
          <div
            key={row.code}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border/30 px-3 py-2"
          >
            <span className="min-w-[9rem] text-sm font-medium">{row.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {t(`events.roles.kinds.${row.kind}`)}
            </Badge>
            {row.kind === "labour" ? (
              <>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  className="h-8 w-24"
                  disabled={!canEdit || busy}
                  value={row.default_hours_per_day}
                  onChange={(e) =>
                    updateRow(row.code, {
                      default_hours_per_day: Number(e.target.value) || 10,
                    })
                  }
                />
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-28"
                  disabled={!canEdit || busy}
                  placeholder={t("events.roles.dayRateOptional")}
                  value={row.default_day_rate_qar ?? ""}
                  onChange={(e) =>
                    updateRow(row.code, {
                      default_day_rate_qar:
                        e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </>
            ) : null}
            {canEdit ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => updateRow(row.code, { is_active: false })}
              >
                {t("common.remove")}
              </Button>
            ) : null}
          </div>
        ))}
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
    </section>
  );
}
