"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Settings } from "lucide-react";
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
  assignCallCenterWhatsappConversation,
  loadCallCenterWhatsappInbox,
  loadCallCenterWhatsappTemplates,
  replyCallCenterWhatsappMessage,
  sendCallCenterWhatsappTemplate,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterWhatsappPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [tplSendingId, setTplSendingId] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: ["call-center", "whatsapp-inbox", selectedId],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterWhatsappInbox({ conversationId: selectedId });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 15_000,
  });

  const templates = useQuery({
    queryKey: ["call-center", "whatsapp-templates"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterWhatsappTemplates({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  useEffect(() => {
    if (!inbox.data?.selectedConversationId) return;
    if (!selectedId) setSelectedId(inbox.data.selectedConversationId);
  }, [inbox.data?.selectedConversationId, selectedId]);

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    try {
      const result = await replyCallCenterWhatsappMessage({
        conversationId: selectedId,
        body: reply.trim(),
      });
      if (!result.ok) throw new Error(result.error);
      if (!result.data.sent) {
        toast.error(result.data.error || t("callCenter.whatsappSendFailed"));
      } else {
        toast.success(t("callCenter.whatsappSent"));
        setReply("");
      }
      await queryClient.invalidateQueries({ queryKey: ["call-center", "whatsapp-inbox"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setSending(false);
    }
  }

  async function assignToMe() {
    if (!selectedId || !user?.id) return;
    const result = await assignCallCenterWhatsappConversation({
      conversationId: selectedId,
      agentUserId: user.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.whatsappAssigned"));
    await queryClient.invalidateQueries({ queryKey: ["call-center", "whatsapp-inbox"] });
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.whatsappTitle" subtitleKey="callCenter.whatsappSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const settings = inbox.data?.settings;
  const conversations = inbox.data?.conversations ?? [];
  const messages = inbox.data?.messages ?? [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const activeTemplates = (templates.data ?? []).filter((tpl) => tpl.isActive !== false);

  return (
    <CallCenterShell titleKey="callCenter.whatsappTitle" subtitleKey="callCenter.whatsappSubtitle">
      <SendPulseChatbotPanel
        className="mb-4"
        channel="whatsapp"
        canEdit={canEdit}
        status={inbox.data?.sendpulseBridge}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t("callCenter.tagFecWhatsapp")}</Badge>
        <Badge variant="outline">{t("callCenter.tagAgentInbox")}</Badge>
        {settings?.whatsappConfigured ? (
          <Badge variant="success">{t("callCenter.whatsappConfigured")}</Badge>
        ) : (
          <Badge variant="outline">{t("callCenter.whatsappMissing")}</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          POST /api/public/call-center/whatsapp
        </span>
        {canEdit ? (
          <Button type="button" size="sm" variant="outline" className="ms-auto gap-1.5" asChild>
            <Link href="/call-center/settings#whatsapp">
              <Settings className="h-3.5 w-3.5" aria-hidden />
              {t("callCenter.whatsappOpenSettings")}
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{t("callCenter.whatsappFecInboxHint")}</p>

      {inbox.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <section className="rounded-2xl border border-border/50 bg-card">
            <div className="border-b border-border/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("callCenter.whatsappInbox")}
            </div>
            <ul className="max-h-[28rem] overflow-y-auto">
              {conversations.length === 0 ? (
                <li className="p-4 text-center text-sm text-muted-foreground">
                  <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden />
                  {t("callCenter.whatsappEmpty")}
                </li>
              ) : (
                conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`w-full border-b border-border/30 px-3 py-2.5 text-start hover:bg-muted/40 ${
                        selectedId === c.id ? "bg-muted/50" : ""
                      }`}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.customerName || c.customerE164 || c.waId}
                        </span>
                        {c.unreadCount > 0 ? (
                          <Badge variant="secondary">{c.unreadCount}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.lastMessagePreview || "—"}
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
                      {selected.customerName || selected.customerE164}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selected.customerE164 || selected.waId}
                    </p>
                  </div>
                  <div className="ms-auto flex flex-wrap items-center gap-2">
                    <Select
                      value={selected.assignedAgentId || "none"}
                      onValueChange={(v) => {
                        void (async () => {
                          const result = await assignCallCenterWhatsappConversation({
                            conversationId: selected.id,
                            agentUserId: v === "none" ? null : v,
                          });
                          if (!result.ok) toast.error(result.error);
                          else {
                            toast.success(t("callCenter.whatsappAssigned"));
                            await queryClient.invalidateQueries({
                              queryKey: ["call-center", "whatsapp-inbox"],
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
                {activeTemplates.length > 0 ? (
                  <div className="flex flex-wrap gap-2 border-b border-border/30 px-4 py-2">
                    <span className="self-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("callCenter.whatsappSendTemplate")}
                    </span>
                    {activeTemplates.map((tpl) => (
                      <Button
                        key={tpl.id}
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={tplSendingId === tpl.id}
                        onClick={() => {
                          void (async () => {
                            setTplSendingId(tpl.id);
                            try {
                              const result = await sendCallCenterWhatsappTemplate({
                                conversationId: selected.id,
                                templateId: tpl.id,
                              });
                              if (!result.ok) throw new Error(result.error);
                              if (!result.data.sent) {
                                toast.error(result.data.error || t("callCenter.whatsappSendFailed"));
                              } else {
                                toast.success(t("callCenter.whatsappTemplateSent"));
                              }
                              await queryClient.invalidateQueries({
                                queryKey: ["call-center", "whatsapp-inbox"],
                              });
                            } catch (error) {
                              toast.error(
                                error instanceof Error ? error.message : t("callCenter.loadError"),
                              );
                            } finally {
                              setTplSendingId(null);
                            }
                          })();
                        }}
                      >
                        {tpl.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        m.direction === "outbound"
                          ? "ms-auto bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
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
                  ))}
                </div>
                <div className="border-t border-border/40 p-3">
                  <div className="flex gap-2">
                    <Textarea
                      rows={2}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={t("callCenter.whatsappReplyPlaceholder")}
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
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                {t("callCenter.whatsappPick")}
              </div>
            )}
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterWhatsappPage;
