"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { startTrainingQuiz, submitTrainingQuiz } from "@/lib/training/quiz.functions";

type Option = { id?: string | null; label?: string | null; side?: string | null };
type Question = {
  id?: unknown;
  prompt?: unknown;
  kind?: unknown;
  scenarioPrompt?: unknown;
  innerKind?: unknown;
  options?: Option[];
};
type Explanation = { questionId: string; explanation: string | null; wasCorrect: boolean };

export function TrainingQuizPanel({
  enrollmentId,
  lessonId,
  onFinished,
}: {
  enrollmentId: string;
  lessonId: string;
  onFinished: () => void;
}) {
  const { t } = useTranslation();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, { value?: string | boolean | string[] | null; order?: string[] | null; pairs?: { left: string; right: string }[] | null }>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean; attemptsRemaining: number; explanations: Explanation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function questionId(question: Question) {
    return String(question.id ?? "");
  }

  function gradedKind(question: Question) {
    const kind = String(question.kind ?? "");
    return kind === "SCENARIO" ? String(question.innerKind ?? "") : kind;
  }

  async function start() {
    setBusy(true);
    const response = await startTrainingQuiz({ enrollmentId, lessonId });
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setError(null);
    setResult(null);
    setAttemptId(response.data.attemptId);
    setQuestions(response.data.questions as Question[]);
    setRemaining(response.data.attemptsRemaining);
    const next: typeof answers = {};
    for (const question of response.data.questions as Question[]) {
      const id = questionId(question);
      const kind = gradedKind(question);
      if (kind === "ORDERING") next[id] = { order: (question.options ?? []).map((option) => String(option.id ?? "")) };
      else if (kind === "MATCHING") next[id] = { pairs: [] };
      else if (kind === "MULTIPLE_SELECT") next[id] = { value: [] };
      else next[id] = { value: null };
    }
    setAnswers(next);
  }

  async function submit() {
    if (!attemptId) return;
    setBusy(true);
    const response = await submitTrainingQuiz({
      attemptId,
      answers: questions.map((question) => {
        const id = questionId(question);
        const answer = answers[id] ?? {};
        return {
          questionId: id,
          value: answer.value ?? null,
          order: answer.order ?? null,
          pairs: answer.pairs ?? null,
        };
      }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setError(null);
    setResult(response.data);
    setRemaining(response.data.attemptsRemaining);
    setAttemptId(null);
    if (response.data.lessonCompleted || response.data.courseCompleted) onFinished();
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!attemptId && !result ? (
        <button type="button" className="min-h-12 rounded-xl bg-primary px-4 text-base text-primary-foreground disabled:opacity-50" disabled={busy} onClick={() => void start()}>
          {t("trainingLearning.player.quizStart")}
        </button>
      ) : null}
      {questions.length > 0 && attemptId ? (
        <ol className="space-y-4">
          {questions.map((question, index) => {
            const id = questionId(question);
            const kind = gradedKind(question);
            const options = question.options ?? [];
            const answer = answers[id] ?? {};
            return (
              <li key={id || index} className="space-y-2 rounded-xl border border-border p-3">
                {question.scenarioPrompt ? <p className="text-sm text-muted-foreground">{String(question.scenarioPrompt)}</p> : null}
                <p className="font-medium">{index + 1}. {String(question.prompt ?? "")}</p>
                {kind === "MULTIPLE_CHOICE" || kind === "TRUE_FALSE" || kind === "YES_NO" ? (
                  <div className="grid gap-2">
                    {(kind === "TRUE_FALSE" ? [{ id: "true", label: t("trainingLearning.player.true") }, { id: "false", label: t("trainingLearning.player.false") }] : kind === "YES_NO" ? [{ id: "yes", label: t("trainingLearning.player.yes") }, { id: "no", label: t("trainingLearning.player.no") }] : options).map((option) => (
                      <label key={String(option.id)} className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3">
                        <input
                          type="radio"
                          className="h-5 w-5"
                          name={id}
                          checked={String(answer.value ?? "") === String(option.id)}
                          onChange={() => setAnswers((current) => ({
                            ...current,
                            [id]: { value: kind === "TRUE_FALSE" ? option.id === "true" : String(option.id) },
                          }))}
                        />
                        <span>{String(option.label ?? "")}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {kind === "MULTIPLE_SELECT" ? (
                  <div className="grid gap-2">
                    {options.map((option) => {
                      const selected = Array.isArray(answer.value) ? answer.value.map(String) : [];
                      const optionId = String(option.id ?? "");
                      return (
                        <label key={optionId} className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            checked={selected.includes(optionId)}
                            onChange={(event) => {
                              const next = event.target.checked ? [...selected, optionId] : selected.filter((item) => item !== optionId);
                              setAnswers((current) => ({ ...current, [id]: { value: next } }));
                            }}
                          />
                          <span>{String(option.label ?? "")}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                {kind === "SHORT_ANSWER" ? (
                  <input
                    className="min-h-12 w-full rounded-lg border border-input bg-card px-3"
                    value={typeof answer.value === "string" ? answer.value : ""}
                    onChange={(event) => setAnswers((current) => ({ ...current, [id]: { value: event.target.value } }))}
                  />
                ) : null}
                {kind === "ORDERING" ? (
                  <ol className="space-y-2">
                    {(answer.order ?? []).map((optionId, optionIndex, order) => (
                      <li key={optionId} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-border px-3">
                        <span>{String(options.find((option) => option.id === optionId)?.label ?? "")}</span>
                        <span className="flex gap-2">
                          <button type="button" className="min-h-11 rounded-lg border px-3" disabled={optionIndex === 0} onClick={() => {
                            const next = [...order];
                            [next[optionIndex - 1], next[optionIndex]] = [next[optionIndex], next[optionIndex - 1]];
                            setAnswers((current) => ({ ...current, [id]: { order: next } }));
                          }}>{t("trainingLearning.player.up")}</button>
                          <button type="button" className="min-h-11 rounded-lg border px-3" disabled={optionIndex === order.length - 1} onClick={() => {
                            const next = [...order];
                            [next[optionIndex + 1], next[optionIndex]] = [next[optionIndex], next[optionIndex + 1]];
                            setAnswers((current) => ({ ...current, [id]: { order: next } }));
                          }}>{t("trainingLearning.player.down")}</button>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {kind === "MATCHING" ? (
                  <div className="grid gap-2">
                    {options.filter((option) => option.side === "left").map((left) => (
                      <label key={String(left.id)} className="grid gap-1 text-sm">
                        <span>{String(left.label ?? "")}</span>
                        <select
                          className="min-h-12 rounded-lg border border-input bg-card px-3"
                          value={(answer.pairs ?? []).find((pair) => pair.left === left.id)?.right ?? ""}
                          onChange={(event) => {
                            const pairs = (answer.pairs ?? []).filter((pair) => pair.left !== left.id);
                            if (event.target.value) pairs.push({ left: String(left.id), right: event.target.value });
                            setAnswers((current) => ({ ...current, [id]: { pairs } }));
                          }}
                        >
                          <option value="">—</option>
                          {options.filter((option) => option.side === "right").map((right) => (
                            <option key={String(right.id)} value={String(right.id)}>{String(right.label ?? "")}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
          <button type="button" className="min-h-12 rounded-xl bg-primary px-4 text-base text-primary-foreground disabled:opacity-50" disabled={busy} onClick={() => void submit()}>
            {t("trainingLearning.player.quizSubmit")}
          </button>
        </ol>
      ) : null}
      {result ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p>{result.passed ? t("trainingLearning.player.quizPassed", { score: result.score }) : t("trainingLearning.player.quizFailed", { score: result.score })}</p>
          <p className="text-sm text-muted-foreground">{t("trainingLearning.player.quizRemaining", { count: result.attemptsRemaining })}</p>
          {result.explanations.map((item) => (
            <p key={item.questionId} className="text-sm">{item.wasCorrect ? t("trainingLearning.player.quizRight") : t("trainingLearning.player.quizWrong")} {item.explanation ?? ""}</p>
          ))}
          {result.attemptsRemaining > 0 ? (
            <button type="button" className="min-h-12 rounded-xl border border-border px-4" onClick={() => { setResult(null); setQuestions([]); void start(); }}>
              {t("trainingLearning.player.quizRetry")}
            </button>
          ) : null}
        </div>
      ) : null}
      {remaining != null && attemptId ? <p className="text-sm text-muted-foreground">{t("trainingLearning.player.quizRemaining", { count: remaining })}</p> : null}
    </div>
  );
}
