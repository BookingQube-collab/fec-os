"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FecButton as Button, FecEmptyState, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import { TRAINING_ENTITY_TYPES, requirementEnforcement } from "@/lib/training/engine";
import { listTrainingLinks, readTrainingRequirement, saveTrainingLink, trainingCourseShareCard } from "@/lib/training/links.functions";
import { listSessionFormOptions } from "@/lib/training/sessions.functions";
import { TrainingSectionNav } from "@/views/training-section-nav";

type LinkRow = {
  id: string;
  course_id: string | null;
  entity_type: string;
  entity_id: string;
  requirement_type: string;
  enforce_mode: string;
};

export default function TrainingLinksPage() {
  const { t } = useTranslation();
  const canEdit = usePermission("training.edit");
  const [courses, setCourses] = useState<{ id: string; title: string; code: string }[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [courseId, setCourseId] = useState("");
  const [entityType, setEntityType] = useState<(typeof TRAINING_ENTITY_TYPES)[number]>("SOP");
  const [entityId, setEntityId] = useState("");
  const [requirementType, setRequirementType] = useState<"REQUIRED" | "RECOMMENDED">("REQUIRED");
  const [enforceMode, setEnforceMode] = useState<"WARN" | "BLOCK">("WARN");
  const [staffId, setStaffId] = useState("");
  const [checkType, setCheckType] = useState<(typeof TRAINING_ENTITY_TYPES)[number]>("SOP");
  const [checkId, setCheckId] = useState("");
  const [results, setResults] = useState<{ courseTitle: string; status: string; enforceMode: string; requirementType: string }[]>([]);
  const [shareText, setShareText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const listed = await listTrainingLinks({ courseId: null });
    if (!listed.ok) {
      setError(listed.error);
      return;
    }
    setLinks(listed.data);
    setError(null);
    const options = await listSessionFormOptions({});
    if (options.ok) setCourses(options.data.courses);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <FecPageHeader icon={Link2} title={t("trainingLinks.title")} subtitle={t("trainingLinks.subtitle")} />
      <TrainingSectionNav />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {canEdit ? (
        <form
          className="grid gap-3 rounded-2xl border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              const result = await saveTrainingLink({ courseId, entityType, entityId, requirementType, enforceMode });
              if (!result.ok) setError(result.error);
              else await load();
            })();
          }}
        >
          <select className="min-h-12 rounded-md border border-input bg-background px-3" value={courseId} onChange={(event) => setCourseId(event.target.value)} required>
            <option value="">{t("trainingLinks.course")}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
          <select className="min-h-12 rounded-md border border-input bg-background px-3" value={entityType} onChange={(event) => setEntityType(event.target.value as typeof entityType)}>
            {TRAINING_ENTITY_TYPES.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <Input value={entityId} placeholder={t("trainingLinks.recordId")} onChange={(event) => setEntityId(event.target.value)} required />
          <select className="min-h-12 rounded-md border border-input bg-background px-3" value={requirementType} onChange={(event) => setRequirementType(event.target.value as typeof requirementType)}>
            <option value="REQUIRED">{t("trainingLinks.required")}</option>
            <option value="RECOMMENDED">{t("trainingLinks.recommended")}</option>
          </select>
          <select className="min-h-12 rounded-md border border-input bg-background px-3" value={enforceMode} onChange={(event) => setEnforceMode(event.target.value as typeof enforceMode)}>
            <option value="WARN">{t("trainingLinks.warn")}</option>
            <option value="BLOCK">{t("trainingLinks.block")}</option>
          </select>
          <Button type="submit" className="min-h-12">{t("trainingLinks.save")}</Button>
        </form>
      ) : null}
      {links.length === 0 ? <FecEmptyState message={t("trainingLinks.empty")} /> : (
        <ul className="grid gap-2">
          {links.map((link) => (
            <li key={link.id} className="rounded-xl border border-border p-3 text-sm">
              {link.entity_type} · {link.requirement_type} · {link.enforce_mode}
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            const result = await readTrainingRequirement({ entityType: checkType, entityId: checkId, staffId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setResults(result.data);
          })();
        }}
      >
        <h2 className="md:col-span-2 text-sm font-medium">{t("trainingLinks.check")}</h2>
        <select className="min-h-12 rounded-md border border-input bg-background px-3" value={checkType} onChange={(event) => setCheckType(event.target.value as typeof checkType)}>
          {TRAINING_ENTITY_TYPES.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <Input value={checkId} placeholder={t("trainingLinks.recordId")} onChange={(event) => setCheckId(event.target.value)} required />
        <Input value={staffId} placeholder={t("trainingLinks.staffId")} onChange={(event) => setStaffId(event.target.value)} required />
        <Button type="submit" className="min-h-12">{t("trainingLinks.check")}</Button>
      </form>
      {results.map((row) => {
        const effect = requirementEnforcement({
          status: row.status,
          enforceMode: row.enforceMode === "BLOCK" ? "BLOCK" : "WARN",
          requirementType: row.requirementType === "RECOMMENDED" ? "RECOMMENDED" : "REQUIRED",
        });
        return (
          <p key={row.courseTitle} className="text-sm">
            {row.courseTitle}: {row.status}
            {effect.block ? ` · ${t("trainingLinks.wouldBlock")}` : effect.warn ? ` · ${t("trainingLinks.wouldWarn")}` : ""}
          </p>
        );
      })}
      <form
        className="grid gap-3 md:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            const result = await trainingCourseShareCard({ courseId, dueOn: null });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            const card = result.data;
            setShareText(
              `${card.title}\n${card.mandatory ? t("trainingLinks.mandatory") : t("trainingLinks.optional")}\n${card.href}`,
            );
          })();
        }}
      >
        <p className="md:col-span-2 text-sm text-muted-foreground">{t("trainingLinks.shareNote")}</p>
        <Button type="submit" className="min-h-12">{t("trainingLinks.share")}</Button>
      </form>
      {shareText ? <pre className="whitespace-pre-wrap rounded-xl border border-border p-3 text-sm">{shareText}</pre> : null}
    </div>
  );
}
