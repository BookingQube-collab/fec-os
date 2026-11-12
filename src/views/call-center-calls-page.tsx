"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterCdr,
  loadCallCenterConfigBundle,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterCallsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const canUse = canUserDo(
    roles.map((r) => r.role),
    "call_center.view",
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [queueId, setQueueId] = useState("");
  const [direction, setDirection] = useState<string>("");
  const [applied, setApplied] = useState({
    fromDate: "",
    toDate: "",
    queueId: "",
    direction: "",
  });

  const config = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const cdr = useQuery({
    queryKey: ["call-center", "cdr", applied],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterCdr({
        fromDate: applied.fromDate || null,
        toDate: applied.toDate || null,
        queueId: applied.queueId || null,
        direction:
          applied.direction === "inbound" ||
          applied.direction === "outbound" ||
          applied.direction === "internal_test"
            ? applied.direction
            : null,
        limit: 150,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.callsTitle" subtitleKey="callCenter.callsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.callsTitle" subtitleKey="callCenter.callsSubtitle">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 bg-card p-4">
        <div className="space-y-1.5">
          <Label>{t("callCenter.filterFrom")}</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("callCenter.filterTo")}</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("callCenter.filterQueue")}</Label>
          <Select value={queueId || "all"} onValueChange={(v) => setQueueId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("callCenter.filterAll")}</SelectItem>
              {(config.data?.queues ?? []).map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("callCenter.filterDirection")}</Label>
          <Select
            value={direction || "all"}
            onValueChange={(v) => setDirection(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("callCenter.filterAll")}</SelectItem>
              <SelectItem value="inbound">inbound</SelectItem>
              <SelectItem value="outbound">outbound</SelectItem>
              <SelectItem value="internal_test">test</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={() =>
            setApplied({
              fromDate: fromDate ? new Date(fromDate).toISOString() : "",
              toDate: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : "",
              queueId,
              direction,
            })
          }
        >
          {t("callCenter.applyFilters")}
        </Button>
      </section>

      {cdr.isLoading ? (
        <div className="flex justify-center py-12">
          <FecLoader density="page" />
        </div>
      ) : cdr.isError ? (
        <p className="text-sm text-destructive">{t("callCenter.loadError")}</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-2xl border border-border/50 bg-card">
          {(cdr.data ?? []).length === 0 ? (
            <li className="p-8 text-center text-sm text-muted-foreground">{t("callCenter.noCalls")}</li>
          ) : (
            (cdr.data ?? []).map((call) => (
              <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {call.fromE164 || "—"} → {call.toE164 || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(call.startedAt).toLocaleString()} · {call.direction}
                    {call.talkSeconds != null ? ` · ${call.talkSeconds}s` : ""}
                    {call.recordingUrl ? ` · ${t("callCenter.hasRecording")}` : ""}
                    {call.transferType ? ` · ${call.transferType} → ${call.transferTarget}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{call.status}</Badge>
              </li>
            ))
          )}
        </ul>
      )}
    </CallCenterShell>
  );
}

export default CallCenterCallsPage;
