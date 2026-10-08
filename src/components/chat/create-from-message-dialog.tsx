"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSites } from "@/hooks/queries/useSites";
import {
  CHAT_FACILITY_CATEGORIES,
  CHAT_HANDOVER_SHIFTS,
  CHAT_INCIDENT_SEVERITIES,
  chatActionPrefill,
  type ChatActionKind,
  type ChatFacilityCategory,
  type ChatHandoverShift,
  type ChatIncidentSeverity,
} from "@/lib/chat/action-rules";
import { INCIDENT_TYPES, INCIDENT_TYPE_LABELS, type IncidentType } from "@/lib/daily-ops/constants";
import { chatReminderDateIssue } from "@/lib/chat/reminder-rules";

export type CreateFromMessageInput = {
  locationId?: string;
  incidentCategory?: IncidentType;
  incidentSeverity?: ChatIncidentSeverity;
  taskCategory?: ChatFacilityCategory;
  taskDueDate?: string;
  handoverShift?: ChatHandoverShift;
  reminderOn?: string;
};

export function CreateFromMessageDialog({
  open,
  action,
  messageBody,
  conversationLocationId,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  action: ChatActionKind;
  messageBody: string;
  conversationLocationId: string | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateFromMessageInput) => void;
}) {
  const { t } = useTranslation();
  const sites = useSites({ enabled: open && action !== "REMINDER" });
  const [pickedLocationId, setPickedLocationId] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [taskCategory, setTaskCategory] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [handoverShift, setHandoverShift] = useState("");
  const [reminderOn, setReminderOn] = useState("");
  const prefill = chatActionPrefill(action, messageBody);
  const preview =
    prefill == null
      ? null
      : prefill.kind === "MAINTENANCE_TICKET" || prefill.kind === "TASK"
        ? prefill.description
        : prefill.kind === "PURCHASE_REQUEST"
          ? prefill.justification
          : prefill.kind === "HANDOVER"
            ? prefill.note
            : prefill.kind === "REMINDER"
              ? prefill.body
              : (prefill.detail ?? prefill.summary);
  const conversationSite = (sites.data ?? []).find((site) => site.id === conversationLocationId) ?? null;
  const needsReminder = action === "REMINDER";
  const needsLocation = !needsReminder && conversationSite == null;
  const needsIncident = action === "INCIDENT";
  const needsTask = action === "TASK";
  const needsHandover = action === "HANDOVER";
  const dueDateOk = taskDueDate.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(taskDueDate);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
  const reminderIssue = needsReminder && reminderOn.length > 0 ? chatReminderDateIssue(reminderOn, today) : null;
  const canSubmit =
    preview != null &&
    !pending &&
    (!needsLocation || !sites.isLoading) &&
    (!needsLocation || pickedLocationId.length > 0) &&
    (!needsIncident || (category.length > 0 && severity.length > 0)) &&
    (!needsTask || (taskCategory.length > 0 && dueDateOk)) &&
    (!needsHandover || handoverShift.length > 0) &&
    (!needsReminder || (reminderOn.length > 0 && reminderIssue == null));

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      locationId: needsLocation ? pickedLocationId : undefined,
      incidentCategory: needsIncident ? (category as IncidentType) : undefined,
      incidentSeverity: needsIncident ? (severity as ChatIncidentSeverity) : undefined,
      taskCategory: needsTask ? (taskCategory as ChatFacilityCategory) : undefined,
      taskDueDate: needsTask && taskDueDate.length > 0 ? taskDueDate : undefined,
      handoverShift: needsHandover ? (handoverShift as ChatHandoverShift) : undefined,
      reminderOn: needsReminder ? reminderOn : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(`chat.createActions.${action}`)}</DialogTitle>
          <DialogDescription>{t("chat.actionDialogHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium">{t("chat.actionPrefill")}</p>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              {preview ?? t("chat.actionNoText")}
            </p>
          </div>
          {needsReminder ? null : conversationSite ? (
            <p className="text-sm text-muted-foreground">
              {t("chat.actionUsingLocation", { name: `${conversationSite.code} — ${conversationSite.name}` })}
            </p>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="chat-action-location">{t("chat.actionLocation")}</Label>
              <Select value={pickedLocationId || undefined} onValueChange={setPickedLocationId}>
                <SelectTrigger id="chat-action-location">
                  <SelectValue placeholder={t("chat.actionLocationPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {(sites.data ?? []).map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.code} — {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {needsIncident ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="chat-action-type">{t("chat.actionIncidentType")}</Label>
                <Select value={category || undefined} onValueChange={setCategory}>
                  <SelectTrigger id="chat-action-type">
                    <SelectValue placeholder={t("chat.actionChooseType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`chat.incidentTypes.${type}`, { defaultValue: INCIDENT_TYPE_LABELS[type] })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="chat-action-severity">{t("chat.actionIncidentSeverity")}</Label>
                <Select value={severity || undefined} onValueChange={setSeverity}>
                  <SelectTrigger id="chat-action-severity">
                    <SelectValue placeholder={t("chat.actionChooseSeverity")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAT_INCIDENT_SEVERITIES.map((level) => (
                      <SelectItem key={level} value={level}>
                        {t(`chat.severities.${level}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          {action === "PURCHASE_REQUEST" ? <p className="text-sm text-muted-foreground">{t("chat.actionPrDraftNote")}</p> : null}
          {needsTask ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="chat-action-task-category">{t("chat.actionTaskCategory")}</Label>
                <Select value={taskCategory || undefined} onValueChange={setTaskCategory}>
                  <SelectTrigger id="chat-action-task-category">
                    <SelectValue placeholder={t("chat.actionChooseType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAT_FACILITY_CATEGORIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {t(`chat.taskCategories.${item}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="chat-action-due">{t("chat.actionDueDate")}</Label>
                <Input id="chat-action-due" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
              </div>
            </div>
          ) : null}
          {needsReminder ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("chat.actionReminderHint")}</p>
              <div className="space-y-1">
                <Label htmlFor="chat-action-reminder">{t("chat.actionReminderDate")}</Label>
                <Input
                  id="chat-action-reminder"
                  type="date"
                  min={today}
                  value={reminderOn}
                  onChange={(event) => setReminderOn(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          {needsHandover ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("chat.actionHandoverHint")}</p>
              <div className="space-y-1">
                <Label htmlFor="chat-action-shift">{t("chat.actionShift")}</Label>
                <Select value={handoverShift || undefined} onValueChange={setHandoverShift}>
                  <SelectTrigger id="chat-action-shift">
                    <SelectValue placeholder={t("chat.actionChooseShift")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAT_HANDOVER_SHIFTS.map((shift) => (
                      <SelectItem key={shift} value={shift}>
                        {t(`chat.shifts.${shift}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("chat.actionCancel")}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            {t("chat.actionConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
