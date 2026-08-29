"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
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
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.announcements.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Megaphone}
          kicker={t("hr.announcements.kicker")}
          title={t("hr.announcements.title")}
          subtitle={t("hr.announcements.subtitle")}
        >
          <HrPanel delay={0}>
            <div className="space-y-3 p-4 sm:p-5">
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
            </div>
          </HrPanel>

          <HrPanel delay={1}>
            <div className="space-y-2 p-4 sm:p-5">
              {(list.data ?? []).length === 0 ? (
                <HrEmptyState message={t("hr.announcements.empty")} icon={Megaphone} />
              ) : (
                (list.data ?? []).map((row) => (
                  <div key={row.id} className="hr-list-row !items-start flex-col sm:!items-center sm:flex-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium tracking-tight">{row.title}</p>
                        <Badge variant={row.active ? "success" : "muted"}>
                          {row.active ? t("hr.announcements.active") : t("hr.announcements.inactive")}
                        </Badge>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{row.body}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggle.mutate({ id: row.id, active: !row.active })}
                    >
                      {row.active ? t("hr.announcements.deactivate") : t("hr.announcements.activate")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
