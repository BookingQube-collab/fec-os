"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermission } from "@/hooks/use-permission";
import {
  completeTraining,
  createTrainingEnrollment,
  deleteTrainingEnrollment,
  listTraining,
  updateTrainingEnrollment,
} from "@/lib/people.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

const TRAINING_STATUSES = ["enrolled", "in_progress", "completed", "overdue"] as const;

type TrainingRow = {
  id: string;
  course_name: string;
  required: boolean;
  status: string;
  due_on: string | null;
  score: number | null;
};

export function StaffTrainingPanel({
  staffId,
  locationId,
  onChanged,
}: {
  staffId: string;
  locationId: string;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canEdit = usePermission("people.edit_roster");
  const [courseName, setCourseName] = useState("");
  const [required, setRequired] = useState(false);
  const [dueOn, setDueOn] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: queryKeys.people.staffTraining(staffId),
    queryFn: () => listTraining({ staffId }),
    staleTime: STALE.people,
    enabled: Boolean(staffId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.staffTraining(staffId) });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "training"] });
    onChanged?.();
  };

  const create = useMutation({
    mutationFn: () => {
      if (!courseName.trim()) throw new Error(t("people.training.course"));
      return createTrainingEnrollment({
        locationId,
        staffId,
        courseName: courseName.trim(),
        required,
        dueOn: dueOn || undefined,
      });
    },
    onSuccess: () => {
      toast.success(t("people.training.createSuccess"));
      setCourseName("");
      setRequired(false);
      setDueOn("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: (id: string) => completeTraining({ id }),
    onSuccess: () => {
      toast.success(t("people.training.completeSuccess"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: (input: { id: string; status: (typeof TRAINING_STATUSES)[number] }) =>
      updateTrainingEnrollment(input),
    onSuccess: () => {
      toast.success(t("people.training.updateSuccess"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTrainingEnrollment({ id }),
    onSuccess: () => {
      toast.success(t("people.training.deleteSuccess"));
      setDeleteId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (list.data ?? []) as TrainingRow[];

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("people.training.course")}</Label>
            <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("people.training.due")}</Label>
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={required} onCheckedChange={(v) => setRequired(Boolean(v))} />
              {t("people.training.required")}
            </label>
            <Button size="sm" disabled={!courseName.trim() || !locationId || create.isPending} onClick={() => create.mutate()}>
              {t("people.training.add")}
            </Button>
          </div>
        </div>
      ) : null}

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("people.training.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("people.profile.noTraining")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id} className="space-y-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{row.course_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.required ? t("people.training.yes") : t("people.training.no")}
                    {row.due_on ? ` · ${t("people.training.due")} ${row.due_on}` : ""}
                    {row.score != null ? ` · ${row.score}` : ""}
                  </p>
                </div>
                <Badge variant="outline">{row.status.replace(/_/g, " ")}</Badge>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                    value={TRAINING_STATUSES.includes(row.status as (typeof TRAINING_STATUSES)[number]) ? row.status : "enrolled"}
                    onChange={(e) =>
                      updateStatus.mutate({
                        id: row.id,
                        status: e.target.value as (typeof TRAINING_STATUSES)[number],
                      })
                    }
                  >
                    {TRAINING_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  {row.status !== "completed" ? (
                    <Button size="sm" variant="secondary" disabled={complete.isPending} onClick={() => complete.mutate(row.id)}>
                      {t("people.training.complete")}
                    </Button>
                  ) : null}
                  {deleteId === row.id ? (
                    <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}>
                      {t("people.training.deleteTitle")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(row.id)}>
                      {t("common.delete")}
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
