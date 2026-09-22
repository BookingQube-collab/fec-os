"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Shield, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/hooks/use-auth";
import { listCapabilityGrants, setRoleCapabilityGrant } from "@/lib/admin.functions";
import { listCatalogNavPages } from "@/lib/nav-config";
import { queryKeys } from "@/lib/query-keys";
import {
  CAPABILITIES,
  ROLE_LEVELS,
  canUserDo,
  type AppRole,
  type Capability,
} from "@/lib/rbac";
import { grantKey, toGrantMap, type CapabilityGrantMap } from "@/lib/rbac-grants";
import { cn } from "@/lib/utils";

const ROLES = Object.keys(ROLE_LEVELS) as AppRole[];
const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

function Forbidden() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {t("adminRoles.forbidden")}
    </div>
  );
}

export default function AdminRolesPage() {
  return (
    <CapabilityGate capability="admin.view" fallback={<Forbidden />}>
      <AdminRolesView />
    </CapabilityGate>
  );
}

function AccessToggle({
  allowed,
  disabled,
  busy,
  onToggle,
  labelAllow,
  labelDeny,
}: {
  allowed: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
  labelAllow: string;
  labelDeny: string;
}) {
  const label = allowed ? labelAllow : labelDeny;
  if (disabled) {
    return (
      <span
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          allowed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        )}
        title={label}
        aria-label={label}
      >
        {allowed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      title={label}
      aria-label={label}
      aria-pressed={allowed}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        allowed
          ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400"
          : "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-400",
        busy && "opacity-60",
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : allowed ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function AdminRolesView() {
  const { t } = useTranslation();
  const canEdit = usePermission("admin.manage_roles");
  const { refreshCapabilityGrants } = useAuth();
  const qc = useQueryClient();
  const [role, setRole] = useState<AppRole>("ceo");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pages = useMemo(() => listCatalogNavPages(), []);

  const grantsQuery = useQuery({
    queryKey: queryKeys.admin.capabilityGrants(),
    queryFn: () => listCapabilityGrants(),
  });

  const grants: CapabilityGrantMap = useMemo(
    () => toGrantMap(grantsQuery.data ?? []),
    [grantsQuery.data],
  );

  const pagesForRole = useMemo(
    () => pages.filter((p) => canUserDo([role], p.capability, grants)),
    [pages, role, grants],
  );

  const capsForRole = useMemo(
    () => ALL_CAPABILITIES.filter((c) => canUserDo([role], c, grants)),
    [role, grants],
  );

  const byDept = useMemo(() => {
    const m = new Map<string, typeof pages>();
    for (const p of pages) {
      const key = p.departmentLabelKey;
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    return [...m.entries()];
  }, [pages]);

  const toggleMutation = useMutation({
    mutationFn: setRoleCapabilityGrant,
    onMutate: (vars) => {
      setPendingKey(grantKey(vars.role as AppRole, vars.capability));
    },
    onSuccess: async (data, vars) => {
      const prev = grantsQuery.data ?? [];
      const next = data.resetToDefault
        ? prev.filter((r) => !(r.role === vars.role && r.capability === vars.capability))
        : (() => {
            const copy = [...prev];
            const idx = copy.findIndex(
              (r) => r.role === vars.role && r.capability === vars.capability,
            );
            if (idx >= 0) copy[idx] = { ...copy[idx], allowed: vars.allowed };
            else copy.push({ role: vars.role as AppRole, capability: vars.capability, allowed: vars.allowed });
            return copy;
          })();
      qc.setQueryData(queryKeys.admin.capabilityGrants(), next);
      await qc.invalidateQueries({ queryKey: queryKeys.admin.capabilityGrants() });
      await refreshCapabilityGrants();
    },
    onError: (e: Error) => {
      toast.error(e.message || t("adminRoles.saveFailed"));
    },
    onSettled: () => setPendingKey(null),
  });

  const toggle = (capability: Capability, currentlyAllowed: boolean) => {
    if (!canEdit) return;
    toggleMutation.mutate({
      role,
      capability,
      allowed: !currentlyAllowed,
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Shield}
        kicker={t("adminRoles.kicker")}
        title={t("adminRoles.title")}
        subtitle={t("adminRoles.subtitle")}
      />

      <div className="rounded-2xl border border-border/50 bg-card p-4 text-sm text-muted-foreground shadow-elevated-xs">
        <p>{canEdit ? t("adminRoles.editNote") : t("adminRoles.viewOnlyNote")}</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/admin">{t("adminRoles.assignUsers")}</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("adminRoles.selectRole")}</p>
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`roles.${r}`)} (L{ROLE_LEVELS[r]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="secondary">
          {t("adminRoles.pageCount", { count: pagesForRole.length })}
        </Badge>
        <Badge variant="outline">
          {t("adminRoles.capabilityCount", { count: capsForRole.length })}
        </Badge>
        {grantsQuery.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t("adminRoles.pagesHeading")}</h2>
        <p className="text-xs text-muted-foreground">{t("adminRoles.toggleHint")}</p>
        <div className="space-y-4">
          {byDept.map(([deptKey, items]) => (
            <div key={deptKey} className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elevated-xs">
              <div className="border-b border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(deptKey)}
              </div>
              <ul className="divide-y divide-border/40">
                {items.map((item) => {
                  const allowed = canUserDo([role], item.capability, grants);
                  const key = grantKey(role, item.capability);
                  return (
                    <li
                      key={item.href}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{t(item.labelKey)}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {item.href} · {item.capability}
                        </p>
                      </div>
                      <AccessToggle
                        allowed={allowed}
                        disabled={!canEdit}
                        busy={pendingKey === key}
                        onToggle={() => toggle(item.capability, allowed)}
                        labelAllow={t("adminRoles.clickToDeny")}
                        labelDeny={t("adminRoles.clickToAllow")}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t("adminRoles.capabilitiesHeading")}</h2>
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elevated-xs">
          <ul className="max-h-[28rem] divide-y divide-border/40 overflow-y-auto">
            {ALL_CAPABILITIES.map((cap) => {
              const allowed = canUserDo([role], cap, grants);
              const key = grantKey(role, cap);
              return (
                <li
                  key={cap}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                >
                  <p className="min-w-0 truncate font-mono text-[11px] text-foreground">{cap}</p>
                  <AccessToggle
                    allowed={allowed}
                    disabled={!canEdit}
                    busy={pendingKey === key}
                    onToggle={() => toggle(cap, allowed)}
                    labelAllow={t("adminRoles.clickToDeny")}
                    labelDeny={t("adminRoles.clickToAllow")}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t("adminRoles.allRolesHeading")}</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => {
            const n = pages.filter((p) => canUserDo([r], p.capability, grants)).length;
            return (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    r === role
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/50 bg-card hover:bg-muted/40",
                  )}
                >
                  <span className="font-medium">{t(`roles.${r}`)}</span>
                  <span className="text-xs text-muted-foreground">
                    L{ROLE_LEVELS[r]} · {n}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
