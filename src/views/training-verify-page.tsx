"use client";

import { useTranslation } from "react-i18next";

import type { PublicCertificate } from "@/lib/training/engine";

export default function TrainingVerifyPage({ certificate }: { certificate: PublicCertificate | null }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <article className="w-full rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">{t("trainingVerify.kicker")}</p>
        <h1 className="mt-2 text-2xl font-medium">{t("trainingVerify.title")}</h1>
        {certificate ? (
          <dl className="mt-6 grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("trainingVerify.status")}</dt>
              <dd>{t(`trainingCertificates.statuses.${certificate.status}`, certificate.status)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("trainingVerify.name")}</dt>
              <dd>{certificate.holderName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("trainingVerify.training")}</dt>
              <dd>{certificate.courseTitle}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("trainingVerify.issued")}</dt>
              <dd>{certificate.issuedAt ? certificate.issuedAt.slice(0, 10) : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("trainingVerify.validUntil")}</dt>
              <dd>{certificate.validUntil ?? t("trainingVerify.noExpiry")}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-6 text-sm">{t("trainingVerify.notFound")}</p>
        )}
      </article>
    </main>
  );
}
