"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useCallCenterSoftphoneOptional } from "@/components/call-center/softphone-provider";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterAgentPerformance,
  saveCallCenterAgentExtension,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterAgentsPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const softphone = useCallCenterSoftphoneOptional();
  const queryClient = useQueryClient();
  const canUse = canUserDo(
    roles.map((r) => r.role),
    "call_center.view",
  );
  const [extension, setExtension] = useState("");
  const [pending, setPending] = useState(false);

  const perf = useQuery({
    queryKey: ["call-center", "agent-performance"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterAgentPerformance({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 20_000,
  });

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.agentsTitle" subtitleKey="callCenter.agentsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const myRow = (perf.data?.rows ?? []).find((r) => r.userId === user?.id);

  return (
    <CallCenterShell titleKey="callCenter.agentsTitle" subtitleKey="callCenter.agentsSubtitle">
      <section className="mb-4 rounded-2xl border border-border/50 bg-card/70 p-4">
        <p className="text-sm font-semibold">{t("callCenter.myExtension")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("callCenter.extensionHint")}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label>{t("callCenter.extension")}</Label>
            <Input
              className="mt-1 w-32 font-mono"
              value={extension || myRow?.extension || ""}
              onChange={(e) => setExtension(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="101"
            />
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              void (async () => {
                setPending(true);
                try {
                  const result = await saveCallCenterAgentExtension({
                    extension: extension || myRow?.extension || "",
                  });
                  if (!result.ok) throw new Error(result.error);
                  toast.success(t("callCenter.extensionSaved"));
                  await queryClient.invalidateQueries({ queryKey: ["call-center", "agent-performance"] });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
                } finally {
                  setPending(false);
                }
              })();
            }}
          >
            {t("callCenter.saveExtension")}
          </Button>
        </div>
      </section>

      {perf.isLoading ? (
        <div className="flex justify-center py-12">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("callCenter.agentCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.extension")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.statusCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.handledCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.answeredCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.missedCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.ahtCol")}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(perf.data?.rows ?? []).map((row) => (
                <tr key={row.userId} className="border-t border-border/40">
                  <td className="px-3 py-2 font-mono text-xs">{row.userId.slice(0, 8)}…</td>
                  <td className="px-3 py-2 font-mono">{row.extension || "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{t(`callCenter.status.${row.status}`)}</Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.callsHandled}</td>
                  <td className="px-3 py-2 tabular-nums">{row.answered}</td>
                  <td className="px-3 py-2 tabular-nums">{row.missed}</td>
                  <td className="px-3 py-2 tabular-nums">{row.avgHandleSeconds}s</td>
                  <td className="px-3 py-2">
                    {row.extension && softphone?.canUse && row.userId !== user?.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => softphone.onDial(row.extension)}
                      >
                        {t("callCenter.dialExt")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterAgentsPage;
