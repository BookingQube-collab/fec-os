"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
  loadCallCenterConfigBundle,
  removeCallCenterDid,
  saveCallCenterDid,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterNumbersPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view");
  const [e164, setE164] = useState("+974");
  const [label, setLabel] = useState("");
  const [queueId, setQueueId] = useState("");
  const [ivrMenuId, setIvrMenuId] = useState("");
  const [eventId, setEventId] = useState("");

  const bundle = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  async function addDid() {
    if (!canEdit) return;
    const result = await saveCallCenterDid({
      e164,
      label,
      queueId: queueId || null,
      ivrMenuId: ivrMenuId || null,
      eventId: eventId || null,
      isActive: true,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenterAdmin.didSaved"));
    setLabel("");
    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.numbersTitle" subtitleKey="callCenter.numbersSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.numbersTitle" subtitleKey="callCenter.numbersSubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <>
          {canEdit ? (
            <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/50 bg-card p-4">
              <div className="space-y-1.5">
                <Label>{t("callCenterAdmin.e164")}</Label>
                <Input value={e164} onChange={(e) => setE164(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenterAdmin.label")}</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenterAdmin.queue")}</Label>
                <Select value={queueId || "none"} onValueChange={(v) => setQueueId(v === "none" ? "" : v)}>
                  <SelectTrigger className="w-[11rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("callCenterAdmin.none")}</SelectItem>
                    {(bundle.data?.queues ?? []).map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.ivrMenu")}</Label>
                <Select
                  value={ivrMenuId || "none"}
                  onValueChange={(v) => setIvrMenuId(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="w-[11rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("callCenterAdmin.none")}</SelectItem>
                    {(bundle.data?.menus ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.eventId")}</Label>
                <Input
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  placeholder="UUID (optional)"
                  className="w-[14rem]"
                />
              </div>
              <Button type="button" onClick={() => void addDid()}>
                <Plus className="me-1 h-4 w-4" />
                {t("callCenterAdmin.addDid")}
              </Button>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">{t("callCenter.configReadOnly")}</p>
          )}

          <ul className="space-y-2">
            {(bundle.data?.dids ?? []).map((d) => {
              const queue = bundle.data?.queues.find((q) => q.id === d.queueId);
              const menu = bundle.data?.menus.find((m) => m.id === d.ivrMenuId);
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-card px-3 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {d.e164} {d.label ? `· ${d.label}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {queue?.name ?? "—"} · IVR {menu?.name ?? "—"}
                      {d.eventId ? ` · event ${d.eventId.slice(0, 8)}…` : ""}
                      {!d.isActive ? " · inactive" : ""}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        const result = await removeCallCenterDid({ id: d.id });
                        if (!result.ok) toast.error(result.error);
                        else {
                          toast.success(t("callCenterAdmin.deleted"));
                          await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </CallCenterShell>
  );
}

export default CallCenterNumbersPage;
