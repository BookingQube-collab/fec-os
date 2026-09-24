"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { expiryBand, qatarTodayYmd } from "@/lib/hr-expiry-bands";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { FaceCaptureDialog } from "@/components/attendance-hr/face-capture-dialog";
import { StaffAvatar, StaffPhotoField, type StaffPhotoDraft } from "@/components/people/staff-photo-field";
import { getStaffFaceEnrollment, saveStaffFaceEnrollment } from "@/lib/attendance-hr-field.functions";
import { listEmployeeTimeline } from "@/lib/hr-leave.functions";
import { transferStaffMember, updateStaffSalary, updateStaffWorkLocations } from "@/lib/staff-roster.functions";
import { removeStaffPhoto, saveStaffPhoto, updateStaff } from "@/lib/people.functions";
import { Checkbox } from "@/components/ui/checkbox";

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
  employment_category: string | null;
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
  const canSalary = usePermission("people.edit_salary");
  const canViewSalaryPerm = usePermission("people.view_salary");
  const canViewSensitive = usePermission("hr.profile.view_sensitive") || canViewSalaryPerm;
  const canConfigure = usePermission("attendance.configure");
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

  const profile = useQuery({
    queryKey: queryKeys.people.staffProfile(id),
    queryFn: async () => {
      const res = await fetch(`/api/people/staff/${id}`, { credentials: "include" });
      const body = (await res.json()) as ProfileResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load profile");
      return body;
    },
    staleTime: STALE.people,
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
      const result = await updateStaffSalary({ id, monthlySalaryQar: salary ? Number(salary) : null });
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
    enabled: Boolean(id),
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

  return (
    <div className="space-y-6">
      <PageHeader
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
            <Button asChild variant="secondary" size="sm">
              <Link href="/people?tab=staff">{t("people.tabs.staff")}</Link>
            </Button>
          </div>
        }
      />

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
        className="space-y-4"
      >
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="attendance">Attendance & Leave</TabsTrigger>
          {profile.data?.canViewSalary || canViewSalaryPerm ? (
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
          ) : null}
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="warnings">Disciplinary</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <section className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1">
              <StaffAvatar staffId={s.id} name={s.full_name} hasPhoto={Boolean(s.has_photo)} photoUpdatedAt={s.photo_updated_at} className="h-16 w-16" />
              <div>
                <p className="font-semibold">{s.full_name}</p>
                <p className="font-mono text-xs text-muted-foreground">{s.employee_code}</p>
                <Badge variant="outline" className="mt-1 uppercase text-[10px]">{s.status}</Badge>
              </div>
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Position</dt><dd>{s.job_title ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Department</dt><dd>{s.department ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Location</dt><dd>{formatLocationLabel(s.locations?.code, s.locations?.name)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Manager</dt><dd>{profile.data?.managerName ?? "—"}</dd></div>
            </dl>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Type</dt><dd>{s.employment_type ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Joined</dt><dd>{s.hire_date ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Service</dt><dd>{serviceDays != null ? `${Math.floor(serviceDays / 365)}y ${Math.floor((serviceDays % 365) / 30)}m` : "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Contact</dt><dd>{s.phone ?? s.email ?? "—"}</dd></div>
            </dl>
          </section>
        </TabsContent>

        <TabsContent value="employment" className="space-y-4">
          <section className="surface-card space-y-2 p-5 text-sm">
            <h2 className="text-sm font-semibold">Employment</h2>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Position</dt><dd>{s.job_title ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Department</dt><dd>{s.department ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Sponsorship</dt><dd>{ext?.sponsorship_info ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Category</dt><dd>{ext?.employment_category ?? s.employment_type ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Probation</dt><dd>{ext?.probation_start ?? "—"} → {ext?.probation_end ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Contract</dt><dd>{ext?.contract_start ?? "—"} → {ext?.contract_end ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Expected hours</dt><dd>{s.expected_hours ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Weekly off</dt><dd>{s.weekly_off_weekday == null ? "—" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][s.weekly_off_weekday]}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Ticket eligibility</dt><dd>{ext?.ticket_eligibility == null ? "—" : ext.ticket_eligibility ? "Yes" : "No"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Ticket cycle / amount</dt><dd>{ext?.ticket_eligibility_months ?? "—"} mo · {profile.data?.canViewSalary ? (ext?.ticket_amount ?? "—") : "••••"}</dd></div>
              {profile.data?.canViewSalary ? (
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Salary</dt><dd>{profile.data.compensation?.monthly_salary_qar?.toLocaleString() ?? "—"} QAR</dd></div>
              ) : null}
            </dl>
          </section>
        </TabsContent>

        <TabsContent value="personal" className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">{t("people.profile.personal")}</h2>
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
        <section className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">{t("people.profile.employment")}</h2>
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
              label={t("people.staff.salary")}
              value={
                profile.data.compensation?.monthly_salary_qar != null
                  ? `${profile.data.compensation.monthly_salary_qar} ${profile.data.compensation.currency}`
                  : "—"
              }
            />
          ) : null}
          {canSalary ? (
            <div className="flex items-end gap-2 pt-2">
              <div className="space-y-1">
                <Label>{t("people.staff.salary")}</Label>
                <Input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="QAR" />
              </div>
              <Button size="sm" onClick={() => salaryMut.mutate()} disabled={salaryMut.isPending}>
                {t("common.save")}
              </Button>
            </div>
          ) : null}
        </section>
        <section className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">{t("people.profile.location")}</h2>
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
        <section className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">Identity & contacts</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Nationality</dt><dd>{ext?.nationality ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Gender</dt><dd>{ext?.gender ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Date of birth</dt><dd>{ext?.date_of_birth ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">QID</dt><dd className="font-mono text-xs">{canViewSensitive ? (s.qid ?? "—") : s.qid ? "••••••••" : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">QID expiry</dt><dd>{canViewSensitive ? (ext?.qid_expiry ?? "—") : "••••"} {canViewSensitive ? <Badge variant="outline" className="ml-1 text-[10px]">{expiryBand(today, ext?.qid_expiry)}</Badge> : null}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Passport</dt><dd className="font-mono text-xs">{canViewSensitive ? (ext?.passport_number ?? "—") : ext?.passport_number ? "••••••••" : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Passport expiry</dt><dd>{canViewSensitive ? (ext?.passport_expiry ?? "—") : "••••"} {canViewSensitive ? <Badge variant="outline" className="ml-1 text-[10px]">{expiryBand(today, ext?.passport_expiry)}</Badge> : null}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Emergency</dt><dd>{ext?.emergency_contact_name ?? "—"} {ext?.emergency_contact_phone ? `· ${ext.emergency_contact_phone}` : ""}</dd></div>
          </dl>
        </section>
      </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <section className="surface-card space-y-2 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Documents</h2>
              {canViewSensitive ? (
                <Button asChild size="sm" variant="secondary"><Link href="/people/hr/documents">Open HR Documents</Link></Button>
              ) : null}
            </div>
            {!canViewSensitive ? (
              <p className="text-sm text-muted-foreground">Sensitive HR documents (QID, passport, contracts) are visible to Admin and HR only.</p>
            ) : !(profile.data?.documents?.length) ? (
              <p className="text-sm text-muted-foreground">No documents on file yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left">Type</th>
                      <th className="px-2 py-1 text-left">Number</th>
                      <th className="px-2 py-1 text-left">Issue</th>
                      <th className="px-2 py-1 text-left">Expiry</th>
                      <th className="px-2 py-1 text-left">Band</th>
                      <th className="px-2 py-1 text-left">Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.data!.documents!.map((doc) => (
                      <tr key={doc.id} className="border-t">
                        <td className="px-2 py-1">{doc.doc_type}</td>
                        <td className="px-2 py-1 font-mono text-xs">{doc.document_number ?? "—"}</td>
                        <td className="px-2 py-1">{doc.issue_date ?? "—"}</td>
                        <td className="px-2 py-1">{doc.expiry_date ?? "—"}</td>
                        <td className="px-2 py-1"><Badge variant="outline" className="text-[10px]">{expiryBand(today, doc.expiry_date)}</Badge></td>
                        <td className="px-2 py-1">{doc.verification_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
      <section className="surface-card space-y-2 p-5">
        <h2 className="text-sm font-semibold">{t("people.profile.attendance")}</h2>
        {!profile.data?.attendance.length ? (
          <p className="text-sm text-muted-foreground">{t("people.profile.noAttendance")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">{t("people.attendance.date")}</th>
                  <th className="px-2 py-1 text-left">{t("people.staff.location")}</th>
                  <th className="px-2 py-1 text-left">{t("people.staff.status")}</th>
                  <th className="px-2 py-1 text-left">{t("people.attendance.firstCheckIn")}</th>
                  <th className="px-2 py-1 text-left">{t("people.attendance.lastCheckOut")}</th>
                </tr>
              </thead>
              <tbody>
                {profile.data.attendance.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-1">{row.work_date}</td>
                    <td className="px-2 py-1 text-xs text-muted-foreground">{row.location_label ?? "—"}</td>
                    <td className="px-2 py-1"><Badge variant="outline">{row.status}</Badge></td>
                    <td className="px-2 py-1 text-xs">{row.actual_in ?? "—"}</td>
                    <td className="px-2 py-1 text-xs">{row.actual_out ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button asChild size="sm" variant="secondary"><Link href="/people/leave">Leave module</Link></Button>
      </section>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <section className="surface-card space-y-2 p-5 text-sm">
            <h2 className="text-sm font-semibold">Payroll</h2>
            {profile.data?.canViewSalary ? (
              <p>Monthly: {profile.data.compensation?.monthly_salary_qar?.toLocaleString() ?? "—"} {profile.data.compensation?.currency ?? "QAR"}</p>
            ) : (
              <p className="text-muted-foreground">Salary is permission-gated.</p>
            )}
            <Button asChild size="sm" variant="secondary"><Link href="/people/payroll">Open payroll</Link></Button>
          </section>
        </TabsContent>

        <TabsContent value="warnings" className="space-y-4">
          <section className="surface-card p-5 text-sm text-muted-foreground">
            Warnings & disciplinary letters live in HR documents (`warning_letter`).{" "}
            <Link className="underline" href="/people/hr/documents">Open documents</Link>
          </section>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <section className="surface-card p-5">
            <Button asChild><Link href={`/people/performance/staff/${s.id}`}>{t("people.profile.openPerformance")}</Link></Button>
          </section>
        </TabsContent>

        <TabsContent value="training" className="space-y-4">
        <section className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">{t("people.profile.training")}</h2>
          {!profile.data?.training.length ? (
            <p className="text-sm text-muted-foreground">{t("people.profile.noTraining")}</p>
          ) : (
            profile.data.training.map((tr) => (
              <p key={tr.id} className="text-sm">{tr.course_name} · {tr.status}</p>
            ))
          )}
        </section>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <section className="surface-card space-y-2 p-5">
            <h2 className="text-sm font-semibold">Status history</h2>
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
        <section className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">{t("people.profile.timeline")}</h2>
          <div className="flex flex-wrap gap-2">
            {(
              ["all", "status_change", "salary_change", "leave_approved", "document_verified", "document_replaced"] as const
            ).map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded-md border px-2 py-1 text-xs ${
                  timelineFilter === value ? "border-foreground bg-foreground text-background" : "border-border"
                }`}
                onClick={() => setTimelineFilter(value)}
              >
                {t(`people.profile.timelineFilters.${value}`)}
              </button>
            ))}
          </div>
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
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <section className="surface-card p-5 text-sm whitespace-pre-wrap">
            {ext?.notes?.trim() || <span className="text-muted-foreground">No HR notes on file.</span>}
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

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
