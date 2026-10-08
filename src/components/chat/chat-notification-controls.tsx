"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useGlobalChatNotification } from "@/hooks/queries/useChat";
import { setConversationChatNotification, setGlobalChatNotification } from "@/lib/chat.functions";
import { queryKeys } from "@/lib/query-keys";

const LEVELS = ["ALL", "MENTIONS", "MUTED"] as const;
type Level = (typeof LEVELS)[number];

function asLevel(value: string | null | undefined): Level {
  if (value === "MENTIONS" || value === "MUTED") return value;
  return "ALL";
}

function LevelRadios({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: Level;
  disabled: boolean;
  onChange: (level: Level) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {LEVELS.map((level) => (
        <label key={level} className="inline-flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={name}
            value={level}
            checked={value === level}
            disabled={disabled}
            onChange={() => onChange(level)}
          />
          {t(`chat.notify.level.${level}`)}
        </label>
      ))}
    </div>
  );
}

export function ConversationNotificationControl({
  conversationId,
  level,
}: {
  conversationId: string;
  level: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const resolved = asLevel(level);
  const [value, setValue] = useState<Level>(resolved);

  useEffect(() => {
    setValue(resolved);
  }, [resolved]);

  const save = useMutation({
    mutationFn: setConversationChatNotification,
    onSuccess: async (result) => {
      if (!result.ok) {
        setValue(resolved);
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    },
    onError: (error: Error) => {
      setValue(resolved);
      toast.error(error.message);
    },
  });

  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-3" disabled={save.isPending}>
      <legend className="px-1 text-sm font-medium">{t("chat.notify.roomLabel")}</legend>
      <LevelRadios
        name={`chat-notify-${conversationId}`}
        value={value}
        disabled={save.isPending}
        onChange={(next) => {
          if (next === value) return;
          setValue(next);
          save.mutate({ conversationId, level: next });
        }}
      />
    </fieldset>
  );
}

export function GlobalChatNotificationControl() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useGlobalChatNotification();
  const resolved = asLevel(settings.data?.level);
  const [level, setLevel] = useState<Level>(resolved);
  const [notifyCalls, setNotifyCalls] = useState(true);
  const [notifyAnnouncements, setNotifyAnnouncements] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setLevel(asLevel(settings.data.level));
    setNotifyCalls(settings.data.notifyCalls);
    setNotifyAnnouncements(settings.data.notifyAnnouncements);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: setGlobalChatNotification,
    onSuccess: async (result) => {
      if (!result.ok) {
        if (settings.data) {
          setLevel(asLevel(settings.data.level));
          setNotifyCalls(settings.data.notifyCalls);
          setNotifyAnnouncements(settings.data.notifyAnnouncements);
        }
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    },
    onError: (error: Error) => {
      if (settings.data) {
        setLevel(asLevel(settings.data.level));
        setNotifyCalls(settings.data.notifyCalls);
        setNotifyAnnouncements(settings.data.notifyAnnouncements);
      }
      toast.error(error.message);
    },
  });

  function persist(next: { level: Level; notifyCalls: boolean; notifyAnnouncements: boolean }) {
    setLevel(next.level);
    setNotifyCalls(next.notifyCalls);
    setNotifyAnnouncements(next.notifyAnnouncements);
    save.mutate(next);
  }

  return (
    <section aria-label={t("chat.notify.globalLabel")} className="mb-2 shrink-0 rounded-lg border border-border bg-card md:mb-3">
      <button
        type="button"
        className="flex min-h-11 w-full items-center px-3 text-start text-sm font-medium md:hidden"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
      >
        {t("chat.notify.globalLabel")}
      </button>
      <div className={cn("px-3 py-2", mobileOpen ? "block" : "hidden", "md:block")}>
      <h2 className="hidden text-sm font-medium md:block">{t("chat.notify.globalLabel")}</h2>
      {settings.isLoading ? <p className="mt-1 text-xs text-muted-foreground">{t("common.loading")}</p> : null}
      {settings.isError ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {settings.error instanceof Error ? settings.error.message : t("chat.loadFailed")}
        </p>
      ) : null}
      {settings.data ? (
        <div className="mt-2 space-y-2">
          <LevelRadios
            name="chat-notify-global"
            value={level}
            disabled={save.isPending}
            onChange={(next) => persist({ level: next, notifyCalls, notifyAnnouncements })}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch
                checked={notifyCalls}
                disabled={save.isPending}
                aria-label={t("chat.notify.calls")}
                onCheckedChange={(checked) => persist({ level, notifyCalls: checked, notifyAnnouncements })}
              />
              {t("chat.notify.calls")}
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch
                checked={notifyAnnouncements}
                disabled={save.isPending}
                aria-label={t("chat.notify.announcements")}
                onCheckedChange={(checked) => persist({ level, notifyCalls, notifyAnnouncements: checked })}
              />
              {t("chat.notify.announcements")}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{t("chat.notify.preferenceOnly")}</p>
        </div>
      ) : null}
      </div>
    </section>
  );
}
