"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { FaceCaptureDialog } from "@/components/attendance-hr/face-capture-dialog";
import { getStaffFaceEnrollment, saveStaffFaceEnrollment } from "@/lib/attendance-hr-field.functions";
import { transferStaffMember, updateStaffSalary, updateStaffWorkLocations } from "@/lib/staff-roster.functions";
import { Checkbox } from "@/components/ui/checkbox";

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
    work_locations?: Array<{ id: string; code: string; name: string }>;
    locations?: { code: string; name: string } | null;
  };
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
};

export default function StaffProfilePage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const canEdit = usePermission("people.edit_roster");
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
    mutationFn: () => updateStaffSalary({ id, monthlySalaryQar: salary ? Number(salary) : null }),
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

  const enrollMut = useMutation({
    mutationFn: (payload: { photoBase64: string; livenessPassed: boolean }) =>
      saveStaffFaceEnrollment({ staffId: id, ...payload }),
    onSuccess: () => {
      toast.success(t("attendanceHr.field.enrolled"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const workSitesMut = useMutation({
    mutationFn: () => updateStaffWorkLocations({ id, locationIds: workLocationIds, isRoaming }),
    onSuccess: () => {
      toast.success(t("people.staff.workLocationsSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.staffProfile(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = profile.data?.staff;
  if (profile.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("people.staff.loading")}</p>;
  }
  if (!s) {
    return <p className="text-sm text-muted-foreground">{t("people.staff.empty")}</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={User}
        kicker={t("people.profile.title")}
        title={s.full_name}
        subtitle={`${s.employee_code} · ${s.locations?.code ?? ""} ${s.locations?.name ?? ""}${s.is_roaming ? ` · ${t("people.staff.roaming")}` : ""}`}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/people">{t("nav.people")}</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">{t("people.profile.personal")}</h2>
          <Row label={t("people.staff.qid")} value={s.qid} />
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
          <Row label={t("people.staff.type")} value={s.employment_type} />
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
          <Row label={t("people.staff.location")} value={`${s.locations?.code ?? ""} — ${s.locations?.name ?? ""}`} />
          <Row label={t("people.staff.dept")} value={s.department} />
          {!canEdit && (s.work_locations?.length || s.is_roaming) ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {s.is_roaming ? <Badge variant="outline">{t("people.staff.roaming")}</Badge> : null}
              {(s.work_locations ?? []).map((loc) => (
                <Badge key={loc.id} variant="secondary">{loc.code}</Badge>
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
                          {site.code} — {site.name}
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
                  label: `${site.code} — ${site.name}`,
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
          <h2 className="text-sm font-semibold">{t("people.profile.training")}</h2>
          {!profile.data?.training.length ? (
            <p className="text-sm text-muted-foreground">{t("people.profile.noTraining")}</p>
          ) : (
            profile.data.training.map((tr) => (
              <p key={tr.id} className="text-sm">{tr.course_name} · {tr.status}</p>
            ))
          )}
          <Button asChild variant="secondary" size="sm">
            <Link href={`/people/performance/staff/${s.id}`}>{t("people.profile.openPerformance")}</Link>
          </Button>
        </section>
      </div>

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
      </section>
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

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
