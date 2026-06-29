"use client";

import { useTranslation } from "react-i18next";

import { RagBadge } from "@/components/weekly-reports/rag-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ExecutiveWeeklyReport } from "@/lib/weekly-reports/executive-report-types";

interface ExecutiveReportViewProps {
  report: ExecutiveWeeklyReport;
  printMode?: boolean;
}

function Section({ n, titleKey, children }: { n: number; titleKey: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="executive-report-section break-inside-avoid rounded-lg border border-border bg-card p-5 print:border print:shadow-none">
      <h2 className="text-sm font-semibold text-foreground">
        {n}. {t(titleKey)}
      </h2>
      <div className="mt-3 space-y-3 text-sm text-foreground/90">{children}</div>
    </section>
  );
}

export function ExecutiveReportView({ report, printMode }: ExecutiveReportViewProps) {
  const { t } = useTranslation();
  const es = report.executive_summary;

  return (
    <div className={printMode ? "executive-report-print space-y-4 bg-white text-black" : "space-y-4"}>
      <header className="rounded-lg border border-border bg-card p-5 print:border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t("weeklyReports.executive.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{report.meta.company}</p>
            <p className="text-sm text-muted-foreground">
              {report.meta.week_start} → {report.meta.week_end}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{new Date(report.meta.generated_at).toLocaleString()}</div>
            <Badge variant="secondary" className="mt-2">
              {report.meta.generation_mode === "ai" ? t("weeklyReports.aiGenerated") : t("weeklyReports.ruleBased")}
            </Badge>
          </div>
        </div>
        {report.meta.locations_missing.length > 0 && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-rag-amber/10 px-3 py-2 text-xs rag-amber">
            {t("weeklyReports.missingSubmissions")}: {report.meta.locations_missing.join(", ")}
          </p>
        )}
      </header>

      <Section n={1} titleKey="weeklyReports.sections.executiveSummary">
        <p><span className="font-medium">{t("weeklyReports.fields.performance")}:</span> {es.performance}</p>
        <p><span className="font-medium">{t("weeklyReports.fields.health")}:</span> {es.health}</p>
        <div>
          <span className="font-medium">{t("weeklyReports.fields.riskLevel")}:</span>{" "}
          <Badge variant="outline">{es.risk_level}</Badge>
        </div>
        <p><span className="font-medium">{t("weeklyReports.fields.recommendation")}:</span> {es.recommendation}</p>
        {es.achievements.length > 0 && (
          <ul className="list-disc pl-5">
            {es.achievements.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        {es.concerns.length > 0 && (
          <>
            <p className="font-medium rag-amber">{t("weeklyReports.fields.concerns")}</p>
            <ul className="list-disc pl-5">
              {es.concerns.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section n={2} titleKey="weeklyReports.sections.kpiDashboard">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weeklyReports.fields.metric")}</TableHead>
                <TableHead>{t("weeklyReports.fields.value")}</TableHead>
                <TableHead>RAG</TableHead>
                <TableHead>{t("weeklyReports.fields.note")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.kpi_dashboard.map((k) => (
                <TableRow key={k.metric}>
                  <TableCell className="font-medium">{k.metric}</TableCell>
                  <TableCell>{k.value}</TableCell>
                  <TableCell><RagBadge rag={k.rag} /></TableCell>
                  <TableCell className="text-muted-foreground">{k.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section n={3} titleKey="weeklyReports.sections.locationRanking">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weeklyReports.fields.location")}</TableHead>
                <TableHead>{t("weeklyReports.fields.score")}</TableHead>
                <TableHead>{t("weeklyReports.fields.strengths")}</TableHead>
                <TableHead>{t("weeklyReports.fields.weaknesses")}</TableHead>
                <TableHead>{t("weeklyReports.fields.criticalIssues")}</TableHead>
                <TableHead>{t("weeklyReports.fields.immediateActions")}</TableHead>
                <TableHead>{t("weeklyReports.fields.managementComment")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.location_ranking.map((l) => (
                <TableRow key={l.location}>
                  <TableCell className="font-medium">{l.location}</TableCell>
                  <TableCell>{l.score}/100</TableCell>
                  <TableCell className="max-w-[140px] text-xs">{l.strengths.join(" · ") || "—"}</TableCell>
                  <TableCell className="max-w-[140px] text-xs">{l.weaknesses.join(" · ") || "—"}</TableCell>
                  <TableCell className="max-w-[120px] text-xs">{l.critical_issues.join(" · ") || "—"}</TableCell>
                  <TableCell className="max-w-[120px] text-xs">{l.immediate_actions.join(" · ") || "—"}</TableCell>
                  <TableCell className="max-w-[160px] text-xs">{l.management_comment}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section n={4} titleKey="weeklyReports.sections.topAchievements">
        <ul className="space-y-2">
          {report.top_achievements.map((a, i) => (
            <li key={i}>
              <span className="font-medium">{a.title}</span>
              {a.location ? ` · ${a.location}` : ""}
              <p className="text-muted-foreground">{a.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section n={5} titleKey="weeklyReports.sections.topRisks">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weeklyReports.fields.severity")}</TableHead>
                <TableHead>{t("weeklyReports.fields.title")}</TableHead>
                <TableHead>{t("weeklyReports.fields.impact")}</TableHead>
                <TableHead>{t("weeklyReports.fields.recommendedAction")}</TableHead>
                <TableHead>{t("weeklyReports.fields.location")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.top_risks.map((r, i) => (
                <TableRow key={i}>
                  <TableCell><Badge variant="outline">{r.severity}</Badge></TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>{r.impact}</TableCell>
                  <TableCell>{r.recommended_action}</TableCell>
                  <TableCell>{r.location ?? "Estate"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section n={6} titleKey="weeklyReports.sections.maintenanceSummary">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["open", report.maintenance_summary.open],
            ["closed", report.maintenance_summary.closed],
            ["overdue", report.maintenance_summary.overdue],
            ["vendorPending", report.maintenance_summary.vendor_pending],
            ["critical", report.maintenance_summary.critical],
          ].map(([key, val]) => (
            <div key={key} className="rounded-md border border-border/60 p-3 text-center">
              <div className="text-xs text-muted-foreground">{t(`weeklyReports.maintenance.${key}`)}</div>
              <div className="text-lg font-semibold">{val}</div>
            </div>
          ))}
        </div>
        {report.maintenance_summary.highlights.length > 0 && (
          <ul className="list-disc pl-5">{report.maintenance_summary.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        )}
      </Section>

      <Section n={7} titleKey="weeklyReports.sections.complianceSummary">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["qcdd", report.compliance_summary.qcdd],
              ["fireAlarm", report.compliance_summary.fire_alarm],
              ["fireFighting", report.compliance_summary.fire_fighting],
              ["cctv", report.compliance_summary.cctv],
              ["pestControl", report.compliance_summary.pest_control],
              ["hvac", report.compliance_summary.hvac],
              ["kitchen", report.compliance_summary.kitchen],
              ["medicalCerts", report.compliance_summary.medical_certs],
              ["licenses", report.compliance_summary.licenses],
              ["amc", report.compliance_summary.amc],
              ["renewals", report.compliance_summary.renewals],
              ["expired", report.compliance_summary.expired],
            ] as const
          ).map(([key, val]) => (
            <div key={key} className="flex justify-between gap-2 rounded-md border border-border/50 px-3 py-2 text-xs">
              <span className="font-medium">{t(`weeklyReports.compliance.${key}`)}</span>
              <span className="text-muted-foreground">{val}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n={8} titleKey="weeklyReports.sections.customerExperience">
        <p><span className="font-medium">{t("weeklyReports.fields.complaints")}:</span> {report.customer_experience.complaints}</p>
        {report.customer_experience.recurring_issues.length > 0 && (
          <ul className="list-disc pl-5">{report.customer_experience.recurring_issues.map((x) => <li key={x}>{x}</li>)}</ul>
        )}
      </Section>

      <Section n={9} titleKey="weeklyReports.sections.staffingSummary">
        <p>{t("weeklyReports.fields.attendance")}: {report.staffing_summary.attendance_pct != null ? `${report.staffing_summary.attendance_pct}%` : "—"}</p>
        <p>{report.staffing_summary.absenteeism}</p>
        <p>{report.staffing_summary.overtime}</p>
        <p>{report.staffing_summary.performance}</p>
        <p>{report.staffing_summary.training}</p>
      </Section>

      <Section n={10} titleKey="weeklyReports.sections.financialSummary">
        <p><span className="font-medium">{t("weeklyReports.fields.revenue")}:</span> {report.financial_summary.revenue}</p>
        <p>{report.financial_summary.targets}</p>
        <p>{report.financial_summary.events} · {report.financial_summary.birthdays}</p>
        <p>{report.financial_summary.promotions}</p>
      </Section>

      <Section n={11} titleKey="weeklyReports.sections.decisionsRequired">
        {report.decisions_required.length === 0 ? (
          <p className="text-muted-foreground">{t("weeklyReports.noDecisions")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("weeklyReports.fields.issue")}</TableHead>
                  <TableHead>{t("weeklyReports.fields.impact")}</TableHead>
                  <TableHead>{t("weeklyReports.fields.recommendedDecision")}</TableHead>
                  <TableHead>{t("weeklyReports.fields.priority")}</TableHead>
                  <TableHead>{t("weeklyReports.fields.owner")}</TableHead>
                  <TableHead>{t("weeklyReports.fields.requiredDate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.decisions_required.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell>{d.issue}</TableCell>
                    <TableCell>{d.impact}</TableCell>
                    <TableCell>{d.recommended_decision}</TableCell>
                    <TableCell>{d.priority}</TableCell>
                    <TableCell>{d.owner}</TableCell>
                    <TableCell>{d.required_date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section n={12} titleKey="weeklyReports.sections.nextWeekPriorities">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weeklyReports.fields.action")}</TableHead>
                <TableHead>{t("weeklyReports.fields.owner")}</TableHead>
                <TableHead>{t("weeklyReports.fields.deadline")}</TableHead>
                <TableHead>{t("weeklyReports.fields.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.next_week_priorities.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{p.action}</TableCell>
                  <TableCell>{p.owner}</TableCell>
                  <TableCell>{p.deadline}</TableCell>
                  <TableCell>{p.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section n={13} titleKey="weeklyReports.sections.headOfOperationsAssessment">
        <p className="leading-relaxed whitespace-pre-wrap">{report.head_of_operations_assessment}</p>
      </Section>

      <Section n={14} titleKey="weeklyReports.sections.actionTracker">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weeklyReports.fields.action")}</TableHead>
                <TableHead>{t("weeklyReports.fields.location")}</TableHead>
                <TableHead>{t("weeklyReports.fields.owner")}</TableHead>
                <TableHead>{t("weeklyReports.fields.priority")}</TableHead>
                <TableHead>{t("weeklyReports.fields.deadline")}</TableHead>
                <TableHead>{t("weeklyReports.fields.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.action_tracker.map((a, i) => (
                <TableRow key={i}>
                  <TableCell>{a.action}</TableCell>
                  <TableCell>{a.location}</TableCell>
                  <TableCell>{a.owner}</TableCell>
                  <TableCell>{a.priority}</TableCell>
                  <TableCell>{a.deadline}</TableCell>
                  <TableCell>{a.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
