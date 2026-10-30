"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { HrLetterPrintDialog, type HrLetterPrintPayload } from "@/components/hr/hr-letter-print-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  HR_LETTER_DOC_TYPES,
  HR_LETTER_WARNING_LEVELS,
  type HrLetterDocType,
  type HrLetterDraft,
} from "@/lib/hr/hr-letter-types";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { aiDraftHrLetter, fileGeneratedHrLetter } from "@/lib/hr-letters.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type Step = "facts" | "preview";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyDraft(): HrLetterDraft {
  return {
    subject: "",
    reference: "",
    salutation: "",
    bodyParagraphs: [""],
    closing: "",
    signatoryTitle: "",
  };
}

export function HrGenerateLetterDialog({
  open,
  onOpenChange,
  initialLetterType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLetterType?: HrLetterDocType | "all";
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("facts");
  const [staffId, setStaffId] = useState("");
  const [letterType, setLetterType] = useState<HrLetterDocType>("warning_letter");
  const [letterDate, setLetterDate] = useState(todayIso);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [amountQar, setAmountQar] = useState("");
  const [previousTitle, setPreviousTitle] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [warningLevel, setWarningLevel] = useState<(typeof HR_LETTER_WARNING_LEVELS)[number]>("written");
  const [reason, setReason] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [draft, setDraft] = useState<HrLetterDraft>(emptyDraft);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [staffMeta, setStaffMeta] = useState<{
    fullName: string;
    employeeCode: string | null;
    jobTitle: string | null;
    department: string | null;
  } | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const staff = useQuery({
    queryKey: queryKeys.people.hrDocs({ scope: "letter-staff" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setStep("facts");
    setDraft(emptyDraft());
    setAiGenerated(false);
    setStaffMeta(null);
    setReason("");
    setAdditionalNotes("");
    setAmountQar("");
    setPreviousTitle("");
    setNewTitle("");
    setEffectiveDate("");
    setLetterDate(todayIso());
    setLocale(i18n.language?.startsWith("ar") ? "ar" : "en");
    if (initialLetterType && initialLetterType !== "all") {
      setLetterType(initialLetterType);
    }
  }, [open, initialLetterType, i18n.language]);

  const generate = useMutation({
    mutationFn: () => {
      if (!staffId) throw new Error(t("hrWorkspace.letters.needStaff"));
      if (reason.trim().length < 3) throw new Error(t("hrWorkspace.letters.needReason"));
      const amount = amountQar.trim() ? Number(amountQar) : null;
      if (amountQar.trim() && (!Number.isFinite(amount) || (amount ?? 0) < 0)) {
        throw new Error(t("hrWorkspace.letters.invalidAmount"));
      }
      return aiDraftHrLetter({
        staffId,
        letterType,
        letterDate,
        effectiveDate: effectiveDate || null,
        amountQar: amount,
        previousTitle: previousTitle.trim() || null,
        newTitle: newTitle.trim() || null,
        reason: reason.trim(),
        additionalNotes: additionalNotes.trim() || null,
        warningLevel: letterType === "warning_letter" ? warningLevel : null,
        locale,
      });
    },
    onSuccess: (result) => {
      setDraft(result.draft);
      setAiGenerated(result.aiGenerated);
      setStaffMeta({
        fullName: result.staff.fullName,
        employeeCode: result.staff.employeeCode,
        jobTitle: result.staff.jobTitle,
        department: result.staff.department,
      });
      setStep("preview");
      toast.success(
        result.aiGenerated
          ? t("hrWorkspace.letters.generatedAi")
          : t("hrWorkspace.letters.generatedFallback"),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fileLetter = useMutation({
    mutationFn: () => {
      if (!staffId) throw new Error(t("hrWorkspace.letters.needStaff"));
      const paragraphs = draft.bodyParagraphs.map((p) => p.trim()).filter(Boolean);
      if (!draft.subject.trim() || !draft.salutation.trim() || paragraphs.length === 0) {
        throw new Error(t("hrWorkspace.letters.needDraft"));
      }
      return fileGeneratedHrLetter({
        staffId,
        letterType,
        letterDate,
        locale,
        draft: {
          ...draft,
          reference: draft.reference?.trim() || null,
          bodyParagraphs: paragraphs,
        },
        notes: additionalNotes.trim() || null,
      });
    },
    onSuccess: async () => {
      toast.success(t("hrWorkspace.letters.filed"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.hrDocs({ scope: "letters" }) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.people.hrDocs() });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const printPayload: HrLetterPrintPayload | null = useMemo(() => {
    if (!staffMeta) return null;
    return {
      letterTypeLabel: t(`hr.docs.types.${letterType}`),
      letterDate,
      staffName: staffMeta.fullName,
      employeeCode: staffMeta.employeeCode,
      jobTitle: staffMeta.jobTitle,
      department: staffMeta.department,
      draft: {
        ...draft,
        bodyParagraphs: draft.bodyParagraphs.map((p) => p.trim()).filter(Boolean),
      },
      locale,
    };
  }, [staffMeta, letterType, letterDate, draft, locale, t]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden />
              {t("hrWorkspace.letters.generateTitle")}
            </DialogTitle>
            <DialogDescription>{t("hrWorkspace.letters.generateHint")}</DialogDescription>
          </DialogHeader>

          {step === "facts" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>{t("hrWorkspace.letters.staff")}</Label>
                <SearchableSelect
                  value={staffId}
                  onValueChange={setStaffId}
                  placeholder={t("hrWorkspace.letters.pickStaff")}
                  options={(staff.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                    keywords: `${s.name} ${s.employeeCode ?? ""}`,
                  }))}
                />
              </div>

              <div>
                <Label>{t("hrWorkspace.letters.letterType")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={letterType}
                  onChange={(e) => setLetterType(e.target.value as HrLetterDocType)}
                >
                  {HR_LETTER_DOC_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`hr.docs.types.${type}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>{t("hrWorkspace.letters.locale")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as "en" | "ar")}
                >
                  <option value="en">{t("hrWorkspace.letters.localeEn")}</option>
                  <option value="ar">{t("hrWorkspace.letters.localeAr")}</option>
                </select>
              </div>

              <div>
                <Label>{t("hrWorkspace.letters.letterDate")}</Label>
                <Input type="date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} />
              </div>

              <div>
                <Label>{t("hrWorkspace.letters.effectiveDate")}</Label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>

              {letterType === "warning_letter" ? (
                <div className="sm:col-span-2">
                  <Label>{t("hrWorkspace.letters.warningLevel")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={warningLevel}
                    onChange={(e) =>
                      setWarningLevel(e.target.value as (typeof HR_LETTER_WARNING_LEVELS)[number])
                    }
                  >
                    {HR_LETTER_WARNING_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {t(`hrWorkspace.letters.warningLevels.${level}`)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {letterType === "increment_letter" ? (
                <div className="sm:col-span-2">
                  <Label>{t("hrWorkspace.letters.amountQar")}</Label>
                  <Input
                    inputMode="decimal"
                    value={amountQar}
                    onChange={(e) => setAmountQar(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              ) : null}

              {letterType === "demotion_letter" ? (
                <>
                  <div>
                    <Label>{t("hrWorkspace.letters.previousTitle")}</Label>
                    <Input value={previousTitle} onChange={(e) => setPreviousTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("hrWorkspace.letters.newTitle")}</Label>
                    <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                  </div>
                </>
              ) : null}

              <div className="sm:col-span-2">
                <Label>{t("hrWorkspace.letters.reason")}</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>

              <div className="sm:col-span-2">
                <Label>{t("hrWorkspace.letters.notes")}</Label>
                <Textarea
                  rows={2}
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {aiGenerated
                  ? t("hrWorkspace.letters.aiBadge")
                  : t("hrWorkspace.letters.fallbackBadge")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>{t("hrWorkspace.letters.subject")}</Label>
                  <Input
                    value={draft.subject}
                    onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>{t("hrWorkspace.letters.reference")}</Label>
                  <Input
                    value={draft.reference ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>{t("hrWorkspace.letters.salutation")}</Label>
                  <Input
                    value={draft.salutation}
                    onChange={(e) => setDraft((d) => ({ ...d, salutation: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t("hrWorkspace.letters.body")}</Label>
                  <Textarea
                    rows={10}
                    className={cn(locale === "ar" && "text-end")}
                    dir={locale === "ar" ? "rtl" : "ltr"}
                    value={draft.bodyParagraphs.join("\n\n")}
                    onChange={(e) =>
                      setDraft((d) => {
                        const parts = e.target.value
                          .split(/\n\s*\n/)
                          .map((p) => p.trim())
                          .filter(Boolean);
                        return { ...d, bodyParagraphs: parts.length ? parts : [e.target.value] };
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{t("hrWorkspace.letters.closing")}</Label>
                  <Input
                    value={draft.closing}
                    onChange={(e) => setDraft((d) => ({ ...d, closing: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>{t("hrWorkspace.letters.signatory")}</Label>
                  <Input
                    value={draft.signatoryTitle}
                    onChange={(e) => setDraft((d) => ({ ...d, signatoryTitle: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {step === "preview" ? (
                <Button type="button" variant="secondary" onClick={() => setStep("facts")}>
                  {t("hrWorkspace.letters.back")}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              {step === "facts" ? (
                <Button type="button" onClick={() => generate.mutate()} disabled={generate.isPending}>
                  {generate.isPending
                    ? t("hrWorkspace.letters.generating")
                    : t("hrWorkspace.letters.generateAction")}
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setPrintOpen(true)}>
                    {t("hrWorkspace.letters.previewPrint")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => fileLetter.mutate()}
                    disabled={fileLetter.isPending}
                  >
                    {fileLetter.isPending
                      ? t("common.saving")
                      : t("hrWorkspace.letters.fileToRecord")}
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HrLetterPrintDialog open={printOpen} onOpenChange={setPrintOpen} payload={printPayload} />
    </>
  );
}
