"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FecButton as Button, FecPageHeader } from "@/components/fec";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/training/engine";
import { getTrainingSession, markSessionAttendance } from "@/lib/training/sessions.functions";

type SessionResult = Awaited<ReturnType<typeof getTrainingSession>>;
type Detail = Extract<SessionResult, { ok: true }>["data"];

export default function TrainingSessionPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const response = await getTrainingSession({ sessionId: params.id });
    if (!response.ok) {
      setError(response.error);
      setDetail(null);
      return;
    }
    setError(null);
    setDetail(response.data);
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function mark(staffId: string, status: AttendanceStatus) {
    const response = await markSessionAttendance({ sessionId: params.id, staffId, status });
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setError(null);
    setNotice(response.data.courseCompleted ? t("trainingSessions.courseCompleted") : t("trainingSessions.recorded"));
    await load();
  }

  return (
    <div className="space-y-6">
      <FecPageHeader
        icon={CalendarDays}
        title={detail?.courseTitle || t("trainingSessions.title")}
        subtitle={detail ? `${detail.locationName}${detail.room ? ` · ${detail.room}` : ""} · ${detail.trainerName}` : t("trainingSessions.subtitle")}
        actions={<Link className="text-sm underline-offset-4 hover:underline" href="/training/calendar">{t("trainingSessions.back")}</Link>}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {detail ? (
        <ul className="grid gap-3">
          {detail.participants.length === 0 ? <li className="text-sm text-muted-foreground">{t("trainingSessions.noParticipants")}</li> : null}
          {detail.participants.map((person) => (
            <li key={person.staffId} className="grid gap-2 rounded-2xl border border-border bg-card p-4">
              <p className="font-medium">{person.staffName} · {person.employeeCode}</p>
              <p className="text-sm text-muted-foreground">
                {person.attendance ? t(`trainingSessions.statuses.${person.attendance}`) : t("trainingSessions.unmarked")}
                {person.markedByName ? ` · ${person.markedByName}` : ""}
                {person.markedAt ? ` · ${new Date(person.markedAt).toLocaleString()}` : ""}
              </p>
              {person.canMark ? (
                <div className="flex flex-wrap gap-2">
                  {ATTENDANCE_STATUSES.map((status) => (
                    <Button key={status} type="button" variant={person.attendance === status ? "default" : "outline"} className="min-h-14 min-w-28 text-base" onClick={() => void mark(person.staffId, status)}>
                      {t(`trainingSessions.statuses.${status}`)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
