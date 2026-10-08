"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecEmptyState } from "@/components/fec";
import { getTrainingPlayer, recordTrainingPlayerEvent } from "@/lib/training/player.functions";
import { isReadLesson, parseChecklist } from "@/lib/training/engine";
import { TrainingQuizPanel } from "@/views/training-quiz-panel";

type Lesson = {
  id: string;
  title: string;
  kind: string;
  body: string | null;
  externalUrl: string | null;
  durationSeconds: number | null;
  required: boolean;
  gated: boolean;
  completed: boolean;
  viewed: boolean;
  timeSpentSeconds: number;
  positionSeconds: number;
  checklist: string[];
  acknowledged: boolean;
};

type Player = {
  enrollmentId: string;
  title: string;
  code: string;
  progressPercent: number;
  courseCompleted: boolean;
  lastLessonId: string | null;
  sections: { id: string; title: string; lessons: Lesson[] }[];
};

function flatten(player: Player) {
  return player.sections.flatMap((section) => section.lessons.map((lesson) => ({ section, lesson })));
}

export default function TrainingLearningOutlinePage() {
  const { t } = useTranslation();
  const params = useParams<{ enrollmentId: string }>();
  const enrollmentId = params.enrollmentId;
  const [staffId, setStaffId] = useState<string | null | undefined>(undefined);
  const [player, setPlayer] = useState<Player | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enrollmentId) return;
    void (async () => {
      const result = await getTrainingPlayer({ enrollmentId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStaffId(result.data.staffId);
      setPlayer(result.data.player);
      const lessons = result.data.player ? flatten(result.data.player) : [];
      const resume =
        lessons.find((item) => item.lesson.id === result.data.player?.lastLessonId)?.lesson.id ??
        lessons[0]?.lesson.id ??
        null;
      setLessonId(resume);
    })();
  }, [enrollmentId]);

  const lessons = useMemo(() => (player ? flatten(player) : []), [player]);
  const index = lessons.findIndex((item) => item.lesson.id === lessonId);
  const current = index >= 0 ? lessons[index] : null;

  useEffect(() => {
    if (!player || !current) return;
    void recordTrainingPlayerEvent({
      enrollmentId: player.enrollmentId,
      lessonId: current.lesson.id,
      event: "VIEW",
      deltaSeconds: null,
      positionSeconds: null,
      itemId: null,
      itemChecked: null,
    });
  }, [player?.enrollmentId, current?.lesson.id]);

  useEffect(() => {
    if (!player || !current || current.lesson.gated) return;
    const timer = window.setInterval(() => {
      void recordTrainingPlayerEvent({
        enrollmentId: player.enrollmentId,
        lessonId: current.lesson.id,
        event: "HEARTBEAT",
        deltaSeconds: 10,
        positionSeconds: null,
        itemId: null,
        itemChecked: null,
      }).then((result) => {
        if (!result.ok) return;
        setPlayer((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            sections: prev.sections.map((section) => ({
              ...section,
              lessons: section.lessons.map((lesson) =>
                lesson.id === current.lesson.id
                  ? { ...lesson, timeSpentSeconds: result.data.timeSpentSeconds }
                  : lesson,
              ),
            })),
          };
        });
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [player?.enrollmentId, current?.lesson.id, current?.lesson.gated]);

  async function send(
    event: "MARK_READ" | "CHECKLIST" | "ACKNOWLEDGE",
    extra?: { itemId?: string; itemChecked?: boolean },
  ) {
    if (!player || !current) return;
    const result = await recordTrainingPlayerEvent({
      enrollmentId: player.enrollmentId,
      lessonId: current.lesson.id,
      event,
      deltaSeconds: null,
      positionSeconds: null,
      itemId: extra?.itemId ?? null,
      itemChecked: extra?.itemChecked ?? null,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setPlayer((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        courseCompleted: prev.courseCompleted || result.data.courseCompleted,
        sections: prev.sections.map((section) => ({
          ...section,
          lessons: section.lessons.map((lesson) =>
            lesson.id === current.lesson.id
              ? {
                  ...lesson,
                  completed: result.data.lessonCompleted,
                  checklist: result.data.checklist,
                  acknowledged: result.data.acknowledged,
                  timeSpentSeconds: result.data.timeSpentSeconds,
                }
              : lesson,
          ),
        })),
      };
    });
  }

  const checklist = current ? parseChecklist(current.lesson.body) : [];
  const canMarkRead = current ? isReadLesson(current.lesson.kind) && current.lesson.timeSpentSeconds >= 10 : false;

  return (
    <CapabilityGate capability="training.learn" fallback={<p className="text-sm text-muted-foreground">{t("trainingLearning.noAccess")}</p>}>
      {staffId === null ? (
        <FecEmptyState message={t("trainingLearning.noStaff")} hint={t("trainingLearning.noStaffHint")} />
      ) : !player ? (
        error ? <p className="text-sm text-destructive">{error}</p> : null
      ) : (
        <div className="flex min-h-[70vh] flex-col gap-4">
          <header className="space-y-2">
            <Link className="text-sm underline-offset-4 hover:underline" href="/training/learning">
              {t("trainingLearning.back")}
            </Link>
            <h1 className="text-xl font-medium">{player?.title || t("trainingLearning.outline")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("trainingLearning.progress", { percent: player?.progressPercent ?? 0 })}
              {player?.courseCompleted ? ` · ${t("trainingLearning.groups.completed")}` : ""}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${player?.progressPercent ?? 0}%` }} />
            </div>
          </header>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-1 flex-col gap-4 md:flex-row">
            <nav className="max-h-48 overflow-auto rounded-2xl border border-border bg-card p-3 md:max-h-none md:w-64 md:shrink-0">
              {player?.sections.map((section) => (
                <div key={section.id} className="mb-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</p>
                  <ul className="mt-1 space-y-1">
                    {section.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          className={`w-full rounded-lg px-2 py-2 text-left text-sm ${lesson.id === lessonId ? "bg-muted" : ""}`}
                          onClick={() => setLessonId(lesson.id)}
                        >
                          {lesson.title}
                          {lesson.completed ? " · ✓" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <main className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4 text-base leading-relaxed">
              {current ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-medium">{current.lesson.title}</h2>
                  {current.lesson.kind === "QUIZ" ? (
                    <TrainingQuizPanel
                      enrollmentId={player.enrollmentId}
                      lessonId={current.lesson.id}
                      onFinished={() => {
                        void getTrainingPlayer({ enrollmentId: player.enrollmentId }).then((fresh) => {
                          if (fresh.ok) setPlayer(fresh.data.player);
                        });
                      }}
                    />
                  ) : current.lesson.kind === "PRACTICAL_ASSESSMENT" ? (
                    <div className="space-y-3">
                      <p>{t("trainingLearning.player.practicalRequired")}</p>
                      <ul className="space-y-2">
                        {parseChecklist(current.lesson.body).map((item) => (
                          <li key={item.id} className="flex min-h-12 items-center rounded-lg border border-border px-3">
                            {item.label}{item.required ? ` · ${t("trainingLearning.player.practicalRequiredItem")}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : current.lesson.gated ? <p>{t("trainingLearning.player.gated")}</p> : null}
                  {current.lesson.kind !== "QUIZ" && (current.lesson.kind === "VIDEO" || current.lesson.kind === "AUDIO") ? (
                    <p>
                      {current.lesson.durationSeconds
                        ? t("trainingLearning.player.media", { seconds: current.lesson.positionSeconds, duration: current.lesson.durationSeconds })
                        : t("trainingLearning.player.mediaNoDuration")}
                    </p>
                  ) : null}
                  {current.lesson.kind === "EXTERNAL_LINK" && current.lesson.externalUrl ? (
                    <a className="underline" href={current.lesson.externalUrl} target="_blank" rel="noreferrer">
                      {current.lesson.externalUrl}
                    </a>
                  ) : null}
                  {current.lesson.kind === "CHECKLIST" ? (
                    <ul className="space-y-2">
                      {checklist.map((item) => (
                        <li key={item.id}>
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-1 h-5 w-5"
                              checked={current.lesson.checklist.includes(item.id)}
                              onChange={(event) => void send("CHECKLIST", { itemId: item.id, itemChecked: event.target.checked })}
                            />
                            <span>{item.label}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : current.lesson.kind === "QUIZ" || current.lesson.kind === "PRACTICAL_ASSESSMENT" ? null : (
                    <p className="whitespace-pre-wrap">{current.lesson.body}</p>
                  )}
                  {isReadLesson(current.lesson.kind) ? (
                    <button
                      type="button"
                      className="min-h-12 rounded-xl bg-primary px-4 text-base text-primary-foreground disabled:opacity-50"
                      disabled={!canMarkRead || current.lesson.completed}
                      onClick={() => void send("MARK_READ")}
                    >
                      {t("trainingLearning.player.markRead")}
                    </button>
                  ) : null}
                  {current.lesson.kind === "ACKNOWLEDGEMENT" ? (
                    <button
                      type="button"
                      className="min-h-12 rounded-xl bg-primary px-4 text-base text-primary-foreground disabled:opacity-50"
                      disabled={current.lesson.acknowledged}
                      onClick={() => void send("ACKNOWLEDGE")}
                    >
                      {t("trainingLearning.player.acknowledge")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </main>
          </div>
          <footer className="sticky bottom-0 grid grid-cols-2 gap-2 bg-background py-2">
            <button
              type="button"
              className="min-h-12 rounded-xl border border-border text-base"
              disabled={index <= 0}
              onClick={() => lessons[index - 1] && setLessonId(lessons[index - 1].lesson.id)}
            >
              {t("trainingLearning.player.previous")}
            </button>
            <button
              type="button"
              className="min-h-12 rounded-xl border border-border text-base"
              disabled={index < 0 || index >= lessons.length - 1}
              onClick={() => lessons[index + 1] && setLessonId(lessons[index + 1].lesson.id)}
            >
              {t("trainingLearning.player.next")}
            </button>
          </footer>
        </div>
      )}
    </CapabilityGate>
  );
}
