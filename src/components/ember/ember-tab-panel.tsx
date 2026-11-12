"use client";

import { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { EmberWorkspaceShell } from "@/components/ember/ember-workspace-shell";
import { emberTabById, type EmberTabId } from "@/lib/ember";

function panelForTab(tabId: EmberTabId): React.ComponentProps<typeof EmberWorkspaceShell>["panel"] {
  switch (tabId) {
    case "files":
      return "files";
    case "bots":
      return "bots";
    case "agents":
      return "agents";
    case "profile":
      return "profile";
    case "push":
      return "push";
    case "settings":
      return "settings";
    case "styles":
      return "styles";
    default:
      return "chat";
  }
}

export function EmberTabPanel({ tabId }: { tabId: EmberTabId }) {
  const { t } = useTranslation();
  const tab = emberTabById(tabId);
  const panel = panelForTab(tabId);
  const chatSurface = tab.native.kind === "chat" ? tab.native.surface : "all";
  const autoOpenCreate = tab.native.kind === "chat" ? Boolean(tab.native.autoOpenCreate) : false;
  const autoOpenCompose = tab.native.kind === "chat" ? Boolean(tab.native.autoOpenCompose) : false;
  const autoOpenSearch = tab.native.kind === "chat" ? Boolean(tab.native.autoOpenSearch) : false;

  return (
    <CapabilityGate
      capability={tab.capability}
      fallback={<p className="text-sm text-muted-foreground">{t("ember.noAccess")}</p>}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Suspense fallback={<p className="text-sm text-muted-foreground">{t("chat.loadingMessages")}</p>}>
          <EmberWorkspaceShell
            panel={panel}
            surface={chatSurface}
            autoOpenCreate={autoOpenCreate}
            autoOpenCompose={autoOpenCompose}
            autoOpenSearch={autoOpenSearch}
          />
        </Suspense>
      </div>
    </CapabilityGate>
  );
}
