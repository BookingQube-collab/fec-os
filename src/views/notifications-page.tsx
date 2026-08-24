"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  getNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  upsertNotificationPreference,
} from "@/lib/notifications.functions";
import { useActionInbox } from "@/hooks/queries/useNotifications";
import { useAuth } from "@/hooks/use-auth";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CATEGORIES = [
  "general",
  "escalation",
  "kpi",
  "sop",
  "compliance",
  "snag",
  "inventory",
  "procurement",
  "maintenance",
  "events",
  "people",
] as const;

function NotificationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: inbox, isLoading } = useActionInbox(user?.id, { enabled: !!user });
  const { data: prefs } = useQuery({
    queryKey: ["notifications", "prefs"],
    queryFn: () => getNotificationPreferences(),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead({ id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      toast.success(t("inbox.markedAllRead"));
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
  const savePref = useMutation({
    mutationFn: (payload: { category: (typeof CATEGORIES)[number]; channelInApp: boolean; channelEmail: boolean }) =>
      upsertNotificationPreference(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications", "prefs"] }),
  });

  const items = inbox?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t("inbox.pageTitle")}</h1>
          <p className="text-xs text-muted-foreground">{t("inbox.pageSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
          <CheckCheck className="mr-1 h-4 w-4" />
          {t("inbox.markAllRead")}
        </Button>
      </header>

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">{t("inbox.tabInbox")}</TabsTrigger>
          <TabsTrigger value="preferences">{t("inbox.tabPreferences")}</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="rounded-lg border border-border bg-card divide-y divide-border">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">{t("inbox.loading")}</p>
          ) : !items.length ? (
            <p className="p-4 text-sm text-muted-foreground">{t("inbox.empty")}</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className="flex items-start gap-3 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {n.titleKey ? t(n.titleKey, n.titleParams) : n.title}
                    </span>
                    {!n.readAt && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                  {n.actionUrl && (
                    <Link href={n.actionUrl} className="mt-1 inline-block text-xs text-primary hover:underline">
                      {t("inbox.open")}
                    </Link>
                  )}
                </div>
                {n.persisted && !n.readAt && n.id.startsWith("notif:") && (
                  <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id.slice(6))}>
                    {t("inbox.markRead")}
                  </Button>
                )}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="preferences" className="space-y-3">
          {CATEGORIES.map((cat) => {
            const pref = prefs?.find((p) => p.category === cat);
            return (
              <div key={cat} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                <div>
                  <div className="text-sm font-medium capitalize">{t(`inbox.kinds.${cat}`, { defaultValue: cat })}</div>
                  <div className="text-xs text-muted-foreground">{t("inbox.prefHint")}</div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    {t("inbox.channelInApp")}
                    <Switch
                      checked={pref?.channel_in_app ?? true}
                      onCheckedChange={(v) =>
                        savePref.mutate({ category: cat, channelInApp: v, channelEmail: pref?.channel_email ?? false })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    {t("inbox.channelEmail")}
                    <Switch
                      checked={pref?.channel_email ?? false}
                      onCheckedChange={(v) =>
                        savePref.mutate({ category: cat, channelInApp: pref?.channel_in_app ?? true, channelEmail: v })
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default NotificationsPage;
