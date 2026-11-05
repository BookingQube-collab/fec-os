"use client";

import { FecPageHeader } from "@/components/fec";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { EventHealthBadge } from "@/components/events/event-health-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { usePermission } from "@/hooks/use-permission";
import { fmtQar } from "@/lib/currency";
import { EVENT_STATUSES } from "@/lib/events/constants";
import { hardDeleteEvent, restoreEvent, softDeleteEvent } from "@/lib/events.functions";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";

type ConfirmKind = "archive" | "restore" | "delete";

type ConfirmTarget = {
  kind: ConfirmKind;
  id: string;
  label: string;
};

export default function EventsListPage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const searchParams = useSearchParams();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canManage = usePermission("events.manage");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState(searchParams.get("health") ?? "all");
  const [stageId, setStageId] = useState("all");
  const [status, setStatus] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const options = useEventOptions();
  const filters = useMemo(
    () => ({
      locationId,
      search: search.trim() || null,
      health: health === "all" ? null : (health as "green" | "amber" | "red" | "critical"),
      stageId: stageId === "all" ? null : stageId,
      status: status === "all" ? null : (status as (typeof EVENT_STATUSES)[number]),
      onlyDeleted: showArchived || undefined,
    }),
    [locationId, search, health, stageId, status, showArchived],
  );
  const list = useEventsList(filters);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.events.all });
  };

  const archiveMut = useMutation({
    mutationFn: (eventId: string) => softDeleteEvent({ eventId }),
    onSuccess: () => {
      invalidate();
      setConfirm(null);
      toast.success(t("events.toasts.archived"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const restoreMut = useMutation({
    mutationFn: (eventId: string) => restoreEvent({ eventId }),
    onSuccess: () => {
      invalidate();
      setConfirm(null);
      toast.success(t("events.toasts.restored"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (eventId: string) => hardDeleteEvent({ eventId }),
    onSuccess: () => {
      invalidate();
      setConfirm(null);
      toast.success(t("events.toasts.deleted"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pending = archiveMut.isPending || restoreMut.isPending || deleteMut.isPending;
  const colCount = canManage ? 11 : 10;

  const confirmCopy = confirm
    ? {
        archive: {
          title: t("events.list.archiveTitle"),
          description: t("events.list.archiveConfirm", { name: confirm.label }),
          action: t("events.list.archive"),
        },
        restore: {
          title: t("events.list.restoreTitle"),
          description: t("events.list.restoreConfirm", { name: confirm.label }),
          action: t("events.list.restore"),
        },
        delete: {
          title: t("events.list.deleteTitle"),
          description: t("events.list.deleteConfirm", { name: confirm.label }),
          action: t("events.list.delete"),
        },
      }[confirm.kind]
    : null;

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === "archive") archiveMut.mutate(confirm.id);
    else if (confirm.kind === "restore") restoreMut.mutate(confirm.id);
    else deleteMut.mutate(confirm.id);
  };

  return (
    <div className="space-y-6">
      <FecPageHeader
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("events.list.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("events.filters.all")}</SelectItem>
            {EVENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(`events.status.${s}`)}</SelectItem>
            ))}
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
        {canManage ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {t("events.list.showArchived")}
          </label>
        ) : null}
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
              {canManage ? <TableHead className="w-12 text-end">{t("events.list.actions")}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-8 text-center text-muted-foreground">
                  {t("events.list.empty")}
                </TableCell>
              </TableRow>
            ) : (
              (list.data ?? []).map((event) => {
                const label = event.event_name || event.name || event.event_number;
                return (
                  <TableRow key={event.id} className="hover:bg-muted/40">
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
                    {canManage ? (
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              aria-label={t("events.list.actions")}
                              disabled={pending}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {showArchived ? (
                              <DropdownMenuItem
                                onSelect={() => setConfirm({ kind: "restore", id: event.id, label })}
                              >
                                <RotateCcw className="h-4 w-4" />
                                {t("events.list.restore")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => setConfirm({ kind: "archive", id: event.id, label })}
                              >
                                <Archive className="h-4 w-4" />
                                {t("events.list.archive")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setConfirm({ kind: "delete", id: event.id, label })}
                            >
                              <Trash2 className="h-4 w-4" />
                              {t("events.list.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={confirm?.kind === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={(e) => {
                e.preventDefault();
                runConfirm();
              }}
            >
              {confirmCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
