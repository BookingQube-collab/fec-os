"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Bot,
  Hash,
  Home,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConversationThread } from "@/components/chat/conversation-thread";
import { CreateConversationDialog } from "@/components/chat/create-conversation-dialog";
import { DirectoryPicker } from "@/components/chat/directory-picker";
import { SearchPanel } from "@/components/chat/search-panel";
import { useChatFavorites } from "@/components/chat/use-chat-favorites";
import { EmberThreadPanel } from "@/components/ember/ember-thread-panel";
import {
  EmberAgentsPanel,
  EmberBotsPanel,
  EmberProfilePanel,
  EmberPushPanel,
  EmberSettingsPanel,
  EmberStylesPanel,
} from "@/components/ember/ember-info-panel";
import { EmberFilesPanel } from "@/components/ember/ember-files-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useChatDirectory, useMyConversations } from "@/hooks/queries/useChat";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { openDirect, type ChatDirectoryPerson, type ChatJumpTarget, type ChatSearchFile, type ChatSearchMessage } from "@/lib/chat.functions";
import { emberChannelLabel, withDirectPeerLabels } from "@/lib/chat/display-rules";
import { chatCanMarkSensitive } from "@/lib/chat/group-rules";
import { chatUnreadBadgeLabel } from "@/lib/chat/message-rules";
import type { ChatHubSurface } from "@/components/chat/chat-hub";
import { canUserDo } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const CONVERSATION_QUERY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RailId = "home" | "dms" | "activity" | "search" | "admin" | "profile";

export type EmberWorkspaceShellProps = {
  surface?: ChatHubSurface;
  panel?: "chat" | "files" | "bots" | "agents" | "profile" | "push" | "settings" | "styles";
  autoOpenCreate?: boolean;
  autoOpenCompose?: boolean;
  autoOpenSearch?: boolean;
};

