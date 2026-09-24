"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { HR_DOC_TYPES } from "@/lib/hr-advanced";
import {
  approveEmployeeDocument,
  deleteEmployeeDocument,
  expireEmployeeDocument,
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

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

const EDUCATION_TYPES = new Set(["educational_certificate", "mofa_attested_certificate"]);

export default function HrDocumentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [docType, setDocType] = useState<(typeof HR_DOC_TYPES)[number]>("contract");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [qualification, setQualification] = useState("");
  const [institution, setInstitution] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [mofaStatus, setMofaStatus] = useState<"" | "yes" | "no" | "not_required">("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const staff = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
  });

  const docs = useQuery({
    queryKey: queryKeys.people.hrDocs({ staffId: staffId || "all" }),
    queryFn: () => listEmployeeDocuments({ staffId: staffId || undefined }),
    staleTime: STALE.people,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.people.hrDocs() });

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
      setFile(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDoc = useMutation({
    mutationFn: (id: string) => getEmployeeDocumentUrl({ id, purpose: "preview" }),
    onSuccess: (res) => {
      window.open(res.url, "_blank", "noopener,noreferrer");
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
      return replaceEmployeeDocument({
        id: replaceId,
        filename: replaceFile.name,
        data_base64,
        content_type: replaceFile.type || "application/pdf",
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

  return (
    <CapabilityGate
      capability="hr.docs.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.docs.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={FileText}
          kicker={t("hr.docs.kicker")}
          title={t("hr.docs.title")}
          subtitle={t("hr.docs.subtitle")}
        >
          <HrPanel delay={0}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <Label>{t("hr.docs.staff")}</Label>
                <SearchableSelect
                  value={staffId}
                  onValueChange={setStaffId}
                  placeholder={t("hr.docs.allStaff")}
                  emptyOption={{ value: "", label: t("hr.docs.allStaff") }}
                  options={(staff.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                    keywords: `${s.name} ${s.employeeCode ?? ""}`,
                  }))}
                />
              </div>
              <div>
                <Label>{t("hr.docs.type")}</Label>
                <select
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as (typeof HR_DOC_TYPES)[number])}
                >
                  {HR_DOC_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(`hr.docs.types.${value}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("hr.docs.expiry")}</Label>
                <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
              <div>
                <Label>{t("hr.docs.file")}</Label>
                <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
                    <select
                      className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      value={mofaStatus}
                      onChange={(e) => setMofaStatus(e.target.value as typeof mofaStatus)}
                    >
                      <option value="">{t("hr.docs.mofaUnset")}</option>
                      <option value="yes">{t("hr.docs.mofaYes")}</option>
                      <option value="no">{t("hr.docs.mofaNo")}</option>
                      <option value="not_required">{t("hr.docs.mofaNotRequired")}</option>
                    </select>
                  </div>
                </>
              ) : null}
              <div className="flex items-end lg:col-span-5">
                <Button disabled={!staffId || !file || upload.isPending} onClick={() => upload.mutate()}>
                  {t("hr.docs.upload")}
                </Button>
              </div>
            </div>
          </HrPanel>

          {replaceId ? (
            <HrPanel delay={0.5}>
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
            </HrPanel>
          ) : null}

          <HrPanel delay={1}>
            <div className="space-y-2 p-4 sm:p-5">
              {(docs.data ?? []).length === 0 ? (
                <HrEmptyState message={t("hr.docs.empty")} icon={FileText} />
              ) : (
                (docs.data ?? []).map((doc) => (
                  <div key={doc.id} className="hr-list-row">
                    <div>
                      <p className="font-medium">
                        {doc.staffName} · {t(`hr.docs.types.${doc.docType}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.fileName ?? "—"}
                        {doc.expiryDate ? ` · ${t("hr.docs.expires", { date: doc.expiryDate })}` : ""}
                        {` · ${t(`hr.docs.status.${doc.status}`)}`}
                        {` · ${t(`hr.docs.verification.${doc.verificationStatus}`)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {doc.expiryDate && doc.expiryDate < today ? (
                        <Badge variant="destructive">{t("hr.docs.expired")}</Badge>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={() => openDoc.mutate(doc.id)}>
                        {t("hr.docs.view")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => downloadDoc.mutate(doc.id)}>
                        {t("hr.docs.download")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setReplaceId(doc.id)}>
                        {t("hr.docs.replace")}
                      </Button>
                      {doc.verificationStatus !== "verified" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            verify.mutate({ id: doc.id, verificationStatus: "verified" })
                          }
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
                    </div>
                  </div>
                ))
              )}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
