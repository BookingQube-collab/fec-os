"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { ME_PUNCH_APPROVALS_HREF } from "@/lib/attendance-hr/missed-punch-approval";

/** Legacy Time & Attendance Corrections desk → My Day Correction / Approve. */
export default function AttendanceCorrectionsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(ME_PUNCH_APPROVALS_HREF);
  }, [router]);
  return null;
}
