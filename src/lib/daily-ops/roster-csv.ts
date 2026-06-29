export function shiftsToCsv(
  rows: Array<{
    starts_at: string;
    ends_at: string;
    role_label: string | null;
    status: string;
    staff: { full_name: string; employee_code: string } | null;
    location: { code: string } | null;
  }>,
): string {
  const header = "location_code,employee_code,date,start_time,end_time,role_label,status";
  const lines = rows.map((row) => {
    const date = row.starts_at.slice(0, 10);
    const start = row.starts_at.slice(11, 16);
    const end = row.ends_at.slice(11, 16);
    const loc = row.location?.code ?? "";
    const code = row.staff?.employee_code ?? "";
    const role = (row.role_label ?? "").replace(/,/g, " ");
    return `${loc},${code},${date},${start},${end},${role},${row.status}`;
  });
  return [header, ...lines].join("\n");
}
