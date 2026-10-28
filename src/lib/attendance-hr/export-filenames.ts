/** Lightweight export names — keep off the reports page static graph (no ExcelJS). */

export function e3AttendanceExportFilename(
  dateFrom: string,
  dateTo: string,
  kind: "xlsx" | "csv" | "pdf" | "payroll" | "employee" | "matrix" | "payroll-input" = "xlsx",
): string {
  const from = dateFrom.slice(0, 10);
  const to = dateTo.slice(0, 10);
  switch (kind) {
    case "csv":
      return `E3_HR_Attendance_${from}_to_${to}.csv`;
    case "pdf":
      return `E3_HR_Attendance_${from}_to_${to}.pdf`;
    case "payroll":
      return `E3_HR_Payroll_${from}_to_${to}.xlsx`;
    case "employee":
      return `E3_Employee_Summary_${from}_to_${to}.xlsx`;
    case "matrix":
      return `E3_Attendance_Matrix_${from}_to_${to}.xlsx`;
    case "payroll-input":
      return `E3_Payroll_Input_${from}_to_${to}.xlsx`;
    default:
      return `E3_HR_Attendance_${from}_to_${to}.xlsx`;
  }
}
