"use client";

import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { StaffDocumentLightbox } from "@/components/people/staff-document-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HR_DOC_TYPES } from "@/lib/hr-advanced";
import { listEmployeeDocuments } from "@/lib/hr-documents.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

const LETTER_TYPES = HR_DOC_TYPES.filter((type) => type.endsWith("_letter"));

export default function HrLettersPage() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<(typeof LETTER_TYPES)[number] | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: queryKeys.people.hrDocs({ scope: "letters" }),
    queryFn: () => listEmployeeDocuments({}),
    staleTime: STALE.people,
  });

  const letters = useMemo(() => {
    return (documents.data ?? []).filter((doc) => {
      if (!doc.docType.endsWith("_letter") || doc.deletedAt) return false;
      return kind === "all" || doc.docType === kind;
    });
  }, [documents.data, kind]);

  const openDoc = letters.find((doc) => doc.id === openId) ?? null;

  return (
    <CapabilityGate capability="hr.docs.manage" fallback={<Denied />}>
      <HrShell>
        <HrSection
          icon={Mail}
          kicker={t("hrWorkspace.letters.kicker")}
          title={t("hrWorkspace.letters.title")}
          subtitle={t("hrWorkspace.letters.subtitle")}
        >
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={kind === "all" ? "default" : "outline"} onClick={() => setKind("all")}>
              {t("hrWorkspace.letters.all")}
            </Button>
            {LETTER_TYPES.map((type) => (
              <Button
                key={type}
                type="button"
                size="sm"
                variant={kind === type ? "default" : "outline"}
                onClick={() => setKind(type)}
              >
                {t(`hr.docs.types.${type}`)}
              </Button>
            ))}
          </div>

          {documents.isLoading ? (
            <FecLoader density="page" label={t("common.loading")} />
          ) : documents.isError ? (
            <HrEmptyState message={t("hrWorkspace.loadFailed")} />
          ) : letters.length === 0 ? (
            <HrEmptyState message={t("hrWorkspace.letters.empty")} icon={Mail} />
          ) : (
            <ul className="space-y-2">
              {letters.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className="hr-list-row w-full text-start"
                    onClick={() => setOpenId(doc.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{doc.title || doc.fileName || t(`hr.docs.types.${doc.docType}`)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[doc.staffName, doc.employeeCode, doc.createdAt.slice(0, 10)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge variant="outline">{t(`hr.docs.types.${doc.docType}`)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
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
