"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { StaffDocumentLightbox } from "@/components/people/staff-document-preview";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listEmployeeDocuments } from "@/lib/hr-documents.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export default function HrContractsPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: queryKeys.people.hrDocs({ scope: "contract-register" }),
    queryFn: () => listEmployeeDocuments({}),
    staleTime: STALE.people,
  });

  const contracts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (documents.data ?? [])
      .filter((doc) => doc.docType === "contract" && !doc.deletedAt)
      .filter((doc) => {
        if (!needle) return true;
        return `${doc.staffName ?? ""} ${doc.employeeCode ?? ""} ${doc.title ?? ""}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
  }, [documents.data, query]);

  const openDoc = contracts.find((doc) => doc.id === openId) ?? null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });

  return (
    <CapabilityGate capability="hr.docs.manage" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={ScrollText}
          kicker={t("hrWorkspace.contracts.kicker")}
          title={t("hrWorkspace.contracts.title")}
          subtitle={t("hrWorkspace.contracts.subtitle")}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("hrWorkspace.contracts.search")}
            aria-label={t("hrWorkspace.contracts.search")}
            className="max-w-sm"
          />
          {documents.isLoading ? (
            <FecLoader density="page" label={t("common.loading")} />
          ) : documents.isError ? (
            <HrEmptyState message={t("hrWorkspace.loadFailed")} />
          ) : contracts.length === 0 ? (
            <HrEmptyState message={t("hrWorkspace.contracts.empty")} icon={ScrollText} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t("hrWorkspace.staff")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("hrWorkspace.contracts.file")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("hrWorkspace.contracts.ends")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("hrWorkspace.contracts.check")}</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((doc) => {
                    const ended = Boolean(doc.expiryDate && doc.expiryDate < today);
                    return (
                      <tr key={doc.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <button type="button" className="text-start font-medium hover:underline" onClick={() => setOpenId(doc.id)}>
                            {doc.staffName ?? "—"}
                          </button>
                          <p className="text-xs text-muted-foreground">{doc.employeeCode}</p>
                        </td>
                        <td className="px-3 py-2">{doc.title || doc.fileName || t("hrWorkspace.history.contractFile")}</td>
                        <td className="px-3 py-2 tabular-nums">{doc.expiryDate ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={ended ? "destructive" : "outline"}>
                            {ended ? t("hrWorkspace.contracts.ended") : t(`hr.docs.verification.${doc.verificationStatus}`, { defaultValue: doc.verificationStatus })}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <StaffDocumentLightbox
            doc={
              openDoc
                ? {
                    id: openDoc.id,
                    staffName: openDoc.staffName,
                    docType: openDoc.docType,
                    fileName: openDoc.fileName,
                    fileMime: openDoc.fileMime,
                  }
                : null
            }
            open={Boolean(openDoc)}
            onOpenChange={(open) => {
              if (!open) setOpenId(null);
            }}
          />
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

function Denied() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <HrEmptyState message={t("hr.dashboard.noAccess")} />
    </HrShell>
  );
}
