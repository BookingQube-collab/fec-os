"use client";

import { useQuery } from "@tanstack/react-query";

import { getMyAttendance, getMyEmployeeProfile, getMyRoster } from "@/lib/hr-employee.functions";
import { getLeaveBalanceSummary, listLeaveRequests } from "@/lib/hr-leave.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

import { useIssues } from "./useIssues";

/** Same key as /hr/me so the profile is fetched once. */
export function useMyEmployeeProfile(enabled = true) {
  return useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "my-profile" }),
    queryFn: () => getMyEmployeeProfile(),
    staleTime: STALE.people,
    enabled,
  });
}

/** Own biometric attendance for a date range (defaults to the current FEC month). */
export function useMyAttendance(
  enabled = true,
  range?: { dateFrom: string; dateTo: string } | null,
) {
  return useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "my-attendance",
      dateFrom: range?.dateFrom ?? null,
      dateTo: range?.dateTo ?? null,
    }),
    queryFn: () =>
      getMyAttendance(range ? { dateFrom: range.dateFrom, dateTo: range.dateTo } : {}),
    staleTime: STALE.people,
    enabled,
  });
}

/** Own roster assignments for a date range (defaults to the current FEC month). */
export function useMyRoster(
  enabled = true,
  range?: { dateFrom: string; dateTo: string } | null,
) {
  return useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "my-roster",
      dateFrom: range?.dateFrom ?? null,
      dateTo: range?.dateTo ?? null,
    }),
    queryFn: () => getMyRoster(range ? { dateFrom: range.dateFrom, dateTo: range.dateTo } : {}),
    staleTime: STALE.people,
    enabled,
  });
}

/** Own leave requests — `mineOnly` even for managers who open this view. */
export function useMyLeaveRequests(enabled = true) {
  return useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "my-leave" }),
    queryFn: () => listLeaveRequests({ mineOnly: true }),
    staleTime: STALE.people,
    enabled,
  });
}

/** Leave balances for self, or a team subject when `staffId` is provided. */
export function useMyLeaveBalances(enabled = true, staffId?: string | null) {
  return useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({
      mine: !staffId,
      staffId: staffId ?? null,
    }),
    queryFn: () => getLeaveBalanceSummary(staffId ? { staffId } : {}),
    staleTime: STALE.people,
    enabled,
  });
}

/** Tickets the employee reported or that are assigned to them. */
export function useMyIssues(enabled = true) {
  return useIssues({ mine: true, pageSize: 12 }, { enabled });
}
