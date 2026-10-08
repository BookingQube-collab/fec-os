"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { loadChatPushSettings, saveChatPushSettings } from "@/lib/chat/push-settings.functions";

const QUERY_KEY = ["admin", "push-settings"] as const;

export function PushAdminCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: QUERY_KEY,
    enabled: canEdit,
    queryFn: async () => {
      const result = await loadChatPushSettings({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data || hydrated) return;
    setPublicKey(settings.data.publicKey);
    setPrivateKey("");
    setEnabled(settings.data.enabled);
    setHydrated(true);
  }, [hydrated, settings.data]);

  async function save() {
    setSaving(true);
    const result = await saveChatPushSettings({ enabled, publicKey, privateKey });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPrivateKey("");
    setPublicKey(result.data.publicKey);
    setEnabled(result.data.enabled);
    queryClient.setQueryData(QUERY_KEY, result.data);
    toast.success(t("pushSettings.saved"));
  }

  if (!canEdit) return null;

  return (
    <section className="max-w-xl space-y-4 rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
      <div>
        <h2 className="text-lg font-semibold">{t("pushSettings.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("pushSettings.subtitle")}</p>
      </div>
      {settings.isLoading ? (
        <div className="flex justify-center py-8">
          <FecLoader density="page" />
        </div>
      ) : settings.isError ? (
        <p className="text-sm text-destructive">{t("pushSettings.loadError")}</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="push-public">{t("pushSettings.publicKey")}</Label>
            <Input
              id="push-public"
              name="publicKey"
              autoComplete="off"
              value={publicKey}
              onChange={(event) => setPublicKey(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("pushSettings.publicKeyHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="push-private">{t("pushSettings.privateKey")}</Label>
            <Input
              id="push-private"
              name="privateKey"
              type="password"
              autoComplete="new-password"
              value={privateKey}
              onChange={(event) => setPrivateKey(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {settings.data?.privateKeySet ? t("pushSettings.privateSet") : t("pushSettings.privateEmpty")}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="push-enabled">{t("pushSettings.enabled")}</Label>
              <p className="text-xs text-muted-foreground">{t("pushSettings.enabledHint")}</p>
            </div>
            <Switch id="push-enabled" checked={enabled} onCheckedChange={setEnabled} aria-label={t("pushSettings.enabled")} />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? t("pushSettings.saving") : t("pushSettings.save")}
          </Button>
        </form>
      )}
    </section>
  );
}
