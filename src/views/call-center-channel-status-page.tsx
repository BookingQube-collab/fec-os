"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SendPulseChatbotPanel } from "@/components/call-center/sendpulse-chatbot-panel";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  assignCallCenterOmniTicket,
  ensureCallCenterM365Subscription,
  loadCallCenterOmniInbox,
  replyCallCenterOmniMessage,
  syncCallCenterM365Inbox,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

type ChannelKind = "instagram" | "messenger" | "email";

const CHANNEL_META: Record<
  ChannelKind,
  {
    titleKey: string;
    subtitleKey: string;
    settingsHash: string;
    webhookPath: string;
    omniSource: "instagram" | "facebook_messenger" | "microsoft365_email";
    showSendPulse: boolean;
    sendPulseChannel?: "instagram" | "messenger";
    agentTagKey: string;
    configuredKey: string;
    missingKey: string;
    openSettingsKey: string;
  }
> = {
  instagram: {
    titleKey: "callCenter.instagramTitle",
    subtitleKey: "callCenter.instagramSubtitle",
    settingsHash: "#instagram",
    webhookPath: "POST /api/public/meta/instagram",
    omniSource: "instagram",
    showSendPulse: true,
    sendPulseChannel: "instagram",
    agentTagKey: "callCenter.tagInstagram",
    configuredKey: "callCenter.instagramConfigured",
    missingKey: "callCenter.instagramMissing",
    openSettingsKey: "callCenter.instagramOpenSettings",
  },
  messenger: {
    titleKey: "callCenter.messengerTitle",
    subtitleKey: "callCenter.messengerSubtitle",
    settingsHash: "#messenger",
    webhookPath: "POST /api/public/meta/messenger",
    omniSource: "facebook_messenger",
    showSendPulse: true,
    sendPulseChannel: "messenger",
    agentTagKey: "callCenter.tagMessenger",
    configuredKey: "callCenter.messengerConfigured",
    missingKey: "callCenter.messengerMissing",
    openSettingsKey: "callCenter.messengerOpenSettings",
  },
  email: {
    titleKey: "callCenter.emailTitle",
    subtitleKey: "callCenter.emailSubtitle",
    settingsHash: "#m365",
    webhookPath: "POST /api/public/call-center/microsoft365",
    omniSource: "microsoft365_email",
    showSendPulse: false,
    agentTagKey: "callCenter.tagM365",
    configuredKey: "callCenter.m365Configured",
    missingKey: "callCenter.m365Missing",
    openSettingsKey: "callCenter.m365OpenSettings",
  },
};

