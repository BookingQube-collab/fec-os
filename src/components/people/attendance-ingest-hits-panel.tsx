"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteAllAttendanceIngestLogs,
  deleteAttendanceIngestLog,
  updateAttendanceIngestLogSetting,
  useAttendanceIngestLogs,
} from "@/hooks/queries/usePeopleExtended";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function formatCalledAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function AttendanceIngestHitsPanel() {
  const { t } = useTranslation();
  const canManage = usePermission("attendance.import");
  const qc = useQueryClient();
  const { data, isLoading } = useAttendanceIngestLogs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceIngestLogs() });
  };

  const deleteMut = useMutation({
    mutationFn: deleteAttendanceIngestLog,
    onSuccess: () => {
      toast.success(t("people.attendance.ingestLogDeleted"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAllMut = useMutation({
    mutationFn: deleteAllAttendanceIngestLogs,
    onSuccess: (r) => {
      toast.success(t("people.attendance.ingestLogsCleared", { count: r.deleted }));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settingsMut = useMutation({
    mutationFn: updateAttendanceIngestLogSetting,
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const hits = data?.hits ?? [];
  const logApiHits = data?.settings.logApiHits ?? true;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/40 px-4 py-3">
        <p className="text-xs text-muted-foreground">{t("people.attendance.ingestLogsHint")}</p>
        {canManage && (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="keep-ingest-logs"
                checked={logApiHits}
                disabled={settingsMut.isPending || isLoading}
                onCheckedChange={(checked) => settingsMut.mutate(checked)}
              />
              <Label htmlFor="keep-ingest-logs" className="text-xs text-muted-foreground">
                {t("people.attendance.keepIngestLogs")}
              </Label>
            </div>
            {hits.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={deleteAllMut.isPending}
                onClick={() => deleteAllMut.mutate()}
              >
                {t("people.attendance.clearAllIngestLogs")}
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t("people.attendance.ingestLogsLoading")}</p>
      ) : !hits.length ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t("people.attendance.ingestLogsEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {hits.map((hit) => {
            const open = expandedId === hit.id;
            return (
              <li key={hit.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium tabular-nums">{formatCalledAt(hit.called_at)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("people.attendance.ingestLogSummary", {
                        records: hit.record_count,
                        imported: hit.imported_count,
                        failed: hit.failed_count,
                      })}
                      {hit.location_codes.length > 0 && (
                        <span className="ml-1">· {hit.location_codes.join(", ")}</span>
                      )}
                      {hit.source_ip && <span className="ml-1">· {hit.source_ip}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedId(open ? null : hit.id)}
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                      <span className="ml-1">{t("people.attendance.viewPayload")}</span>
                    </Button>
                    {canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMut.isPending}
                        onClick={() => deleteMut.mutate(hit.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {open && (
                  <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-all">
                    {JSON.stringify({ request: hit.payload, response: hit.response_summary }, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
