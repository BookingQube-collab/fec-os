"use client";

import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecButton as Button, FecEmptyState, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createTrainingBankQuestion,
  createTrainingQuestionBank,
  listTrainingBankQuestions,
  listTrainingQuestionBanks,
} from "@/lib/training/question-bank.functions";
import { QUESTION_DIFFICULTIES, QUESTION_KINDS } from "@/lib/training/engine";

type Bank = { id: string; name: string; category: string | null; tags: string[] };
type QuestionRow = { id: string; kind: string; prompt: string; points: number; difficulty: string | null };

const OBJECTIVE = QUESTION_KINDS.filter((kind) => kind !== "SCENARIO");

function linesOf(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function tagsOf(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

export default function TrainingQuestionsPage() {
  const { t } = useTranslation();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [bankTags, setBankTags] = useState("");
  const [kind, setKind] = useState<(typeof QUESTION_KINDS)[number]>("MULTIPLE_CHOICE");
  const [innerKind, setInnerKind] = useState<(typeof OBJECTIVE)[number]>("MULTIPLE_CHOICE");
  const [prompt, setPrompt] = useState("");
  const [scenario, setScenario] = useState("");
  const [difficulty, setDifficulty] = useState<(typeof QUESTION_DIFFICULTIES)[number]>("MEDIUM");
  const [points, setPoints] = useState("1");
  const [topic, setTopic] = useState("");
  const [questionTags, setQuestionTags] = useState("");
  const [explanation, setExplanation] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [correctChoice, setCorrectChoice] = useState("1");
  const [error, setError] = useState<string | null>(null);

  async function loadBanks() {
    const result = await listTrainingQuestionBanks({});
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBanks(result.data);
    setBankId((current) => current || result.data[0]?.id || "");
  }

  async function loadQuestions(nextBankId: string, nextPage: number) {
    if (!nextBankId) {
      setQuestions([]);
      setTotal(0);
      return;
    }
    const result = await listTrainingBankQuestions({ bankId: nextBankId, page: nextPage });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setQuestions(result.data.questions);
    setTotal(result.data.total);
    setPage(result.data.page);
  }

  useEffect(() => {
    void loadBanks();
  }, []);

  useEffect(() => {
    void loadQuestions(bankId, page);
  }, [bankId, page]);

  const gradedKind = kind === "SCENARIO" ? innerKind : kind;
  const needsOptions = gradedKind === "MULTIPLE_CHOICE" || gradedKind === "MULTIPLE_SELECT" || gradedKind === "ORDERING" || gradedKind === "MATCHING" || gradedKind === "SHORT_ANSWER";

  function buildCorrect() {
    const lines = linesOf(optionsText);
    if (gradedKind === "TRUE_FALSE") return { options: [], correct: { value: correctChoice === "true" } };
    if (gradedKind === "YES_NO") return { options: [], correct: { value: correctChoice === "no" ? "no" : "yes" } };
    if (gradedKind === "SHORT_ANSWER") return { options: [], correct: { answers: lines } };
    if (gradedKind === "MATCHING") {
      const pairs = lines.map((line) => {
        const [left, right] = line.split("|").map((part) => part.trim());
        return { left, right, leftId: crypto.randomUUID(), rightId: crypto.randomUUID() };
      });
      return {
        options: [
          ...pairs.map((pair) => ({ id: pair.leftId, label: pair.left, side: "left" as const })),
          ...pairs.map((pair) => ({ id: pair.rightId, label: pair.right, side: "right" as const })),
        ],
        correct: { pairs: pairs.map((pair) => ({ left: pair.leftId, right: pair.rightId })) },
      };
    }
    const options = lines.map((label) => ({ id: crypto.randomUUID(), label, side: null }));
    if (gradedKind === "ORDERING") return { options, correct: { order: options.map((option) => option.id) } };
    if (gradedKind === "MULTIPLE_SELECT") {
      const indexes = correctChoice.split(",").map((item) => Number(item.trim()) - 1);
      return { options, correct: { optionIds: indexes.map((index) => options[index]?.id).filter(Boolean) } };
    }
    const index = Number(correctChoice) - 1;
    return { options, correct: { optionId: options[index]?.id } };
  }

  return (
    <CapabilityGate capability="training.assessment.manage" fallback={<p className="text-sm text-muted-foreground">{t("trainingQuestions.noAccess")}</p>}>
      <div className="space-y-6">
        <FecPageHeader icon={GraduationCap} title={t("trainingQuestions.title")} subtitle={t("trainingQuestions.subtitle")} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form
          className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              const result = await createTrainingQuestionBank({
                name,
                category: category.trim() || null,
                tags: tagsOf(bankTags),
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setError(null);
              setName("");
              setBankId(result.data.id);
              await loadBanks();
            })();
          }}
        >
          <Input aria-label={t("trainingQuestions.bankName")} placeholder={t("trainingQuestions.bankName")} value={name} onChange={(event) => setName(event.target.value)} required />
          <Input aria-label={t("trainingQuestions.category")} placeholder={t("trainingQuestions.category")} value={category} onChange={(event) => setCategory(event.target.value)} />
          <Input aria-label={t("trainingQuestions.tags")} placeholder={t("trainingQuestions.tags")} value={bankTags} onChange={(event) => setBankTags(event.target.value)} />
          <Button type="submit" className="min-h-12 md:col-span-3">{t("trainingQuestions.createBank")}</Button>
        </form>
        {banks.length === 0 ? <FecEmptyState message={t("trainingQuestions.empty")} /> : (
          <label className="grid max-w-md gap-1 text-sm">
            <span className="font-medium">{t("trainingQuestions.bank")}</span>
            <select className="min-h-12 rounded-lg border border-input bg-card px-3" value={bankId} onChange={(event) => { setPage(1); setBankId(event.target.value); }}>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>{bank.name}{bank.category ? ` · ${bank.category}` : ""}</option>
              ))}
            </select>
          </label>
        )}
        {bankId ? (
          <form
            className="grid gap-3 rounded-2xl border border-border bg-card p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const built = buildCorrect();
              if (!built.correct || Object.values(built.correct).some((value) => value == null || value === "")) {
                setError(t("trainingQuestions.needsAnswer"));
                return;
              }
              void (async () => {
                const result = await createTrainingBankQuestion({
                  bankId,
                  kind,
                  prompt,
                  difficulty,
                  tags: tagsOf(questionTags),
                  topic: topic.trim() || null,
                  courseId: null,
                  points: Number(points) || 1,
                  explanation: explanation.trim() || null,
                  scenarioPrompt: kind === "SCENARIO" ? scenario : null,
                  innerKind: kind === "SCENARIO" ? innerKind : null,
                  options: built.options,
                  correct: built.correct,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setError(null);
                setPrompt("");
                setOptionsText("");
                setExplanation("");
                await loadQuestions(bankId, page);
              })();
            }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <select className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingQuestions.kind")} value={kind} onChange={(event) => setKind(event.target.value as (typeof QUESTION_KINDS)[number])}>
                {QUESTION_KINDS.map((item) => <option key={item} value={item}>{t(`trainingQuestions.kinds.${item}`)}</option>)}
              </select>
              {kind === "SCENARIO" ? (
                <select className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingQuestions.innerKind")} value={innerKind} onChange={(event) => setInnerKind(event.target.value as (typeof OBJECTIVE)[number])}>
                  {OBJECTIVE.map((item) => <option key={item} value={item}>{t(`trainingQuestions.kinds.${item}`)}</option>)}
                </select>
              ) : null}
              <select className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingQuestions.difficulty")} value={difficulty} onChange={(event) => setDifficulty(event.target.value as (typeof QUESTION_DIFFICULTIES)[number])}>
                {QUESTION_DIFFICULTIES.map((item) => <option key={item} value={item}>{t(`trainingQuestions.difficulties.${item}`)}</option>)}
              </select>
              <Input aria-label={t("trainingQuestions.points")} type="number" min={1} max={100} value={points} onChange={(event) => setPoints(event.target.value)} />
            </div>
            {kind === "SCENARIO" ? <Textarea aria-label={t("trainingQuestions.scenario")} placeholder={t("trainingQuestions.scenario")} value={scenario} onChange={(event) => setScenario(event.target.value)} /> : null}
            <Textarea aria-label={t("trainingQuestions.prompt")} placeholder={t("trainingQuestions.prompt")} value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
            {needsOptions ? <Textarea aria-label={t("trainingQuestions.options")} placeholder={t(`trainingQuestions.optionHelp.${gradedKind}`)} value={optionsText} onChange={(event) => setOptionsText(event.target.value)} /> : null}
            {gradedKind === "TRUE_FALSE" || gradedKind === "YES_NO" || gradedKind === "MULTIPLE_CHOICE" || gradedKind === "MULTIPLE_SELECT" ? (
              <Input aria-label={t("trainingQuestions.correct")} placeholder={t(`trainingQuestions.correctHelp.${gradedKind}`)} value={correctChoice} onChange={(event) => setCorrectChoice(event.target.value)} />
            ) : null}
            <Input aria-label={t("trainingQuestions.topic")} placeholder={t("trainingQuestions.topic")} value={topic} onChange={(event) => setTopic(event.target.value)} />
            <Input aria-label={t("trainingQuestions.tags")} placeholder={t("trainingQuestions.tags")} value={questionTags} onChange={(event) => setQuestionTags(event.target.value)} />
            <Textarea aria-label={t("trainingQuestions.explanation")} placeholder={t("trainingQuestions.explanation")} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
            <Button type="submit" className="min-h-12">{t("trainingQuestions.addQuestion")}</Button>
          </form>
        ) : null}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("trainingQuestions.count", { count: total })}</p>
          {questions.map((question) => (
            <article key={question.id} className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-medium">{question.prompt}</p>
              <p className="text-xs text-muted-foreground">{question.kind} · {question.points} · {question.difficulty ?? "—"}</p>
            </article>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-12" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t("trainingQuestions.previous")}</Button>
            <Button type="button" variant="outline" className="min-h-12" disabled={page * 20 >= total} onClick={() => setPage((current) => current + 1)}>{t("trainingQuestions.next")}</Button>
          </div>
        </div>
      </div>
    </CapabilityGate>
  );
}
