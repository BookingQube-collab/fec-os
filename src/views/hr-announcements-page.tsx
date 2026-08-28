"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createAnnouncement,
  listAnnouncements,
  setAnnouncementActive,
} from "@/lib/hr-announcements.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrAnnouncementsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expires, setExpires] = useState("");

  const list = useQuery({
    queryKey: queryKeys.people.hrAnnouncements({ includeInactive: true }),
    queryFn: () => listAnnouncements({ includeInactive: true }),
    staleTime: STALE.people,
  });

  const create = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: () => {
      toast.success(t("hr.announcements.created"));
      setTitle("");
      setBody("");
      setExpires("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrAnnouncements() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: setAnnouncementActive,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrAnnouncements() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={<p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("hr.announcements.noAccess")}</p>}
    >
      <div className="space-y-6">
        <PageHeader
          icon={Megaphone}
          kicker={t("hr.announcements.kicker")}
          title={t("hr.announcements.title")}
          subtitle={t("hr.announcements.subtitle")}
        />

        <NeumorphicCard className="space-y-3 p-5">
          <div>
            <Label>{t("hr.announcements.fieldTitle")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>{t("hr.announcements.fieldBody")}</Label>
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="max-w-xs">
            <Label>{t("hr.announcements.expires")}</Label>
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
          <Button
            disabled={!title.trim() || !body.trim() || create.isPending}
            onClick={() => create.mutate({ title: title.trim(), body: body.trim(), expiresAt: expires || null })}
          >
            {t("hr.announcements.publish")}
          </Button>
        </NeumorphicCard>

        <NeumorphicCard className="space-y-2 p-5">
          {(list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hr.announcements.empty")}</p>
          ) : (
            (list.data ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{row.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.active ? "success" : "muted"}>
                      {row.active ? t("hr.announcements.active") : t("hr.announcements.inactive")}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggle.mutate({ id: row.id, active: !row.active })}
                    >
                      {row.active ? t("hr.announcements.deactivate") : t("hr.announcements.activate")}
                    </Button>
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{row.body}</p>
              </div>
            ))
          )}
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}
