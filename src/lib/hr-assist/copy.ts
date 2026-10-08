import { formatEnglishTime } from "./time";

/** English review copy. en.json `hrAssist` must match this object. */
export const HR_ASSIST_COPY = {
  insufficient: "Insufficient HR data to answer this reliably.",
  error: "Could not load these review notes.",
  loading: "Loading review notes…",
  emptyAttendance: "No attendance items need review for this period.",
  emptyRoster: "No roster recommendations for this period.",
  emptyLeave: "No leave coverage notes for these requests.",
  corrections: "Open corrections",
  why: "Why",
  evidence: "Evidence",
  actionLabel: "Recommended action",
  unnamed: "This employee",
  unknownSite: "Site not recorded",
  shiftUnspecified: "shift time not recorded",
  weekdays: {
    "0": "Sunday",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday",
  },
  attendance: {
    title: "Attendance review",
    hint: "These notes read the current punches, daily summaries, and roster. They do not change punches. Use Corrections if a person should confirm a time.",
    action: "Open Corrections and decide there. This note does not change punches, summaries, or device sync.",
    duplicate_punch: {
      title: "Duplicate punches to review",
      why: "{{staffName}} has duplicate punches marked on {{workDate}} ({{times}}). Marked count: {{count}}. This is a flag for review.",
      evidence:
        "Period {{periodFrom}}–{{periodTo}}. The duplicate mark is the one already stored on the punch. Times: {{times}}.",
    },
    impossible_timestamp: {
      title: "Timestamp to review",
      why: "{{staffName}} on {{workDate}} has a time that does not fit a normal shift: {{detail}}. Review the record before treating the day as final.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Check-in {{actualIn}}. Check-out {{actualOut}}.",
      detail: {
        span: "check-out is {{hours}} hours after check-in",
        unparseable: "a check-in or check-out time could not be read",
        far_from_day: "a punch is more than one day away from {{workDate}}",
      },
    },
    repeated_missing_punch: {
      title: "Repeated missing punches to review",
      why: "{{staffName}} has a missing in or out punch on {{count}} days between {{periodFrom}} and {{periodTo}} ({{dates}}). Review those days.",
      evidence:
        "Period {{periodFrom}}–{{periodTo}}. Days: {{dates}}. A missing punch means the daily summary has an in without an out, or an out without an in.",
    },
    unusual_overtime: {
      title: "Overtime to review",
      why: "{{staffName}} on {{workDate}} has {{overtimeMinutes}} overtime minutes. Across {{comparedDays}} worked days in {{periodFrom}}–{{periodTo}}, the median overtime is {{medianMinutes}} minutes. Review whether that day should stay as recorded.",
      evidence:
        "Period {{periodFrom}}–{{periodTo}}. That day is {{overtimeMinutes}} minutes. The median of the worked days in this period is {{medianMinutes}} minutes. No score is attached.",
    },
    outside_assigned_site: {
      title: "Attendance outside the rostered site",
      why: "{{staffName}} on {{workDate}} is rostered at {{rosterSite}} and the attendance row is at {{attendanceSite}}. Review which site should stand.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Roster site: {{rosterSite}}. Attendance site: {{attendanceSite}}.",
    },
    outside_assigned_shift: {
      title: "Attendance outside the rostered shift",
      why: "{{staffName}} on {{workDate}} is outside the rostered shift {{startLabel}}–{{endLabel}} (in {{actualInLabel}}, out {{actualOutLabel}}). The gap is {{gapMinutes}} minutes. Review the day.",
      evidence:
        "Period {{periodFrom}}–{{periodTo}}. Rostered shift {{startLabel}}–{{endLabel}}. Attendance in {{actualInLabel}}, out {{actualOutLabel}}.",
    },
    roster_mismatch: {
      title: "Roster and attendance do not match",
      absent: {
        why: "{{staffName}} is rostered on duty at {{site}} on {{workDate}}, and attendance is {{status}} with {{punchCount}} punches. Compare the two records.",
      },
      week_off: {
        why: "{{staffName}} is rostered week off on {{workDate}} at {{site}}, and attendance shows {{punchCount}} punches ({{status}}). Compare the two records.",
      },
      leave: {
        why: "{{staffName}} is rostered on duty on {{workDate}} at {{site}}, and attendance status is {{status}}. Compare the roster with the leave or attendance row.",
      },
      evidence:
        "Period {{periodFrom}}–{{periodTo}}. Roster duty and the daily summary status are both shown above. Neither record is changed by this note.",
    },
  },
  roster: {
    title: "Roster recommendations",
    hint: "Suggestions read the current roster, leave, and shift windows. A manager still approves any roster change. Nothing here writes the roster.",
    action:
      "Adjust the roster only through the existing import, amend, or copy actions on this page. This recommendation does not save a roster.",
    evidence:
      "Period {{periodFrom}}–{{periodTo}}. Counts are people rostered on that shift after removing pending or approved leave. Median uses the other matching weekdays in this period.",
    short_cover: {
      title: "Coverage to review",
      why: "{{windowPrefix}}{{weekday}} {{startLabel}}–{{endLabel}} at {{site}} on {{date}} has {{current}} attendants. Other {{weekday}} shifts in {{periodFrom}}–{{periodTo}} rostered a median of {{median}}. Review whether {{gap}} additional attendants are needed before a manager approves the roster.",
    },
    short_cover_with_leave: {
      title: "Coverage to review",
      why: "{{windowPrefix}}{{weekday}} {{startLabel}}–{{endLabel}} at {{site}} on {{date}} has {{current}} attendants after leave. {{onLeave}} rostered people have pending or approved leave that day, out of {{rostered}} rostered. Other {{weekday}} shifts in {{periodFrom}}–{{periodTo}} rostered a median of {{median}}. Review whether {{gap}} additional attendants are needed before a manager approves the roster.",
    },
    leave_still_rostered: {
      title: "Leave overlaps a rostered shift",
      why: "{{staffName}} is rostered at {{site}} on {{workDate}} ({{shiftLabel}}) and has {{leaveStatusLabel}} leave covering that day. The roster still lists them until a manager changes it.",
      evidence:
        "Period {{periodFrom}}–{{periodTo}}. Leave status: {{leaveStatusLabel}}. Roster row remains until someone saves a roster change.",
    },
  },
  leave: {
    title: "Leave coverage",
    hint: "Notes read the current leave requests and roster counts. Approval rules and balances stay as they are. A manager still approves each request.",
    action: "Approve or reject the request on this page. This note does not change balances or the approval steps.",
    team_overlap: {
      title: "Overlapping leave",
      why: "On {{workDate}} at {{site}}, {{count}} people have pending or approved leave ({{names}}). Review team coverage before approving more leave.",
      evidence: "Dates come from the current leave requests. People: {{names}}.",
    },
    team_overlap_no_site: {
      title: "Overlapping leave",
      why: "On {{workDate}}, {{count}} people have overlapping pending or approved leave ({{names}}). Those requests do not include a site, so this is a date overlap only.",
      evidence: "People: {{names}}. Site was not on the staff row for these requests.",
    },
    staffing: {
      title: "Staffing to review",
      why: "On {{workDate}} at {{site}}, {{leaveCount}} people have pending or approved leave and the roster lists {{onDuty}} on duty ({{names}}). Review whether the shift is short before approving.",
      evidence: "Leave count {{leaveCount}}. Rostered on duty {{onDuty}}. People on leave: {{names}}.",
    },
    pattern_review: {
      title: "Pattern requires HR review",
      why: "Pattern requires HR review. {{staffName}} has {{count}} {{leaveTypeLabel}} requests between {{periodFrom}} and {{periodTo}}. A person in HR should look at the dates and decide.",
      evidence: "Request count {{count}}. Type {{leaveTypeLabel}}. First day {{periodFrom}}. Last day {{periodTo}}.",
    },
  },
  openModule: "Open the record",
  viewEvidence: "View evidence",
  dismiss: "Dismiss",
  source: "Source",
  filtersLabel: "Filters",
  emptyPayroll: "No payroll lines need review before processing.",
  emptyRecruitment: "No missing role requirements to review for these applications.",
  emptyOnboarding: "No open onboarding items to review.",
  emptyPerformance: "No evaluation notes to review.",
  emptyTraining: "No skill-gap or overdue course notes.",
  emptyDocuments: "No document expiry notes to review.",
  emptyWarnings: "No warning summaries to review.",
  emptyWorkforce: "No headcount or workload notes for this period.",
  emptyCopilot: "No matching notes for that question in the selected period.",
  emptyActions: "No review cards are open.",
  emptyReport: "This report has no extra explanation.",
  emptyEngagement: "No engagement notes for this period beyond the missing survey record.",
  emptyEss: "Ask about leave remaining or how to update a document.",
  emptyCommand: "These counts do not need a review action.",
  payroll: {
    title: "Payroll review before processing",
    hint: "These notes read the current payroll lines. They do not change salary, calculations, lock, or exports. A person still processes payroll.",
    action: "A person with payroll access reviews this line before processing. This note does not change salary, lock, or exports.",
    variance: {
      title: "Net changed from the previous period",
      why: "{{staffName}} net is {{netQar}} QAR. The stored change from the previous period is {{deltaQar}} QAR, so the previous net was {{previousNetQar}} QAR. Review the line before processing.",
      evidence: "Period {{periodLabel}}. Current net {{netQar}} QAR. Previous net {{previousNetQar}} QAR. Change {{deltaQar}} QAR. No percentage is attached.",
    },
    deduction: {
      title: "Deduction to review",
      why: "{{staffName}} has {{amountQar}} QAR on {{code}} in this period. That deduction code was not on the previous period line. Review it before processing.",
      evidence: "Period {{periodLabel}}. Deduction code {{code}}. Amount {{amountQar}} QAR. Previous period codes: {{previousCodes}}.",
    },
    overtime: {
      title: "Overtime pay to review",
      why: "{{staffName}} has {{otQar}} QAR overtime pay in this period. The previous period line had {{previousOtQar}} QAR overtime pay. Review the overtime before processing.",
      evidence: "Period {{periodLabel}}. This period overtime pay {{otQar}} QAR. Previous period overtime pay {{previousOtQar}} QAR.",
    },
    reconcile: {
      title: "Reconciliation to review",
      why: "{{staffName}}: {{detail}} Review the line before processing. The stored amounts are not changed by this note.",
      evidence: "Period {{periodLabel}}. Gross {{grossQar}} QAR. Sum of earnings {{earningsQar}} QAR. Sum of deductions {{deductionsQar}} QAR. Net {{netQar}} QAR.",
      detail: {
        earnings: "the earnings lines sum to {{earningsQar}} QAR and gross is {{grossQar}} QAR.",
        net: "gross minus deductions is {{expectedNetQar}} QAR and the stored net is {{netQar}} QAR.",
        import: "the imported net is {{importedNetQar}} QAR and the system net is {{systemNetQar}} QAR.",
      },
    },
  },
  recruitment: {
    title: "Role requirement check",
    hint: "This compares role text with the candidate skills, experience, education, and CV text. It does not score people and it does not reject anyone.",
    action: "A recruiter decides on the existing application. This note must not be used to auto-reject a candidate.",
    skill: {
      title: "Role skill not shown on the candidate",
      why: "{{candidateName}} for {{jobTitle}} does not show these role skills in the skills field or CV text: {{skills}}. This is supporting analysis only.",
      evidence: "Role skills: {{requiredSkills}}. Candidate skills: {{candidateSkills}}.",
    },
    experience: {
      title: "Experience years to review",
      why: "{{candidateName}} for {{jobTitle}} is short of the role experience. The role asks {{requiredYears}} years and the candidate record shows {{candidateYears}} years. This is supporting analysis only.",
      evidence: "Role experience years: {{requiredYears}}. Candidate experience years: {{candidateYears}}.",
    },
    experience_missing: {
      title: "Experience years to review",
      why: "{{candidateName}} for {{jobTitle}} has no experience years on the candidate record. The role asks {{requiredYears}} years. This is supporting analysis only.",
      evidence: "Role experience years: {{requiredYears}}. Candidate experience years were not recorded.",
    },
    education: {
      title: "Education requirement to review",
      why: "{{candidateName}} for {{jobTitle}} does not show the role education text in the education field or CV text: {{education}}. This is supporting analysis only.",
      evidence: "Role education: {{requiredEducation}}. Candidate education: {{candidateEducation}}.",
    },
    qid: {
      title: "QID requirement not on the candidate record",
      why: "{{jobTitle}} requires a QID. {{candidateName}} does not have one marked on the candidate record. The document number is not shown. This is supporting analysis only.",
      evidence: "Role requires a QID: yes. Candidate record shows a QID: no. The number is not included in this note.",
    },
    visa: {
      title: "Visa requirement not on the candidate record",
      why: "{{jobTitle}} requires a visa. {{candidateName}} does not have a visa status on the candidate record. This is supporting analysis only.",
      evidence: "Role requires a visa: yes. Candidate visa status recorded: no.",
    },
  },
  onboarding: {
    title: "Onboarding checklist",
    hint: "Open items come from the current onboarding checklist. This note does not mark them complete.",
    action: "Complete or skip the item on the existing checklist. This note does not change checklist status.",
    open_items: {
      title: "Onboarding items still open",
      why: "{{staffName}} still has open onboarding items: {{items}}.",
      evidence: "Checklist {{kind}}. Open count {{count}}. Items: {{items}}.",
    },
  },
  performance: {
    title: "Evaluation review",
    hint: "Notes read existing evaluations and KPI actuals. They do not decide promotion or termination.",
    action: "Discuss this in the existing evaluation. This note does not decide promotion, termination, or pay.",
    trend: {
      title: "KPI actual moved down",
      why: "{{staffName}} on {{kpiLabel}} in {{cycleName}} moved from {{earlier}} ({{earlierLabel}}) to {{later}} ({{laterLabel}}). Review the existing evaluation.",
      evidence: "Cycle {{cycleName}}. KPI {{kpiLabel}}. Earlier actual {{earlier}} on {{earlierLabel}}. Later actual {{later}} on {{laterLabel}}.",
    },
    contradiction: {
      title: "Comments disagree",
      why: "{{staffName}} has comments that disagree in {{cycleName}}. One comment praises the work and another asks for improvement. Read both on the evaluation. This is not a health assessment.",
      evidence: "Cycle {{cycleName}}. Supervisor comment length {{supervisorLength}} characters. Manager comment length {{managerLength}} characters. Open the evaluation to read them.",
    },
    coaching: {
      title: "Coaching suggestion",
      why: "Discuss {{kpiLabel}} with {{staffName}} during {{cycleName}}. Recorded values: {{earlier}} then {{later}}. A manager decides any next step.",
      evidence: "Cycle {{cycleName}}. KPI {{kpiLabel}}. Earlier {{earlier}}. Later {{later}}. No promotion or termination decision is made here.",
    },
  },
  training: {
    title: "Training notes",
    hint: "Notes read existing enrollments, published courses, and the skills text on the employee. They do not assign courses.",
    action: "Assign or complete the course on the existing training screen. This note does not enroll anyone.",
    overdue: {
      title: "Required course still open",
      why: "{{staffName}} has required course {{courseName}} still {{status}}, due {{dueOn}}.",
      evidence: "Course {{courseName}}. Status {{status}}. Due {{dueOn}}. Required: yes.",
    },
    skill_gap: {
      title: "Course to consider",
      why: "{{staffName}} has skill {{skill}} on the employee record and no completed course whose name includes it. Published course {{courseName}} includes that skill.",
      evidence: "Skill text token: {{skill}}. Published course: {{courseName}}. No completed enrollment name includes that token.",
    },
  },
  documents: {
    title: "Document expiry",
    hint: "Notes read document type and expiry date. They do not show document numbers and they do not edit files.",
    action: "Review the file on the existing documents screen. This note does not change the document.",
    expiry: {
      title: "Document date to review",
      why: "{{staffName}} has a {{docType}} document with expiry {{expiryDate}}. Today is {{today}}. Days until that date: {{days}}. A negative number means the date is already past.",
      evidence: "Document type {{docType}}. Expiry {{expiryDate}}. Today {{today}}. Days {{days}}. The document number is not shown.",
    },
    missing_expiry: {
      title: "Expiry date not recorded",
      why: "{{staffName}} has a {{docType}} document with no expiry date. Review whether the date should be recorded.",
      evidence: "Document type {{docType}}. Expiry was empty. The document number is not shown.",
    },
  },
  warnings: {
    title: "Case summary",
    hint: "Summaries read category, level, date, and status. They do not decide what happened.",
    action: "HR reviews the existing case. This summary does not determine guilt or change the warning.",
    case: {
      title: "Warning on file",
      why: "A {{level}} warning in category {{category}} for {{staffName}} was recorded on {{issuedOn}}. Status: {{status}}. Employee explanation on file: {{explanation}}. This summary does not determine what happened.",
      evidence: "Issued {{issuedOn}}. Level {{level}}. Category {{category}}. Status {{status}}. Explanation on file: {{explanation}}.",
    },
    pattern_review: {
      title: "Pattern requires HR review",
      why: "Pattern requires HR review. {{staffName}} has {{count}} warnings between {{periodFrom}} and {{periodTo}}. HR should read the existing cases. This summary does not determine what happened.",
      evidence: "Warning count {{count}}. Period {{periodFrom}}–{{periodTo}}. Categories: {{categories}}.",
    },
  },
  workforce: {
    title: "Headcount and workload",
    hint: "Notes read quota, roster, overtime, leave, training, and evaluations already stored. They do not change hiring, roster, or pay, and they do not attach a score.",
    action: "A manager reviews the underlying screen before anyone changes headcount, roster, or workload. This note does not write those records.",
    quota: {
      title: "Headcount gap to review",
      why: "Approved headcount at {{site}} is {{approved}}. Distinct people rostered on duty in {{periodFrom}}–{{periodTo}} is {{rostered}}. The gap is {{gap}}.",
      evidence: "Site {{site}}. Approved {{approved}}. Rostered on duty {{rostered}}. Gap {{gap}}. Period {{periodFrom}}–{{periodTo}}.",
    },
    overtime: {
      title: "Workload concern",
      why: "Workload concern. Overtime minutes from {{periodFrom}} to {{midpoint}} are {{earlier}}, and from {{midpoint}} to {{periodTo}} are {{later}}. The later half is higher by {{gap}} minutes.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. First half {{earlier}} minutes. Second half {{later}} minutes. Difference {{gap}} minutes. No score is attached.",
    },
    attendance: {
      title: "Attendance stability to review",
      why: "Attendance stability to review. Missing-punch days in {{periodFrom}}–{{periodTo}}: {{count}}. This is a flag for review, not an accusation.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Missing-punch days {{count}}. No score is attached.",
    },
    leave: {
      title: "Leave trend to review",
      why: "Leave days recorded in {{periodFrom}}–{{periodTo}}: {{count}}. Review coverage on the leave screen.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Leave days counted from pending and approved requests: {{count}}.",
    },
    training: {
      title: "Overdue required courses",
      why: "Required courses still overdue in {{periodFrom}}–{{periodTo}}: {{count}}.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Overdue required enrollments: {{count}}.",
    },
    performance: {
      title: "KPI actuals moved down",
      why: "Evaluations where the later KPI actual is lower than the earlier one: {{count}}. Review them on performance. This does not decide promotion or termination.",
      evidence: "Count of KPI series with a lower later actual: {{count}}. Period {{periodFrom}}–{{periodTo}}.",
    },
  },
  copilot: {
    title: "HR question",
    hint: "Answers use the same review notes as the module screens, for the period and filters shown. If the data is not here, the answer says so.",
    action: "Open the module and decide there. This answer does not change records.",
    hidden_payroll: {
      title: "Payroll is not included",
      why: "Payroll stays on the payroll screen for roles that already have payroll access. This answer does not include pay amounts.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Filters: {{filters}}. Source: payroll access check.",
    },
    ask: "Ask about attendance, roster, leave, payroll, recruitment, performance, training, documents, warnings, or headcount.",
  },
  actions: {
    title: "Review queue",
    hint: "Cards open the existing module or can be dismissed on this screen. Dismiss hides a card in this browser only. Nothing is approved automatically.",
    action: "Open the module and decide there, or dismiss this card. No high-impact action runs from here.",
  },
  reports: {
    title: "Report explanation",
    hint: "This explains the catalog report already on this page. Salary and identity columns stay on the existing capability checks.",
    action: "Use the existing export on this page if you need a file. This note does not add a new report builder.",
    catalog: {
      title: "What this report shows",
      why: "{{reportName}} uses the columns already shown in this catalog. Salary and identity columns stay hidden unless this role already has those capabilities.",
      evidence: "Report {{reportId}}. The date range, site, and department filters on this page are the scope. This explanation does not print salary, bank, QID, or passport values.",
    },
  },
  engagement: {
    title: "Engagement",
    hint: "Pulse surveys are not stored. These notes use warnings, leave, attendance, and recognition already on file. They do not rank people and they are not a health assessment.",
    action: "A manager reads the linked screen and decides. This note does not change warnings, leave, or attendance.",
    missing_survey: {
      title: "Pulse surveys are not stored",
      why: "There is no survey table. This screen cannot summarize pulse answers. It uses warnings, leave, attendance, and recognition that are already saved.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Survey rows found: 0. No survey product was added.",
    },
    recognition: {
      title: "Recognition on file",
      why: "{{count}} recognition records were saved between {{periodFrom}} and {{periodTo}}: {{titles}}. This is a list of saved records, not a ranking.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Records: {{titles}}.",
    },
    concern: {
      title: "Recurring concern to review",
      why: "Engagement risk. Workload concern. Warning category {{category}} appears {{count}} times between {{periodFrom}} and {{periodTo}}. Pattern requires HR review. This does not decide discipline.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Category {{category}}. Count {{count}}. The warning text is not repeated here.",
    },
    attendance: {
      title: "Attendance stability to review",
      why: "Engagement risk. Workload concern. Missing-punch days in {{periodFrom}}–{{periodTo}}: {{count}}. This is a flag for review, not an accusation.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Missing-punch days {{count}}. No score is attached.",
    },
    leave: {
      title: "Leave trend to review",
      why: "Leave days recorded in {{periodFrom}}–{{periodTo}}: {{count}}. Review coverage on the leave screen.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Leave days from pending and approved requests: {{count}}.",
    },
  },
  ess: {
    title: "My questions",
    hint: "Answers use your leave balances and your documents. They do not file or approve a request.",
    action: "Use the leave or documents section on this page. This answer does not change a balance or a file.",
    ask: "Ask how much leave is left, or how to update a document.",
    leave: {
      title: "Leave remaining",
      why: "For {{year}}, remaining days are {{lines}}. Remaining is allotted plus carried forward, minus used, expired, and pending days already stored.",
      evidence: "Year {{year}}. Lines: {{lines}}. Approval rules are unchanged.",
    },
    document: {
      title: "Update a document",
      why: "Open Documents on this page, choose the type, and upload the file. Current files: {{files}}. There is no separate insurance request. A medical or other file is updated the same way.",
      evidence: "Document count {{count}}. Files: {{files}}. Upload stays on this page.",
    },
    document_empty: {
      title: "Update a document",
      why: "No documents are on your record yet. Open Documents on this page, choose the type, and upload the file. Insurance is not a separate request.",
      evidence: "Document count 0. The upload control is on this page.",
    },
  },
  command: {
    title: "What these counts show",
    hint: "Each note uses a count the dashboard already loaded. If a count is missing, it is not guessed.",
    action: "Open the linked screen and decide there. This note does not change headcount, leave, or documents.",
    on_leave: {
      title: "People on leave today",
      why: "{{count}} approved leave requests cover today, {{today}}, inside {{periodFrom}}–{{periodTo}}.",
      evidence: "On leave today: {{count}}. Today: {{today}}. Period {{periodFrom}}–{{periodTo}}.",
    },
    expired: {
      title: "Documents past expiry",
      why: "{{count}} documents are past expiry in the current document count.",
      evidence: "Expired documents: {{count}}. Period {{periodFrom}}–{{periodTo}}.",
    },
    expiring: {
      title: "Documents expiring soon",
      why: "{{count}} documents are inside the expiring window already used by this dashboard.",
      evidence: "Expiring documents: {{count}}. Period {{periodFrom}}–{{periodTo}}.",
    },
    pending_leave: {
      title: "Leave still pending",
      why: "{{count}} leave requests are still pending. A manager approves them on the leave screen.",
      evidence: "Pending leave requests: {{count}}. Period {{periodFrom}}–{{periodTo}}.",
    },
    present: {
      title: "Present today",
      why: "{{present}} people are marked present today, {{today}}. Active headcount in this filter is {{headcount}}.",
      evidence: "Present today {{present}}. Headcount {{headcount}}. Today {{today}}. No percentage is attached.",
    },
    quiet: {
      title: "Counts do not need a review action",
      why: "Headcount is {{headcount}}. On leave today {{onLeave}}. Expired documents {{expired}}. Pending leave {{pending}}. None of those review counts is above zero.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. Headcount {{headcount}}. On leave {{onLeave}}. Expired {{expired}}. Pending leave {{pending}}.",
    },
    summary: {
      title: "Counts on this page",
      why: "Active headcount is {{headcount}}. Present today is {{present}}. On leave today is {{onLeave}}. Pending leave is {{pending}}. Expired documents are {{expired}}.",
      evidence: "Period {{periodFrom}}–{{periodTo}}. These counts were already loaded. No score is attached.",
    },
  },
} as const;

