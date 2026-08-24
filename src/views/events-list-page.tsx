"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { EventHealthBadge } from "@/components/events/event-health-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEventOptions, useEventsList } from "@/hooks/queries/useEvents";
import { fmtQar } from "@/lib/currency";
import { useAppStore } from "@/stores/app-store";

export default function EventsListPage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const locationId = useAppStore((s) => s.currentLocationId);
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState("all");
  const [stageId, setStageId] = useState("all");
  const options = useEventOptions();
  const filters = useMemo(
    () => ({
      locationId,
      search: search.trim() || null,
      health: health === "all" ? null : (health as "green" | "amber" | "red" | "critical"),
      stageId: stageId === "all" ? null : stageId,
    }),
    [locationId, search, health, stageId],
  );
  const list = useEventsList(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("events.kicker")}
        title={t("events.list.title")}
        subtitle={t("events.list.subtitle")}
        actions={
          <CapabilityGate capability="events.create">
            <Button size="sm" asChild>
              <Link href="/events/new">{t("events.new")}</Link>
            </Button>
          </CapabilityGate>
        }
      />

      <div className="flex flex-wrap gap-3 rounded-2xl border border-border/40 bg-card p-4">
        <Input
          className="w-64"
          placeholder={t("events.list.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={health} onValueChange={setHealth}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("events.list.health")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("events.filters.all")}</SelectItem>
            <SelectItem value="green">{t("events.rag.green")}</SelectItem>
            <SelectItem value="amber">{t("events.rag.amber")}</SelectItem>
            <SelectItem value="red">{t("events.rag.red")}</SelectItem>
            <SelectItem value="critical">{t("events.rag.critical")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stageId} onValueChange={setStageId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("events.list.stage")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("events.filters.all")}</SelectItem>
            {(options.data?.stages ?? []).map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {ar ? stage.label_ar : stage.label_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="surface-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("events.list.number")}</TableHead>
              <TableHead>{t("events.list.name")}</TableHead>
              <TableHead>{t("events.list.client")}</TableHead>
              <TableHead>{t("events.list.site")}</TableHead>
              <TableHead>{t("events.list.dates")}</TableHead>
              <TableHead>{t("events.list.stage")}</TableHead>
              <TableHead>{t("events.list.health")}</TableHead>
              <TableHead>{t("events.list.prs")}</TableHead>
              <TableHead>{t("events.list.readiness")}</TableHead>
              <TableHead>{t("events.list.value")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  {t("events.list.empty")}
                </TableCell>
              </TableRow>
            ) : (
              (list.data ?? []).map((event) => (
                <TableRow key={event.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    <Link href={`/events/${event.id}`} className="underline-offset-2 hover:underline">
                      {event.event_number}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/events/${event.id}`} className="underline-offset-2 hover:underline">
                      {event.event_name || event.name}
                    </Link>
                  </TableCell>
                  <TableCell>{event.client_name ?? "—"}</TableCell>
                  <TableCell>{event.location_name ?? "—"}</TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {event.event_start ?? "—"}
                    {event.event_end ? ` → ${event.event_end}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{(ar ? event.stage_label_ar : event.stage_label_en) ?? "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <EventHealthBadge rag={event.health_rag} />
                  </TableCell>
                  <TableCell>
                    {event.pending_prs > 0 ? (
                      <Badge variant="warning">{t("events.dashboard.prBlockers", { n: event.pending_prs })}</Badge>
                    ) : event.linked_prs > 0 ? (
                      <Badge variant="outline">{t("events.dashboard.prsClear", { n: event.linked_prs })}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{Math.round(event.readiness_pct)}%</TableCell>
                  <TableCell className="tabular-nums">
                    {event.contracted_value != null ? fmtQar(event.contracted_value) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
