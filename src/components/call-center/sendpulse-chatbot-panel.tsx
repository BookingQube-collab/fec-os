"use client";

import { Bot, ExternalLink, Settings } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { FecButton as Button } from "@/components/fec";
import { Badge } from "@/components/ui/badge";

export type SendPulseChatbotPanelStatus = {
  secretConfigured: boolean;
  sendpulseNumber?: string;
  webhookPath?: string;
  warnings?: string[];
};

type Props = {
  status: SendPulseChatbotPanelStatus | null | undefined;
  /** Channel context shown in the panel. */
  channel: "whatsapp" | "instagram" | "messenger";
  canEdit?: boolean;
  className?: string;
};

/**
 * Read-only status for SendPulse chatbot automation.
 * Flows stay in SendPulse; FEC only shows bridge readiness + settings link.
 */
export function SendPulseChatbotPanel({
  status,
  channel,
  canEdit = false,
  className,
}: Props) {
  const { t } = useTranslation();
  const ready = Boolean(status?.secretConfigured);
  const number =
    status?.sendpulseNumber?.trim() || t("callCenter.sendpulseNumberUnset");
  const webhookPath =
    status?.webhookPath ??
    "/api/public/call-center/sendpulse?secret=<SENDPULSE_WEBHOOK_SECRET>";
  const channelNoteKey =
    channel === "instagram"
      ? "callCenter.sendpulseChatbotInstagramNote"
      : channel === "messenger"
        ? "callCenter.sendpulseChatbotMessengerNote"
        : "callCenter.sendpulseChatbotWhatsappNote";

  return (
    <section
      className={`rounded-2xl border border-border/50 bg-[var(--surface-2)]/50 p-4 ${className ?? ""}`}
      aria-label={t("callCenter.sendpulseChatbotPanelTitle")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold tracking-tight">
              {t("callCenter.sendpulseChatbotPanelTitle")}
            </h2>
            <Badge variant="secondary">{t("callCenter.tagSendPulse")}</Badge>
            <Badge variant="outline">{t("callCenter.tagChatbot")}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("callCenter.sendpulseChatbotPanelHint")}
          </p>
        </div>
        {ready ? (
          <Badge variant="success">{t("callCenter.sendpulseChatbotReady")}</Badge>
        ) : (
          <Badge variant="warning">{t("callCenter.sendpulseChatbotNotConfigured")}</Badge>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t(channelNoteKey)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("callCenter.sendpulseChatbotRunsInSendpulse")}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border/40 bg-card px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("callCenter.sendpulseWhatsappNumberLabel")}
          </p>
          <p className="mt-0.5 font-mono text-xs text-foreground">{number}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("callCenter.sendpulseChatbotWebhookPath")}
          </p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-foreground">{webhookPath}</p>
        </div>
      </div>

      {(status?.warnings?.length ?? 0) > 0 ? (
        <ul className="mt-3 space-y-1 rounded-xl border border-rag-amber/40 bg-rag-amber/10 px-3 py-2 text-xs text-foreground">
          {status!.warnings!.map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canEdit ? (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" asChild>
            <Link href="/call-center/settings#sendpulse">
              <Settings className="h-3.5 w-3.5" aria-hidden />
              {t("callCenter.sendpulseChatbotOpenSettings")}
            </Link>
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="gap-1.5" asChild>
          <a
            href="https://sendpulse.com/integrations/api/chatbot"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {t("callCenter.sendpulseChatbotOpenSendpulse")}
          </a>
        </Button>
      </div>
    </section>
  );
}
