"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Inbox, MessageCircle, MessagesSquare, Plus, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DevicePushControl } from "@/components/chat/device-push-control";
import { GlobalChatNotificationControl } from "@/components/chat/chat-notification-controls";
import { ConversationList } from "@/components/chat/conversation-list";
import { ConversationThread } from "@/components/chat/conversation-thread";
import { CreateConversationDialog } from "@/components/chat/create-conversation-dialog";
import { DirectoryPicker } from "@/components/chat/directory-picker";
import { HubActivity, useHubActivityCounts } from "@/components/chat/hub-activity";
import { SearchPanel } from "@/components/chat/search-panel";
import { useChatFavorites } from "@/components/chat/use-chat-favorites";
import { useChatKeyboardInset } from "@/components/chat/use-chat-keyboard-inset";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useChatDirectory, useMyConversations, useSavedMessages } from "@/hooks/queries/useChat";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { openDirect, unsaveMessage } from "@/lib/chat.functions";
import type { ChatDirectoryPerson, ChatJumpTarget, ChatSavedMessage, ChatSearchFile, ChatSearchMessage } from "@/lib/chat.functions";
import { withDirectPeerLabels } from "@/lib/chat/display-rules";
import { chatCanMarkSensitive } from "@/lib/chat/group-rules";
import { chatUnreadBadgeLabel } from "@/lib/chat/message-rules";
import { canUserDo } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const CONVERSATION_QUERY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HubTab = "chats" | "updates" | "inbox";