export function EmberWorkspaceShell({
  surface = "all",
  panel = "chat",
  autoOpenCreate = false,
  autoOpenCompose = false,
  autoOpenSearch = false,
}: EmberWorkspaceShellProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const roles = useUserRoles();
  const canManage = usePermission("ember.manage");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const conversations = useMyConversations();
  const directory = useChatDirectory({ enabled: canUserDo(roles, "chat.send") });
  const favorites = useChatFavorites(user?.id ?? null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sideThreadRootId, setSideThreadRootId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(autoOpenCreate);
  const [composeOpen, setComposeOpen] = useState(autoOpenCompose);
  const [searchOpen, setSearchOpen] = useState(autoOpenSearch);
  const [focus, setFocus] = useState<ChatJumpTarget | null>(null);

  const canCreate = canUserDo(roles, "chat.create_group");
  const canSend = canUserDo(roles, "chat.send");
  const canManageCapability = canUserDo(roles, "chat.manage_members");
  const people = canSend ? (directory.data?.people ?? []) : [];
  const allRows = withDirectPeerLabels(conversations.data ?? [], people);

  const channels = useMemo(
    () => allRows.filter((row) => row.kind !== "DIRECT"),
    [allRows],
  );
  const dms = useMemo(
    () => allRows.filter((row) => row.kind === "DIRECT"),
    [allRows],
  );
  const activityRows = useMemo(
    () => allRows.filter((row) => row.unreadCount > 0),
    [allRows],
  );

  const listRows =
    surface === "dms" ? dms : surface === "rooms" ? channels : surface === "activity" ? activityRows : allRows;

  const railActive: RailId =
    panel === "bots" || panel === "agents" || panel === "settings" || panel === "styles"
      ? "admin"
      : panel === "profile" || panel === "push"
        ? "profile"
        : surface === "dms"
          ? "dms"
          : surface === "activity"
            ? "activity"
            : autoOpenSearch || searchOpen
              ? "search"
              : "home";

  useEffect(() => {
    const requested = searchParams.get("c");
    if (requested && CONVERSATION_QUERY.test(requested)) {
      setSelectedId(requested);
    }
  }, [searchParams]);

  useEffect(() => {
    setSideThreadRootId(null);
  }, [selectedId]);

  const selected = listRows.find((row) => row.id === selectedId) ?? allRows.find((row) => row.id === selectedId) ?? null;
  const canManageSelected =
    canManageCapability &&
    (selected?.role === "OWNER" || selected?.role === "ADMIN" || selected?.role === "MODERATOR");

  const direct = useMutation({
    mutationFn: (input: { otherUserId: string }) => openDirect(input),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setComposeOpen(false);
      openConversation(result.data.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.list() });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  function openConversation(id: string) {
    setSelectedId(id);
    setFocus(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("c", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openJump(target: ChatJumpTarget) {
    setSelectedId(target.conversationId);
    setFocus(target);
    setSearchOpen(false);
  }

  const unreadTotal = allRows.reduce((sum, row) => sum + (row.unreadCount > 0 ? 1 : 0), 0);
  const activityBadge = chatUnreadBadgeLabel(unreadTotal);

  const showChat = panel === "chat";

  return (
    <div className="ember-shell flex min-h-[min(78dvh,880px)] min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <nav
        className="ember-shell__rail flex shrink-0 flex-row items-center gap-1 px-2 py-2 lg:w-14 lg:flex-col lg:py-3"
        aria-label={t("ember.shell.railLabel")}
      >
        <RailLink
          href="/ember"
          active={railActive === "home"}
          label={t("ember.shell.railHome")}
          icon={Home}
        />
        <RailLink
          href="/ember/dms"
          active={railActive === "dms"}
          label={t("ember.shell.railDms")}
          icon={Users}
        />
        <RailLink
          href="/ember/activity"
          active={railActive === "activity"}
          label={t("ember.shell.railActivity")}
          icon={Activity}
          badge={activityBadge}
        />
        <button
          type="button"
          className={cn("ember-shell__rail-btn relative", railActive === "search" && "is-active")}
          aria-label={t("ember.shell.railSearch")}
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
        </button>
        {canManage ? (
          <RailLink
            href="/ember/bots"
            active={railActive === "admin"}
            label={t("ember.shell.railAdmin")}
            icon={Bot}
          />
        ) : null}
        <div className="ms-auto lg:ms-0 lg:mt-auto">
          <RailLink
            href="/ember/profile"
            active={railActive === "profile"}
            label={t("ember.shell.railProfile")}
            icon={UserRound}
          />
        </div>
      </nav>

      {showChat ? (
        <>
          <aside className="ember-shell__sidebar flex min-h-0 w-full min-w-0 flex-col lg:w-[16.5rem] lg:max-w-[16.5rem] lg:shrink-0">
            <div className="border-b border-[color:var(--ember-border)] px-3 py-3">
              <p className="truncate text-sm font-semibold">{t("ember.shell.workspaceName")}</p>
              <p className="truncate text-xs text-[color:var(--ember-muted)]">{t("ember.shell.workspaceTagline")}</p>
            </div>
            <div className="flex items-center gap-1 px-2 py-2">
              {canCreate ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 flex-1 justify-start gap-1.5 text-[color:var(--ember-muted)] hover:text-[color:var(--ember-text)]"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("ember.shell.newRoom")}
                </Button>
              ) : null}
              {canSend ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 flex-1 justify-start gap-1.5 text-[color:var(--ember-muted)] hover:text-[color:var(--ember-text)]"
                  onClick={() => setComposeOpen(true)}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {t("ember.shell.newDm")}
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {surface !== "dms" ? (
                <Section
                  label={t("ember.shell.channels")}
                  rows={surface === "activity" ? activityRows.filter((r) => r.kind !== "DIRECT") : channels}
                  selectedId={selectedId}
                  onSelect={openConversation}
                  channel
                />
              ) : null}
              {surface !== "rooms" ? (
                <Section
                  label={t("ember.shell.directMessages")}
                  rows={surface === "activity" ? activityRows.filter((r) => r.kind === "DIRECT") : dms}
                  selectedId={selectedId}
                  onSelect={openConversation}
                />
              ) : null}
              {conversations.isLoading ? (
                <p className="px-2 py-3 text-xs text-[color:var(--ember-muted)]">{t("common.loading")}</p>
              ) : null}
              {!conversations.isLoading && listRows.length === 0 ? (
                <p className="px-2 py-3 text-xs text-[color:var(--ember-muted)]">{t("ember.shell.emptyList")}</p>
              ) : null}
            </div>
          </aside>

          <section className="ember-shell__main flex min-h-0 min-w-0 flex-1 flex-col">
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
                onBack={() => setSelectedId(null)}
                onOpenConversation={openConversation}
                onOpenMessage={(message: ChatSearchMessage) =>
                  openJump({
                    messageId: message.id,
                    conversationId: message.conversationId,
                    createdAt: message.createdAt,
                    snippet: message.snippet,
                  })
                }
                onOpenPerson={(person) => {
                  if (person.userId) direct.mutate({ otherUserId: person.userId });
                }}
                onOpenFile={(file: ChatSearchFile) => {
                  if (file.messageId && file.messageCreatedAt) {
                    openJump({
                      messageId: file.messageId,
                      conversationId: file.conversationId,
                      createdAt: file.messageCreatedAt,
                      snippet: file.filename,
                    });
                  } else {
                    openConversation(file.conversationId);
                  }
                }}
                onOpenSideThread={setSideThreadRootId}
                collapseThreadReplies
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                <MessageCircle className="mb-4 h-10 w-10 text-[color:var(--ember-muted)]" strokeWidth={1.5} />
                <h2 className="text-lg font-semibold">{t("ember.shell.emptyHeading")}</h2>
                <p className="mt-2 max-w-sm text-sm text-[color:var(--ember-muted)]">{t("ember.shell.emptyBody")}</p>
              </div>
            )}
          </section>

          {selected && sideThreadRootId ? (
            <EmberThreadPanel
              conversation={selected}
              rootMessageId={sideThreadRootId}
              currentUserId={user?.id ?? null}
              canSend={canSend}
              onClose={() => setSideThreadRootId(null)}
            />
          ) : null}
        </>
      ) : (
        <div className="ember-shell__main min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {panel === "files" ? <EmberFilesPanel /> : null}
          {panel === "bots" ? <EmberBotsPanel /> : null}
          {panel === "agents" ? <EmberAgentsPanel /> : null}
          {panel === "profile" ? <EmberProfilePanel /> : null}
          {panel === "push" ? <EmberPushPanel /> : null}
          {panel === "settings" ? <EmberSettingsPanel /> : null}
          {panel === "styles" ? <EmberStylesPanel /> : null}
          {canManage && (panel === "bots" || panel === "agents" || panel === "settings" || panel === "styles") ? (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-[color:var(--ember-border)] pt-4">
              <AdminChip href="/ember/bots" icon={Bot} label={t("nav.emberBots")} active={panel === "bots"} />
              <AdminChip href="/ember/agents" icon={Sparkles} label={t("nav.emberAgents")} active={panel === "agents"} />
              <AdminChip href="/ember/settings" icon={Settings} label={t("nav.emberSettings")} active={panel === "settings"} />
              <AdminChip href="/ember/styles" icon={Bell} label={t("nav.emberStyles")} active={panel === "styles"} />
            </div>
          ) : null}
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
          <DirectoryPicker
            onSelect={(person) => {
              if (!person.userId) {
                toast.error(t("chat.noLoginTitle"));
                return;
              }
              direct.mutate({ otherUserId: person.userId });
            }}
          />
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
            onOpenMessage={(message) =>
              openJump({
                messageId: message.id,
                conversationId: message.conversationId,
                createdAt: message.createdAt,
                snippet: message.snippet,
              })
            }
            onOpenPerson={(person) => {
              setSearchOpen(false);
              if (person.userId) direct.mutate({ otherUserId: person.userId });
            }}
            onOpenFile={(file) => {
              if (file.messageId && file.messageCreatedAt) {
                openJump({
                  messageId: file.messageId,
                  conversationId: file.conversationId,
                  createdAt: file.messageCreatedAt,
                  snippet: file.filename,
                });
              } else {
                openConversation(file.conversationId);
                setSearchOpen(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RailLink({
  href,
  active,
  label,
  icon: Icon,
  badge,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: typeof Home;
  badge?: string | null;
}) {
  return (
    <Link href={href} className={cn("ember-shell__rail-btn relative", active && "is-active")} aria-label={label} title={label}>
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {badge ? (
        <span className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[color:var(--ember-unread)] px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function AdminChip({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: typeof Bot;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ember-border)] px-3 py-1.5 text-xs font-semibold",
        active ? "bg-[color:var(--ember-active)] text-[color:var(--ember-accent)]" : "text-[color:var(--ember-muted)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function Section({
  label,
  rows,
  selectedId,
  onSelect,
  channel = false,
}: {
  label: string;
  rows: ReturnType<typeof withDirectPeerLabels>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  channel?: boolean;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="ember-shell__section-label px-2 py-1.5">{label}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => {
          const name = emberChannelLabel(row, (key, options) => t(key, options));
          const unread = row.unreadCount > 0 ? chatUnreadBadgeLabel(row.unreadCount) : null;
          return (
            <li key={row.id}>
              <button
                type="button"
                className={cn("ember-shell__row", selectedId === row.id && "is-active")}
                onClick={() => onSelect(row.id)}
              >
                {channel ? <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" /> : <Users className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                <span className="min-w-0 flex-1 truncate">{name.replace(/^#/, "")}</span>
                {unread ? (
                  <span className="rounded-full bg-[color:var(--ember-unread)] px-1.5 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
