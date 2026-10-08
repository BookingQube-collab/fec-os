"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  Briefcase,
  FileText,
  FileX,
  GraduationCap,
  IdCard,
  TreePalm,
  Plane,
  ScrollText,
  Stamp,
  Stethoscope,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmbedFrame } from "@/components/hr/hr-embed-frame";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import {
  documentStatusMark,
  StaffDocumentLightbox,
  StaffDocumentOpenButton,
  StaffDocumentThumbnail,
  verificationStatusMark,
} from "@/components/people/staff-document-preview";
import GlideSelect from "@/components/react-bits/glide-select";
import StatusMark from "@/components/react-bits/status-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { HR_DOC_TYPES, type HrDocType } from "@/lib/hr-advanced";
import {
  fileToBase64,
  IDENTITY_FILE_ACCEPT,
  IDENTITY_FILE_MAX_BYTES,
  identityFileContentType,
} from "@/lib/hr/identity-file";
import {
  applyDocumentEditorExtraction,
  isIdentityDocType,
} from "@/lib/hr/identity-document-parse";
import {
  approveEmployeeDocument,
  deleteEmployeeDocument,
  expireEmployeeDocument,
  extractStaffIdentityDocument,
  getEmployeeDocumentUrl,
  listEmployeeDocuments,
  rejectEmployeeDocument,
  replaceEmployeeDocument,
  uploadEmployeeDocument,
  verifyEmployeeDocument,
} from "@/lib/hr-documents.functions";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

const DOC_TAB_ICONS: Record<HrDocType, LucideIcon> = {
  cv: UserRound,
  qid: IdCard,
  passport: BookOpen,
  visa: Stamp,
  secondment: Briefcase,
  contract: ScrollText,
  educational_certificate: GraduationCap,
  mofa_attested_certificate: Award,
  warning_letter: FileX,
  increment_letter: Wallet,
  demotion_letter: FileText,
  resignation_letter: FileText,
  termination_letter: FileX,
  medical_certificate: Stethoscope,
  leave_document: TreePalm,
  air_ticket_receipt: Plane,
  loan_document: Wallet,
  other: FileText,
};

const EDUCATION_TYPES = new Set(["educational_certificate", "mofa_attested_certificate"]);

