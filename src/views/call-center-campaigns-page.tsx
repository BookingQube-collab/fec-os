"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterCampaignContacts,
  loadCallCenterConfigBundle,
  placeCallCenterOutbound,
  removeCallCenterCampaign,
  removeCallCenterCampaignContact,
  saveCallCenterCampaign,
  saveCallCenterCampaignContact,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterCampaignsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view");
  const [name, setName] = useState("");
  const [script, setScript] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contactE164, setContactE164] = useState("+974");
  const [contactName, setContactName] = useState("");

  const bundle = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const contacts = useQuery({
    queryKey: ["call-center", "campaign-contacts", selectedId],
    enabled: canUse && Boolean(selectedId),
    queryFn: async () => {
      const result = await loadCallCenterCampaignContacts({ campaignId: selectedId! });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.campaignsTitle" subtitleKey="callCenter.campaignsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.campaignsTitle" subtitleKey="callCenter.campaignsSubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            {canEdit ? (
              <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
                <h2 className="text-sm font-semibold">{t("callCenter.newCampaign")}</h2>
                <div className="space-y-1.5">
                  <Label>{t("callCenterAdmin.label")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.script")}</Label>
                  <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={3} />
                </div>
                <Button
                  type="button"
                  onClick={async () => {
                    const result = await saveCallCenterCampaign({
                      name,
                      status: "draft",
                      callerIdE164: bundle.data?.settings.outboundCallerIdE164 ?? "",
                      scriptText: script,
                      isActive: true,
                    });
                    if (!result.ok) toast.error(result.error);
                    else {
                      toast.success(t("callCenter.campaignSaved"));
                      setName("");
                      setScript("");
                      await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                    }
                  }}
                >
                  <Plus className="me-1 h-4 w-4" />
                  {t("callCenter.newCampaign")}
                </Button>
              </section>
            ) : null}

            <ul className="space-y-2">
              {(bundle.data?.campaigns ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2.5 text-start text-sm ${
                      selectedId === c.id
                        ? "border-primary bg-primary/5"
                        : "border-border/50 bg-card"
                    }`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      <Badge variant="secondary">{c.status}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {c.scriptText || t("callCenter.noScript")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <section className="rounded-2xl border border-border/50 bg-card p-4">
            {!selectedId ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("callCenter.pickCampaign")}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{t("callCenter.campaignContacts")}</h2>
                  {canEdit ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const result = await removeCallCenterCampaign({ id: selectedId });
                        if (!result.ok) toast.error(result.error);
                        else {
                          setSelectedId(null);
                          await queryClient.invalidateQueries({
                            queryKey: ["call-center", "config"],
                          });
                        }
                      }}
                    >
                      <Trash2 className="me-1 h-4 w-4" />
                      {t("callCenterAdmin.delete")}
                    </Button>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1.5">
                      <Label>{t("callCenterAdmin.e164")}</Label>
                      <Input value={contactE164} onChange={(e) => setContactE164(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("callCenterAdmin.label")}</Label>
                      <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                    </div>
                    <Button
                      type="button"
                      onClick={async () => {
                        const result = await saveCallCenterCampaignContact({
                          campaignId: selectedId,
                          e164: contactE164,
                          displayName: contactName,
                        });
                        if (!result.ok) toast.error(result.error);
                        else {
                          setContactName("");
                          await queryClient.invalidateQueries({
                            queryKey: ["call-center", "campaign-contacts", selectedId],
                          });
                        }
                      }}
                    >
                      {t("callCenter.addContact")}
                    </Button>
                  </div>
                ) : null}
                <ul className="divide-y divide-border/60">
                  {(contacts.data ?? []).map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <p className="font-medium">
                          {c.displayName || c.e164}{" "}
                          <span className="text-muted-foreground">{c.e164}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{c.status}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const result = await placeCallCenterOutbound({
                              toE164: c.e164,
                              campaignId: selectedId,
                            });
                            if (!result.ok) toast.error(result.error);
                            else toast.success(t("callCenter.outboundStarted"));
                          }}
                        >
                          {t("callCenter.call")}
                        </Button>
                        {canEdit ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={async () => {
                              await removeCallCenterCampaignContact({ id: c.id });
                              await queryClient.invalidateQueries({
                                queryKey: ["call-center", "campaign-contacts", selectedId],
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterCampaignsPage;
