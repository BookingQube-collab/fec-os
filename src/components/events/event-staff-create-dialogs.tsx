"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  EventStaffAddExistingForm,
  EventStaffBulkImportActions,
  EventStaffCreateHireForm,
  type EventStaffFormOption,
} from "@/components/events/event-staff-assignment-forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEvent, useEventOptions, useEventRoles, useEventStaffAssignments } from "@/hooks/queries/useEvents";

export type EventStaffCreateEventOption = {
  id: string;
  name: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

function EventPicker({
  events,
  value,
  onChange,
}: {
  events: EventStaffCreateEventOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{t("peopleEvent.filters.event")}</label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder={t("peopleEvent.create.pickEvent")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("peopleEvent.create.pickEvent")}</SelectItem>
          {events.map((ev) => (
            <SelectItem key={ev.id} value={ev.id}>
              {ev.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function EventStaffIndividualCreateDialog({
  open,
  onOpenChange,
  events,
  initialEventId,
  canHire,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: EventStaffCreateEventOption[];
  initialEventId?: string;
  canHire: boolean;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [eventId, setEventId] = useState(initialEventId ?? "");
  const [tab, setTab] = useState<"existing" | "hire">("existing");
  const options = useEventOptions({ enabled: open });
  const rolesQ = useEventRoles(open ? eventId || null : null);
  const staffingQ = useEventStaffAssignments(open ? eventId || null : null);
  const eventQ = useEvent(open ? eventId || null : null);

  useEffect(() => {
    if (open) setEventId(initialEventId ?? "");
  }, [open, initialEventId]);

  const defaults = useMemo(() => {
    const selected = events.find((e) => e.id === eventId);
    const from =
      staffingQ.data?.eventWindow.dateFrom ??
      selected?.dateFrom ??
      eventQ.data?.event?.event_start?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10);
    const to =
      staffingQ.data?.eventWindow.dateTo ??
      selected?.dateTo ??
      eventQ.data?.event?.event_end?.slice(0, 10) ??
      from;
    return { from, to };
  }, [events, eventId, staffingQ.data?.eventWindow, eventQ.data?.event]);

  const staff = useMemo((): EventStaffFormOption[] => {
    const raw =
      (options.data?.staff as EventStaffFormOption[] | undefined) ?? [];
    return raw;
  }, [options.data?.staff]);

  function handleCreated() {
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("peopleEvent.create.individualTitle")}</DialogTitle>
          <DialogDescription>{t("peopleEvent.create.individualHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <EventPicker events={events} value={eventId} onChange={setEventId} />
          {!eventId ? (
            <p className="text-sm text-muted-foreground">{t("peopleEvent.create.needEvent")}</p>
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "hire")}>
              <TabsList>
                <TabsTrigger value="existing">{t("peopleEvent.create.tabExisting")}</TabsTrigger>
                {canHire ? (
                  <TabsTrigger value="hire">{t("peopleEvent.create.tabHire")}</TabsTrigger>
                ) : null}
              </TabsList>
              <TabsContent value="existing" className="mt-3">
                <EventStaffAddExistingForm
                  key={`${eventId}-${defaults.from}-${defaults.to}-existing`}
                  eventId={eventId}
                  staff={staff}
                  roles={rolesQ.data?.roles ?? []}
                  defaultFrom={defaults.from}
                  defaultTo={defaults.to}
                  onCreated={handleCreated}
                />
              </TabsContent>
              {canHire ? (
                <TabsContent value="hire" className="mt-3">
                  <EventStaffCreateHireForm
                    key={`${eventId}-${defaults.from}-${defaults.to}-hire`}
                    eventId={eventId}
                    roles={rolesQ.data?.roles ?? []}
                    defaultFrom={defaults.from}
                    defaultTo={defaults.to}
                    onCreated={handleCreated}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          )}
          {!canHire ? (
            <p className="text-xs text-muted-foreground">{t("events.staffing.hireNeedsPeople")}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EventStaffBulkCreateDialog({
  open,
  onOpenChange,
  events,
  initialEventId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: EventStaffCreateEventOption[];
  initialEventId?: string;
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const [eventId, setEventId] = useState(initialEventId ?? "");

  useEffect(() => {
    if (open) setEventId(initialEventId ?? "");
  }, [open, initialEventId]);

  function handleImported() {
    onImported();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("peopleEvent.create.bulkTitle")}</DialogTitle>
          <DialogDescription>{t("peopleEvent.create.bulkHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <EventPicker events={events} value={eventId} onChange={setEventId} />
          {!eventId ? (
            <p className="text-sm text-muted-foreground">{t("peopleEvent.create.needEvent")}</p>
          ) : (
            <EventStaffBulkImportActions
              eventId={eventId}
              onImported={handleImported}
            />
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