export function HrDocumentsWorkspace({
  lockedStaffId,
  embedded = false,
  onChanged,
}: {
  lockedStaffId?: string;
  embedded?: boolean;
  onChanged?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const menuAlign = i18n.dir() === "rtl" ? "right" : "left";
  const qc = useQueryClient();
  const [pickedStaffId, setPickedStaffId] = useState("");
  const staffId = lockedStaffId ?? pickedStaffId;
  const [docType, setDocType] = useState<(typeof HR_DOC_TYPES)[number]>("contract");
  const [expiry, setExpiry] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [numberSuggestion, setNumberSuggestion] = useState("");
  const [expirySuggestion, setExpirySuggestion] = useState("");
  const [extractNote, setExtractNote] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [qualification, setQualification] = useState("");
  const [institution, setInstitution] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [mofaStatus, setMofaStatus] = useState<"" | "yes" | "no" | "not_required">("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  const staff = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
    enabled: !lockedStaffId,
  });

  const docs = useQuery({
    queryKey: queryKeys.people.hrDocs({ staffId: staffId || "all" }),
    queryFn: () => listEmployeeDocuments({ staffId: staffId || undefined }),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrDocs() });
    onChanged?.();
  };

  async function onPickUpload(next: File | null) {
    setFile(next);
    setNumberSuggestion("");
    setExpirySuggestion("");
    setExtractNote("");
    if (!next || !isIdentityDocType(docType)) return;
    if (next.size > IDENTITY_FILE_MAX_BYTES) {
      toast.error(t("people.staff.fileTooLarge"));
      setFile(null);
      return;
    }
    const contentType = identityFileContentType(next);
    if (!contentType) {
      toast.error(t("people.staff.fileType"));
      setFile(null);
      return;
    }
    setReadingFile(true);
    try {
      const data_base64 = await fileToBase64(next);
      const result = await extractStaffIdentityDocument({
        docType,
        filename: next.name,
        data_base64,
        content_type: contentType,
      });
      const applied = applyDocumentEditorExtraction({
        docType,
        number: documentNumber,
        expiry,
        parsed: result.parsed,
      });
      setDocumentNumber(applied.number);
      setExpiry(applied.expiry);
      setNumberSuggestion(applied.suggestions.number ?? "");
      setExpirySuggestion(applied.suggestions.expiry ?? "");
      setExtractNote(result.manual ? t("people.staff.extractManual") : "");
    } catch (error) {
      setExtractNote((error as Error).message || t("people.staff.extractManual"));
    } finally {
      setReadingFile(false);
    }
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (!staffId || !file) throw new Error(t("hr.docs.needFile"));
      const data_base64 = await fileToBase64(file);
      return uploadEmployeeDocument({
        staffId,
        docType,
        filename: file.name,
        data_base64,
        content_type: file.type || "application/pdf",
        documentNumber: documentNumber.trim() || null,
        expiryDate: expiry || null,
        title: file.name,
        qualification: qualification || null,
        institution: institution || null,
        graduationYear: graduationYear ? Number(graduationYear) : null,
        mofaStatus: mofaStatus || null,
      });
    },
    onSuccess: () => {
      toast.success(t("hr.docs.uploaded"));
      setOpenFolder(docType);
      setFile(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadDoc = useMutation({
    mutationFn: (id: string) => getEmployeeDocumentUrl({ id, purpose: "download" }),
    onSuccess: (res) => {
      window.open(res.url, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteEmployeeDocument,
    onSuccess: () => {
      toast.success(t("hr.docs.deleted"));
      setPreviewId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: verifyEmployeeDocument,
    onSuccess: () => {
      toast.success(t("hr.docs.verified"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: approveEmployeeDocument,
    onSuccess: () => {
      toast.success(t("hr.docs.approved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: rejectEmployeeDocument,
    onSuccess: () => {
      toast.success(t("hr.docs.rejected"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expire = useMutation({
    mutationFn: expireEmployeeDocument,
    onSuccess: () => {
      toast.success(t("hr.docs.markedExpired"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replace = useMutation({
    mutationFn: async () => {
      if (!replaceId || !replaceFile) throw new Error(t("hr.docs.needFile"));
      const data_base64 = await fileToBase64(replaceFile);
      const contentType = identityFileContentType(replaceFile) || replaceFile.type || "application/pdf";
      const existing = (docs.data ?? []).find((doc) => doc.id === replaceId);
      let documentNumber = existing?.documentNumber ?? null;
      let expiryDate = existing?.expiryDate ?? null;
      if (existing && isIdentityDocType(existing.docType) && identityFileContentType(replaceFile)) {
        try {
          const result = await extractStaffIdentityDocument({
            docType: existing.docType,
            filename: replaceFile.name,
            data_base64,
            content_type: contentType,
          });
          const applied = applyDocumentEditorExtraction({
            docType: existing.docType,
            number: existing.documentNumber ?? "",
            expiry: existing.expiryDate ?? "",
            parsed: result.parsed,
          });
          documentNumber = applied.number || documentNumber;
          expiryDate = applied.expiry || expiryDate;
        } catch {
          /* keep the previous number and expiry; the new file still replaces the scan */
        }
      }
      return replaceEmployeeDocument({
        id: replaceId,
        filename: replaceFile.name,
        data_base64,
        content_type: contentType,
        documentNumber,
        expiryDate,
      });
    },
    onSuccess: () => {
      toast.success(t("hr.docs.replaced"));
      setReplaceId(null);
      setReplaceFile(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const showEducation = EDUCATION_TYPES.has(docType);
  const today = new Date().toISOString().slice(0, 10);
  const documents = docs.data ?? [];
  const previewDoc = documents.find((doc) => doc.id === previewId) ?? null;
  const folders = useMemo(() => {
    const rows = docs.data ?? [];
    const byType = new Map<string, typeof rows>();
    for (const doc of rows) {
      const bucket = byType.get(doc.docType);
      if (bucket) bucket.push(doc);
      else byType.set(doc.docType, [doc]);
    }
    return HR_DOC_TYPES.flatMap((type) => {
      const items = byType.get(type);
      return items ? [{ type, items }] : [];
    });
  }, [docs.data]);
  const activeFolder = folders.find((folder) => folder.type === openFolder) ?? folders[0] ?? null;

  function docActions(
    doc: {
      id: string;
      verificationStatus: string;
      status: string;
      expiryDate: string | null;
    },
    includeView = false,
  ) {
    return (
      <>
        {includeView ? (
          <Button size="sm" variant="secondary" onClick={() => setPreviewId(doc.id)}>
            {t("hr.docs.view")}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => downloadDoc.mutate(doc.id)}>
          {t("hr.docs.download")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReplaceId(doc.id);
            setPreviewId(null);
          }}
        >
          {t("hr.docs.replace")}
        </Button>
        {doc.verificationStatus !== "verified" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => verify.mutate({ id: doc.id, verificationStatus: "verified" })}
          >
            {t("hr.docs.verify")}
          </Button>
        ) : null}
        {doc.status === "pending" ? (
          <>
            <Button size="sm" variant="outline" onClick={() => approve.mutate({ id: doc.id })}>
              {t("hr.docs.approve")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => reject.mutate({ id: doc.id })}>
              {t("hr.docs.reject")}
            </Button>
          </>
        ) : null}
        {doc.status !== "expired" && doc.expiryDate && doc.expiryDate < today ? (
          <Button size="sm" variant="outline" onClick={() => expire.mutate({ id: doc.id })}>
            {t("hr.docs.expire")}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => remove.mutate({ id: doc.id })}>
          {t("hr.docs.delete")}
        </Button>
      </>
    );
  }

  return (
    <CapabilityGate
      capability="hr.docs.manage"
      fallback={
        embedded ? (
          <HrEmptyState message={t("hr.docs.noAccess")} />
        ) : (
          <HrShell>
            <HrPanel>
              <HrEmptyState message={t("hr.docs.noAccess")} />
            </HrPanel>
          </HrShell>
        )
      }
    >
      <HrEmbedFrame
        embedded={embedded}
        icon={FileText}
        kicker={t("hr.docs.kicker")}
        title={t("hr.docs.title")}
        subtitle={t("hr.docs.subtitle")}
      >
          <div className="hr-intake hr-enter">
            <div className="hr-intake__tab" title={t("hr.docs.fileInto", { type: t(`hr.docs.types.${docType}`) })}>
              <span className="hr-intake__label">{t("hr.docs.fileInto", { type: t(`hr.docs.types.${docType}`) })}</span>
            </div>
            <div className="hr-intake__body">
            <p className="hr-intake__hint">{t("hr.docs.intakeHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {lockedStaffId ? null : (
              <div className="lg:col-span-2">
                <Label>{t("hr.docs.staff")}</Label>
                <SearchableSelect
                  value={staffId}
                  onValueChange={setPickedStaffId}
                  placeholder={t("hr.docs.allStaff")}
                  emptyOption={{ value: "", label: t("hr.docs.allStaff") }}
                  options={(staff.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                    keywords: `${s.name} ${s.employeeCode ?? ""}`,
                  }))}
                />
              </div>
              )}
              <div>
                <Label>{t("hr.docs.type")}</Label>
                <GlideSelect
                  ariaLabel={t("hr.docs.type")}
                  value={docType}
                  size="lg"
                  showTags={false}
                  align={menuAlign}
                  menuWidth={360}
                  className="block w-full [&>button]:w-full [&>button]:justify-between"
                  options={HR_DOC_TYPES.map((value) => ({
                    value,
                    label: t(`hr.docs.types.${value}`),
                  }))}
                  onChange={(value) => {
                    setDocType(value as (typeof HR_DOC_TYPES)[number]);
                    if ((docs.data ?? []).some((doc) => doc.docType === value)) setOpenFolder(value);
                    setDocumentNumber("");
                    setExpiry("");
                    setNumberSuggestion("");
                    setExpirySuggestion("");
                    setExtractNote("");
                    setFile(null);
                  }}
                />
              </div>
              {isIdentityDocType(docType) ? (
                <div>
                  <Label>{t("hr.docs.documentNumber")}</Label>
                  <Input
                    value={documentNumber}
                    className="font-mono"
                    onChange={(e) => {
                      setDocumentNumber(e.target.value);
                      setNumberSuggestion("");
                    }}
                  />
                  {numberSuggestion ? (
                    <button
                      type="button"
                      className="mt-1 text-left text-xs text-primary underline"
                      onClick={() => {
                        setDocumentNumber(numberSuggestion);
                        setNumberSuggestion("");
                      }}
                    >
                      {t("people.staff.useExtracted", { value: numberSuggestion })}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div>
                <Label>{t("hr.docs.expiry")}</Label>
                <Input
                  type="date"
                  value={expiry}
                  onChange={(e) => {
                    setExpiry(e.target.value);
                    setExpirySuggestion("");
                  }}
                />
                {expirySuggestion ? (
                  <button
                    type="button"
                    className="mt-1 text-left text-xs text-primary underline"
                    onClick={() => {
                      setExpiry(expirySuggestion);
                      setExpirySuggestion("");
                    }}
                  >
                    {t("people.staff.useExtracted", { value: expirySuggestion })}
                  </button>
                ) : null}
              </div>
              <div className="hr-intake__slot">
                <Label>{t("hr.docs.file")}</Label>
                <Input
                  type="file"
                  accept={IDENTITY_FILE_ACCEPT}
                  onChange={(e) => void onPickUpload(e.target.files?.[0] ?? null)}
                />
                {readingFile ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("people.staff.readingDocument")}</p>
                ) : null}
                {extractNote ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{extractNote}</p>
                ) : null}
              </div>
              {showEducation ? (
                <>
                  <div>
                    <Label>{t("hr.docs.qualification")}</Label>
                    <Input value={qualification} onChange={(e) => setQualification(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("hr.docs.institution")}</Label>
                    <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("hr.docs.graduationYear")}</Label>
                    <Input
                      type="number"
                      value={graduationYear}
                      onChange={(e) => setGraduationYear(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{t("hr.docs.mofaStatus")}</Label>
                    <GlideSelect
                      ariaLabel={t("hr.docs.mofaStatus")}
                      value={mofaStatus}
                      size="lg"
                      showTags={false}
                      align={menuAlign}
                      menuWidth={280}
                      className="block w-full [&>button]:w-full [&>button]:justify-between"
                      options={[
                        { value: "", label: t("hr.docs.mofaUnset") },
                        { value: "yes", label: t("hr.docs.mofaYes") },
                        { value: "no", label: t("hr.docs.mofaNo") },
                        { value: "not_required", label: t("hr.docs.mofaNotRequired") },
                      ]}
                      onChange={(value) => setMofaStatus(value as typeof mofaStatus)}
                    />
                  </div>
                </>
              ) : null}
              <div className="flex items-end lg:col-span-5">
                <Button disabled={!staffId || !file || upload.isPending} onClick={() => upload.mutate()}>
                  {t("hr.docs.upload")}
                </Button>
              </div>
            </div>
            </div>
          </div>

          {replaceId ? (
            <div className="hr-slip hr-enter">
              <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
                <div>
                  <Label>{t("hr.docs.replaceFile")}</Label>
                  <Input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <Button disabled={!replaceFile || replace.isPending} onClick={() => replace.mutate()}>
                  {t("hr.docs.replace")}
                </Button>
                <Button variant="ghost" onClick={() => { setReplaceId(null); setReplaceFile(null); }}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="hr-cabinet hr-enter">
            {activeFolder ? (
              <>
                <div className="fec-inner-tabs" role="tablist" aria-label={t("hr.docs.cabinet")}>
                  {folders.map((folder) => {
                    const label = t(`hr.docs.types.${folder.type}`);
                    const selected = folder.type === activeFolder.type;
                    const Icon = DOC_TAB_ICONS[folder.type as HrDocType] ?? FileText;
                    return (
                      <button
                        key={folder.type}
                        type="button"
                        role="tab"
                        id={`hr-folder-tab-${folder.type}`}
                        aria-selected={selected}
                        aria-controls="hr-folder-panel"
                        className={selected ? "fec-inner-tab is-active" : "fec-inner-tab"}
                        title={label}
                        aria-label={t("hr.docs.openFolder", { type: label, count: folder.items.length })}
                        onClick={() => setOpenFolder(folder.type)}
                      >
                        <Icon aria-hidden />
                        <span className="hr-folder-tab__label">{label}</span>
                        <span className="hr-folder-tab__count">{folder.items.length}</span>
                      </button>
                    );
                  })}
                </div>
                <div
                  className="hr-folder-body"
                  role="tabpanel"
                  id="hr-folder-panel"
                  aria-labelledby={`hr-folder-tab-${activeFolder.type}`}
                >
                  <div className="hr-folder-body__stack">
                    {activeFolder.items.map((doc) => (
                      <article key={doc.id} className="hr-sheet">
                        <StaffDocumentOpenButton
                          label={t("hr.docs.openPreview", {
                            name: doc.fileName ?? t(`hr.docs.types.${doc.docType}`),
                          })}
                          onOpen={() => setPreviewId(doc.id)}
                        >
                          <StaffDocumentThumbnail doc={doc} />
                          <span className="hr-sheet__copy min-w-0 flex-1">
                            <span className="block font-medium">
                              {doc.staffName} · {t(`hr.docs.types.${doc.docType}`)}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {doc.fileName ?? "—"}
                              {doc.expiryDate ? ` · ${t("hr.docs.expires", { date: doc.expiryDate })}` : ""}
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-3">
                              <StatusMark
                                status={documentStatusMark(doc.status)}
                                label={t(`hr.docs.status.${doc.status}`)}
                                size={16}
                                fontSize={12}
                                strike={false}
                              />
                              <StatusMark
                                status={verificationStatusMark(doc.verificationStatus)}
                                label={t(`hr.docs.verification.${doc.verificationStatus}`)}
                                size={16}
                                fontSize={12}
                                strike={false}
                              />
                              {doc.expiryDate && doc.expiryDate < today ? (
                                <Badge variant="destructive">{t("hr.docs.expired")}</Badge>
                              ) : null}
                            </span>
                          </span>
                        </StaffDocumentOpenButton>
                        <div className="hr-sheet__actions">{docActions(doc, true)}</div>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="hr-intake__tab" aria-hidden="true">
                  <span className="hr-intake__label">{t("hr.docs.cabinet")}</span>
                </div>
                <div className="hr-folder-body">
                  <HrEmptyState message={t("hr.docs.empty")} icon={FileText} />
                </div>
              </>
            )}
          </div>
          <StaffDocumentLightbox
            doc={previewDoc}
            open={Boolean(previewDoc)}
            onOpenChange={(next) => {
              if (!next) setPreviewId(null);
            }}
            actions={previewDoc ? docActions(previewDoc) : null}
          />
      </HrEmbedFrame>
    </CapabilityGate>
  );
}

export default function HrDocumentsPage() {
  return <HrDocumentsWorkspace />;
}