export function CallCenterChannelStatusPage({ channel }: { channel: ChannelKind }) {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;
  const meta = CHANNEL_META[channel];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const inbox = useQuery({
    queryKey: ["call-center", "omni-inbox", meta.omniSource, selectedId],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterOmniInbox({
        source: meta.omniSource,
        ticketId: selectedId,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!inbox.data?.selectedTicketId) return;
    if (!selectedId) setSelectedId(inbox.data.selectedTicketId);
  }, [inbox.data?.selectedTicketId, selectedId]);

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    try {
      const result = await replyCallCenterOmniMessage({
        ticketId: selectedId,
        body: reply.trim(),
      });
      if (!result.ok) throw new Error(result.error);
      if (!result.data.sent) {
        toast.error(result.data.error || t("callCenter.omniSendFailed"));
      } else {
        toast.success(t("callCenter.omniSent"));
        setReply("");
      }
      await queryClient.invalidateQueries({
        queryKey: ["call-center", "omni-inbox", meta.omniSource],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setSending(false);
    }
  }

  async function assignToMe() {
    if (!selectedId || !user?.id) return;
    const result = await assignCallCenterOmniTicket({
      ticketId: selectedId,
      agentUserId: user.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.omniAssigned"));
    await queryClient.invalidateQueries({
      queryKey: ["call-center", "omni-inbox", meta.omniSource],
    });
  }

  async function syncM365() {
    setSyncing(true);
    try {
      const result = await syncCallCenterM365Inbox({ limit: 25 });
      if (!result.ok) throw new Error(result.error);
      if (result.data.error) toast.error(result.data.error);
      else toast.success(t("callCenter.m365Synced", { count: result.data.synced }));
      await queryClient.invalidateQueries({
        queryKey: ["call-center", "omni-inbox", meta.omniSource],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setSyncing(false);
    }
  }

  async function ensureSubscription() {
    setSubscribing(true);
    try {
      const result = await ensureCallCenterM365Subscription({});
      if (!result.ok) throw new Error(result.error);
      toast.success(t("callCenter.m365SubscriptionReady"));
      await queryClient.invalidateQueries({ queryKey: ["call-center"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setSubscribing(false);
    }
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey={meta.titleKey} subtitleKey={meta.subtitleKey}>
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const settings = inbox.data?.settings;
  const configured =
    channel === "instagram"
      ? Boolean(settings?.instagramConfigured)
      : channel === "messenger"
        ? Boolean(settings?.messengerConfigured ?? inbox.data?.messenger?.configured)
        : Boolean(settings?.m365Configured ?? inbox.data?.m365?.configured);

  const tickets = inbox.data?.tickets ?? [];
  const messages = inbox.data?.messages ?? [];
  const selected = tickets.find((c) => c.id === selectedId) ?? null;

  return (
    <CallCenterShell titleKey={meta.titleKey} subtitleKey={meta.subtitleKey}>
      {meta.showSendPulse && meta.sendPulseChannel ? (
        <SendPulseChatbotPanel
          className="mb-4"
          channel={meta.sendPulseChannel}
          canEdit={canEdit}
          status={inbox.data?.sendpulseBridge}
        />
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t(meta.agentTagKey)}</Badge>
        <Badge variant="outline">{t("callCenter.tagAgentInbox")}</Badge>
        {configured ? (
          <Badge variant="success">{t(meta.configuredKey)}</Badge>
        ) : (
          <Badge variant="outline">{t(meta.missingKey)}</Badge>
        )}
        <span className="text-xs text-muted-foreground">{meta.webhookPath}</span>
        {channel === "email" ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={syncing}
              onClick={() => void syncM365()}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {syncing ? t("callCenter.m365Syncing") : t("callCenter.m365SyncInbox")}
            </Button>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={subscribing}
                onClick={() => void ensureSubscription()}
              >
                {subscribing
                  ? t("callCenter.m365Subscribing")
                  : t("callCenter.m365EnsureSubscription")}
              </Button>
            ) : null}
          </>
        ) : null}
        {canEdit ? (
          <Button type="button" size="sm" variant="outline" className="ms-auto gap-1.5" asChild>
            <Link href={`/call-center/settings${meta.settingsHash}`}>
              <Settings className="h-3.5 w-3.5" aria-hidden />
              {t(meta.openSettingsKey)}
            </Link>
          </Button>
        ) : null}
      </div>

      {inbox.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <section className="rounded-2xl border border-border/50 bg-card">
            <div className="border-b border-border/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("callCenter.omniThreads")}
            </div>
            <ul className="max-h-[28rem] overflow-y-auto">
              {tickets.length === 0 ? (
                <li className="p-4 text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden />
                  {t("callCenter.omniTicketsEmpty")}
                </li>
              ) : (
                tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      className={`w-full border-b border-border/30 px-3 py-2.5 text-start hover:bg-muted/40 ${
                        selectedId === ticket.id ? "bg-muted/50" : ""
                      }`}
                      onClick={() => setSelectedId(ticket.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {ticket.customerName ||
                            ticket.customerEmail ||
                            ticket.customerExternalId ||
                            ticket.summary}
                        </span>
                        <Badge variant="muted">{ticket.status}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {ticket.lastMessage || ticket.summary || "—"}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="flex min-h-[28rem] flex-col rounded-2xl border border-border/50 bg-card">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {selected.customerName ||
                        selected.customerEmail ||
                        selected.customerExternalId}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selected.customerEmail ||
                        selected.customerExternalId ||
                        selected.externalThreadId}
                    </p>
                    {selected.summary ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{selected.summary}</p>
                    ) : null}
                  </div>
                  <div className="ms-auto flex flex-wrap items-center gap-2">
                    <Select
                      value={selected.assignedAgentId || "none"}
                      onValueChange={(v) => {
                        void (async () => {
                          const result = await assignCallCenterOmniTicket({
                            ticketId: selected.id,
                            agentUserId: v === "none" ? null : v,
                          });
                          if (!result.ok) toast.error(result.error);
                          else {
                            toast.success(t("callCenter.omniAssigned"));
                            await queryClient.invalidateQueries({
                              queryKey: ["call-center", "omni-inbox", meta.omniSource],
                            });
                          }
                        })();
                      }}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder={t("callCenter.whatsappAssign")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("callCenter.whatsappUnassigned")}</SelectItem>
                        {(inbox.data?.agents ?? []).map((a) => (
                          <SelectItem key={a.userId} value={a.userId}>
                            {a.displayName}
                            {a.extension ? ` · Ext ${a.extension}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" variant="outline" onClick={() => void assignToMe()}>
                      {t("callCenter.whatsappAssignMe")}
                    </Button>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("callCenter.omniNoMessages")}</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          m.direction === "outbound"
                            ? "ms-auto bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {m.subject ? (
                          <p className="mb-1 text-[11px] font-medium opacity-80">{m.subject}</p>
                        ) : null}
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            m.direction === "outbound"
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {m.status}
                          {m.errorText ? ` · ${m.errorText}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-border/40 p-3">
                  <div className="flex gap-2">
                    <Textarea
                      rows={2}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={t("callCenter.omniReplyPlaceholder")}
                      className="min-h-[2.5rem]"
                    />
                    <Button
                      type="button"
                      disabled={sending || !reply.trim()}
                      onClick={() => void sendReply()}
                    >
                      {sending ? t("callCenterAdmin.saving") : t("callCenter.whatsappSend")}
                    </Button>
                  </div>
                  {!configured ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {t("callCenter.omniReplyNeedsCredentials")}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                {t("callCenter.omniPickThread")}
              </div>
            )}
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}
