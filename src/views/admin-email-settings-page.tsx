"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import {
  loadAppEmailSettings,
  saveAppEmailSettings,
  testAppEmailSettings,
} from "@/lib/email/settings.functions";
import { canUserDo } from "@/lib/rbac";

const QUERY_KEY = ["admin", "email-settings"] as const;

function AdminEmailSettingsPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((role) => role.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;
  const settings = useQuery({
    queryKey: QUERY_KEY,
    enabled: canEdit,
    queryFn: async () => {
      const result = await loadAppEmailSettings({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
  const [fromAddress, setFromAddress] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState<"resend" | "webhook" | null>(null);

  useEffect(() => {
    if (!settings.data || hydrated) return;
    setFromAddress(settings.data.fromAddress);
    setEnabled(settings.data.enabled);
    setResendApiKey("");
    setWebhookUrl("");
    setTestTo(user?.email?.trim() ?? "");
    setHydrated(true);
  }, [hydrated, settings.data, user?.email]);

  async function save(opts?: { clearResendKey?: boolean; clearWebhook?: boolean }) {
    setSaving(true);
    if (opts?.clearResendKey) setClearing("resend");
    if (opts?.clearWebhook) setClearing("webhook");
    const result = await saveAppEmailSettings({
      enabled,
      fromAddress,
      resendApiKey: opts?.clearResendKey || opts?.clearWebhook ? "" : resendApiKey,
      webhookUrl: opts?.clearResendKey || opts?.clearWebhook ? "" : webhookUrl,
      clearResendKey: opts?.clearResendKey,
      clearWebhook: opts?.clearWebhook,
    });
    setSaving(false);
    setClearing(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setResendApiKey("");
    setWebhookUrl("");
    setFromAddress(result.data.fromAddress);
    setEnabled(result.data.enabled);
    queryClient.setQueryData(QUERY_KEY, result.data);
    toast.success(
      opts?.clearResendKey
        ? t("emailSettings.resendCleared")
        : opts?.clearWebhook
          ? t("emailSettings.webhookCleared")
          : t("emailSettings.saved"),
    );
  }

  async function sendTest() {
    setTesting(true);
    const result = await testAppEmailSettings({ to: testTo.trim() });
    setTesting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (!result.data.sent) {
      toast.error(result.data.reason || t("emailSettings.testFailed"));
      return;
    }
    toast.success(t("emailSettings.testSent"));
  }

  return (
    <div className="space-y-5">
      <FecPageHeader
        icon={Mail}
        kicker={t("emailSettings.kicker")}
        title={t("emailSettings.title")}
        subtitle={t("emailSettings.subtitle")}
      />
      {!canEdit ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("emailSettings.forbidden")}
        </p>
      ) : settings.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : settings.isError ? (
        <p className="text-sm text-destructive">{t("emailSettings.loadError")}</p>
      ) : (
        <>
          {!settings.data?.managed && settings.data?.envProviderAvailable ? (
            <p className="rounded-2xl border border-border/50 bg-card px-4 py-3 text-sm text-muted-foreground shadow-elevated-xs">
              {t("emailSettings.envFallbackHint")}
            </p>
          ) : null}
          <form
            className="max-w-xl space-y-4 rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="email-enabled">{t("emailSettings.enabled")}</Label>
                <p className="text-xs text-muted-foreground">{t("emailSettings.enabledHint")}</p>
              </div>
              <Switch
                id="email-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label={t("emailSettings.enabled")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-from">{t("emailSettings.fromAddress")}</Label>
              <Input
                id="email-from"
                name="fromAddress"
                type="text"
                autoComplete="off"
                placeholder="noreply@fec.qa"
                value={fromAddress}
                onChange={(event) => setFromAddress(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("emailSettings.fromAddressHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-resend">{t("emailSettings.resendApiKey")}</Label>
              <Input
                id="email-resend"
                name="resendApiKey"
                type="password"
                autoComplete="new-password"
                value={resendApiKey}
                onChange={(event) => setResendApiKey(event.target.value)}
                placeholder={t("emailSettings.resendPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {settings.data?.resendKeySet
                  ? t("emailSettings.resendLast4", { last4: settings.data.resendKeyLast4 })
                  : t("emailSettings.resendEmpty")}
              </p>
              {settings.data?.resendKeySet ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void save({ clearResendKey: true })}
                >
                  {clearing === "resend" ? t("emailSettings.clearing") : t("emailSettings.clearResend")}
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-webhook">{t("emailSettings.webhookUrl")}</Label>
              <Input
                id="email-webhook"
                name="webhookUrl"
                type="password"
                autoComplete="new-password"
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                placeholder="https://"
              />
              <p className="text-xs text-muted-foreground">
                {settings.data?.webhookSet
                  ? t("emailSettings.webhookSet", { host: settings.data.webhookHint })
                  : t("emailSettings.webhookEmpty")}
              </p>
              {settings.data?.webhookSet ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void save({ clearWebhook: true })}
                >
                  {clearing === "webhook" ? t("emailSettings.clearing") : t("emailSettings.clearWebhook")}
                </Button>
              ) : null}
            </div>
            <Button type="submit" disabled={saving}>
              {saving && !clearing ? t("emailSettings.saving") : t("emailSettings.save")}
            </Button>
          </form>

          <div className="max-w-xl space-y-4 rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
            <div>
              <p className="text-sm font-semibold text-foreground">{t("emailSettings.testTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("emailSettings.testHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-test-to">{t("emailSettings.testTo")}</Label>
              <Input
                id="email-test-to"
                name="testTo"
                type="email"
                autoComplete="email"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
              />
            </div>
            <Button type="button" variant="outline" disabled={testing || !testTo.trim()} onClick={() => void sendTest()}>
              {testing ? t("emailSettings.testing") : t("emailSettings.testSend")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminEmailSettingsPage;
