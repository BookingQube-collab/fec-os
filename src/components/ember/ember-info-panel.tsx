"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { DevicePushControl } from "@/components/chat/device-push-control";
import { GlobalChatNotificationControl } from "@/components/chat/chat-notification-controls";
import { EmberAgentsManagePanel } from "@/components/ember/ember-agents-manage-panel";
import { EmberBotsManagePanel } from "@/components/ember/ember-bots-manage-panel";
import { FecButton as Button } from "@/components/fec";

export function EmberSettingsPanel() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t("ember.settingsNativeHint")}</p>
      <GlobalChatNotificationControl />
      <DevicePushControl />
    </div>
  );
}

export function EmberPushPanel() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t("ember.pushNativeHint")}</p>
      <DevicePushControl />
    </div>
  );
}

export function EmberProfilePanel() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t("ember.profileNativeHint")}</p>
      <Button asChild>
        <Link href="/profile">{t("ember.openFecProfile")}</Link>
      </Button>
      <DevicePushControl />
    </div>
  );
}

export function EmberBotsPanel() {
  return <EmberBotsManagePanel />;
}

export function EmberAgentsPanel() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <EmberAgentsManagePanel />
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("ember.agentsNativeBody")}</p>
        <Button asChild className="mt-3">
          <Link href="/admin/ai-integrations">{t("ember.openAiIntegrations")}</Link>
        </Button>
      </div>
    </div>
  );
}

export function EmberStylesPanel() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-foreground">{t("ember.stylesNativeTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("ember.stylesNativeBody")}</p>
    </div>
  );
}
