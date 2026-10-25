"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { canReviewStaffSuggestions, type SuggestionStatus } from "@/lib/hr-suggestions";
import { listSuggestionInbox, updateSuggestionStatus } from "@/lib/hr-suggestions.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { AppRole } from "@/lib/rbac";

export default function HrSuggestionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { roles, profile } = useAuth();
  const roleList = roles.map((role) => role.role as AppRole);
  const canReview = canReviewStaffSuggestions(roleList, {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  });
  const [filter, setFilter] = useState<SuggestionStatus | "all">("all");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: queryKeys.people.hrSuggestions({ inbox: true, status: filter }),
    queryFn: () => listSuggestionInbox(filter === "all" ? {} : { status: filter }),
    staleTime: STALE.people,
    enabled: canReview,
  });

  const update = useMutation({
    mutationFn: updateSuggestionStatus,
    onSuccess: () => {
      toast.success(t("hr.suggestions.updated"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrSuggestions() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="admin.view"
      alsoAllow={canReview}
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.suggestions.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Lightbulb}
          kicker={t("hr.suggestions.kicker")}
          title={t("hr.suggestions.title")}
          subtitle={t("hr.suggestions.subtitle")}
        >
          <HrPanel delay={0}>
            <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
              <div className="w-full max-w-xs">
                <Label>{t("hr.suggestions.filterStatus")}</Label>
                <SearchableSelect
                  value={filter}
                  onValueChange={(value) => setFilter(value as SuggestionStatus | "all")}
                  aria-label={t("hr.suggestions.filterStatus")}
                  options={[
                    { value: "all", label: t("hr.suggestions.filterAll") },
                    { value: "new", label: t("hr.suggestions.status.new") },
                    { value: "seen", label: t("hr.suggestions.status.seen") },
                    { value: "closed", label: t("hr.suggestions.status.closed") },
                  ]}
                />
              </div>
            </div>
          </HrPanel>

          <HrPanel delay={1}>
            <div className="space-y-3 p-4 sm:p-5">
              {(list.data ?? []).length === 0 && !list.isLoading ? (
                <HrEmptyState message={t("hr.suggestions.empty")} icon={Lightbulb} />
              ) : null}
              {(list.data ?? []).map((row) => (
                <div key={row.id} className="hr-list-row !items-start flex-col gap-3">
                  <div className="flex w-full flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium tracking-tight">{row.title}</p>
                        <Badge variant={row.status === "new" ? "success" : "muted"}>
                          {t(`hr.suggestions.status.${row.status}`)}
                        </Badge>
                        {row.category ? (
                          <Badge variant="outline">{t(`hr.suggestions.category.${row.category}`)}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[row.staffName, row.employeeCode, row.jobTitle].filter(Boolean).join(" · ")}
                        {` · ${formatWorkDateDdMmYyyy(row.createdAt.slice(0, 10))}`}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{row.body}</p>
                    </div>
                  </div>
                  <div className="w-full space-y-2">
                    <Label htmlFor={`suggestion-note-${row.id}`}>{t("hr.suggestions.note")}</Label>
                    <Textarea
                      id={`suggestion-note-${row.id}`}
                      rows={2}
                      value={noteDrafts[row.id] ?? row.adminNote ?? ""}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      placeholder={t("hr.suggestions.notePlaceholder")}
                    />
                    <div className="flex flex-wrap gap-2">
                      {row.status === "new" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: row.id,
                              status: "seen",
                              adminNote: (noteDrafts[row.id] ?? row.adminNote ?? "").trim() || null,
                            })
                          }
                        >
                          {t("hr.suggestions.markSeen")}
                        </Button>
                      ) : null}
                      {row.status !== "closed" ? (
                        <Button
                          size="sm"
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: row.id,
                              status: "closed",
                              adminNote: (noteDrafts[row.id] ?? row.adminNote ?? "").trim() || null,
                            })
                          }
                        >
                          {t("hr.suggestions.close")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: row.id,
                            status: row.status,
                            adminNote: (noteDrafts[row.id] ?? "").trim() || null,
                          })
                        }
                      >
                        {t("hr.suggestions.saveNote")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
