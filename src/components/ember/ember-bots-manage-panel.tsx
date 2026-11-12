"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyConversations } from "@/hooks/queries/useChat";
import {
  createChatBot,
  deleteChatBot,
  listChatBots,
  rotateChatBotToken,
  setChatBotEnabled,
  setChatBotRooms,
  type ChatBotRow,
} from "@/lib/chat/bots.functions";
import { queryKeys } from "@/lib/query-keys";

function unwrapBot<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export function EmberBotsManagePanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const conversations = useMyConversations();
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [revealed, setRevealed] = useState<ChatBotRow | null>(null);

  const botsQuery = useQuery({
    queryKey: [...queryKeys.chat.all, "bots"],
    queryFn: async () => unwrapBot(await listChatBots()),
  });

  const rooms = useMemo(
    () => (conversations.data ?? []).filter((row) => row.kind !== "DIRECT"),
    [conversations.data],
  );

  const create = useMutation({
    mutationFn: async () =>
      unwrapBot(
        await createChatBot({
          name,
          conversationIds: roomId ? [roomId] : [],
        }),
      ),
    onSuccess: (bot) => {
      setRevealed(bot);
      setName("");
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.chat.all, "bots"] });
      toast.success(t("ember.botsCreated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t("ember.botsManageHint")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ember-bot-name">{t("ember.botName")}</Label>
          <Input id="ember-bot-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ember-bot-room">{t("ember.botRoom")}</Label>
          <select
            id="ember-bot-room"
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">{t("ember.botRoomPick")}</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.title || room.id}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="button" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
        {t("ember.createBot")}
      </Button>

      {revealed?.webhookToken && revealed.webhookPath ? (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">{t("ember.botTokenOnce")}</p>
          <p className="break-all font-mono text-xs" dir="ltr">
            {origin}
            {revealed.webhookPath}
            {revealed.roomIds[0] ? `?channel=${revealed.roomIds[0]}` : "?channel=<conversation-uuid>"}
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground" dir="ltr">
            token: {revealed.webhookToken}
          </p>
        </div>
      ) : null}

      <ul className="space-y-3">
        {(botsQuery.data ?? []).map((bot) => (
          <li key={bot.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{bot.name}</p>
                <p className="text-xs text-muted-foreground">
                  {bot.enabled ? t("ember.botEnabled") : t("ember.botDisabled")} · …{bot.webhookTokenPrefix}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const next = unwrapBot(await setChatBotEnabled({ botId: bot.id, enabled: !bot.enabled }));
                      toast.success(next.enabled ? t("ember.botEnabled") : t("ember.botDisabled"));
                      void queryClient.invalidateQueries({ queryKey: [...queryKeys.chat.all, "bots"] });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("ember.botError"));
                    }
                  }}
                >
                  {bot.enabled ? t("ember.disableBot") : t("ember.enableBot")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const rotated = unwrapBot(await rotateChatBotToken({ botId: bot.id }));
                      setRevealed({
                        ...bot,
                        webhookToken: rotated.webhookToken,
                        webhookPath: rotated.webhookPath,
                        webhookTokenPrefix: rotated.webhookTokenPrefix,
                      });
                      void queryClient.invalidateQueries({ queryKey: [...queryKeys.chat.all, "bots"] });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("ember.botError"));
                    }
                  }}
                >
                  {t("ember.rotateToken")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!roomId) {
                      toast.error(t("ember.botRoomPick"));
                      return;
                    }
                    try {
                      unwrapBot(await setChatBotRooms({ botId: bot.id, conversationIds: [roomId] }));
                      toast.success(t("ember.botRoomsSaved"));
                      void queryClient.invalidateQueries({ queryKey: [...queryKeys.chat.all, "bots"] });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("ember.botError"));
                    }
                  }}
                >
                  {t("ember.assignRoom")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    try {
                      unwrapBot(await deleteChatBot({ botId: bot.id }));
                      void queryClient.invalidateQueries({ queryKey: [...queryKeys.chat.all, "bots"] });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("ember.botError"));
                    }
                  }}
                >
                  {t("ember.deleteBot")}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
