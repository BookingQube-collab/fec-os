"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterBlacklist,
  removeCallCenterBlacklistEntry,
  saveCallCenterBlacklistEntry,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterBlacklistPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;
  const [e164, setE164] = useState("+974");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const bundle = useQuery({
    queryKey: ["call-center", "blacklist"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterBlacklist({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.blacklistTitle" subtitleKey="callCenter.blacklistSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.blacklistTitle" subtitleKey="callCenter.blacklistSubtitle">
      {canEdit ? (
        <section className="mb-4 rounded-2xl border border-border/50 bg-card/70 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label>{t("callCenter.contactPhone")}</Label>
              <Input className="mt-1" value={e164} onChange={(e) => setE164(e.target.value)} />
            </div>
            <div>
              <Label>{t("callCenter.blacklistReason")}</Label>
              <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                disabled={pending || e164.length < 4}
                onClick={() => {
                  void (async () => {
                    setPending(true);
                    try {
                      const result = await saveCallCenterBlacklistEntry({ e164, reason, isActive: true });
                      if (!result.ok) throw new Error(result.error);
                      setReason("");
                      toast.success(t("callCenter.blacklistSaved"));
                      await queryClient.invalidateQueries({ queryKey: ["call-center", "blacklist"] });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
                    } finally {
                      setPending(false);
                    }
                  })();
                }}
              >
                {t("callCenter.blockNumber")}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">{t("callCenter.blacklistReadOnly")}</p>
      )}

      {bundle.isLoading ? (
        <div className="flex justify-center py-12">
          <FecLoader density="page" />
        </div>
      ) : (bundle.data?.entries ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("callCenter.blacklistEmpty")}
        </p>
      ) : (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/60">
          {(bundle.data?.entries ?? []).map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{entry.e164}</p>
                <p className="text-sm text-muted-foreground">
                  {entry.reason || t("callCenter.noReason")}
                  {!entry.isActive ? ` · ${t("callCenter.inactive")}` : ""}
                </p>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    void (async () => {
                      const result = await removeCallCenterBlacklistEntry({ id: entry.id });
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(t("callCenter.blacklistRemoved"));
                      await queryClient.invalidateQueries({ queryKey: ["call-center", "blacklist"] });
                    })();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </CallCenterShell>
  );
}

export default CallCenterBlacklistPage;