const LEAVE_TYPE_EN: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  unpaid: "Unpaid",
  emergency: "Emergency",
  maternity: "Maternity",
  hajj: "Hajj",
  compassionate: "Compassionate",
  comp_off: "Comp off",
  other: "Other",
};

const LEAVE_STATUS_EN: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    values[key] == null ? "" : String(values[key]),
  );
}

function dig(root: unknown, path: string[]): unknown {
  let cur = root;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function prepareEnglishValues(values: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = { ...values };
  if (!String(out.staffName ?? "").trim()) out.staffName = HR_ASSIST_COPY.unnamed;
  if (out.weekdayIndex != null) {
    const label = HR_ASSIST_COPY.weekdays[String(out.weekdayIndex) as keyof typeof HR_ASSIST_COPY.weekdays];
    if (label) out.weekday = label;
  }
  const start = typeof out.start === "string" && out.start ? out.start : "";
  const end = typeof out.end === "string" && out.end ? out.end : "";
  if (start) out.startLabel = formatEnglishTime(start);
  if (end) out.endLabel = formatEnglishTime(end);
  if (start && end) out.shiftLabel = `${out.startLabel}–${out.endLabel}`;
  else if (!out.shiftLabel) out.shiftLabel = HR_ASSIST_COPY.shiftUnspecified;
  if (typeof out.actualInHm === "string" && out.actualInHm) out.actualInLabel = formatEnglishTime(out.actualInHm);
  else if (!out.actualInLabel) out.actualInLabel = "—";
  if (typeof out.actualOutHm === "string" && out.actualOutHm) out.actualOutLabel = formatEnglishTime(out.actualOutHm);
  else if (!out.actualOutLabel) out.actualOutLabel = "—";
  if (!out.site) out.site = HR_ASSIST_COPY.unknownSite;
  if (typeof out.leaveType === "string") out.leaveTypeLabel = LEAVE_TYPE_EN[out.leaveType] ?? out.leaveType;
  if (typeof out.leaveStatus === "string") out.leaveStatusLabel = LEAVE_STATUS_EN[out.leaveStatus] ?? out.leaveStatus;
  if (typeof out.detailCode === "string") {
    const attendance =
      HR_ASSIST_COPY.attendance.impossible_timestamp.detail[
        out.detailCode as keyof typeof HR_ASSIST_COPY.attendance.impossible_timestamp.detail
      ];
    const payroll =
      HR_ASSIST_COPY.payroll.reconcile.detail[
        out.detailCode as keyof typeof HR_ASSIST_COPY.payroll.reconcile.detail
      ];
    const template = attendance ?? payroll;
    if (template) out.detail = fillTemplate(template, out);
  }
  if (!out.windowPrefix) out.windowPrefix = "";
  return out;
}

export function englishAssistText(key: string, values: Record<string, string | number>): string {
  const prepared = prepareEnglishValues(values);
  const template = dig(HR_ASSIST_COPY, key.replace(/^hrAssist\./, "").split("."));
  if (typeof template !== "string") return key;
  return fillTemplate(template, prepared);
}
