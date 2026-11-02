"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import {
  applySmtpPreset,
  isSmtpAuthFailure,
  mailgunRegionHint,
  mailgunSmtpPasswordHint,
  mailgunUsernameHint,
  type EmailProvider,
  type SmtpAuthDiagnostics,
  type SmtpEncryption,
  type SmtpPreset,
} from "@/lib/email/outbound-config";
import {
  loadAppEmailSettings,
  saveAppEmailSettings,
  testAppEmailSettings,
  testAppSmtpConnection,
} from "@/lib/email/settings.functions";
import { canUserDo } from "@/lib/rbac";

const QUERY_KEY = ["admin", "email-settings"] as const;

type ClearKind = "resend" | "smtpPassword" | "webhook" | null;

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
  const [provider, setProvider] = useState<EmailProvider>("smtp");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [smtpPreset, setSmtpPreset] = useState<SmtpPreset>("mailgun_eu");
  const [smtpHost, setSmtpHost] = useState("smtp.eu.mailgun.org");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpEncryption, setSmtpEncryption] = useState<SmtpEncryption>("tls");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [clearing, setClearing] = useState<ClearKind>(null);

  useEffect(() => {
    if (!settings.data || hydrated) return;
    setProvider(settings.data.provider);
    setFromAddress(settings.data.fromAddress);
    setFromName(settings.data.fromName);
    setEnabled(settings.data.enabled);
    setSmtpPreset(settings.data.smtpPreset);
    setSmtpHost(settings.data.smtpHost || (settings.data.smtpPreset !== "custom"
      ? applySmtpPreset(settings.data.smtpPreset)?.host ?? ""
      : ""));
    setSmtpPort(settings.data.smtpPort || 587);
    setSmtpEncryption(settings.data.smtpEncryption);
    setSmtpUsername(settings.data.smtpUsername);
    setResendApiKey("");
    setSmtpPassword("");
    setWebhookUrl("");
    setTestTo(user?.email?.trim() ?? "");
    setHydrated(true);
  }, [hydrated, settings.data, user?.email]);

  function onPresetChange(next: SmtpPreset) {
    setSmtpPreset(next);
    const values = applySmtpPreset(next);
    if (!values) return;
    setSmtpHost(values.host);
    setSmtpPort(values.port);
    setSmtpEncryption(values.encryption);
  }

  async function save(opts?: {
    clearResendKey?: boolean;
    clearSmtpPassword?: boolean;
    clearWebhook?: boolean;
  }) {
    setSaving(true);
    if (opts?.clearResendKey) setClearing("resend");
    if (opts?.clearSmtpPassword) setClearing("smtpPassword");
    if (opts?.clearWebhook) setClearing("webhook");
    const clearingAny = Boolean(opts?.clearResendKey || opts?.clearSmtpPassword || opts?.clearWebhook);
    const result = await saveAppEmailSettings({
      enabled,
      provider,
      fromAddress,
      fromName,
      resendApiKey: clearingAny ? "" : resendApiKey,
      smtpHost,
      smtpPort,
      smtpEncryption,
      smtpUsername,
      smtpPassword: clearingAny ? "" : smtpPassword,
      smtpPreset,
      webhookUrl: clearingAny ? "" : webhookUrl,
      clearResendKey: opts?.clearResendKey,
      clearSmtpPassword: opts?.clearSmtpPassword,
      clearWebhook: opts?.clearWebhook,
    });
    setSaving(false);
    setClearing(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setResendApiKey("");
    setSmtpPassword("");
    setWebhookUrl("");
    setProvider(result.data.provider);
    setFromAddress(result.data.fromAddress);
    setFromName(result.data.fromName);
    setEnabled(result.data.enabled);
    setSmtpPreset(result.data.smtpPreset);
    setSmtpHost(result.data.smtpHost);
    setSmtpPort(result.data.smtpPort);
    setSmtpEncryption(result.data.smtpEncryption);
    setSmtpUsername(result.data.smtpUsername);
    queryClient.setQueryData(QUERY_KEY, result.data);
    toast.success(
      opts?.clearResendKey
        ? t("emailSettings.resendCleared")
        : opts?.clearSmtpPassword
          ? t("emailSettings.smtpPasswordCleared")
          : opts?.clearWebhook
            ? t("emailSettings.webhookCleared")
            : t("emailSettings.saved"),
    );
  }

  function formatSmtpDiagnostics(diag: SmtpAuthDiagnostics | undefined): string {
    if (!diag) return "";
    // Length + host/user only — never password suffix in toasts (screenshots leak).
    return t("emailSettings.smtpDiagnostics", {
      host: diag.host,
      port: diag.port,
      user: diag.username,
      passwordLength: diag.passwordLength,
    });
  }

  function smtpPasswordShapeHint(diag: SmtpAuthDiagnostics | undefined): string {
    switch (diag?.passwordHint) {
      case "mailgun_password_looks_like_api_key":
        return t("emailSettings.mailgunPasswordLooksLikeApiKey");
      case "mailgun_password_looks_like_pubkey":
        return t("emailSettings.mailgunPasswordLooksLikePubkey");
      case "mailgun_password_looks_like_webhook_signing":
        return t("emailSettings.mailgunPasswordLooksLikeWebhookSigning");
      default:
        return "";
    }
  }

  function smtpFailureMessage(reason: string | undefined, diag: SmtpAuthDiagnostics | undefined): string {
    const detail = formatSmtpDiagnostics(diag);
    if (isSmtpAuthFailure(reason)) {
      if (diag?.alternateHostWorked) {
        const regionMsg = t("emailSettings.smtpAuthFailedOtherRegionWorks", {
          failedHost: diag.host,
          workingHost: diag.alternateHostWorked,
          preset:
            diag.alternatePreset === "mailgun_eu"
              ? t("emailSettings.presetMailgunEu")
              : diag.alternatePreset === "mailgun_us"
                ? t("emailSettings.presetMailgunUs")
                : diag.alternateHostWorked,
        });
        return detail ? `${regionMsg} ${detail}` : regionMsg;
      }
      const region = mailgunRegionHint(diag?.host || smtpHost);
      const shape = smtpPasswordShapeHint(diag);
      const authMsg =
        region === "eu"
          ? t("emailSettings.smtpAuthFailedMailgunEu")
          : region === "us"
            ? t("emailSettings.smtpAuthFailedMailgunUs")
            : t("emailSettings.smtpAuthFailed");
      const withShape = shape ? `${authMsg} ${shape}` : authMsg;
      return detail ? `${withShape} ${detail}` : withShape;
    }
    const base = reason || t("emailSettings.smtpVerifyFailed");
    return detail ? `${base} ${detail}` : base;
  }

  async function sendTest() {
    setTesting(true);
    const result = await testAppEmailSettings({
      to: testTo.trim(),
      smtpHost,
      smtpPort,
      smtpEncryption,
      smtpUsername,
      smtpPassword,
      fromAddress,
      fromName,
    });
    setTesting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (!result.data.sent) {
      toast.error(smtpFailureMessage(result.data.reason, result.data.diagnostics) || t("emailSettings.testFailed"));
      return;
    }
    toast.success(t("emailSettings.testSent"));
  }

  function smtpVerifyErrorMessage(
    reason: string | undefined,
    diag?: SmtpAuthDiagnostics,
  ): string {
    switch (reason) {
      case "smtp_host_missing":
        return t("emailSettings.smtpHostMissing");
      case "smtp_username_missing":
        return t("emailSettings.smtpUsernameMissing");
      case "smtp_password_missing":
        return t("emailSettings.smtpPasswordMissing");
      case "smtp_not_configured":
        return t("emailSettings.smtpNotConfigured");
      default:
        return smtpFailureMessage(reason, diag);
    }
  }

  async function verifySmtp() {
    setVerifying(true);
    const result = await testAppSmtpConnection({
      smtpHost,
      smtpPort,
      smtpEncryption,
      smtpUsername,
      smtpPassword,
    });
    setVerifying(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (!result.data.ok) {
      toast.error(smtpVerifyErrorMessage(result.data.reason, result.data.diagnostics));
      return;
    }
    toast.success(
      t("emailSettings.smtpVerifyOk", {
        host: result.data.host ?? smtpHost,
        port: result.data.port ?? smtpPort,
      }),
    );
  }

  const mailgunUserHintKey = mailgunUsernameHint(smtpUsername, smtpHost);
  const mailgunPassHintKey = mailgunSmtpPasswordHint(smtpPassword, smtpHost);

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
              <Label htmlFor="email-provider">{t("emailSettings.provider")}</Label>
              <Select value={provider} onValueChange={(value) => setProvider(value as EmailProvider)}>
                <SelectTrigger id="email-provider" aria-label={t("emailSettings.provider")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smtp">{t("emailSettings.providerSmtp")}</SelectItem>
                  <SelectItem value="resend">{t("emailSettings.providerResend")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("emailSettings.providerHint")}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email-from-name">{t("emailSettings.fromName")}</Label>
                <Input
                  id="email-from-name"
                  name="fromName"
                  type="text"
                  autoComplete="off"
                  placeholder="FEC"
                  value={fromName}
                  onChange={(event) => setFromName(event.target.value)}
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
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("emailSettings.fromAddressHint")}</p>

            {provider === "smtp" ? (
              <div className="space-y-4 rounded-xl border border-border/40 bg-muted/20 p-3">
                <div className="space-y-2">
                  <Label htmlFor="email-smtp-preset">{t("emailSettings.smtpPreset")}</Label>
                  <Select value={smtpPreset} onValueChange={(value) => onPresetChange(value as SmtpPreset)}>
                    <SelectTrigger id="email-smtp-preset" aria-label={t("emailSettings.smtpPreset")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mailgun_eu">{t("emailSettings.presetMailgunEu")}</SelectItem>
                      <SelectItem value="mailgun_us">{t("emailSettings.presetMailgunUs")}</SelectItem>
                      <SelectItem value="gmail">{t("emailSettings.presetGmail")}</SelectItem>
                      <SelectItem value="custom">{t("emailSettings.presetCustom")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {smtpPreset === "gmail"
                      ? t("emailSettings.gmailHint")
                      : smtpPreset === "mailgun_eu"
                        ? t("emailSettings.mailgunHintEu")
                        : smtpPreset === "mailgun_us"
                          ? t("emailSettings.mailgunHintUs")
                          : t("emailSettings.smtpPresetHint")}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                  <div className="space-y-2">
                    <Label htmlFor="email-smtp-host">{t("emailSettings.smtpHost")}</Label>
                    <Input
                      id="email-smtp-host"
                      name="smtpHost"
                      type="text"
                      autoComplete="off"
                      value={smtpHost}
                      onChange={(event) => {
                        setSmtpPreset("custom");
                        setSmtpHost(event.target.value);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-smtp-port">{t("emailSettings.smtpPort")}</Label>
                    <Input
                      id="email-smtp-port"
                      name="smtpPort"
                      type="number"
                      min={1}
                      max={65535}
                      value={smtpPort}
                      onChange={(event) => {
                        setSmtpPreset("custom");
                        setSmtpPort(Number(event.target.value) || 587);
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-smtp-encryption">{t("emailSettings.smtpEncryption")}</Label>
                  <Select
                    value={smtpEncryption}
                    onValueChange={(value) => {
                      setSmtpPreset("custom");
                      setSmtpEncryption(value as SmtpEncryption);
                    }}
                  >
                    <SelectTrigger id="email-smtp-encryption" aria-label={t("emailSettings.smtpEncryption")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">TLS</SelectItem>
                      <SelectItem value="starttls">STARTTLS</SelectItem>
                      <SelectItem value="ssl">SSL</SelectItem>
                      <SelectItem value="none">{t("emailSettings.encryptionNone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-smtp-user">{t("emailSettings.smtpUsername")}</Label>
                  <Input
                    id="email-smtp-user"
                    name="smtpUsername"
                    type="text"
                    autoComplete="off"
                    value={smtpUsername}
                    onChange={(event) => setSmtpUsername(event.target.value)}
                    placeholder={
                      smtpPreset === "gmail" ? "you@gmail.com" : "postmaster@mg.example.com"
                    }
                  />
                  {mailgunUserHintKey === "mailgun_username_need_at" ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t("emailSettings.mailgunUsernameNeedAt")}
                    </p>
                  ) : mailgunUserHintKey === "mailgun_username_unusual" ? (
                    <p className="text-xs text-muted-foreground">
                      {t("emailSettings.mailgunUsernameUnusual")}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-smtp-pass">{t("emailSettings.smtpPassword")}</Label>
                  <Input
                    id="email-smtp-pass"
                    name="smtpPassword"
                    type="password"
                    autoComplete="new-password"
                    value={smtpPassword}
                    onChange={(event) => setSmtpPassword(event.target.value)}
                    placeholder={t("emailSettings.smtpPasswordPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.data?.smtpPasswordSet
                      ? t("emailSettings.smtpPasswordLast4", {
                          last4: settings.data.smtpPasswordLast4,
                          length: settings.data.smtpPasswordLength,
                        })
                      : t("emailSettings.smtpPasswordEmpty")}
                  </p>
                  {mailgunPassHintKey === "mailgun_password_looks_like_api_key" ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t("emailSettings.mailgunPasswordLooksLikeApiKey")}
                    </p>
                  ) : mailgunPassHintKey === "mailgun_password_looks_like_pubkey" ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t("emailSettings.mailgunPasswordLooksLikePubkey")}
                    </p>
                  ) : mailgunPassHintKey === "mailgun_password_looks_like_webhook_signing" ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t("emailSettings.mailgunPasswordLooksLikeWebhookSigning")}
                    </p>
                  ) : null}
                  {settings.data?.smtpPasswordSet ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => void save({ clearSmtpPassword: true })}
                    >
                      {clearing === "smtpPassword"
                        ? t("emailSettings.clearing")
                        : t("emailSettings.clearSmtpPassword")}
                    </Button>
                  ) : null}
                </div>

                <Button type="button" variant="outline" disabled={verifying || saving} onClick={() => void verifySmtp()}>
                  {verifying ? t("emailSettings.smtpVerifying") : t("emailSettings.smtpVerify")}
                </Button>
              </div>
            ) : (
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
            )}

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
