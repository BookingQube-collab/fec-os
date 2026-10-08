"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader, FecPageHeader } from "@/components/fec";
import { PushAdminCard } from "@/components/chat/push-admin-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { loadChatLiveKitSettings, saveChatLiveKitSettings } from "@/lib/chat/livekit-settings.functions";
import { canUserDo } from "@/lib/rbac";

const QUERY_KEY = ["admin", "livekit-settings"] as const;

function AdminLiveKitPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((role) => role.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;
  const settings = useQuery({
    queryKey: QUERY_KEY,
    enabled: canEdit,
    queryFn: async () => {
      const result = await loadChatLiveKitSettings({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data || hydrated) return;
    setServerUrl(settings.data.serverUrl);
    setEnabled(settings.data.enabled);
    setApiKey("");
    setApiSecret("");
    setHydrated(true);
  }, [hydrated, settings.data]);

  async function save() {
    setSaving(true);
    const result = await saveChatLiveKitSettings({ enabled, serverUrl, apiKey, apiSecret });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setApiKey("");
    setApiSecret("");
    setServerUrl(result.data.serverUrl);
    setEnabled(result.data.enabled);
    queryClient.setQueryData(QUERY_KEY, result.data);
    toast.success(t("livekitSettings.saved"));
  }

  return (
    <div className="space-y-5">
      <FecPageHeader
        icon={Phone}
        kicker={t("livekitSettings.kicker")}
        title={t("livekitSettings.title")}
        subtitle={t("livekitSettings.subtitle")}
      />
      {!canEdit ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("livekitSettings.forbidden")}
        </p>
      ) : settings.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : settings.isError ? (
        <p className="text-sm text-destructive">{t("livekitSettings.loadError")}</p>
      ) : (
        <form
          className="max-w-xl space-y-4 rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="livekit-url">{t("livekitSettings.serverUrl")}</Label>
            <Input
              id="livekit-url"
              name="serverUrl"
              inputMode="url"
              autoComplete="off"
              placeholder="wss://"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("livekitSettings.serverUrlHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="livekit-key">{t("livekitSettings.apiKey")}</Label>
            <Input
              id="livekit-key"
              name="apiKey"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {settings.data?.keyLast4
                ? t("livekitSettings.keyLast4", { last4: settings.data.keyLast4 })
                : t("livekitSettings.keyEmpty")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="livekit-secret">{t("livekitSettings.apiSecret")}</Label>
            <Input
              id="livekit-secret"
              name="apiSecret"
              type="password"
              autoComplete="new-password"
              value={apiSecret}
              onChange={(event) => setApiSecret(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {settings.data?.secretSet ? t("livekitSettings.secretSet") : t("livekitSettings.secretEmpty")}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="livekit-enabled">{t("livekitSettings.enabled")}</Label>
              <p className="text-xs text-muted-foreground">{t("livekitSettings.enabledHint")}</p>
            </div>
            <Switch id="livekit-enabled" checked={enabled} onCheckedChange={setEnabled} aria-label={t("livekitSettings.enabled")} />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? t("livekitSettings.saving") : t("livekitSettings.save")}
          </Button>
        </form>
      )}
      <PushAdminCard canEdit={canEdit} />
    </div>
  );
}

export default AdminLiveKitPage;
