"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterConfigBundle,
  saveCallCenterSettings,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterAiPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;

  const bundle = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const [firstAnswer, setFirstAnswer] = useState(false);
  const [handoff, setHandoff] = useState(true);
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bundle.data || hydrated) return;
    setFirstAnswer(bundle.data.settings.aiFirstAnswerEnabled);
    setHandoff(bundle.data.settings.aiHandoffEnabled);
    setNotes(bundle.data.settings.aiNotes);
    setHydrated(true);
  }, [bundle.data, hydrated]);

  async function save() {
    if (!bundle.data) return;
    const s = bundle.data.settings;
    setSaving(true);
    const result = await saveCallCenterSettings({
      enabled: s.enabled,
      ivrEnabled: s.ivrEnabled,
      businessHoursEnabled: s.businessHoursEnabled,
      businessHoursJson: s.businessHoursJson,
      timezone: s.timezone,
      defaultQueueId: s.defaultQueueId,
      telnyxSipUri: s.telnyxSipUri,
      telnyxConnectionId: s.telnyxConnectionId,
      telnyxApiKey: "",
      telnyxWebhookSecret: "",
      livekitSipTrunkId: s.livekitSipTrunkId,
      livekitSipDispatchRuleId: s.livekitSipDispatchRuleId,
      webhookSharedSecret: "",
      notes: s.notes,
      aiFirstAnswerEnabled: firstAnswer,
      aiHandoffEnabled: handoff,
      aiNotes: notes,
      outboundCallerIdE164: s.outboundCallerIdE164,
      webhookOutboundUrl: s.webhookOutboundUrl,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.aiSaved"));
    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.aiTitle" subtitleKey="callCenter.aiSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.aiTitle" subtitleKey="callCenter.aiSubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-sm text-muted-foreground">{t("callCenter.aiStubBody")}</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>{t("callCenter.aiFirstAnswer")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenter.aiFirstAnswerHint")}</p>
              </div>
              <Switch
                checked={firstAnswer}
                onCheckedChange={setFirstAnswer}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>{t("callCenter.aiHandoff")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenter.aiHandoffHint")}</p>
              </div>
              <Switch checked={handoff} onCheckedChange={setHandoff} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.aiNotes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                disabled={!canEdit}
              />
            </div>
            {canEdit ? (
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? t("callCenterAdmin.saving") : t("callCenterAdmin.save")}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t("callCenter.configReadOnly")}</p>
            )}
          </section>
          <pre className="overflow-x-auto rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            {`// LiveKit Agents dispatch stub (wire when Agents project is ready)
// if (settings.ai_first_answer_enabled) {
//   await agents.dispatch({ room: call.livekitRoom, handoff: settings.ai_handoff_enabled });
// }`}
          </pre>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterAiPage;
