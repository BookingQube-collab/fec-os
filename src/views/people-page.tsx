"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  LogIn,
  LogOut,
  CheckCircle2,
  XCircle,
  Upload,
  Download,
  Pencil,
  Trash2,
  ChevronDown,
  CalendarDays,
} from "lucide-react";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { useStaff } from "@/hooks/queries/usePeople";
import { useSites } from "@/hooks/queries/useSites";
import {
  createShift,
  updateShift,
  deleteShift,
  clockInShift,
  clockOutShift,
  cancelShift,
  createStaff,
  updateStaff,
  deactivateStaff,
  createTrainingEnrollment,
  updateTrainingEnrollment,
  deleteTrainingEnrollment,
  completeTraining,
  importStaffCsv,
  importRosterCsv,
} from "@/lib/people.functions";
import { useMasterDepartments } from "@/hooks/queries/useDepartments";
import { DepartmentMultiSelect } from "@/components/people/department-multi-select";
import { ManageDepartmentsDialog } from "@/components/people/manage-departments-dialog";
import {
  useShifts,
  useTraining,
  useAttendanceDailySummary,
  useAttendanceExceptions,
} from "@/hooks/queries/usePeopleExtended";
import {
  generateAttendanceSummary,
  createAttendanceSummary,
  updateAttendanceSummary,
  deleteAttendanceSummary,
} from "@/lib/attendance.functions";
import {
  buildRosterDatedSampleCsv,
  buildRosterWeeklySampleCsv,
  buildStaffSampleCsv,
  downloadCsvContent,
} from "@/lib/staff-import";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PeopleDashboardPanel = dynamic(
  () =>
    import("@/components/people/people-dashboard-panel").then((m) => m.PeopleDashboardPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Loading dashboard…
      </div>
    ),
  },
);

const STAFF_STATUSES = ["active", "on_leave", "terminated"] as const;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "early_leave", "missed_punch", "overtime"] as const;
const TRAINING_STATUSES = ["enrolled", "in_progress", "completed", "overdue"] as const;

type ShiftRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  role_label: string | null;
  status: string;
  staff_id?: string | null;
  notes?: string | null;
  staff?: {
    full_name?: string;
    employee_code?: string;
    department?: string | null;
    job_title?: string | null;
  } | null;
};

function formatShiftDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatShiftTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function shiftDepartment(s: ShiftRow): string {
  return s.staff?.department ?? s.staff?.job_title ?? s.role_label ?? "—";
}

type TrainingRow = {
  id: string;
  course_name: string;
  required: boolean;
  status: string;
  due_on: string | null;
  score: number | null;
  staff_id: string;
  staff: { full_name?: string; employee_code?: string } | null;
};

type AttendanceRow = {
  id: string;
  work_date: string;
  status: string;
  late_minutes: number;
  missed_punch: boolean;
  staff_id: string | null;
  actual_in?: string | null;
  actual_out?: string | null;
  staff: { full_name?: string } | null;
};

