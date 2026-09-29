"use client";

import { FecPageHeader } from "@/components/fec";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, type ReactNode } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { expiryBand, qatarTodayYmd } from "@/lib/hr-expiry-bands";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import { hrAlertSeverityLabel, staffHrAlerts, type HrAlertSeverity } from "@/lib/staff-hr-alerts";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { FaceCaptureDialog } from "@/components/attendance-hr/face-capture-dialog";
import { StaffAvatar, StaffPhotoField, type StaffPhotoDraft } from "@/components/people/staff-photo-field";
import { getStaffFaceEnrollment, saveStaffFaceEnrollment } from "@/lib/attendance-hr-field.functions";
import { listEmployeeTimeline } from "@/lib/hr-leave.functions";
import { transferStaffMember, updateStaffSalary, updateStaffWorkLocations } from "@/lib/staff-roster.functions";
import { previewStaffLogin, provisionStaffLogin } from "@/lib/admin.functions";
import { isStaffLoginPassword, parseStaffLoginEmail, resolveStaffLoginEmail } from "@/lib/staff-login";
import { StaffPayrollPanel } from "@/components/people/staff-payroll-panel";
import { StaffTrainingPanel } from "@/components/people/staff-training-panel";
import { removeStaffPhoto, saveStaffPhoto, updateStaff, updateStaffProfileNotes } from "@/lib/people.functions";
import { HrDocumentsWorkspace } from "@/views/hr-documents-page";
import { HrLeaveWorkspace } from "@/views/hr-leave-page";
import { HrWarningsWorkspace } from "@/views/hr-warnings-page";
import { PerformanceStaffProfilePanel } from "@/views/performance-staff-profile-page";
import { StaffKraScorecards } from "@/components/people/staff-kra-scorecards";
import { Checkbox } from "@/components/ui/checkbox";
import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";

const SECTION_LABEL = "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const PANEL = "surface-card min-w-0 space-y-3 p-4";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type ProfileExt = {
  nationality: string | null;
  gender: string | null;
  date_of_birth: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  qid_expiry: string | null;
  sponsorship_info: string | null;
  probation_start: string | null;
  probation_end: string | null;
  ticket_eligibility: boolean | null;
  ticket_eligibility_months: number | null;
  ticket_amount: number | null;
  contract_start: string | null;
  contract_end: string | null;
  notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation?: string | null;
  employment_category: string | null;
  visa_expiry?: string | null;
  payment_method?: string | null;
  bank_name?: string | null;
  iban?: string | null;
};

type ProfileResponse = {
  staff: {
    id: string;
    employee_code: string;
    full_name: string;
    qid: string | null;
    phone: string | null;
    email: string | null;
    hire_date: string | null;
    job_title: string | null;
    department: string | null;
    status: string;
    e3_enrolled: boolean | null;
    employment_type: string | null;
    staff_role: string | null;
    location_id: string;
    is_roaming?: boolean;
    has_photo?: boolean;
    photo_updated_at?: string | null;
    flexible_attendance?: boolean;
    reporting_time_minutes?: number | null;
    buffer_minutes?: number | null;
    expected_hours?: number | null;
    break_minutes?: number | null;
    weekly_off_weekday?: number | null;
    work_locations?: Array<{ id: string; code: string; name: string | null }>;
    locations?: { code: string; name: string } | null;
  };
  profileExt?: ProfileExt | null;
  managerName?: string | null;
  statusHistory?: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    effective_on: string;
    reason: string | null;
    created_at: string;
  }>;
  documents?: Array<{
    id: string;
    doc_type: string;
    document_number: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    verification_status: string;
    status: string;
    file_name: string | null;
    notes: string | null;
  }>;
  compensation: { monthly_salary_qar: number | null; daily_rate_qar: number | null; currency: string } | null;
  transfers: Array<{
    id: string;
    from_location_id: string | null;
    to_location_id: string;
    from_location_label: string | null;
    to_location_label: string | null;
    effective_on: string;
    reason: string | null;
  }>;
  attendance: Array<{
    id: string;
    work_date: string;
    status: string;
    actual_in: string | null;
    actual_out: string | null;
    worked_minutes: number | null;
    missed_punch: boolean;
    location_label?: string | null;
  }>;
  punches: Array<{ id: string; punch_at: string; punch_type: string; source: string }>;
  training: Array<{ id: string; course_name: string; status: string; due_on: string | null }>;
  canViewSalary: boolean;
  canViewSensitive?: boolean;
  login?: {
    linked: boolean;
    email: string | null;
    defaultPassword: string | null;
  };
};

