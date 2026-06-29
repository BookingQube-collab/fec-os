"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Settings, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { grantRole, revokeRole } from "@/lib/admin.functions";
import { useAdminUsers } from "@/hooks/queries/useAdmin";
import { useSites } from "@/hooks/queries/useSites";
import { ROLE_LEVELS, type AppRole } from "@/lib/rbac";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const ROLES = Object.keys(ROLE_LEVELS) as AppRole[];

function AdminPage() {
  const { roles } = useAuth();
  const maxLevel = roles.reduce((acc, r) => Math.max(acc, r.role_level), 0);
  const canManage = maxLevel >= 95;
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
          <p className="text-xs text-muted-foreground">RBAC editor and platform configuration.</p>
        </div>
      </header>
      {maxLevel < 80 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          You need executive or regional access to view the admin module.
        </div>
      ) : (
        <RBACEditor canManage={canManage} />
      )}
    </div>
  );
}

function RBACEditor({ canManage }: { canManage: boolean }) {
          const qc = useQueryClient();
  const { data, isLoading } = useAdminUsers();
  const locsQ = useSites();

  const rolesByUser = useMemo(() => {
    const m = new Map<string, { id: string; role: AppRole; role_level: number; location_ids: string[] }[]>();
    for (const r of data?.roles ?? []) {
      const arr = m.get(r.user_id) ?? [];
      arr.push(r as never);
      m.set(r.user_id, arr);
    }
    return m;
  }, [data]);

  const grantMut = useMutation({
    mutationFn: (input: { user_id: string; role: AppRole; location_ids: string[] }) => grantRole(input),
    onSuccess: () => { toast.success("Role granted"); void qc.invalidateQueries({ queryKey: ["admin", "rbac"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeRole({ id }),
    onSuccess: () => { toast.success("Role removed"); void qc.invalidateQueries({ queryKey: ["admin", "rbac"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading users…</div>;
  }

  return (
    <div className="space-y-3">
      {!canManage ? (
        <div className="rounded-md border border-border bg-surface/30 px-3 py-2 text-xs text-muted-foreground">
          Read-only — only role level ≥ 95 (CEO/COO) can grant or revoke roles.
        </div>
      ) : null}
      <div className="space-y-3">
        {(data?.profiles ?? []).map((p) => (
          <UserRow
            key={p.id}
            profile={p}
            roles={rolesByUser.get(p.id) ?? []}
            locations={locsQ.data ?? []}
            canManage={canManage}
            onGrant={(role, location_ids) => grantMut.mutate({ user_id: p.id, role, location_ids })}
            onRevoke={(id) => revokeMut.mutate(id)}
            pending={grantMut.isPending || revokeMut.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function UserRow({
  profile, roles, locations, canManage, onGrant, onRevoke, pending,
}: {
  profile: { id: string; display_name: string | null; employee_code: string | null };
  roles: { id: string; role: AppRole; role_level: number; location_ids: string[] }[];
  locations: { id: string; code: string; name: string }[];
  canManage: boolean;
  onGrant: (role: AppRole, location_ids: string[]) => void;
  onRevoke: (id: string) => void;
  pending: boolean;
}) {
  const [role, setRole] = useState<AppRole>("duty_manager");
  const [locId, setLocId] = useState<string>("__all__");
  return (
    <div className="rounded-lg border border-border bg-surface/30 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{profile.display_name ?? "(no name)"}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{profile.employee_code ?? profile.id.slice(0, 8)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {roles.length === 0 ? <span className="text-xs text-muted-foreground">No roles</span> : null}
          {roles.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1.5">
              <Badge variant="outline" className="uppercase text-[10px]">{r.role}</Badge>
              {canManage ? (
                <button type="button" disabled={pending} onClick={() => onRevoke(r.id)} className="text-muted-foreground hover:text-rose-400 disabled:opacity-50">
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </div>
      {canManage ? (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Scope</Label>
            <Select value={locId} onValueChange={setLocId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All branches</SelectItem>
                {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => onGrant(role, locId === "__all__" ? [] : [locId])}
            >
              {pending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Grant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AdminPage;
