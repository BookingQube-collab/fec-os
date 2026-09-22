"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Shield, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listCatalogNavPages } from "@/lib/nav-config";
import {
  CAPABILITIES,
  ROLE_LEVELS,
  canUserDo,
  type AppRole,
  type Capability,
} from "@/lib/rbac";
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

function AdminRolesView() {
  const { t } = useTranslation();
  const [role, setRole] = useState<AppRole>("ceo");
  const pages = useMemo(() => listCatalogNavPages(), []);

  const pagesForRole = useMemo(
    () => pages.filter((p) => canUserDo([role], p.capability)),
    [pages, role],
  );

  const capsForRole = useMemo(
    () => ALL_CAPABILITIES.filter((c) => canUserDo([role], c)),
    [role],
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

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Shield}
        kicker={t("adminRoles.kicker")}
        title={t("adminRoles.title")}
        subtitle={t("adminRoles.subtitle")}
      />

      <div className="rounded-2xl border border-border/50 bg-card p-4 text-sm text-muted-foreground shadow-elevated-xs">
        <p>{t("adminRoles.codeMapNote")}</p>
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
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t("adminRoles.pagesHeading")}</h2>
        <div className="space-y-4">
          {byDept.map(([deptKey, items]) => (
            <div key={deptKey} className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elevated-xs">
              <div className="border-b border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(deptKey)}
              </div>
              <ul className="divide-y divide-border/40">
                {items.map((item) => {
                  const allowed = canUserDo([role], item.capability);
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
                      <span
                        className={cn(
                          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          allowed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                        )}
                        title={allowed ? t("adminRoles.allowed") : t("adminRoles.denied")}
                        aria-label={allowed ? t("adminRoles.allowed") : t("adminRoles.denied")}
                      >
                        {allowed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      </span>
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
        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
          {capsForRole.map((cap) => (
            <Badge key={cap} variant="outline" className="font-mono text-[11px] font-normal">
              {cap}
            </Badge>
          ))}
          {capsForRole.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("adminRoles.noCapabilities")}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t("adminRoles.allRolesHeading")}</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => {
            const n = pages.filter((p) => canUserDo([r], p.capability)).length;
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
