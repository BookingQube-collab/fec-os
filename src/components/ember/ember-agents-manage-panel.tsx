"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createChatAgent,
  deleteChatAgent,
  listChatAgents,
  updateChatAgent,
} from "@/lib/chat/agents.functions";
import { queryKeys } from "@/lib/query-keys";

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export function EmberAgentsManagePanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mentionKey, setMentionKey] = useState("ember");
  const [displayName, setDisplayName] = useState("Ember");
  const [instructions, setInstructions] = useState("You are a helpful FEC operations assistant.");

  const agentsQuery = useQuery({
    queryKey: [...queryKeys.chat.all, "agents"],
    queryFn: async () => unwrap(await listChatAgents()),
  });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await createChatAgent({
          mentionKey,
          displayName,
          instructions,
        }),
      ),
    onSuccess: () => {
      toast.success(t("ember.agentCreated"));
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.chat.all, "agents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t("ember.agentsManageHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="agent-mention">{t("ember.agentMention")}</Label>
          <Input
            id="agent-mention"
            value={mentionKey}
            onChange={(e) => setMentionKey(e.target.value.toLowerCase())}
            maxLength={32}
            dir="ltr"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-name">{t("ember.agentName")}</Label>
          <Input id="agent-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agent-instructions">{t("ember.agentInstructions")}</Label>
        <Textarea
          id="agent-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          maxLength={8000}
        />
      </div>
      <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
        {t("ember.createAgent")}
      </Button>

      <ul className="space-y-3">
        {(agentsQuery.data ?? []).map((agent) => (
          <li key={agent.id} className="rounded-md border border-border p-3 text-sm">
            <p className="font-medium">
              @{agent.mentionKey} — {agent.displayName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{agent.instructions || t("ember.agentNoInstructions")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    unwrap(await updateChatAgent({ agentId: agent.id, enabled: !agent.enabled }));
                    void queryClient.invalidateQueries({ queryKey: [...queryKeys.chat.all, "agents"] });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("ember.agentError"));
                  }
                }}
              >
                {agent.enabled ? t("ember.disableAgent") : t("ember.enableAgent")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={async () => {
                  try {
                    unwrap(await deleteChatAgent({ agentId: agent.id }));
                    void queryClient.invalidateQueries({ queryKey: [...queryKeys.chat.all, "agents"] });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("ember.agentError"));
                  }
                }}
              >
                {t("ember.deleteAgent")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
