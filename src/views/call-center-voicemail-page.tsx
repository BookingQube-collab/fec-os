"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Voicemail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import {
  createCallCenterTestVoicemail,
  loadCallCenterVoicemails,
  markCallCenterVoicemailListened,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterVoicemailPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view");
  const [filter, setFilter] = useState<"pending" | "listened" | "all">("pending");

  const inbox = useQuery({
    queryKey: ["call-center", "voicemails", filter],
    enabled: canUse,
    refetchInterval: 8_000,
    queryFn: async () => {
      const result = await loadCallCenterVoicemails(
        filter === "all" ? {} : { status: filter },
      );
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.voicemailTitle" subtitleKey="callCenter.voicemailSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.voicemailTitle" subtitleKey="callCenter.voicemailSubtitle">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["pending", "listened", "all"] as const).map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ms-auto"
            onClick={async () => {
              const result = await createCallCenterTestVoicemail({});
              if (!result.ok) toast.error(result.error);
              else {
                toast.success(t("callCenter.voicemailCreated"));
                await queryClient.invalidateQueries({ queryKey: ["call-center", "voicemails"] });
              }
            }}
          >
            {t("callCenter.addTestVoicemail")}
          </Button>
        ) : null}
      </div>

      {inbox.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (inbox.data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("callCenter.voicemailEmpty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {(inbox.data ?? []).map((vm) => (
            <li
              key={vm.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/50 bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Voicemail className="h-4 w-4 text-foreground/70" aria-hidden />
                  <p className="font-mono text-sm font-semibold">{vm.fromE164 || "unknown"}</p>
                  <Badge variant={vm.status === "pending" ? "destructive" : "secondary"}>
                    {vm.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{vm.promptText || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(vm.createdAt).toLocaleString()}
                  {vm.toE164 ? ` · to ${vm.toE164}` : ""}
                </p>
                {vm.recordingUrl ? (
                  <audio controls className="mt-2 max-w-full" src={vm.recordingUrl}>
                    <track kind="captions" />
                  </audio>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("callCenter.voicemailNoAudio")}</p>
                )}
              </div>
              {vm.status === "pending" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    const result = await markCallCenterVoicemailListened({ id: vm.id });
                    if (!result.ok) toast.error(result.error);
                    else {
                      toast.success(t("callCenter.voicemailMarked"));
                      await queryClient.invalidateQueries({ queryKey: ["call-center", "voicemails"] });
                    }
                  }}
                >
                  {t("callCenter.markListened")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </CallCenterShell>
  );
}

export default CallCenterVoicemailPage;