export function ChatHub() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const roles = useUserRoles();
  const queryClient = useQueryClient();
  const conversations = useMyConversations();
  const directory = useChatDirectory({ enabled: canUserDo(roles, "chat.send") });
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("c");
  const frameRef = useRef<HTMLDivElement>(null);
  const queryIntent = useRef<string | "list" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useChatKeyboardInset(frameRef);
  const [tab, setTab] = useState<HubTab>("chats");
  const [createOpen, setCreateOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [focus, setFocus] = useState<ChatJumpTarget | null>(null);
  const [unavailable, setUnavailable] = useState<ChatDirectoryPerson | null>(null);
  const saved = useSavedMessages();
  const favorites = useChatFavorites(user?.id ?? null);
  const activity = useHubActivityCounts(user?.id);

  const canCreate = canUserDo(roles, "chat.create_group");
  const canSend = canUserDo(roles, "chat.send");
  const canManageCapability = canUserDo(roles, "chat.manage_members");
  const canCompose = canSend || canCreate;
  const people = canSend ? (directory.data?.people ?? []) : [];
  const rows = withDirectPeerLabels(conversations.data ?? [], people);
  const listLoading = conversations.isLoading || (canSend && directory.isLoading && rows.length === 0);
  const listError = conversations.isError
    ? conversations.error instanceof Error
      ? conversations.error.message
      : t("chat.loadFailed")
    : canSend && directory.isError
      ? directory.error instanceof Error
        ? directory.error.message
        : t("chat.loadFailed")
      : null;
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const paneOpen = Boolean(selected || unavailable);
  const chatUnread = rows.reduce((sum, row) => sum + (row.unreadCount > 0 ? row.unreadCount : 0), 0);
  const chatBadge = chatUnreadBadgeLabel(chatUnread);
  const updatesBadge = chatUnreadBadgeLabel(activity.updates);
  const inboxBadge = chatUnreadBadgeLabel(activity.inboxCount);

  function writeConversationQuery(id: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("c", id);
    else params.delete("c");
    const next = params.toString();
    const href = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, "", href);
  }

  function openConversation(id: string, nextFocus: ChatJumpTarget | null = null) {
    queryIntent.current = id;
    setUnavailable(null);
    setFocus(nextFocus);
    setSelectedId(id);
    setTab("chats");
    if (searchParams.get("c") !== id) writeConversationQuery(id);
  }

  function closeConversation() {
    queryIntent.current = "list";
    setUnavailable(null);
    setFocus(null);
    setSelectedId(null);
    if (searchParams.get("c")) writeConversationQuery(null);
  }

  useEffect(() => {
    if (conversations.isLoading) return;
    const urlId = requestedId && CONVERSATION_QUERY.test(requestedId) ? requestedId : null;
    const intent = queryIntent.current;
    if (intent === "list") {
      if (urlId) return;
      queryIntent.current = null;
      setSelectedId(null);
      return;
    }
    if (intent && intent !== urlId) return;
    if (intent && intent === urlId) queryIntent.current = null;
    if (urlId && (conversations.data ?? []).some((row) => row.id === urlId)) setSelectedId(urlId);
    else setSelectedId(null);
  }, [requestedId, conversations.isLoading, conversations.data]);

  const canManageSelected =
    canManageCapability && (selected?.role === "OWNER" || selected?.role === "ADMIN");

  const direct = useMutation({
    mutationFn: (input: { otherUserId: string }) => openDirect(input),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
      setComposeOpen(false);
      openConversation(result.data.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function choosePerson(person: ChatDirectoryPerson) {
    if (!person.userId) {
      queryIntent.current = "list";
      setFocus(null);
      setSelectedId(null);
      setUnavailable(person);
      setTab("chats");
      if (searchParams.get("c")) writeConversationQuery(null);
      return;
    }
    setUnavailable(null);
    direct.mutate({ otherUserId: person.userId });
  }

  function openJump(target: ChatJumpTarget) {
    openConversation(target.conversationId, target);
    setSearchOpen(false);
  }

  function openMessage(message: ChatSearchMessage) {
    openJump({
      messageId: message.id,
      conversationId: message.conversationId,
      createdAt: message.createdAt,
      snippet: message.snippet,
    });
  }

  function openFile(file: ChatSearchFile) {
    if (file.messageId && file.messageCreatedAt) {
      openJump({
        messageId: file.messageId,
        conversationId: file.conversationId,
        createdAt: file.messageCreatedAt,
        snippet: file.filename,
      });
      return;
    }
    openConversation(file.conversationId);
    setSearchOpen(false);
  }

  function openSaved(row: ChatSavedMessage) {
    openJump({
      messageId: row.messageId,
      conversationId: row.conversationId,
      createdAt: row.createdAt,
      snippet: row.snippet ?? t("chat.deleted"),
    });
    setSavedOpen(false);
  }

  async function unsave(messageId: string) {
    const result = await unsaveMessage({ messageId });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.saved() });
  }

  const tabs: { id: HubTab; label: string; count: string | null; icon: typeof MessagesSquare }[] = [
    { id: "chats", label: t("chat.tabChats"), count: chatBadge, icon: MessagesSquare },
    { id: "updates", label: t("chat.tabUpdates"), count: updatesBadge, icon: Bell },
    { id: "inbox", label: t("chat.tabInbox"), count: inboxBadge, icon: Inbox },
  ];

  return (
    <div ref={frameRef} className="flex min-h-0 flex-1 flex-col max-md:overflow-hidden">
      <div className={cn("mb-3 shrink-0 space-y-3", tab === "chats" && paneOpen && "max-md:hidden")}>
        <p className="text-sm text-muted-foreground">
          <span>{t("chat.breadcrumbWorkspace")}</span>
          <span aria-hidden className="px-1.5">/</span>
          <span className="font-medium text-foreground">{t("nav.communicationHub")}</span>
        </p>
        <div role="tablist" aria-label={t("nav.communicationHub")} className="fec-inner-tabs">
          {tabs.map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`chat-tab-${item.id}`}
                aria-selected={active}
                aria-controls={`chat-panel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={cn("fec-inner-tab", active && "is-active")}
              >
                <Icon aria-hidden />
                {item.label}
                {item.count ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] font-semibold",
                      active ? "bg-primary-foreground/15 text-primary-foreground" : "bg-secondary text-foreground",
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "chats" ? (
        <div
          id="chat-panel-chats"
          role="tabpanel"
          aria-labelledby="chat-tab-chats"
          className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card md:min-h-[32rem]"
        >
          <aside
            className={cn(
              "flex min-h-0 w-full min-w-0 flex-col md:w-[22rem] md:shrink-0 md:border-e md:border-border",
              paneOpen && "hidden md:flex",
            )}
          >
            <ConversationList
              conversations={rows}
              people={people}
              selectedId={selectedId}
              selectedStaffId={unavailable?.id ?? null}
              openingUserId={direct.isPending ? (direct.variables?.otherUserId ?? null) : null}
              loading={listLoading}
              error={listError}
              favoriteIds={favorites.ids}
              canCreate={canCreate}
              canCompose={canCompose}
              onSelect={(id) => openConversation(id)}
              onOpenPerson={choosePerson}
              onNewMessage={() => setComposeOpen(true)}
              onNewGroup={() => setCreateOpen(true)}
              onOpenSaved={() => setSavedOpen(true)}
              onOpenNotifications={() => setNotifyOpen(true)}
              onOpenSearch={() => setSearchOpen(true)}
            />
          </aside>

          <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !paneOpen && "hidden md:flex")}>
            {selected ? (
              <ConversationThread
                conversation={selected}
                currentUserId={user?.id ?? null}
                canSend={canSend}
                canManage={canManageSelected}
                canFilterDepartments={canCreate}
                focus={focus && focus.conversationId === selected.id ? focus : null}
                favorite={favorites.ids.includes(selected.id)}
                onToggleFavorite={() => favorites.toggle(selected.id)}
                onBack={closeConversation}
                onOpenConversation={(id) => openConversation(id)}
                onOpenMessage={openMessage}
                onOpenPerson={(person) => {
                  choosePerson(person);
                }}
                onOpenFile={openFile}
              />
            ) : unavailable ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="p-2 md:hidden">
                  <Button type="button" variant="ghost" onClick={() => setUnavailable(null)}>
                    {t("chat.back")}
                  </Button>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                  <h2 className="max-w-xs text-xl font-semibold text-foreground">
                    {unavailable.fullName.trim() || t("chat.unnamedPerson")}
                  </h2>
                  <p className="mt-2 max-w-sm text-sm font-medium text-foreground">{t("chat.noLoginTitle")}</p>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    {t("chat.noLoginBody", { name: unavailable.fullName.trim() || t("chat.unnamedPerson") })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                <div className="relative mb-6 h-28 w-28" aria-hidden>
                  <span className="absolute start-0 top-1 grid h-20 w-20 place-items-center rounded-full bg-primary/10 text-primary">
                    <MessageCircle className="h-8 w-8" strokeWidth={1.5} />
                  </span>
                  <span className="absolute bottom-0 end-0 grid h-14 w-14 place-items-center rounded-full bg-secondary text-foreground">
                    <User className="h-6 w-6" strokeWidth={1.5} />
                  </span>
                </div>
                <h2 className="max-w-xs text-xl font-semibold text-foreground">{t("chat.emptyHeading")}</h2>
                <p className="mt-2 max-w-xs text-sm text-muted-foreground">{t("chat.emptyBody")}</p>
                {canCompose ? (
                  <Button type="button" className="mt-6" onClick={() => setComposeOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden />
                    {t("chat.newMessage")}
                  </Button>
                ) : null}
                <Link href="/people/hr/helpdesk" className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {t("chat.needHrSupport")}
                </Link>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div
          id={`chat-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`chat-tab-${tab}`}
          className="flex min-h-0 flex-1 flex-col md:min-h-[32rem]"
        >
          <HubActivity mode={tab} />
        </div>
      )}

      <CreateConversationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canMarkSensitive={chatCanMarkSensitive(roles)}
        onCreated={(id) => openConversation(id)}
      />

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-h-[min(40rem,calc(100dvh-2rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("chat.newMessage")}</DialogTitle>
          </DialogHeader>
          {canSend ? <DirectoryPicker onSelect={choosePerson} /> : null}
          {direct.isPending ? <p className="text-sm text-muted-foreground">{t("chat.creating")}</p> : null}
          {canCreate ? (
            <Button
              type="button"
              variant={canSend ? "outline" : "default"}
              onClick={() => {
                setComposeOpen(false);
                setCreateOpen(true);
              }}
            >
              {t("chat.newGroup")}
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-h-[min(40rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("chat.searchMessages")}</DialogTitle>
          </DialogHeader>
          <SearchPanel
            conversationId={selectedId}
            canFilterDepartments={canCreate}
            onOpenConversation={(id) => {
              openConversation(id);
              setSearchOpen(false);
            }}
            onOpenMessage={openMessage}
            onOpenPerson={(person) => {
              setSearchOpen(false);
              choosePerson(person);
            }}
            onOpenFile={openFile}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={savedOpen} onOpenChange={setSavedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("chat.savedLabel")}</DialogTitle>
          </DialogHeader>
          {saved.isLoading ? <p className="text-sm text-muted-foreground">{t("chat.loadingMessages")}</p> : null}
          {!saved.isLoading && (saved.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("chat.savedEmpty")}</p>
          ) : null}
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {(saved.data ?? []).map((row) => (
              <li key={row.messageId} className="flex items-center gap-2">
                <button type="button" className="min-h-11 min-w-0 flex-1 truncate text-start text-sm" onClick={() => openSaved(row)}>
                  {row.snippet ?? t("chat.deleted")}
                </button>
                <Button type="button" variant="ghost" size="sm" aria-label={t("chat.unsaveMessage")} onClick={() => void unsave(row.messageId)}>
                  {t("chat.unsaveMessage")}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent className="max-h-[min(40rem,calc(100dvh-2rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("chat.notifyOpen")}</DialogTitle>
          </DialogHeader>
          <GlobalChatNotificationControl />
          <DevicePushControl />
        </DialogContent>
      </Dialog>
    </div>
  );
}
