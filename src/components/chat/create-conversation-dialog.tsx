"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { useChatDepartments } from "@/hooks/queries/useChat";
import { createConversation } from "@/lib/chat.functions";
import {
  CHAT_CALL_POLICIES,
  CHAT_FILE_POLICIES,
  CHAT_GROUP_KINDS,
  CHAT_POSTING_POLICIES,
  CHAT_RETENTION_POLICIES,
  createConversationSchema,
  type ChatGroupKind,
} from "@/lib/chat/group-rules";
import { queryKeys } from "@/lib/query-keys";

const fieldClass = "space-y-1.5";

export function CreateConversationDialog({
  open,
  onOpenChange,
  canMarkSensitive,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canMarkSensitive: boolean;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const sites = useSites({ enabled: open });
  const departments = useChatDepartments({ enabled: open });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ChatGroupKind>("PRIVATE");
  const [locationId, setLocationId] = useState("none");
  const [departmentId, setDepartmentId] = useState("none");
  const [postingPolicy, setPostingPolicy] = useState<(typeof CHAT_POSTING_POLICIES)[number]>("MEMBERS");
  const [filePolicy, setFilePolicy] = useState<(typeof CHAT_FILE_POLICIES)[number]>("MEMBERS");
  const [callPolicy, setCallPolicy] = useState<(typeof CHAT_CALL_POLICIES)[number]>("MEMBERS");
  const [retentionPolicy, setRetentionPolicy] = useState<(typeof CHAT_RETENTION_POLICIES)[number]>("FOREVER");
  const [retentionUntil, setRetentionUntil] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: createConversation,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
      toast.success(t("chat.createTitle"));
      onOpenChange(false);
      onCreated(result.data.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit() {
    let until: string | null = null;
    if (retentionPolicy === "CUSTOM" && retentionUntil) {
      const parsedDate = new Date(retentionUntil);
      until = Number.isNaN(parsedDate.getTime()) ? retentionUntil : parsedDate.toISOString();
    }
    const parsed = createConversationSchema.safeParse({
      title,
      description: description.trim() || null,
      kind,
      locationId: locationId === "none" ? null : locationId,
      departmentId: departmentId === "none" ? null : departmentId,
      sensitive: canMarkSensitive && sensitive,
      postingPolicy,
      filePolicy,
      callPolicy,
      retentionPolicy,
      retentionUntil: until,
    });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? t("chat.loadFailed"));
      return;
    }
    setFormError(null);
    create.mutate({
      title: title.trim(),
      description: description.trim() || null,
      kind,
      locationId: locationId === "none" ? null : locationId,
      departmentId: departmentId === "none" ? null : departmentId,
      sensitive: canMarkSensitive && sensitive,
      postingPolicy,
      filePolicy,
      callPolicy,
      retentionPolicy,
      retentionUntil: until,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("chat.createTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("chat.createHint")}</p>
        <div className={fieldClass}>
          <Label htmlFor="chat-name">{t("chat.name")}</Label>
          <Input id="chat-name" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className={fieldClass}>
          <Label htmlFor="chat-description">{t("chat.description")}</Label>
          <Textarea
            id="chat-description"
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <PolicySelect label={t("chat.kind")} value={kind} onChange={(value) => setKind(value as ChatGroupKind)} options={CHAT_GROUP_KINDS} translate={(value) => t(`chat.kinds.${value}`)} />
        <PolicySelect
          label={t("chat.location")}
          value={locationId}
          onChange={setLocationId}
          options={["none", ...(sites.data ?? []).map((site) => site.id)]}
          translate={(value) => (value === "none" ? t("chat.none") : (sites.data ?? []).find((site) => site.id === value)?.name ?? value)}
        />
        <PolicySelect
          label={t("chat.department")}
          value={departmentId}
          onChange={setDepartmentId}
          options={["none", ...(departments.data ?? []).map((department) => department.id)]}
          translate={(value) =>
            value === "none" ? t("chat.none") : (departments.data ?? []).find((department) => department.id === value)?.name ?? value
          }
        />
        {departments.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {departments.error instanceof Error ? departments.error.message : t("chat.loadFailed")}
          </p>
        ) : null}
        <PolicySelect label={t("chat.posting")} value={postingPolicy} onChange={(value) => setPostingPolicy(value as typeof postingPolicy)} options={CHAT_POSTING_POLICIES} translate={(value) => t(`chat.policy.${value}`)} />
        <PolicySelect label={t("chat.files")} value={filePolicy} onChange={(value) => setFilePolicy(value as typeof filePolicy)} options={CHAT_FILE_POLICIES} translate={(value) => t(`chat.policy.${value}`)} />
        <PolicySelect label={t("chat.calls")} value={callPolicy} onChange={(value) => setCallPolicy(value as typeof callPolicy)} options={CHAT_CALL_POLICIES} translate={(value) => t(`chat.policy.${value}`)} />
        <PolicySelect
          label={t("chat.retention")}
          value={retentionPolicy}
          onChange={(value) => setRetentionPolicy(value as typeof retentionPolicy)}
          options={CHAT_RETENTION_POLICIES}
          translate={(value) => t(`chat.policy.${value}`)}
        />
        {retentionPolicy === "CUSTOM" ? (
          <div className={fieldClass}>
            <Label htmlFor="chat-retention-until">{t("chat.retentionUntil")}</Label>
            <Input
              id="chat-retention-until"
              type="datetime-local"
              value={retentionUntil}
              onChange={(event) => setRetentionUntil(event.target.value)}
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="chat-sensitive">{t("chat.sensitive")}</Label>
            <p className="text-xs text-muted-foreground">{t("chat.sensitiveHint")}</p>
          </div>
          <Switch
            id="chat-sensitive"
            checked={canMarkSensitive && sensitive}
            disabled={!canMarkSensitive}
            onCheckedChange={setSensitive}
            aria-label={t("chat.sensitive")}
          />
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("chat.creating") : t("chat.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicySelect({
  label,
  value,
  onChange,
  options,
  translate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  translate: (value: string) => string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {translate(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