function StaffProfilePageBody() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id;
  const PROFILE_TABS = [
    "overview",
    "employment",
    "personal",
    "documents",
    "attendance",
    "payroll",
    "warnings",
    "performance",
    "training",
    "history",
    "notes",
  ] as const;
  const tabFromUrl = searchParams.get("tab") ?? "overview";
  const initialTab = (PROFILE_TABS as readonly string[]).includes(tabFromUrl) ? tabFromUrl : "overview";
  const [profileTab, setProfileTab] = useState(initialTab);
  useEffect(() => {
    setProfileTab(initialTab);
  }, [initialTab]);
  const canEdit = usePermission("people.edit_roster");
  const canProvisionLogin = usePermission("admin.provision_users");
  const canSalary = usePermission("people.edit_salary");
  const canViewSalaryPerm = usePermission("people.view_salary");
  const canViewSensitive = usePermission("hr.profile.view_sensitive") || canViewSalaryPerm;
  const canConfigure = usePermission("attendance.configure");
  const canManageDocs = usePermission("hr.docs.manage");
  const canManageLeave = usePermission("hr.leave.manage");
  const canManageWarnings = usePermission("hr.warnings.manage");
  const canViewPayrollLines = usePermission("payroll.view");
  const canPerformance = usePermission("performance.view");
  const canHrManage = usePermission("hr.manage");
  const canEditNotes = canEdit || canHrManage || canManageDocs;
  const [enrollOpen, setEnrollOpen] = useState(false);
  const { data: sites } = useSites();
  const qc = useQueryClient();
  const [toLocationId, setToLocationId] = useState("");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [reason, setReason] = useState("");
  const [salary, setSalary] = useState("");
  const [workLocationIds, setWorkLocationIds] = useState<string[]>([]);
  const [isRoaming, setIsRoaming] = useState(false);
  const [employmentType, setEmploymentType] = useState("");
  const [flexibleAttendance, setFlexibleAttendance] = useState(false);
  const [reportingTimeMinutes, setReportingTimeMinutes] = useState("");
  const [bufferMinutes, setBufferMinutes] = useState("");
  const [expectedHours, setExpectedHours] = useState("");
  const [staffBreakMinutes, setStaffBreakMinutes] = useState("");
  const [weeklyOffWeekday, setWeeklyOffWeekday] = useState("");
  const [photoDraft, setPhotoDraft] = useState<StaffPhotoDraft>({ dataUrl: null, remove: false });
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [issuedLogin, setIssuedLogin] = useState<{ email: string; password: string } | null>(null);
  const [loginEmailDraft, setLoginEmailDraft] = useState<string | null>(null);
  const [loginPasswordDraft, setLoginPasswordDraft] = useState<string | null>(null);
  const [loginDraftStaffId, setLoginDraftStaffId] = useState(id);
  if (loginDraftStaffId !== id) {
    setLoginDraftStaffId(id);
    setLoginEmailDraft(null);
    setLoginPasswordDraft(null);
    setIssuedLogin(null);
  }
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: queryKeys.people.staffProfile(id),
    queryFn: async () => {
      const res = await fetch(`/api/people/staff/${id}?sections=overview`, { credentials: "include" });
      const body = (await res.json()) as ProfileResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load profile");
      return body;
    },
    staleTime: STALE.people,
  });

  const loginPreview = useQuery({
    queryKey: queryKeys.people.staffLoginPreview(id),
    queryFn: async () => {
      const result = await previewStaffLogin({ staffId: id });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled:
      Boolean(id) &&
      canProvisionLogin &&
      Boolean(profile.data?.staff) &&
      !profile.data?.login?.linked,
    staleTime: STALE.people,
  });

  const attendanceSection = useQuery({
    queryKey: queryKeys.people.staffProfileSection(id, "attendance"),
    queryFn: async () => {
      const res = await fetch(`/api/people/staff/${id}?sections=attendance`, { credentials: "include" });
      const body = (await res.json()) as ProfileResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load attendance");
      return { attendance: body.attendance ?? [], punches: body.punches ?? [] };
    },
    staleTime: STALE.people,
    enabled: Boolean(id) && profileTab === "attendance",
  });

  const attendanceRows = attendanceSection.data?.attendance ?? profile.data?.attendance ?? [];

  const refreshProfile = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
  };

  const notesMut = useMutation({
    mutationFn: (notes: string) => updateStaffProfileNotes({ staffId: id, notes: notes.trim() ? notes.trim() : null }),
    onSuccess: () => {
      toast.success(t("people.profile.notesSaved"));
      setNotesDraft(null);
      refreshProfile();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    const loaded = profile.data?.staff;
    if (!loaded) return;
    const ids = new Set<string>([loaded.location_id, ...(loaded.work_locations ?? []).map((loc) => loc.id)]);
    setWorkLocationIds([...ids]);
    setIsRoaming(Boolean(loaded.is_roaming));
    setEmploymentType(loaded.employment_type ?? "permanent");
    setFlexibleAttendance(Boolean(loaded.flexible_attendance));
    setReportingTimeMinutes(
      loaded.reporting_time_minutes == null ? "" : String(loaded.reporting_time_minutes),
    );
    setBufferMinutes(loaded.buffer_minutes == null ? "" : String(loaded.buffer_minutes));
    setExpectedHours(loaded.expected_hours == null ? "" : String(loaded.expected_hours));
    setStaffBreakMinutes(loaded.break_minutes == null ? "" : String(loaded.break_minutes));
    setWeeklyOffWeekday(loaded.weekly_off_weekday == null ? "" : String(loaded.weekly_off_weekday));
  }, [profile.data?.staff]);

  const transferMut = useMutation({
    mutationFn: () => transferStaffMember({ id, toLocationId, effectiveOn, reason }),
    onSuccess: () => {
      toast.success(t("people.staff.transfer"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salaryMut = useMutation({
    mutationFn: async () => {
      const amount = salary.trim() === "" ? null : Number(salary);
      if (amount !== null && Number.isNaN(amount)) throw new Error(t("people.staff.salaryPlaceholder"));
      const isJoker = employmentType === "joker" || profile.data?.staff?.employment_type === "joker";
      const result = await updateStaffSalary(
        isJoker
          ? { id, monthlySalaryQar: null, dailyRateQar: amount }
          : { id, monthlySalaryQar: amount, dailyRateQar: null },
      );
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(t("people.staff.salary"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const faceQ = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "face", staffId: id }),
    queryFn: () => getStaffFaceEnrollment({ staffId: id }),
    staleTime: STALE.people,
  });

  const timeline = useQuery({
    queryKey: queryKeys.people.hrEmployeeTimeline({ staffId: id, eventType: timelineFilter }),
    queryFn: () =>
      listEmployeeTimeline({
        staffId: id,
        eventType: timelineFilter === "all" ? null : timelineFilter,
      }),
    staleTime: STALE.people,
    enabled: Boolean(id) && profileTab === "history",
  });

  const enrollMut = useMutation({
    mutationFn: async (payload: { photoBase64: string; livenessPassed: boolean }) => {
      const result = await saveStaffFaceEnrollment({ staffId: id, ...payload });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(t("attendanceHr.field.enrolled"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const workSitesMut = useMutation({
    mutationFn: async () => {
      const result = await updateStaffWorkLocations({ id, locationIds: workLocationIds, isRoaming });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(t("people.staff.workLocationsSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const employmentMut = useMutation({
    mutationFn: async () => {
      const result = await updateStaff({
        id,
        employmentType: (employmentType || null) as "permanent" | "temporary" | "secondment" | "joker" | null,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(t("people.staff.updateSuccess"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flexibleMut = useMutation({
    mutationFn: parseFlexibleAndSave,
    onSuccess: () => {
      toast.success(t("people.staff.flexibleHoursSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function parseFlexibleAndSave() {
    const reporting =
      reportingTimeMinutes.trim() === "" ? null : Number.parseInt(reportingTimeMinutes, 10);
    const buffer = bufferMinutes.trim() === "" ? null : Number.parseInt(bufferMinutes, 10);
    if (reporting != null && (!Number.isFinite(reporting) || reporting < 0 || reporting > 180)) {
      throw new Error(t("people.staff.flexibleReportingInvalid"));
    }
    if (buffer != null && (!Number.isFinite(buffer) || buffer < 0 || buffer > 120)) {
      throw new Error(t("people.staff.flexibleBufferInvalid"));
    }
    const expected = expectedHours.trim() === "" ? null : Number(expectedHours);
    const breakMins =
      staffBreakMinutes.trim() === "" ? null : Number.parseInt(staffBreakMinutes, 10);
    const weeklyOff =
      weeklyOffWeekday.trim() === "" ? null : Number.parseInt(weeklyOffWeekday, 10);
    if (expected != null && (!Number.isFinite(expected) || expected < 1 || expected > 16)) {
      throw new Error(t("people.staff.expectedHoursInvalid"));
    }
    if (breakMins != null && (!Number.isFinite(breakMins) || breakMins < 0 || breakMins > 240)) {
      throw new Error(t("people.staff.breakMinutesInvalid"));
    }
    const result = await updateStaff({
      id,
      flexibleAttendance,
      reportingTimeMinutes: reporting,
      bufferMinutes: buffer,
      expectedHours: expected,
      breakMinutes: breakMins,
      weeklyOffWeekday: weeklyOff,
    });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  const createLogin = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const result = await provisionStaffLogin({
        staffId: id,
        email: input.email,
        password: input.password,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (result) => {
      if (result.password && result.email) {
        setIssuedLogin({ email: result.email, password: result.password });
        toast.success(t("people.profile.login.created"));
      } else if (result.linkedExisting) {
        toast.success(t("people.profile.login.linkedExisting"));
      } else {
        toast.success(t("people.profile.login.exists"));
      }
      void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const photoMut = useMutation({
    mutationFn: async () => {
      if (photoDraft.dataUrl) {
        await saveStaffPhoto({ id, photoDataUrl: photoDraft.dataUrl });
        return "saved" as const;
      }
      if (photoDraft.remove) {
        await removeStaffPhoto({ id });
        return "removed" as const;
      }
      throw new Error(t("people.staff.photoInvalid"));
    },
    onSuccess: (kind) => {
      toast.success(kind === "removed" ? t("people.staff.photoRemoved") : t("people.staff.photoSaved"));
      setPhotoDraft({ dataUrl: null, remove: false });
      void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = profile.data?.staff;
  const ext = profile.data?.profileExt;
  const today = qatarTodayYmd();
  if (profile.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("people.staff.loading")}</p>;
  }
  if (!s) {
    return <p className="text-sm text-muted-foreground">{t("people.staff.empty")}</p>;
  }

  const serviceDays = s.hire_date
    ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${s.hire_date}T00:00:00Z`)) / 86_400_000))
    : null;
  const serviceLabel =
    serviceDays == null ? null : `${Math.floor(serviceDays / 365)}y ${Math.floor((serviceDays % 365) / 30)}m`;
  const docs = profile.data?.documents ?? [];
  const docExpired = docs.filter((doc) => expiryBand(today, doc.expiry_date) === "expired").length;
  const docSoon = docs.filter((doc) => {
    const band = expiryBand(today, doc.expiry_date);
    return band === "0_30" || band === "31_60" || band === "61_90";
  }).length;
  const warningLetters = docs.filter((doc) => doc.doc_type === "warning_letter");
  // ponytail: staffHrAlerts only reads expiry, contact, and status — not a directory StaffRow.
  const alerts = staffHrAlerts(
    {
      status: s.status,
      qid: s.qid,
      phone: s.phone,
      hire_date: s.hire_date,
      qid_expiry: canViewSensitive ? ext?.qid_expiry : null,
      passport_expiry: canViewSensitive ? ext?.passport_expiry : null,
      contract_end: ext?.contract_end,
      visa_expiry: canViewSensitive ? ext?.visa_expiry : null,
    } as StaffRow,
    today,
  );
  const showPayroll = Boolean(profile.data?.canViewSalary || canViewSalaryPerm);
  const profileTabs: Array<{ value: string; label: string }> = [
    { value: "overview", label: "Overview" },
    { value: "employment", label: "Employment" },
    { value: "personal", label: "Personal" },
    { value: "documents", label: "Documents" },
    { value: "attendance", label: "Attendance & Leave" },
    ...(showPayroll ? [{ value: "payroll", label: "Payroll" }] : []),
    { value: "performance", label: "Performance" },
    { value: "training", label: "Training" },
    { value: "warnings", label: "Disciplinary" },
    { value: "history", label: "History" },
    { value: "notes", label: "Notes" },
  ];
  const emergencyContact = [ext?.emergency_contact_name, ext?.emergency_contact_phone].filter(Boolean).join(" · ");
  const contractSpan = [ext?.contract_start, ext?.contract_end].filter(Boolean).join(" → ");
  const probationSpan = [ext?.probation_start, ext?.probation_end].filter(Boolean).join(" → ");
  const loginLinked = Boolean(profile.data?.login?.linked) || Boolean(issuedLogin);
  const loginEmail = issuedLogin?.email ?? profile.data?.login?.email ?? null;
  const defaultPassword = canProvisionLogin ? profile.data?.login?.defaultPassword ?? issuedLogin?.password ?? null : null;
  let suggestedEmail = "";
  try {
    suggestedEmail = resolveStaffLoginEmail(s.email, s.employee_code, { fullName: s.full_name });
  } catch {
    suggestedEmail = "";
  }
  if (loginPreview.data && !loginPreview.data.alreadyLinked && loginPreview.data.email) {
    suggestedEmail = loginPreview.data.email;
  }
  const loginEmailValue = loginEmailDraft ?? suggestedEmail;
  const loginPasswordValue = loginPasswordDraft ?? defaultPassword ?? "";

  return (
    <div className="min-w-0 space-y-4">
      <FecPageHeader
        icon={User}
        kicker={t("people.profile.title")}
        title={s.full_name}
        subtitle={`${s.employee_code} · ${s.locations?.code ?? ""} ${s.locations?.name ?? ""}${s.is_roaming ? ` · ${t("people.staff.roaming")}` : ""}`}
        actions={
          <div className="flex items-center gap-3">
            <StaffAvatar
              staffId={s.id}
              name={s.full_name}
              hasPhoto={Boolean(s.has_photo) && !photoDraft.remove}
              photoUpdatedAt={s.photo_updated_at}
              className="h-12 w-12 border border-border"
            />
            <Badge variant="outline" className="uppercase">
              {s.status.replace(/_/g, " ")}
            </Badge>
            <Button asChild variant="secondary" size="sm">
              <Link href="/people?tab=staff">{t("people.tabs.staff")}</Link>
            </Button>
          </div>
        }
      />

      <section className="surface-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h2 className={SECTION_LABEL}>{t("people.profile.login.title")}</h2>
            <Badge variant={loginLinked ? "success" : "muted"}>
              {loginLinked ? t("people.profile.login.exists") : t("people.profile.login.missing")}
            </Badge>
            {loginLinked ? (
              <p className="text-sm">
                <span className="text-muted-foreground">{t("people.profile.login.email")}: </span>
                <span className="font-medium">{loginEmail ?? t("people.profile.login.emailUnavailable")}</span>
              </p>
            ) : null}
            {issuedLogin ? (
              <div className="space-y-1 rounded-xl border border-border bg-secondary/60 px-3 py-2">
                <p className="text-sm font-medium">{t("people.profile.login.created")}</p>
                <p className="text-sm">
                  {t("people.profile.login.email")}: <span className="font-medium">{issuedLogin.email}</span>
                </p>
                <p className="text-sm">
                  {t("people.profile.login.issuedPassword")}:{" "}
                  <span className="font-mono font-semibold">{issuedLogin.password}</span>
                </p>
                <p className="text-xs text-muted-foreground">{t("people.profile.login.shareHint")}</p>
              </div>
            ) : null}
            {defaultPassword && loginLinked && !issuedLogin ? (
              <p className="text-sm text-muted-foreground">
                {t("people.profile.login.defaultPassword", { password: defaultPassword })}
              </p>
            ) : null}
            {!loginLinked && !canProvisionLogin ? (
              <p className="text-sm text-muted-foreground">{t("people.profile.login.ceoOnly")}</p>
            ) : null}
          </div>
        </div>
        {!loginLinked && canProvisionLogin ? (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const email = parseStaffLoginEmail(loginEmailValue);
              if (!email) {
                toast.error(t("people.profile.login.emailInvalid"));
                return;
              }
              if (!isStaffLoginPassword(loginPasswordValue)) {
                toast.error(t("people.profile.login.passwordInvalid"));
                return;
              }
              createLogin.mutate({ email, password: loginPasswordValue });
            }}
          >
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="staff-login-email">{t("people.profile.login.email")}</Label>
              <Input
                id="staff-login-email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                value={loginEmailValue}
                disabled={createLogin.isPending}
                onChange={(event) => setLoginEmailDraft(event.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="staff-login-password">{t("people.profile.login.issuedPassword")}</Label>
              <Input
                id="staff-login-password"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={loginPasswordValue}
                disabled={createLogin.isPending}
                onChange={(event) => setLoginPasswordDraft(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={createLogin.isPending || (loginEmailDraft == null && loginPreview.isPending)}
            >
              {createLogin.isPending ? t("people.profile.login.creating") : t("people.profile.login.create")}
            </Button>
            <p className="text-xs text-muted-foreground sm:col-span-3">{t("people.profile.login.editHint")}</p>
            {createLogin.isError ? (
              <p className="text-sm text-destructive sm:col-span-3">{createLogin.error.message}</p>
            ) : null}
          </form>
        ) : null}
      </section>

      <Tabs
        value={profileTab}
        onValueChange={(next) => {
          setProfileTab(next);
          const nextParams = new URLSearchParams(searchParams.toString());
          if (next === "overview") nextParams.delete("tab");
          else nextParams.set("tab", next);
          const qs = nextParams.toString();
          router.replace(qs ? `/people/staff/${id}?${qs}` : `/people/staff/${id}`, { scroll: false });
        }}
        className="space-y-3"
      >
        <TabsList>
          {profileTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <section className="surface-card p-4 sm:p-5">
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0 space-y-3">
                <h2 className={SECTION_LABEL}>Employment</h2>
                <FactGrid
                  cols="grid-cols-2 xl:grid-cols-1"
                  items={[
                    fact("Position", s.job_title),
                    fact("Department", s.department),
                    fact("Location", formatLocationLabel(s.locations?.code, s.locations?.name)),
                    fact("Manager", profile.data?.managerName),
                    fact(
                      "Type",
                      s.employment_type
                        ? t(`people.staff.employmentTypes.${s.employment_type}`, s.employment_type)
                        : null,
                    ),
                    fact("Category", ext?.employment_category),
                    fact("Joined", s.hire_date),
                    fact("Service", serviceLabel),
                    fact("Contract", contractSpan),
                    fact("Probation", probationSpan),
                  ]}
                />
                {s.is_roaming || (s.work_locations?.length ?? 0) > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {s.is_roaming ? <Badge variant="outline">{t("people.staff.roaming")}</Badge> : null}
                    {(s.work_locations ?? []).map((loc) => (
                      <Badge key={loc.id} variant="secondary">
                        {formatLocationLabel(loc.code, loc.name)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 space-y-3">
                <h2 className={SECTION_LABEL}>Contact</h2>
                <FactGrid
                  cols="grid-cols-2 xl:grid-cols-1"
                  items={[
                    fact("Phone", s.phone),
                    fact("Email", s.email),
                    fact("Emergency", emergencyContact),
                    fact("Relation", ext?.emergency_contact_relation),
                  ]}
                />
              </div>
              <div className="min-w-0 space-y-3">
                <h2 className={SECTION_LABEL}>Documents</h2>
                {!canViewSensitive ? (
                  <p className="text-sm text-muted-foreground">
                    Sensitive HR documents (QID, passport, contracts) are visible to Admin and HR only.
                  </p>
                ) : docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents on file yet.</p>
                ) : (
                  <FactGrid
                    items={[
                      fact("On file", String(docs.length)),
                      fact("Expired", String(docExpired)),
                      fact("Expiring ≤90d", String(docSoon)),
                    ]}
                  />
                )}
                {canViewSensitive ? (
                  <button
                    type="button"
                    className="text-xs font-medium underline-offset-4 hover:underline"
                    onClick={() => {
                      setProfileTab("documents");
                      const nextParams = new URLSearchParams(searchParams.toString());
                      nextParams.set("tab", "documents");
                      router.replace(`/people/staff/${id}?${nextParams.toString()}`, { scroll: false });
                    }}
                  >
                    {t("people.profile.viewDocuments")}
                  </button>
                ) : null}
              </div>
              <div className="min-w-0 space-y-3">
                <h2 className={SECTION_LABEL}>Alerts</h2>
                {alerts.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {alerts.map((alert) => (
                      <Badge
                        key={`${alert.kind}-${alert.severity}`}
                        variant={alertBadgeVariant(alert.severity)}
                        className="font-medium normal-case tracking-normal"
                      >
                        {alert.label}
                        <span className="font-normal opacity-80">{hrAlertSeverityLabel(alert.severity)}</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No open alerts.</p>
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="employment" className="mt-3">
          <section className={PANEL}>
            <h2 className={SECTION_LABEL}>Employment</h2>
            <FactGrid
              cols="grid-cols-2 lg:grid-cols-3"
              items={[
                fact("Position", s.job_title),
                fact("Department", s.department),
                fact("Sponsorship", ext?.sponsorship_info),
                fact(
                  "Category",
                  ext?.employment_category ??
                    (s.employment_type
                      ? t(`people.staff.employmentTypes.${s.employment_type}`, s.employment_type)
                      : null),
                ),
                fact("Probation", probationSpan),
                fact("Contract", contractSpan),
                fact("Expected hours", s.expected_hours == null ? null : String(s.expected_hours)),
                fact(
                  "Weekly off",
                  s.weekly_off_weekday == null ? null : WEEKDAYS[s.weekly_off_weekday],
                ),
                fact(
                  "Ticket eligibility",
                  ext?.ticket_eligibility == null ? null : ext.ticket_eligibility ? "Yes" : "No",
                ),
                fact(
                  "Ticket cycle",
                  ext?.ticket_eligibility_months == null ? null : `${ext.ticket_eligibility_months} mo`,
                ),
                fact(
                  "Ticket amount",
                  profile.data?.canViewSalary
                    ? ext?.ticket_amount == null
                      ? null
                      : String(ext.ticket_amount)
                    : "••••",
                ),
                fact(
                  "Salary",
                  profile.data?.canViewSalary && profile.data.compensation?.monthly_salary_qar != null
                    ? `${profile.data.compensation.monthly_salary_qar.toLocaleString()} ${profile.data.compensation.currency ?? "QAR"}`
                    : null,
                ),
              ]}
            />
          </section>
        </TabsContent>

        <TabsContent value="personal" className="mt-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className={PANEL}>
          <h2 className={SECTION_LABEL}>{t("people.profile.personal")}</h2>
          {canEdit ? (
            <div className="space-y-2 border-b pb-3">
              <h3 className="text-xs font-medium">{t("people.profile.directoryPhoto")}</h3>
              <StaffPhotoField
                staffId={s.id}
                hasPhoto={Boolean(s.has_photo)}
                photoUpdatedAt={s.photo_updated_at ?? null}
                draft={photoDraft}
                onChange={setPhotoDraft}
                disabled={photoMut.isPending}
              />
              <Button
                size="sm"
                onClick={() => photoMut.mutate()}
                disabled={photoMut.isPending || (!photoDraft.dataUrl && !photoDraft.remove)}
              >
                {photoMut.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 border-b pb-3">
              <StaffAvatar
                staffId={s.id}
                name={s.full_name}
                hasPhoto={Boolean(s.has_photo)}
                photoUpdatedAt={s.photo_updated_at}
                className="h-16 w-16 border border-border"
              />
              <span className="text-xs text-muted-foreground">{t("people.profile.directoryPhoto")}</span>
            </div>
          )}
          <Row label={t("people.staff.qid")} value={canViewSensitive ? s.qid : s.qid ? "••••••••" : null} />
          <Row label={t("people.staff.contact")} value={s.phone} />
          <Row label={t("people.staff.email")} value={s.email} />
          <div className="space-y-2 border-t pt-3">
            <h3 className="text-xs font-medium">{t("people.profile.face")}</h3>
            <p className="text-xs text-muted-foreground">{t("attendanceHr.field.faceHint")}</p>
            <Badge variant={faceQ.data?.status === "enrolled" ? "success" : "muted"}>
              {faceQ.data?.status === "enrolled" ? t("attendanceHr.field.enrolledBadge") : t("attendanceHr.field.notEnrolled")}
            </Badge>
            {canEdit || canConfigure ? (
              <Button size="sm" variant="secondary" onClick={() => setEnrollOpen(true)}>
                {t("attendanceHr.field.enrollFace")}
              </Button>
            ) : null}
          </div>
        </section>
        <section className={PANEL}>
          <h2 className={SECTION_LABEL}>{t("people.profile.employment")}</h2>
          <Row label={t("people.staff.title")} value={s.job_title} />
          {canEdit ? (
            <div className="space-y-2">
              <Label>{t("people.staff.employmentType")}</Label>
              <SearchableSelect
                value={employmentType}
                onValueChange={setEmploymentType}
                placeholder={t("people.staff.employmentType")}
                options={[
                  { value: "permanent", label: t("people.staff.employmentTypes.permanent") },
                  { value: "secondment", label: t("people.staff.employmentTypes.secondment") },
                  { value: "joker", label: t("people.staff.employmentTypes.joker") },
                  { value: "temporary", label: t("people.staff.employmentTypes.temporary") },
                ]}
              />
              <p className="text-xs text-muted-foreground">{t("people.staff.roleHoursHelp")}</p>
              <Button
                size="sm"
                onClick={() => employmentMut.mutate()}
                disabled={employmentMut.isPending || employmentType === (s.employment_type ?? "permanent")}
              >
                {t("common.save")}
              </Button>
            </div>
          ) : (
            <Row
              label={t("people.staff.type")}
              value={
                s.employment_type
                  ? t(`people.staff.employmentTypes.${s.employment_type}`, s.employment_type)
                  : null
              }
            />
          )}
          {canEdit ? (
            <div className="space-y-2 border-t pt-3">
              <h3 className="text-xs font-medium">{t("people.staff.expectedHours")}</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="expected-hours">{t("people.staff.expectedHours")}</Label>
                  <Input
                    id="expected-hours"
                    type="number"
                    min={1}
                    max={16}
                    step={0.5}
                    value={expectedHours}
                    onChange={(e) => setExpectedHours(e.target.value)}
                    placeholder={t("people.staff.flexibleUseSiteDefault")}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="staff-break">{t("people.staff.breakMinutes")}</Label>
                  <Input
                    id="staff-break"
                    type="number"
                    min={0}
                    max={240}
                    value={staffBreakMinutes}
                    onChange={(e) => setStaffBreakMinutes(e.target.value)}
                    placeholder={t("people.staff.flexibleUseSiteDefault")}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="weekly-off">{t("people.staff.weeklyOff")}</Label>
                  <SearchableSelect
                    value={weeklyOffWeekday === "" ? "none" : weeklyOffWeekday}
                    onValueChange={(v) => setWeeklyOffWeekday(v === "none" ? "" : v)}
                    options={[
                      { value: "none", label: t("people.staff.weeklyOffNone") },
                      ...["0", "1", "2", "3", "4", "5", "6"].map((d) => ({
                        value: d,
                        label: t(`people.staff.weekdays.${d}`),
                      })),
                    ]}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("people.staff.weeklyOffHint")}</p>
              <h3 className="text-xs font-medium pt-2">{t("people.staff.flexibleHours")}</h3>
              <p className="text-xs text-muted-foreground">{t("people.staff.flexibleHoursHint")}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={flexibleAttendance}
                  onCheckedChange={(v) => setFlexibleAttendance(Boolean(v))}
                />
                {t("people.staff.flexibleHoursEnable")}
              </label>
              {flexibleAttendance ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="flex-reporting">{t("people.staff.flexibleReportingMinutes")}</Label>
                    <Input
                      id="flex-reporting"
                      type="number"
                      min={0}
                      max={180}
                      value={reportingTimeMinutes}
                      onChange={(e) => setReportingTimeMinutes(e.target.value)}
                      placeholder={t("people.staff.flexibleReportingBlank")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="flex-buffer">{t("people.staff.flexibleBufferMinutes")}</Label>
                    <Input
                      id="flex-buffer"
                      type="number"
                      min={0}
                      max={120}
                      value={bufferMinutes}
                      onChange={(e) => setBufferMinutes(e.target.value)}
                      placeholder={t("people.staff.flexibleUseSiteDefault")}
                    />
                  </div>
                </div>
              ) : null}
              <Button size="sm" onClick={() => flexibleMut.mutate()} disabled={flexibleMut.isPending}>
                {flexibleMut.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          ) : (
            <div className="space-y-1 border-t pt-3 text-sm">
              <Row
                label={t("people.staff.expectedHours")}
                value={
                  s.expected_hours == null
                    ? t("people.staff.flexibleUseSiteDefault")
                    : String(s.expected_hours)
                }
              />
              <Row
                label={t("people.staff.breakMinutes")}
                value={
                  s.break_minutes == null
                    ? t("people.staff.flexibleUseSiteDefault")
                    : String(s.break_minutes)
                }
              />
              <Row
                label={t("people.staff.weeklyOff")}
                value={
                  s.weekly_off_weekday == null
                    ? t("people.staff.weeklyOffNone")
                    : t(`people.staff.weekdays.${s.weekly_off_weekday}`)
                }
              />
              {s.flexible_attendance ? (
                <>
                  <Row label={t("people.staff.flexibleHours")} value={t("people.staff.flexibleHoursOn")} />
                  <Row
                    label={t("people.staff.flexibleReportingMinutes")}
                    value={
                      s.reporting_time_minutes == null
                        ? t("people.staff.flexibleReportingBlank")
                        : String(s.reporting_time_minutes)
                    }
                  />
                  <Row
                    label={t("people.staff.flexibleBufferMinutes")}
                    value={
                      s.buffer_minutes == null
                        ? t("people.staff.flexibleUseSiteDefault")
                        : String(s.buffer_minutes)
                    }
                  />
                </>
              ) : null}
            </div>
          )}
          <Row label={t("people.staff.e3")} value={s.e3_enrolled == null ? null : s.e3_enrolled ? "Yes" : "No"} />
          <Row label={t("people.staff.hireDate")} value={s.hire_date} />
          <Row label={t("people.staff.status")} value={s.status} />
          {profile.data?.canViewSalary ? (
            <Row
              label={
                (employmentType === "joker" || s.employment_type === "joker") &&
                profile.data.compensation?.daily_rate_qar != null
                  ? t("people.staff.dayRate")
                  : t("people.staff.salary")
              }
              value={(() => {
                const c = profile.data.compensation;
                const cur = c?.currency ?? "QAR";
                if (c?.daily_rate_qar != null && c.daily_rate_qar > 0) {
                  return `${c.daily_rate_qar} ${cur}/day`;
                }
                if (c?.monthly_salary_qar != null) return `${c.monthly_salary_qar} ${cur}`;
                return "—";
              })()}
            />
          ) : null}
          {canSalary ? (
            <div className="flex items-end gap-2 pt-2">
              <div className="space-y-1">
                <Label>
                  {employmentType === "joker" || s.employment_type === "joker"
                    ? t("people.staff.dayRate")
                    : t("people.staff.salary")}
                </Label>
                <Input
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder={
                    employmentType === "joker" || s.employment_type === "joker"
                      ? t("people.staff.dayRatePlaceholder")
                      : "QAR"
                  }
                />
              </div>
              <Button size="sm" onClick={() => salaryMut.mutate()} disabled={salaryMut.isPending}>
                {t("common.save")}
              </Button>
            </div>
          ) : null}
        </section>
        <section className={PANEL}>
          <h2 className={SECTION_LABEL}>{t("people.profile.location")}</h2>
          <Row label={t("people.staff.location")} value={formatLocationLabel(s.locations?.code, s.locations?.name)} />
          <Row label={t("people.staff.dept")} value={s.department} />
          {!canEdit && (s.work_locations?.length || s.is_roaming) ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {s.is_roaming ? <Badge variant="outline">{t("people.staff.roaming")}</Badge> : null}
              {(s.work_locations ?? []).map((loc) => (
                <Badge key={loc.id} variant="secondary" title={formatLocationLabel(loc.code, loc.name)}>
                  {formatLocationLabel(loc.code, loc.name)}
                </Badge>
              ))}
            </div>
          ) : null}
          {canEdit ? (
            <div className="space-y-3 pt-3">
              <div className="space-y-1">
                <h3 className="text-xs font-medium">{t("people.staff.workLocations")}</h3>
                <p className="text-xs text-muted-foreground">{t("people.staff.workLocationsHint")}</p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={isRoaming}
                    onCheckedChange={(v) => setIsRoaming(Boolean(v))}
                  />
                  {t("people.staff.roaming")}
                </label>
                <p className="text-xs text-muted-foreground">{t("people.staff.roamingHint")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(sites ?? []).filter((site) => site.status === "active").map((site) => {
                    const checked = workLocationIds.includes(site.id) || site.id === s.location_id;
                    const home = site.id === s.location_id;
                    return (
                      <label key={site.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={home}
                          onCheckedChange={(v) => {
                            const on = Boolean(v);
                            setWorkLocationIds((prev) => {
                              const next = new Set(prev);
                              if (on) next.add(site.id);
                              else next.delete(site.id);
                              next.add(s.location_id);
                              return [...next];
                            });
                            if (on) setIsRoaming(true);
                          }}
                        />
                        <span>
                          {formatLocationLabel(site.code, site.name)}
                          {home ? ` (${t("people.staff.primaryLocation")})` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <Button size="sm" onClick={() => workSitesMut.mutate()} disabled={workSitesMut.isPending}>
                  {t("people.staff.saveWorkLocations")}
                </Button>
              </div>
              <div className="space-y-2 pt-2">
              <h3 className="text-xs font-medium">{t("people.profile.transferTitle")}</h3>
              <SearchableSelect
                value={toLocationId}
                onValueChange={setToLocationId}
                placeholder={t("people.staff.selectBranch")}
                emptyOption={{ value: "", label: t("people.staff.selectBranch") }}
                options={(sites ?? []).map((site) => ({
                  value: site.id,
                  label: formatLocationLabel(site.code, site.name),
                  keywords: `${site.code} ${site.name}`,
                }))}
              />
              <Input type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
              <Input placeholder={t("people.profile.reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button size="sm" disabled={!toLocationId || !effectiveOn || transferMut.isPending} onClick={() => transferMut.mutate()}>
                {t("people.staff.transfer")}
              </Button>
              </div>
            </div>
          ) : null}
          {profile.data?.transfers.length ? (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {profile.data.transfers.map((tr) => (
                <li key={tr.id}>
                  {tr.effective_on}: {tr.from_location_label ?? t("people.profile.unknownLocation")} → {tr.to_location_label ?? t("people.profile.unknownLocation")}
                  {tr.reason ? ` · ${tr.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <section className={PANEL}>
          <h2 className={SECTION_LABEL}>Identity & contacts</h2>
          <FactGrid
            cols="grid-cols-2 lg:grid-cols-3"
            items={[
              fact("Nationality", ext?.nationality),
              fact("Gender", ext?.gender),
              fact("Date of birth", ext?.date_of_birth),
              fact("QID", canViewSensitive ? s.qid : s.qid ? "••••••••" : null),
              fact(
                "QID expiry",
                canViewSensitive
                  ? ext?.qid_expiry
                    ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {ext.qid_expiry}
                        <Badge variant="outline" className="text-[10px]">{expiryBand(today, ext.qid_expiry)}</Badge>
                      </span>
                    )
                    : null
                  : ext?.qid_expiry
                    ? "••••"
                    : null,
              ),
              fact(
                "Passport",
                canViewSensitive ? ext?.passport_number : ext?.passport_number ? "••••••••" : null,
              ),
              fact(
                "Passport expiry",
                canViewSensitive
                  ? ext?.passport_expiry
                    ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {ext.passport_expiry}
                        <Badge variant="outline" className="text-[10px]">{expiryBand(today, ext.passport_expiry)}</Badge>
                      </span>
                    )
                    : null
                  : ext?.passport_expiry
                    ? "••••"
                    : null,
              ),
              fact("Emergency", emergencyContact),
              fact("Relation", ext?.emergency_contact_relation),
            ]}
          />
        </section>
      </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-3">
          {canManageDocs ? (
            <HrDocumentsWorkspace lockedStaffId={s.id} embedded onChanged={refreshProfile} />
          ) : (
          <section className={PANEL}>
            <h2 className={SECTION_LABEL}>Documents</h2>
            {!canViewSensitive ? (
              <p className="text-sm text-muted-foreground">Sensitive HR documents (QID, passport, contracts) are visible to Admin and HR only.</p>
            ) : docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents on file yet.</p>
            ) : (
              <>
                <FactGrid
                  cols="grid-cols-3"
                  items={[
                    fact("On file", String(docs.length)),
                    fact("Expired", String(docExpired)),
                    fact("Expiring ≤90d", String(docSoon)),
                  ]}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Type</th>
                        <th className="px-2 py-1.5 text-left font-medium">Number</th>
                        <th className="px-2 py-1.5 text-left font-medium">Issue</th>
                        <th className="px-2 py-1.5 text-left font-medium">Expiry</th>
                        <th className="px-2 py-1.5 text-left font-medium">Band</th>
                        <th className="px-2 py-1.5 text-left font-medium">Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((doc) => (
                        <tr key={doc.id} className="border-t border-border/60">
                          <td className="px-2 py-1.5">{doc.doc_type}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{doc.document_number ?? "—"}</td>
                          <td className="px-2 py-1.5">{doc.issue_date ?? "—"}</td>
                          <td className="px-2 py-1.5">{doc.expiry_date ?? "—"}</td>
                          <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{expiryBand(today, doc.expiry_date)}</Badge></td>
                          <td className="px-2 py-1.5">{doc.verification_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="mt-3 space-y-3">
      <section className={PANEL}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={SECTION_LABEL}>{t("people.profile.attendance")}</h2>
        </div>
        {attendanceSection.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("people.staff.loading")}</p>
        ) : !attendanceRows.length ? (
          <p className="text-sm text-muted-foreground">{t("people.profile.noAttendance")}</p>
        ) : (
          <>
            <FactGrid
              cols="grid-cols-3"
              items={[
                fact("Records", String(attendanceRows.length)),
                fact("Missed punches", String(attendanceRows.filter((row) => row.missed_punch).length)),
                fact("Latest", attendanceRows[0]?.work_date),
              ]}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">{t("people.attendance.date")}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t("people.staff.location")}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t("people.staff.status")}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t("people.attendance.firstCheckIn")}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t("people.attendance.lastCheckOut")}</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((row) => (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="px-2 py-1.5">{row.work_date}</td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{row.location_label ?? "—"}</td>
                      <td className="px-2 py-1.5"><Badge variant="outline">{row.status}</Badge></td>
                      <td className="px-2 py-1.5 text-xs">{row.actual_in ?? "—"}</td>
                      <td className="px-2 py-1.5 text-xs">{row.actual_out ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {canManageLeave ? (
        <HrLeaveWorkspace lockedStaffId={s.id} embedded onChanged={refreshProfile} />
      ) : null}
        </TabsContent>

        <TabsContent value="payroll" className="mt-3">
          <section className={`${PANEL} space-y-4`}>
            <h2 className={SECTION_LABEL}>Payroll</h2>
            {profile.data?.canViewSalary ? (
              <FactGrid
                items={[
                  fact(
                    "Monthly",
                    profile.data.compensation?.monthly_salary_qar == null
                      ? null
                      : `${profile.data.compensation.monthly_salary_qar.toLocaleString()} ${profile.data.compensation.currency ?? "QAR"}`,
                  ),
                  fact(
                    "Day rate",
                    profile.data.compensation?.daily_rate_qar == null
                      ? null
                      : `${profile.data.compensation.daily_rate_qar.toLocaleString()} ${profile.data.compensation.currency ?? "QAR"}`,
                  ),
                  fact(
                    "Ticket amount",
                    ext?.ticket_amount == null ? null : String(ext.ticket_amount),
                  ),
                  fact("Payment method", ext?.payment_method),
                  fact("Bank", canViewSensitive ? ext?.bank_name : null),
                  fact("IBAN", canViewSensitive ? ext?.iban : null),
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Salary is permission-gated.</p>
            )}
            {canSalary ? (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label>
                    {employmentType === "joker" || s.employment_type === "joker"
                      ? t("people.staff.dayRate")
                      : t("people.staff.salary")}
                  </Label>
                  <Input
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder={
                      employmentType === "joker" || s.employment_type === "joker"
                        ? t("people.staff.dayRatePlaceholder")
                        : "QAR"
                    }
                  />
                </div>
                <Button size="sm" onClick={() => salaryMut.mutate()} disabled={salaryMut.isPending}>
                  {t("common.save")}
                </Button>
              </div>
            ) : null}
            {canViewPayrollLines ? <StaffPayrollPanel staffId={s.id} /> : null}
          </section>
        </TabsContent>

        <TabsContent value="warnings" className="mt-3">
          {canManageWarnings ? (
            <HrWarningsWorkspace lockedStaffId={s.id} embedded onChanged={refreshProfile} />
          ) : (
          <section className={PANEL}>
            <h2 className={SECTION_LABEL}>Disciplinary</h2>
            {!canViewSensitive ? (
              <p className="text-sm text-muted-foreground">
                Warnings and disciplinary letters live in HR documents (warning letter). Visible to Admin and HR only.
              </p>
            ) : warningLetters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No warning letters on file.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {warningLetters.map((doc) => (
                  <li key={doc.id} className="rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-sm">
                    <p className="font-medium">{doc.document_number ?? doc.file_name ?? "Warning letter"}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.issue_date ?? "No issue date"} · {doc.verification_status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}
        </TabsContent>

        <TabsContent value="performance" className="mt-3">
          {canPerformance ? (
            <div className="space-y-4">
              <StaffKraScorecards staffId={s.id} />
              <PerformanceStaffProfilePanel staffId={s.id} embedded />
            </div>
          ) : (
            <section className={PANEL}>
              <h2 className={SECTION_LABEL}>Performance</h2>
              <FactGrid
                items={[
                  fact("Position", s.job_title),
                  fact("Department", s.department),
                  fact("Status", s.status.replace(/_/g, " ")),
                ]}
              />
            </section>
          )}
        </TabsContent>

        <TabsContent value="training" className="mt-3">
        <section className={PANEL}>
          <h2 className={SECTION_LABEL}>{t("people.profile.training")}</h2>
          <StaffTrainingPanel staffId={s.id} locationId={s.location_id} onChanged={refreshProfile} />
        </section>
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <div className="grid gap-3 lg:grid-cols-2">
          <section className={PANEL}>
            <h2 className={SECTION_LABEL}>Status history</h2>
            {!(profile.data?.statusHistory?.length) ? (
              <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {profile.data!.statusHistory!.map((h) => (
                  <li key={h.id} className="border-b border-border/60 pb-2">
                    {h.effective_on}: {h.from_status ?? "—"} → <strong>{h.to_status}</strong>
                    {h.reason ? ` · ${h.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        <section className={PANEL}>
          <h2 className={SECTION_LABEL}>{t("people.profile.timeline")}</h2>
          <PillTabScroller label={t("people.profile.timeline")}>
            {(
              ["all", "status_change", "salary_change", "leave_approved", "document_verified", "document_replaced"] as const
            ).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={timelineFilter === value}
                className={pillTabItemClass(timelineFilter === value)}
                onClick={() => setTimelineFilter(value)}
              >
                {t(`people.profile.timelineFilters.${value}`)}
              </button>
            ))}
          </PillTabScroller>
          {(timeline.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("people.profile.timelineEmpty")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(timeline.data ?? []).map((ev) => (
                <li key={ev.id} className="border-b border-border/60 pb-2 last:border-0">
                  <p className="font-medium">
                    {ev.effectiveOn} · {t(`people.profile.eventTypes.${ev.eventType}`, ev.eventType)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Object.entries(ev.payload ?? {})
                      .slice(0, 4)
                      .map(([k, v]) => `${k}: ${String(v ?? "")}`)
                      .join(" · ") || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-3">
          <section className={PANEL}>
            <h2 className={SECTION_LABEL}>Notes</h2>
            {canEditNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notesDraft ?? ext?.notes ?? ""}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder={t("people.profile.notesPlaceholder")}
                  rows={6}
                />
                <Button
                  size="sm"
                  disabled={notesMut.isPending}
                  onClick={() => notesMut.mutate(notesDraft ?? ext?.notes ?? "")}
                >
                  {notesMut.isPending ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            ) : ext?.notes?.trim() ? (
              <p className="whitespace-pre-wrap text-sm">{ext.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No HR notes on file.</p>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <FaceCaptureDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        title={t("attendanceHr.field.enrollFace")}
        description={t("attendanceHr.field.faceHint")}
        onCaptured={(result) => enrollMut.mutate({ photoBase64: result.dataUrl, livenessPassed: result.livenessPassed })}
      />
    </div>
  );
}

export default function StaffProfilePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <StaffProfilePageBody />
    </Suspense>
  );
}

function alertBadgeVariant(severity: HrAlertSeverity): "destructive" | "warning" | "muted" {
  if (severity === "expired" || severity === "critical") return "destructive";
  if (severity === "urgent" || severity === "watch") return "warning";
  return "muted";
}

function fact(label: string, value: ReactNode | null | undefined): { label: string; value: ReactNode } | null {
  if (value == null || value === false) return null;
  if (typeof value === "string" && (!value.trim() || value.trim() === "—")) return null;
  return { label, value };
}

function FactGrid({
  items,
  cols = "grid-cols-1",
}: {
  items: Array<{ label: string; value: ReactNode } | null>;
  cols?: string;
}) {
  const rows = items.filter((item): item is { label: string; value: ReactNode } => item != null);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing on file.</p>;
  return (
    <dl className={`grid gap-x-4 gap-y-3 ${cols}`}>
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className={SECTION_LABEL}>{row.label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Row({ label, value, mono }: { label: string; value?: ReactNode | null; mono?: boolean }) {
  const empty = value == null || value === false || value === "" || value === "—";
  return (
    <div className="min-w-0">
      <p className={SECTION_LABEL}>{label}</p>
      <div className={empty ? "mt-0.5 text-sm text-muted-foreground" : `mt-0.5 text-sm font-medium text-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {empty ? "Not on file" : value}
      </div>
    </div>
  );
}