function PeoplePage() {
  const { t } = useTranslation();
  const canEdit = usePermission("people.edit_roster");
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("people.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("people.subtitle")}</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <PeopleSampleDownloadMenu />
            <ImportCsvDialog />
          </div>
        )}
      </header>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">{t("people.tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="staff">{t("people.tabs.staff")}</TabsTrigger>
          <TabsTrigger value="shifts">{t("people.tabs.shifts")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("people.tabs.attendance")}</TabsTrigger>
          <TabsTrigger value="training">{t("people.tabs.training")}</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4">
          <PeopleDashboardPanel />
        </TabsContent>
        <TabsContent value="staff" className="mt-4"><StaffTab /></TabsContent>
        <TabsContent value="shifts" className="mt-4"><ShiftsTab /></TabsContent>
        <TabsContent value="attendance" className="mt-4"><AttendanceTab /></TabsContent>
        <TabsContent value="training" className="mt-4"><TrainingTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useLoc() {
  return useAppStore((s) => s.currentLocationId);
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function formatStaffLocation(s: StaffRow): string {
  if (s.location_code && s.location_name) return `${s.location_code} — ${s.location_name}`;
  if (s.location_code) return s.location_code;
  if (s.location_name) return s.location_name;
  return "—";
}

function StaffTab() {
  const { t } = useTranslation();
  const locationId = useLoc();
  const canEdit = usePermission("people.edit_roster");
  const qc = useQueryClient();
  const { data, isLoading } = useStaff(locationId ?? null);
  const { data: sites } = useSites();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<StaffRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.staff(locationId ?? null) });
    void qc.invalidateQueries({ queryKey: queryKeys.people.departments() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.dashboard({ locationId: locationId ?? null }) });
  };

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateStaff({ id }),
    onSuccess: () => {
      toast.success(t("people.staff.deactivateSuccess"));
      setDeleteId(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <Empty>{t("people.staff.loading")}</Empty>;

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end gap-2">
          <ManageDepartmentsDialog />
          <StaffFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            sites={sites ?? []}
            locationId={locationId}
            onSaved={invalidate}
          />
        </div>
      )}
      {!data?.length ? (
        <Empty>{t("people.staff.empty")}</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t("people.staff.code")}</th>
                <th className="px-3 py-2 text-left">{t("people.staff.name")}</th>
                <th className="px-3 py-2 text-left">{t("people.staff.title")}</th>
                <th className="px-3 py-2 text-left">{t("people.staff.location")}</th>
                <th className="px-3 py-2 text-left">{t("people.staff.dept")}</th>
                <th className="px-3 py-2 text-left">{t("people.staff.status")}</th>
                {canEdit && <th className="px-3 py-2 text-right">{t("people.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 font-mono text-xs">{s.employee_code}</td>
                  <td className="px-3 py-2 font-medium">{s.full_name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.job_title ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground" title={formatStaffLocation(s)}>
                    {formatStaffLocation(s)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.department_names?.length ? s.department_names.join(", ") : s.department ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="uppercase text-[10px]">{s.status}</Badge>
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditRow(s)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(s.id)}>
                          <Trash2 className="h-3 w-3 text-rose-400" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <StaffFormDialog
          key={editRow.id}
          open
          onOpenChange={(o) => !o && setEditRow(null)}
          sites={sites ?? []}
          locationId={locationId}
          staff={editRow}
          onSaved={() => { setEditRow(null); invalidate(); }}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("people.staff.deactivateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("people.staff.deactivateDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deactivateMut.mutate(deleteId)}
              disabled={deactivateMut.isPending}
            >
              {t("people.staff.deactivateConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StaffFormDialog({
  open,
  onOpenChange,
  sites,
  locationId,
  staff,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: { id: string; code: string; name: string }[];
  locationId: string | null;
  staff?: StaffRow;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!staff;
  const [loc, setLoc] = useState(staff?.location_id ?? locationId ?? "");
  const [employeeCode, setEmployeeCode] = useState(staff?.employee_code ?? "");
  const [fullName, setFullName] = useState(staff?.full_name ?? "");
  const [jobTitle, setJobTitle] = useState(staff?.job_title ?? "");
  const { data: departments = [] } = useMasterDepartments({ enabled: open });
  const [departmentIds, setDepartmentIds] = useState<string[]>(staff?.department_ids ?? []);
  const [hireDate, setHireDate] = useState(staff?.hire_date ?? "");
  const [status, setStatus] = useState<(typeof STAFF_STATUSES)[number]>(
    (staff?.status as (typeof STAFF_STATUSES)[number]) ?? "active",
  );
  const [phone, setPhone] = useState(staff?.phone ?? "");
  const [email, setEmail] = useState(staff?.email ?? "");

  const m = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await updateStaff({
          id: staff!.id,
          fullName,
          jobTitle: jobTitle || null,
          departmentIds,
          hireDate: hireDate || null,
          status,
          phone: phone || null,
          email: email || null,
        });
        return;
      }
      if (!loc) throw new Error(t("people.staff.selectBranch"));
      await createStaff({
        locationId: loc,
        employeeCode,
        fullName,
        jobTitle: jobTitle || undefined,
        departmentIds,
        hireDate: hireDate || undefined,
        status,
        phone: phone || undefined,
        email: email || undefined,
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? t("people.staff.updateSuccess") : t("people.staff.createSuccess"));
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            <span className="ml-1.5">{t("people.staff.add")}</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("people.staff.edit") : t("people.staff.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!isEdit && (
            <>
              <div>
                <Label>{t("people.staff.branch")}</Label>
                <Select value={loc} onValueChange={setLoc}>
                  <SelectTrigger><SelectValue placeholder={t("people.staff.selectBranch")} /></SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("people.staff.code")}</Label>
                <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())} />
              </div>
            </>
          )}
          <div>
            <Label>{t("people.staff.name")}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("people.staff.title")}</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div>
              <Label>{t("people.staff.hireDate")}</Label>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label>{t("people.staff.dept")}</Label>
              <ManageDepartmentsDialog />
            </div>
            <DepartmentMultiSelect
              value={departmentIds}
              onChange={setDepartmentIds}
              departments={departments}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("people.staff.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as (typeof STAFF_STATUSES)[number])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAFF_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("people.staff.phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>{t("people.staff.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !fullName || (!isEdit && (!loc || !employeeCode))}
          >
            {m.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShiftsTab() {
  const { t } = useTranslation();
  const locationId = useLoc();
  const canEdit = usePermission("people.edit_roster");
  const qc = useQueryClient();
  const { data, isLoading } = useShifts(locationId ?? null);
  const { data: staffList } = useStaff(locationId ?? null);
  const [editShift, setEditShift] = useState<ShiftRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.people.shifts(locationId ?? null) });

  const mIn = useMutation({
    mutationFn: (id: string) => clockInShift({ id }),
    onSuccess: () => { toast.success(t("people.shifts.clockedIn")); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mOut = useMutation({
    mutationFn: (id: string) => clockOutShift({ id }),
    onSuccess: () => { toast.success(t("people.shifts.clockedOut")); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mCancel = useMutation({
    mutationFn: (id: string) => cancelShift({ id }),
    onSuccess: () => { toast.success(t("people.shifts.cancelled")); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteShift({ id }),
    onSuccess: () => {
      toast.success(t("people.shifts.deleteSuccess"));
      setDeleteId(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!locationId) {
    return <Empty>{t("people.shifts.selectBranch")}</Empty>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("people.shifts.rosterHint")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/daily-ops/roster">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="ml-1.5">{t("people.shifts.openRoster")}</span>
            </Link>
          </Button>
          {canEdit && (
            <NewShiftDialog locationId={locationId} staffList={staffList ?? []} onCreated={invalidate} />
          )}
        </div>
      </div>
      {isLoading ? (
        <Empty>{t("people.shifts.loading")}</Empty>
      ) : !data?.length ? (
        <Empty>{t("people.shifts.emptyRoster")}</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t("people.shifts.staff")}</th>
                <th className="px-3 py-2 text-left">{t("people.shifts.date")}</th>
                <th className="px-3 py-2 text-left">{t("people.shifts.starts")}</th>
                <th className="px-3 py-2 text-left">{t("people.shifts.ends")}</th>
                <th className="px-3 py-2 text-left">{t("people.shifts.role")}</th>
                <th className="px-3 py-2 text-left">{t("people.shifts.department")}</th>
                <th className="px-3 py-2 text-left">{t("people.shifts.status")}</th>
                <th className="px-3 py-2 text-right">{t("people.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(data as ShiftRow[]).map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 font-medium">
                    {s.staff?.full_name ?? t("people.shifts.unassigned")}
                    {s.staff?.employee_code ? (
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">{s.staff.employee_code}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{formatShiftDate(s.starts_at)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatShiftTime(s.starts_at)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatShiftTime(s.ends_at)}</td>
                  <td className="px-3 py-2 text-xs">{s.role_label ?? s.staff?.job_title ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{shiftDepartment(s)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="uppercase text-[10px]">{s.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      {canEdit && s.status !== "completed" && s.status !== "cancelled" && (
                        <Button size="sm" variant="ghost" onClick={() => setEditShift(s)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      {s.status === "scheduled" && (
                        <Button size="sm" variant="outline" onClick={() => mIn.mutate(s.id)} disabled={mIn.isPending}>
                          <LogIn className="h-3 w-3" /><span className="ml-1">{t("people.shifts.in")}</span>
                        </Button>
                      )}
                      {s.status === "in_progress" && (
                        <Button size="sm" variant="outline" onClick={() => mOut.mutate(s.id)} disabled={mOut.isPending}>
                          <LogOut className="h-3 w-3" /><span className="ml-1">{t("people.shifts.out")}</span>
                        </Button>
                      )}
                      {s.status !== "completed" && s.status !== "cancelled" && canEdit && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => mCancel.mutate(s.id)} disabled={mCancel.isPending}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteId(s.id)}>
                            <Trash2 className="h-3 w-3 text-rose-400" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editShift && locationId && (
        <EditShiftDialog
          shift={editShift}
          staffList={staffList ?? []}
          onClose={() => setEditShift(null)}
          onSaved={invalidate}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("people.shifts.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("people.shifts.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewShiftDialog({
  locationId,
  staffList,
  onCreated,
}: {
  locationId: string;
  staffList: StaffRow[];
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [staffId, setStaffId] = useState("");

  const m = useMutation({
    mutationFn: () =>
      createShift({
        locationId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        roleLabel: roleLabel || undefined,
        staffId: staffId || undefined,
      }),
    onSuccess: () => {
      toast.success(t("people.shifts.createSuccess"));
      setOpen(false);
      setStartsAt("");
      setEndsAt("");
      setRoleLabel("");
      setStaffId("");
      onCreated();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          <span className="ml-1.5">{t("people.shifts.add")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("people.shifts.add")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("people.shifts.staff")}</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder={t("people.shifts.selectStaff")} /></SelectTrigger>
              <SelectContent>
                {staffList.filter((s) => s.status === "active").map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.employee_code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>{t("people.shifts.starts")}</Label><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
          <div><Label>{t("people.shifts.ends")}</Label><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
          <div><Label>{t("people.shifts.role")}</Label><Input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} placeholder="e.g. Floor host" /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !startsAt || !endsAt}>
            {m.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditShiftDialog({
  shift,
  staffList,
  onClose,
  onSaved,
}: {
  shift: ShiftRow;
  staffList: StaffRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [startsAt, setStartsAt] = useState(toLocal(shift.starts_at));
  const [endsAt, setEndsAt] = useState(toLocal(shift.ends_at));
  const [roleLabel, setRoleLabel] = useState(shift.role_label ?? "");
  const [staffId, setStaffId] = useState(shift.staff_id ?? "__none__");

  const m = useMutation({
    mutationFn: () =>
      updateShift({
        id: shift.id,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        roleLabel: roleLabel || null,
        staffId: staffId && staffId !== "__none__" ? staffId : null,
      }),
    onSuccess: () => {
      toast.success(t("people.shifts.updateSuccess"));
      onClose();
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("people.shifts.edit")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("people.shifts.staff")}</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder={t("people.shifts.selectStaff")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("people.shifts.unassigned")}</SelectItem>
                {staffList.filter((s) => s.status === "active").map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.employee_code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>{t("people.shifts.starts")}</Label><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
          <div><Label>{t("people.shifts.ends")}</Label><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
          <div><Label>{t("people.shifts.role")}</Label><Input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !startsAt || !endsAt}>
            {m.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrainingTab() {
  const { t } = useTranslation();
  const locationId = useLoc();
  const canEdit = usePermission("people.edit_roster");
  const qc = useQueryClient();
  const { data, isLoading } = useTraining(locationId ?? null);
  const { data: staffList } = useStaff(locationId ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<TrainingRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.people.training(locationId ?? null) });

  const completeMut = useMutation({
    mutationFn: (id: string) => completeTraining({ id }),
    onSuccess: () => { toast.success(t("people.training.completeSuccess")); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTrainingEnrollment({ id }),
    onSuccess: () => {
      toast.success(t("people.training.deleteSuccess"));
      setDeleteId(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <Empty>{t("people.training.loading")}</Empty>;

  const now = Date.now();

  return (
    <div className="space-y-3">
      {canEdit && locationId && (
        <div className="flex justify-end">
          <TrainingFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            locationId={locationId}
            staffList={staffList ?? []}
            onSaved={invalidate}
          />
        </div>
      )}
      {!data?.length ? (
        <Empty>{t("people.training.empty")}</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t("people.training.course")}</th>
                <th className="px-3 py-2 text-left">{t("people.training.staff")}</th>
                <th className="px-3 py-2 text-left">{t("people.training.required")}</th>
                <th className="px-3 py-2 text-left">{t("people.training.status")}</th>
                <th className="px-3 py-2 text-left">{t("people.training.due")}</th>
                <th className="px-3 py-2 text-left">{t("people.training.score")}</th>
                <th className="px-3 py-2 text-right">{t("people.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(data as TrainingRow[]).map((row) => {
                const overdue = row.status !== "completed" && row.due_on && new Date(row.due_on).getTime() < now;
                return (
                  <tr key={row.id} className="border-t border-border hover:bg-surface/40">
                    <td className="px-3 py-2 font-medium">{row.course_name}</td>
                    <td className="px-3 py-2 text-xs">{row.staff?.full_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{row.required ? t("people.training.yes") : t("people.training.no")}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="uppercase text-[10px]">{row.status}</Badge>
                    </td>
                    <td className={`px-3 py-2 text-xs ${overdue ? "text-rose-400" : "text-muted-foreground"}`}>
                      {row.due_on ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums">{row.score ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {canEdit && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setEditRow(row)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteId(row.id)}>
                              <Trash2 className="h-3 w-3 text-rose-400" />
                            </Button>
                          </>
                        )}
                        {row.status !== "completed" && canEdit && (
                          <Button size="sm" variant="outline" onClick={() => completeMut.mutate(row.id)} disabled={completeMut.isPending}>
                            <CheckCircle2 className="h-3 w-3" /><span className="ml-1">{t("people.training.complete")}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editRow && locationId && (
        <TrainingFormDialog
          open
          onOpenChange={(o) => !o && setEditRow(null)}
          locationId={locationId}
          staffList={staffList ?? []}
          training={editRow}
          onSaved={() => { setEditRow(null); invalidate(); }}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("people.training.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("people.training.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TrainingFormDialog({
  open,
  onOpenChange,
  locationId,
  staffList,
  training,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  staffList: StaffRow[];
  training?: TrainingRow;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!training;
  const [staffId, setStaffId] = useState(training?.staff_id ?? "");
  const [courseName, setCourseName] = useState(training?.course_name ?? "");
  const [required, setRequired] = useState(training?.required ?? false);
  const [dueOn, setDueOn] = useState(training?.due_on ?? "");
  const [status, setStatus] = useState<(typeof TRAINING_STATUSES)[number]>(
    (training?.status as (typeof TRAINING_STATUSES)[number]) ?? "enrolled",
  );
  const [score, setScore] = useState(training?.score != null ? String(training.score) : "");

  const m = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await updateTrainingEnrollment({
          id: training!.id,
          courseName,
          required,
          dueOn: dueOn || null,
          status,
          score: score ? Number(score) : null,
        });
        return;
      }
      if (!staffId) throw new Error(t("people.training.selectStaff"));
      await createTrainingEnrollment({
        locationId,
        staffId,
        courseName,
        required,
        dueOn: dueOn || undefined,
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? t("people.training.updateSuccess") : t("people.training.createSuccess"));
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            <span className="ml-1.5">{t("people.training.add")}</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("people.training.edit") : t("people.training.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!isEdit && (
            <div>
              <Label>{t("people.training.staff")}</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder={t("people.training.selectStaff")} /></SelectTrigger>
                <SelectContent>
                  {staffList.filter((s) => s.status === "active").map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.employee_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{t("people.training.course")}</Label>
            <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("people.training.due")}</Label>
              <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </div>
            <div>
              <Label>{t("people.training.required")}</Label>
              <Select value={required ? "yes" : "no"} onValueChange={(v) => setRequired(v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">{t("people.training.yes")}</SelectItem>
                  <SelectItem value="no">{t("people.training.no")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("people.training.status")}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as (typeof TRAINING_STATUSES)[number])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRAINING_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("people.training.score")}</Label>
                <Input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !courseName || (!isEdit && !staffId)}>
            {m.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceTab() {
  const { t } = useTranslation();
  const locationId = useLoc();
  const canCorrect = usePermission("attendance.correct");
  const canImport = usePermission("attendance.import");
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useAttendanceDailySummary(locationId ?? null);
  const { data: exceptions } = useAttendanceExceptions(locationId ?? null);
  const { data: staffList } = useStaff(locationId ?? null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<AttendanceRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceSummary(locationId ?? null) });
    void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceExceptions(locationId ?? null) });
  };

  const genMut = useMutation({
    mutationFn: () => {
      if (!locationId) throw new Error(t("people.attendance.selectBranch"));
      return generateAttendanceSummary({ locationId, workDate: today });
    },
    onSuccess: (r) => {
      toast.success(t("people.attendance.generateSuccess", { count: r.processed }));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAttendanceSummary({ id }),
    onSuccess: () => {
      toast.success(t("people.attendance.deleteSuccess"));
      setDeleteId(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!locationId) return <Empty>{t("people.attendance.selectBranch")}</Empty>;
  if (isLoading) return <Empty>{t("people.attendance.loading")}</Empty>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("people.attendance.summaryHint", { count: exceptions?.length ?? 0 })}
        </p>
        <div className="flex gap-2">
          {canCorrect && (
            <AttendanceFormDialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              locationId={locationId}
              staffList={staffList ?? []}
              onSaved={invalidate}
            />
          )}
          {canImport && (
            <Button size="sm" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
              {t("people.attendance.generateToday")}
            </Button>
          )}
        </div>
      </div>
      {!data?.length ? (
        <Empty>{t("people.attendance.empty")}</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t("people.attendance.staff")}</th>
                <th className="px-3 py-2 text-left">{t("people.attendance.date")}</th>
                <th className="px-3 py-2 text-left">{t("people.attendance.status")}</th>
                <th className="px-3 py-2 text-left">{t("people.attendance.lateMin")}</th>
                <th className="px-3 py-2 text-left">{t("people.attendance.missedPunch")}</th>
                {canCorrect && <th className="px-3 py-2 text-right">{t("people.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {(data as AttendanceRow[]).map((row) => (
                <tr key={row.id} className="border-t border-border/50">
                  <td className="px-3 py-2">{row.staff?.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{row.work_date}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{row.status}</Badge></td>
                  <td className="px-3 py-2">{row.late_minutes}</td>
                  <td className="px-3 py-2">{row.missed_punch ? t("people.training.yes") : t("people.training.no")}</td>
                  {canCorrect && (
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditRow(row)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(row.id)}>
                          <Trash2 className="h-3 w-3 text-rose-400" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <AttendanceFormDialog
          open
          onOpenChange={(o) => !o && setEditRow(null)}
          locationId={locationId}
          staffList={staffList ?? []}
          record={editRow}
          onSaved={() => { setEditRow(null); invalidate(); }}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("people.attendance.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("people.attendance.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AttendanceFormDialog({
  open,
  onOpenChange,
  locationId,
  staffList,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  staffList: StaffRow[];
  record?: AttendanceRow;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!record;
  const [staffId, setStaffId] = useState(record?.staff_id ?? "");
  const [workDate, setWorkDate] = useState(record?.work_date ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<(typeof ATTENDANCE_STATUSES)[number]>(
    (record?.status as (typeof ATTENDANCE_STATUSES)[number]) ?? "present",
  );
  const [lateMinutes, setLateMinutes] = useState(String(record?.late_minutes ?? 0));
  const [missedPunch, setMissedPunch] = useState(record?.missed_punch ?? false);

  const m = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await updateAttendanceSummary({
          id: record!.id,
          status,
          lateMinutes: Number(lateMinutes) || 0,
          missedPunch,
        });
        return;
      }
      if (!staffId) throw new Error(t("people.attendance.selectStaff"));
      await createAttendanceSummary({
        locationId,
        staffId,
        workDate,
        status,
        lateMinutes: Number(lateMinutes) || 0,
        missedPunch,
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? t("people.attendance.updateSuccess") : t("people.attendance.createSuccess"));
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            <span className="ml-1.5">{t("people.attendance.add")}</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("people.attendance.edit") : t("people.attendance.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!isEdit && (
            <>
              <div>
                <Label>{t("people.attendance.staff")}</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger><SelectValue placeholder={t("people.attendance.selectStaff")} /></SelectTrigger>
                  <SelectContent>
                    {staffList.filter((s) => s.status === "active").map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.employee_code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("people.attendance.date")}</Label>
                <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <Label>{t("people.attendance.status")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as (typeof ATTENDANCE_STATUSES)[number])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTENDANCE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("people.attendance.lateMin")}</Label>
              <Input type="number" min={0} value={lateMinutes} onChange={(e) => setLateMinutes(e.target.value)} />
            </div>
            <div>
              <Label>{t("people.attendance.missedPunch")}</Label>
              <Select value={missedPunch ? "yes" : "no"} onValueChange={(v) => setMissedPunch(v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">{t("people.training.yes")}</SelectItem>
                  <SelectItem value="no">{t("people.training.no")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || (!isEdit && !staffId)}>
            {m.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function downloadCsv(content: string, filename: string) {
  downloadCsvContent(content, filename);
}

const PEOPLE_SAMPLE_DOWNLOADS = {
  staff: { build: buildStaffSampleCsv, filename: "staff-directory-sample.csv" },
  rosterDated: { build: buildRosterDatedSampleCsv, filename: "roster-dated-sample.csv" },
  rosterWeekly: { build: buildRosterWeeklySampleCsv, filename: "roster-weekly-sample.csv" },
} as const;

function PeopleSampleDownloadMenu() {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Download className="h-3.5 w-3.5" />
          <span className="ml-1.5">{t("people.downloadSample")}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => downloadCsv(PEOPLE_SAMPLE_DOWNLOADS.staff.build(), PEOPLE_SAMPLE_DOWNLOADS.staff.filename)}
        >
          {t("people.sampleStaff")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            downloadCsv(PEOPLE_SAMPLE_DOWNLOADS.rosterDated.build(), PEOPLE_SAMPLE_DOWNLOADS.rosterDated.filename)
          }
        >
          {t("people.sampleRosterDated")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            downloadCsv(PEOPLE_SAMPLE_DOWNLOADS.rosterWeekly.build(), PEOPLE_SAMPLE_DOWNLOADS.rosterWeekly.filename)
          }
        >
          {t("people.sampleRosterWeekly")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ImportCsvDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"staff" | "roster">("staff");
  const [rosterFormat, setRosterFormat] = useState<"dated" | "weekly">("dated");
  const [month, setMonth] = useState("2026-06");
  const qc = useQueryClient();
  const locationId = useLoc();

  const m = useMutation({
    mutationFn: async (csv: string) => {
      if (kind === "staff") return importStaffCsv({ csv });
      return importRosterCsv({
        csv,
        month: rosterFormat === "weekly" ? month || undefined : undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(t("people.importSuccess", { count: res.imported }));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: queryKeys.people.staff(locationId ?? null) });
      void qc.invalidateQueries({ queryKey: queryKeys.people.dashboard({ locationId: locationId ?? null }) });
      void qc.invalidateQueries({ queryKey: queryKeys.people.shifts(locationId ?? null) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => m.mutate(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const downloadCurrentTemplate = () => {
    if (kind === "staff") {
      downloadCsv(PEOPLE_SAMPLE_DOWNLOADS.staff.build(), PEOPLE_SAMPLE_DOWNLOADS.staff.filename);
      return;
    }
    const rosterKey = rosterFormat === "weekly" ? "rosterWeekly" : "rosterDated";
    downloadCsv(PEOPLE_SAMPLE_DOWNLOADS[rosterKey].build(), PEOPLE_SAMPLE_DOWNLOADS[rosterKey].filename);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="h-3.5 w-3.5" />
          <span className="ml-1.5">{t("people.importCsv")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("people.importTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">{t("people.importHelp")}</p>
          <div className="flex gap-2">
            <Button size="sm" variant={kind === "staff" ? "default" : "outline"} onClick={() => setKind("staff")}>
              {t("people.tabs.staff")}
            </Button>
            <Button size="sm" variant={kind === "roster" ? "default" : "outline"} onClick={() => setKind("roster")}>
              {t("people.tabs.shifts")}
            </Button>
          </div>
          {kind === "roster" && (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={rosterFormat === "dated" ? "default" : "outline"}
                  onClick={() => setRosterFormat("dated")}
                >
                  {t("people.sampleRosterDated")}
                </Button>
                <Button
                  size="sm"
                  variant={rosterFormat === "weekly" ? "default" : "outline"}
                  onClick={() => setRosterFormat("weekly")}
                >
                  {t("people.sampleRosterWeekly")}
                </Button>
              </div>
              {rosterFormat === "weekly" && (
                <div>
                  <Label>{t("people.importMonth")}</Label>
                  <Input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-06" />
                </div>
              )}
            </>
          )}
          <Button type="button" size="sm" variant="outline" onClick={downloadCurrentTemplate}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("people.downloadTemplateForKind")}
          </Button>
          <div>
            <Label>{t("people.importFile")}</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              disabled={m.isPending}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PeoplePage;
