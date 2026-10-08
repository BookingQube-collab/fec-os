"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FecButton as Button, FecEmptyState, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import {
  applyTrainingExpiry,
  downloadTrainingCertificate,
  issueTrainingCertificate,
  listCertificateQueue,
  listTrainingCertificates,
  revokeTrainingCertificate,
} from "@/lib/training/certificates.functions";
import { TrainingSectionNav } from "@/views/training-section-nav";

type CertificateRow = {
  id: string;
  holderName: string;
  courseTitle: string;
  courseCode: string | null;
  status: string;
  issuedAt: string | null;
  validUntil: string | null;
  score: number | null;
  displayCode: string | null;
};

type QueueRow = {
  enrollmentId: string;
  holderName: string;
  employeeCode: string;
  courseTitle: string;
  courseCode: string;
};

function savePdf(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function TrainingCertificatesPage() {
  const { t } = useTranslation();
  const canIssue = usePermission("training.certificate.issue");
  const canRevoke = usePermission("training.certificate.revoke");
  const [rows, setRows] = useState<CertificateRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  async function load() {
    const listed = await listTrainingCertificates({});
    if (!listed.ok) {
      setError(listed.error);
      return;
    }
    setRows(listed.data);
    setError(null);
    if (canIssue) {
      const waiting = await listCertificateQueue({ page: 1 });
      if (waiting.ok) setQueue(waiting.data.rows);
    }
  }

  useEffect(() => {
    void load();
  }, [canIssue]);

  return (
    <div className="space-y-6">
      <FecPageHeader icon={Award} title={t("trainingCertificates.title")} subtitle={t("trainingCertificates.subtitle")} />
      <TrainingSectionNav />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm">{notice}</p> : null}
      {canIssue ? (
        <Button
          type="button"
          onClick={() => {
            void (async () => {
              const result = await applyTrainingExpiry({});
              setNotice(result.ok ? t("trainingCertificates.expiryRan", result.data) : result.error);
              if (result.ok) await load();
            })();
          }}
        >
          {t("trainingCertificates.runExpiry")}
        </Button>
      ) : null}
      {queue.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("trainingCertificates.queue")}</h2>
          {queue.map((row) => (
            <article key={row.enrollmentId} className="rounded-2xl border border-border bg-card p-4">
              <p className="font-medium">{row.courseTitle}</p>
              <p className="text-sm text-muted-foreground">
                {row.holderName} · {row.employeeCode} · {row.courseCode}
              </p>
              <Button
                type="button"
                className="mt-3 min-h-12"
                onClick={() => {
                  void (async () => {
                    const result = await issueTrainingCertificate({ enrollmentId: row.enrollmentId });
                    setNotice(result.ok ? t("trainingCertificates.issued") : result.error);
                    if (result.ok) await load();
                  })();
                }}
              >
                {t("trainingCertificates.issue")}
              </Button>
            </article>
          ))}
        </section>
      ) : null}
      {rows.length === 0 ? (
        <FecEmptyState message={t("trainingCertificates.empty")} />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-medium">{row.courseTitle}</h2>
              <p className="text-sm text-muted-foreground">
                {row.holderName}
                {row.courseCode ? ` · ${row.courseCode}` : ""}
                {row.displayCode ? ` · ${row.displayCode}` : ""}
              </p>
              <p className="mt-2 text-sm">
                {t(`trainingCertificates.statuses.${row.status}`, row.status)}
                {row.score == null ? "" : ` · ${t("trainingCertificates.score", { score: row.score })}`}
                {row.validUntil ? ` · ${t("trainingCertificates.validUntil", { date: row.validUntil })}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-12"
                  onClick={() => {
                    void (async () => {
                      const result = await downloadTrainingCertificate({ certificateId: row.id });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      savePdf(result.data.filename, result.data.pdfBase64);
                    })();
                  }}
                >
                  {t("trainingCertificates.download")}
                </Button>
              </div>
              {canRevoke && row.status !== "REVOKED" ? (
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void (async () => {
                      const result = await revokeTrainingCertificate({
                        certificateId: row.id,
                        reason: reason[row.id] ?? "",
                      });
                      setNotice(result.ok ? t("trainingCertificates.revoked") : result.error);
                      if (result.ok) await load();
                    })();
                  }}
                >
                  <Input
                    value={reason[row.id] ?? ""}
                    placeholder={t("trainingCertificates.revokeReason")}
                    onChange={(event) => setReason({ ...reason, [row.id]: event.target.value })}
                  />
                  <Button type="submit" className="min-h-12">
                    {t("trainingCertificates.revoke")}
                  </Button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
