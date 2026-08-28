"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HR_DOC_TYPES } from "@/lib/hr-advanced";
import {
  deleteEmployeeDocument,
  getEmployeeDocumentUrl,
  listEmployeeDocuments,
  uploadEmployeeDocument,
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

export default function HrDocumentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [docType, setDocType] = useState<(typeof HR_DOC_TYPES)[number]>("contract");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);

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
      });
    },
    onSuccess: () => {
      toast.success(t("hr.docs.uploaded"));
      setFile(null);
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrDocs() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDoc = useMutation({
    mutationFn: getEmployeeDocumentUrl,
    onSuccess: (res) => {
      window.open(res.url, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteEmployeeDocument,
    onSuccess: () => {
      toast.success(t("hr.docs.deleted"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrDocs() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={<p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("hr.docs.noAccess")}</p>}
    >
      <div className="space-y-6">
        <PageHeader icon={FileText} kicker={t("hr.docs.kicker")} title={t("hr.docs.title")} subtitle={t("hr.docs.subtitle")} />

        <NeumorphicCard className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label>{t("hr.docs.staff")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">{t("hr.docs.allStaff")}</option>
              {(staff.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.employeeCode ? ` (${s.employeeCode})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("hr.docs.type")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
          <div className="flex items-end lg:col-span-5">
            <Button disabled={!staffId || !file || upload.isPending} onClick={() => upload.mutate()}>
              {t("hr.docs.upload")}
            </Button>
          </div>
        </NeumorphicCard>

        <NeumorphicCard className="space-y-2 p-5">
          {(docs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hr.docs.empty")}</p>
          ) : (
            (docs.data ?? []).map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3">
                <div>
                  <p className="font-medium">
                    {doc.staffName} · {t(`hr.docs.types.${doc.docType}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {doc.fileName ?? "—"}
                    {doc.expiryDate ? ` · ${t("hr.docs.expires", { date: doc.expiryDate })}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {doc.expiryDate && doc.expiryDate < new Date().toISOString().slice(0, 10) ? (
                    <Badge variant="destructive">{t("hr.docs.expired")}</Badge>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => openDoc.mutate({ id: doc.id })}>
                    {t("hr.docs.view")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remove.mutate({ id: doc.id })}>
                    {t("hr.docs.delete")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}
