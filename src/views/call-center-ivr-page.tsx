"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { IvrFlowCanvas } from "@/components/call-center/ivr-flow/ivr-canvas";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  applyCallCenterFecVenuesIvrTemplate,
  loadCallCenterConfigBundle,
  removeCallCenterIvrMenu,
  saveCallCenterIvrFlow,
  saveCallCenterIvrMenu,
} from "@/lib/call-center/call-center.functions";
import {
  buildFlowFromMenuAndOptions,
  flowHasGraph,
  parseIvrFlowJson,
  type IvrFlowJson,
} from "@/lib/call-center/ivr-flow";
import { CALL_CENTER_DEFAULT_IVR_MENU_ID } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterIvrPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view");

  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  const [newMenuName, setNewMenuName] = useState("");
  const [saving, setSaving] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const bundle = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const menus = bundle.data?.menus ?? [];
  const options = bundle.data?.options ?? [];
  const queues = bundle.data?.queues ?? [];
  const agents = useMemo(() => {
    const fromStatus = (bundle.data?.agents ?? []).map((a) => ({
      userId: a.userId,
      label: `${a.userId.slice(0, 8)}… (${a.status})`,
    }));
    if (fromStatus.length > 0) return fromStatus;
    const seen = new Set<string>();
    const fromMembers: Array<{ userId: string; label: string }> = [];
    for (const m of bundle.data?.members ?? []) {
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      fromMembers.push({ userId: m.userId, label: `${m.userId.slice(0, 8)}…` });
    }
    return fromMembers;
  }, [bundle.data?.agents, bundle.data?.members]);

  const activeMenuId =
    selectedMenuId ||
    menus.find((m) => m.id === CALL_CENTER_DEFAULT_IVR_MENU_ID)?.id ||
    menus[0]?.id ||
    "";

  const activeMenu = menus.find((m) => m.id === activeMenuId) ?? null;

  const initialFlow: IvrFlowJson = useMemo(() => {
    if (!activeMenu) {
      return { version: 1, nodes: [], edges: [] };
    }
    if (flowHasGraph(activeMenu.flowJson)) {
      return parseIvrFlowJson(activeMenu.flowJson);
    }
    const menuOptions = options.filter((o) => o.menuId === activeMenu.id);
    return buildFlowFromMenuAndOptions(activeMenu, menuOptions);
  }, [activeMenu, options]);

  async function createMenu() {
    if (!newMenuName.trim()) {
      toast.error(t("callCenter.pickMenu"));
      return;
    }
    const result = await saveCallCenterIvrMenu({
      name: newMenuName.trim(),
      greetingText: "Thank you for calling.",
      timeoutSeconds: 10,
      maxRetries: 2,
      fallbackQueueId: queues[0]?.id ?? null,
      isActive: true,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.ivrMenuSaved"));
    setNewMenuName("");
    setSelectedMenuId(result.data.id);
    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
  }

  async function handleSaveFlow(flow: IvrFlowJson) {
    if (!activeMenu) return;
    setSaving(true);
    try {
      const start = flow.nodes.find((n) => n.type === "start");
      const result = await saveCallCenterIvrFlow({
        menuId: activeMenu.id,
        name: activeMenu.name,
        greetingText:
          start?.data.greetingEn ||
          start?.data.greetingText ||
          activeMenu.greetingText,
        fallbackQueueId: activeMenu.fallbackQueueId,
        isActive: activeMenu.isActive,
        flow,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("callCenter.ivrFlowSaved"));
      await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyVenuesTemplate() {
    if (!activeMenu) return;
    setApplyingTemplate(true);
    try {
      const result = await applyCallCenterFecVenuesIvrTemplate({ menuId: activeMenu.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("FEC venues IVR template applied (EN/AR → venues → queues).");
      await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
    } finally {
      setApplyingTemplate(false);
    }
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.ivrTitle" subtitleKey="callCenter.ivrSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.ivrTitle" subtitleKey="callCenter.ivrSubtitle" dense>
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] space-y-1.5">
              <Label>{t("callCenter.ivrMenu")}</Label>
              <Select
                value={activeMenuId || "none"}
                onValueChange={(v) => setSelectedMenuId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {menus.length === 0 ? (
                    <SelectItem value="none">{t("callCenterAdmin.none")}</SelectItem>
                  ) : null}
                  {menus.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canEdit ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label>{t("callCenter.addIvrMenu")}</Label>
                  <Input
                    value={newMenuName}
                    onChange={(e) => setNewMenuName(e.target.value)}
                    placeholder="New menu name"
                    className="w-48"
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => void createMenu()}>
                  {t("callCenter.addIvrMenu")}
                </Button>
                {activeMenu ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      const result = await removeCallCenterIvrMenu({ id: activeMenu.id });
                      if (!result.ok) toast.error(result.error);
                      else {
                        toast.success(t("callCenterAdmin.deleted"));
                        setSelectedMenuId("");
                        await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                      }
                    }}
                  >
                    {t("callCenterAdmin.delete")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("callCenter.configReadOnly")}</p>
            )}
          </div>

          {activeMenu ? (
            <IvrFlowCanvas
              key={activeMenu.id}
              initialFlow={initialFlow}
              queues={queues.map((q) => ({ id: q.id, name: q.name }))}
              agents={agents}
              canEdit={canEdit}
              saving={saving}
              applyingTemplate={applyingTemplate}
              onSave={handleSaveFlow}
              onApplyVenuesTemplate={canEdit ? handleApplyVenuesTemplate : undefined}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              {t("callCenter.ivrEmpty")}
            </p>
          )}
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterIvrPage;
