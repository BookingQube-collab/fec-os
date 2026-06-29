"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

import { E3TrackerPageShell } from "@/components/compliance-tracker/E3TrackerLayout";
import { E3LicenseDocumentsBrowser } from "@/components/compliance-tracker/E3LicenseDocumentsBrowser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function E3LicenseDocumentsPage() {
  const { t } = useTranslation();

  return (
    <E3TrackerPageShell
      title={t("e3Tracker.licenseDocs.title", { defaultValue: "License Documents" })}
      subtitle={t("e3Tracker.licenseDocs.subtitle", {
        defaultValue:
          "Browse licenses, certificates, and contractor documents by location. Click a linked document to open it in Google Drive.",
      })}
    >
      <Alert className="border-[#E8A33D] bg-[#FFFBF5] text-[#0B1F3A]">
        <Info className="h-4 w-4 text-[#E8821E]" />
        <AlertTitle>
          {t("e3Tracker.licenseDocs.editHelpTitle", {
            defaultValue: "How to add or edit document links",
          })}
        </AlertTitle>
        <AlertDescription className="space-y-3 text-[#475569]">
          <p>
            {t("e3Tracker.licenseDocs.editHelp", {
              defaultValue:
                "Document links are managed in Master Register. Edit a row (or add a new item) and paste the Google Drive URL in the Google Drive link field. You can also import links in bulk using the CSV/Excel import.",
            })}
          </p>
          <Button variant="outline" size="sm" asChild className="border-[#E8A33D] bg-white">
            <Link href="/compliance/e3-tracker/master-register">
              {t("e3Tracker.licenseDocs.editHelpLink", { defaultValue: "Open Master Register" })}
            </Link>
          </Button>
        </AlertDescription>
      </Alert>

      <E3LicenseDocumentsBrowser />
    </E3TrackerPageShell>
  );
}
