"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { FecButton as Button } from "@/components/fec";
import { Input } from "@/components/ui/input";
import {
  getTrainingLessonQuiz,
  listTrainingQuestionBanks,
  saveTrainingLessonQuiz,
} from "@/lib/training/question-bank.functions";

export function QuizLessonSettings({ lessonId, passingScore }: { lessonId: string; passingScore: number }) {
  const { t } = useTranslation();
  const [banks, setBanks] = useState<Array<{ id: string; name: string }>>([]);
  const [bankId, setBankId] = useState("");
  const [drawCount, setDrawCount] = useState("10");
  const [passing, setPassing] = useState(String(passingScore || 70));
  const [attempts, setAttempts] = useState("1");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [bankResult, quizResult] = await Promise.all([
        listTrainingQuestionBanks({}),
        getTrainingLessonQuiz({ lessonId }),
      ]);
      if (bankResult.ok) setBanks(bankResult.data);
      if (quizResult.ok && quizResult.data) {
        setBankId(quizResult.data.bank_id);
        setDrawCount(String(quizResult.data.draw_count));
        setPassing(String(quizResult.data.passing_score));
        setAttempts(String(quizResult.data.max_attempts));
        setShuffleQuestions(quizResult.data.shuffle_questions);
        setShuffleOptions(quizResult.data.shuffle_options);
      } else if (bankResult.ok) {
        setBankId(bankResult.data[0]?.id ?? "");
      }
    })();
  }, [lessonId]);

  return (
    <form
      className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!bankId) return;
        void (async () => {
          const result = await saveTrainingLessonQuiz({
            lessonId,
            bankId,
            drawCount: Number(drawCount),
            passingScore: Number(passing),
            maxAttempts: Number(attempts),
            shuffleQuestions,
            shuffleOptions,
          });
          setMessage(result.ok ? t("trainingCourses.quizSaved") : result.error);
        })();
      }}
    >
      <label className="grid gap-1 text-sm">
        <span>{t("trainingCourses.quizBank")}</span>
        <select className="min-h-11 rounded-lg border border-input bg-card px-3" value={bankId} onChange={(event) => setBankId(event.target.value)}>
          <option value="">—</option>
          {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>{t("trainingCourses.quizDraw")}</span>
        <Input type="number" min={1} max={100} value={drawCount} onChange={(event) => setDrawCount(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">
        <span>{t("trainingCourses.quizPassing")}</span>
        <Input type="number" min={0} max={100} value={passing} onChange={(event) => setPassing(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">
        <span>{t("trainingCourses.quizAttempts")}</span>
        <Input type="number" min={1} max={20} value={attempts} onChange={(event) => setAttempts(event.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} />
        {t("trainingCourses.quizShuffleQuestions")}
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={shuffleOptions} onChange={(event) => setShuffleOptions(event.target.checked)} />
        {t("trainingCourses.quizShuffleOptions")}
      </label>
      <Button type="submit" className="min-h-11 md:col-span-2">{t("trainingCourses.quizSave")}</Button>
      {message ? <p className="text-xs text-muted-foreground md:col-span-2">{message}</p> : null}
    </form>
  );
}
