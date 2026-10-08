"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DirectoryPicker } from "@/components/chat/directory-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addMember, leaveConversation, removeMember, setMemberRole } from "@/lib/chat.functions";
import type { ChatDirectoryPerson, ChatMemberRow } from "@/lib/chat.functions";
import { CHAT_ASSIGNABLE_ROLES } from "@/lib/chat/group-rules";
import { queryKeys } from "@/lib/query-keys";

function displayName(member: ChatMemberRow, fallback: string): string {
  return member.fullName?.trim() || member.employeeCode?.trim() || fallback;
}

export function MemberManager({
  conversationId,
  members,
  currentUserId,
  canManage,
}: {
  conversationId: string;
  members: ChatMemberRow[];
  currentUserId: string | null;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [person, setPerson] = useState<ChatDirectoryPerson | null>(null);
  const [role, setRole] = useState<(typeof CHAT_ASSIGNABLE_ROLES)[number]>("MEMBER");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
  }

  function fail(result: { ok: false; error: string } | { ok: true }) {
    if (!result.ok) toast.error(result.error);
  }

  const add = useMutation({
    mutationFn: addMember,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPerson(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: removeMember,
    onSuccess: async (result) => {
      fail(result);
      if (result.ok) await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeRole = useMutation({
    mutationFn: setMemberRole,
    onSuccess: async (result) => {
      fail(result);
      if (result.ok) await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const leave = useMutation({
    mutationFn: leaveConversation,
    onSuccess: async (result) => {
      fail(result);
      if (result.ok) await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const self = members.find((member) => member.userId === currentUserId);
  const selfLocked = self?.membershipSource === "DEPARTMENT" || self?.membershipSource === "SITE";

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">{t("chat.members")}</h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {members.map((member) => {
          const name = displayName(member, t("chat.unnamedPerson"));
          const locked = member.membershipSource === "DEPARTMENT" || member.membershipSource === "SITE";
          const isSelf = member.userId === currentUserId;
          return (
            <li key={member.userId} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`chat.roles.${member.role}`, { defaultValue: member.role })}
                  {member.employeeCode ? ` · ${member.employeeCode}` : ""}
                  {locked ? ` · ${t("chat.sourceLocked")}` : ` · ${t("chat.sourceManual")}`}
                </p>
              </div>
              {canManage && !isSelf && member.role !== "OWNER" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="sr-only" htmlFor={`chat-role-${member.userId}`}>
                    {t("chat.changeRole", { name })}
                  </Label>
                  <Select
                    value={(CHAT_ASSIGNABLE_ROLES as readonly string[]).includes(member.role) ? member.role : "MEMBER"}
                    onValueChange={(next) => {
                      if (!(CHAT_ASSIGNABLE_ROLES as readonly string[]).includes(next) || next === member.role) return;
                      changeRole.mutate({
                        conversationId,
                        userId: member.userId,
                        role: next as (typeof CHAT_ASSIGNABLE_ROLES)[number],
                      });
                    }}
                  >
                    <SelectTrigger id={`chat-role-${member.userId}`} aria-label={t("chat.changeRole", { name })} className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHAT_ASSIGNABLE_ROLES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`chat.roles.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {member.membershipSource === "MANUAL" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => remove.mutate({ conversationId, userId: member.userId })}
                    >
                      {t("chat.remove")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canManage ? (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <DirectoryPicker selectedUserId={person?.userId} onSelect={setPerson} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label>{t("chat.yourRole")}</Label>
              <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <SelectTrigger aria-label={t("chat.yourRole")} className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHAT_ASSIGNABLE_ROLES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`chat.roles.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={!person || add.isPending}
              onClick={() => {
                if (!person?.userId) return;
                add.mutate({ conversationId, userId: person.userId, role });
              }}
            >
              {add.isPending ? t("chat.adding") : t("chat.addMember")}
            </Button>
          </div>
        </div>
      ) : null}

      {self && self.role !== "OWNER" ? (
        selfLocked ? (
          <p className="text-sm text-muted-foreground">{t("chat.sourceLocked")}</p>
        ) : (
          <Button type="button" variant="outline" onClick={() => leave.mutate({ conversationId })} disabled={leave.isPending}>
            {t("chat.leave")}
          </Button>
        )
      ) : null}
    </section>
  );
}
