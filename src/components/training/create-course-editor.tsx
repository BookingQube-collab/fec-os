"use client";

import { useQuery } from "@tanstack/react-query";
import { ImageIcon, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STALE } from "@/lib/query-client";
import { createTrainingCourse, listTrainingCourseLookups } from "@/lib/training/courses.functions";
import { courseCoverSrc, TRAINING_COVERS } from "@/lib/training/desk";
import { cn } from "@/lib/utils";

type EditorTab = "details" | "lessons" | "questions" | "rules" | "resources" | "history";

const fieldClass = "min-w-0 border-[#e4dff5] bg-white shadow-none";

function courseCodeFromTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const stem = slug.length >= 2 ? slug : "COURSE";
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  return `${stem}-${stamp}`.slice(0, 40);
}

function coverAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/learning-art/") && !trimmed.includes("..")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function CreateCourseEditor({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<EditorTab>("details");
  const [title, setTitle] = useState("");
  const [artworkFromTitle, setArtworkFromTitle] = useState(true);
  const [selectedCoverId, setSelectedCoverId] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [description, setDescription] = useState("");
  const [organization, setOrganization] = useState(() => t("learningDesk.heroEyebrow"));
  const [duration, setDuration] = useState("30");
  const [capacity, setCapacity] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const lookups = useQuery({
    queryKey: ["training-desk", "course-lookups"],
    queryFn: () => listTrainingCourseLookups({}),
    staleTime: STALE.people,
  });
  const reviewers = lookups.data?.ok ? lookups.data.data.staff : [];

  const keywordCover = (() => {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const first = courseCoverSrc({ title: trimmed, index: 0 });
    const second = courseCoverSrc({ title: trimmed, index: 1 });
    return first === second ? first : null;
  })();
  const manualCover = TRAINING_COVERS.find((cover) => cover.id === selectedCoverId)?.src ?? null;
  const chosenCover = (artworkFromTitle ? keywordCover : manualCover) ?? courseCoverSrc({ title: title.trim() || "course" });
  const highlighted = customUrl.trim() ? null : artworkFromTitle ? keywordCover : manualCover;

  const tabs = [
    ["details", t("learningDesk.editorTabs.details")],
    ["lessons", t("learningDesk.editorTabs.lessons", { count: 1 })],
    ["questions", t("learningDesk.editorTabs.questions", { count: 1 })],
    ["rules", t("learningDesk.editorTabs.rules")],
    ["resources", t("learningDesk.editorTabs.resources")],
    ["history", t("learningDesk.editorTabs.history")],
  ] as const;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const custom = customUrl.trim();
    if (custom && !coverAddress(custom)) {
      setError(t("learningDesk.coverUrlInvalid"));
      setTab("details");
      return;
    }
    const minutes = Number(duration);
    const estimatedMinutes = Number.isInteger(minutes) && minutes >= 0 && minutes <= 100000 ? minutes : 30;
    setCreating(true);
    setError(null);
    const result = await createTrainingCourse({
      title: trimmedTitle,
      code: courseCodeFromTitle(trimmedTitle),
      description: description.trim() || null,
      category: null,
      trainingType: null,
      difficulty: null,
      estimatedMinutes,
      instructorStaffId: reviewerId || null,
      departmentId: null,
      locationId: null,
      businessUnit: organization.trim() || null,
      validityDays: null,
      passingScore: null,
      maxAttempts: null,
      certificateEnabled: false,
      certificateValidityDays: null,
      refresherCourseId: null,
      retrainingLeadDays: 30,
      competencyCode: null,
      competencyName: null,
      retrainOnPublish: false,
      required: false,
      requiresSessionAttendance: false,
      tags: [],
      prerequisiteIds: [],
      thumbnailPath: coverAddress(custom) ?? chosenCover,
      changeSummary: reason.trim() || null,
    });
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.assign(`/training/${result.data.id}`);
  }

  return (
    <form className="min-w-0 space-y-4 overflow-x-clip" onSubmit={(event) => void onSubmit(event)}>
      <section className="min-w-0 rounded-2xl border border-[#ece8f5] bg-white p-4 sm:p-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[#1c1730]">{t("learningDesk.createTitle")}</h1>
            <p className="mt-1 text-sm text-[#6b657f]">{t("learningDesk.createSubtitle")}</p>
          </div>
          <Button type="button" variant="outline" className="shrink-0 border-[#e4dff5] bg-white text-[#2c2742] shadow-none hover:bg-[#f6f3ff]" onClick={onClose}>
            <X className="size-4" aria-hidden />
            {t("learningDesk.closeEditor")}
          </Button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#3c3558]">{t("learningDesk.createBody")}</p>
        <p className="mt-3 rounded-lg bg-[#f3f1f6] px-4 py-3 text-sm leading-relaxed text-[#3c3558]">{t("learningDesk.starterBanner")}</p>

        <div className="mt-4 flex min-w-0 flex-wrap gap-2" role="tablist" aria-label={t("learningDesk.createTitle")}>
          {tabs.map(([id, label]) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  selected
                    ? "border-transparent bg-[#6d4aff] font-medium text-white"
                    : "border-[#e4dff5] bg-white text-[#3c3558] hover:bg-[#f6f3ff]",
                )}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {tab === "details" ? (
          <div className="mt-4 min-w-0 rounded-2xl border border-[#ece8f5] p-4 sm:p-5">
            <h2 className="text-base font-semibold text-[#1c1730]">{t("learningDesk.editorTabs.details")}</h2>
            <Field label={t("trainingCourses.courseTitle")} className="mt-4" htmlFor="create-course-title">
              <Input id="create-course-title" value={title} required className={fieldClass} onChange={(event) => setTitle(event.target.value)} />
            </Field>

            <p className="mb-3 mt-5 flex items-center gap-2 text-sm text-[#3c3558]">
              <ImageIcon className="size-4 shrink-0" aria-hidden />
              {t("learningDesk.courseCover")}
            </p>
            <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3">
              {TRAINING_COVERS.map((cover) => {
                const active = highlighted === cover.src;
                return (
                  <button
                    key={cover.id}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "min-w-0 overflow-hidden rounded-xl border bg-[#faf9fc] text-start",
                      active ? "border-[#6d4aff] ring-2 ring-[#6d4aff]" : "border-[#ece8f5]",
                    )}
                    onClick={() => {
                      setArtworkFromTitle(false);
                      setSelectedCoverId(cover.id);
                      setCustomUrl("");
                    }}
                  >
                    <img src={cover.src} alt="" className="aspect-[16/10] w-full object-cover" />
                    <span className="block px-3 py-2 text-xs text-[#6b657f]">{t(`learningDesk.covers.${cover.id}`)}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-[#2c2742]">
              <input
                type="checkbox"
                className="size-4 accent-[#6d4aff]"
                checked={artworkFromTitle}
                onChange={(event) => {
                  setArtworkFromTitle(event.target.checked);
                  if (event.target.checked) setSelectedCoverId(null);
                }}
              />
              {t("learningDesk.chooseArtwork")}
            </label>

            <Field label={t("learningDesk.customCoverUrl")} className="mt-4" htmlFor="create-course-cover-url">
              <Input
                id="create-course-cover-url"
                value={customUrl}
                placeholder={t("learningDesk.urlPlaceholder")}
                className={fieldClass}
                onChange={(event) => setCustomUrl(event.target.value)}
              />
            </Field>
            <Field label={t("trainingCourses.description")} className="mt-4" htmlFor="create-course-description">
              <Textarea id="create-course-description" value={description} className={cn(fieldClass, "min-h-24")} onChange={(event) => setDescription(event.target.value)} />
            </Field>

            <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
              <Field label={t("learningDesk.organization")} htmlFor="create-course-org">
                <Input id="create-course-org" value={organization} className={fieldClass} onChange={(event) => setOrganization(event.target.value)} />
              </Field>
              <Field label={t("learningDesk.durationMinutes")} htmlFor="create-course-duration">
                <Input
                  id="create-course-duration"
                  type="number"
                  min={0}
                  value={duration}
                  className={fieldClass}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </Field>
              <Field label={t("learningDesk.capacity")} htmlFor="create-course-capacity">
                <Input
                  id="create-course-capacity"
                  type="number"
                  min={1}
                  value={capacity}
                  className={fieldClass}
                  onChange={(event) => setCapacity(event.target.value)}
                />
              </Field>
              <Field label={t("learningDesk.reviewer")} htmlFor="create-course-reviewer">
                <select
                  id="create-course-reviewer"
                  value={reviewerId}
                  className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-[#e4dff5] bg-white px-3 text-sm text-[#1c1730]"
                  onChange={(event) => setReviewerId(event.target.value)}
                >
                  <option value="">{t("learningDesk.reviewerPlaceholder")}</option>
                  {reviewers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} ({person.employee_code})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[#6b657f]">{t("learningDesk.deliveryNote")}</p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-[#ece8f5] p-4 sm:p-5">
            <h2 className="text-base font-semibold text-[#1c1730]">{tabs.find(([id]) => id === tab)?.[1]}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#6b657f]">{t("learningDesk.draftTabsNote")}</p>
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-[#ece8f5] bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-[#1c1730]">{t("learningDesk.savePublish")}</h2>
        <Field label={t("learningDesk.changeReason")} className="mt-4" htmlFor="create-course-reason">
          <Textarea id="create-course-reason" value={reason} className={cn(fieldClass, "min-h-24")} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={creating} className="mt-4 border-transparent bg-[#6d4aff] text-white shadow-none hover:bg-[#5b3de6]">
          + {t("trainingCourses.createDraft")}
        </Button>
      </section>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm text-[#5c5670]">
        {label}
      </label>
      {children}
    </div>
  );
}
