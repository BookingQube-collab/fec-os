# Import employee roster

**People → Import roster** — canonical HR roster upload.

**Purpose.** Upload the E3 Employee Roster workbook, preview matches, then confirm. This does not replace the Daily Ops shift calendar.

### Period

Choose **Weekly** or **Monthly**, then week start (Sunday) or month. Shift rows are matched and saved for that period only.

### Download sample

1. Click **Download sample**.
2. Choose **All locations** or **One site**.
3. Download. The workbook is the E3 date-wise roster (`Date Wise Roster` sheet) for the selected week or month: **DATE**, **DAY**, **EMPLOYEE**, **POSITION**, **LOCATION**, **SHIFT**, **STATUS**. Names, positions, and locations come from saved staff.
4. Fill **SHIFT** (for example `12:00 PM–10:00 PM` or `DAY OFF`) and **STATUS** (`WORKING` or `OFF`) only.

The sample is a roster template from the directory. **It does not include salary.** Weekly download lists Sunday–Saturday; monthly lists every day in that month.

### Import

1. Choose **Weekly** or **Monthly**.
2. Drop or choose `.xlsx`, `.xls`, `.csv`, or HTML export (or a folder). Fingerprint templates are not used here.
3. Preview starts automatically.
4. If Location or Employee Name cannot be detected, **Map columns** (the map is remembered).
5. Choose **Safe Sync** (venue roles can only use this) or **Authoritative Replace** (then confirm permanent delete of unreferenced missing staff).
6. Review tabs: New, Updates, Unchanged, Review, Missing.
7. **Confirm import**.

**Safe Sync** — create new, update matched, archive missing staff at uploaded locations. No permanent delete.

**Matching** — QID first, then phone and name. The Excel `#` column is not an employee id. Name + location is a further fallback. Ambiguous or conflicting rows land in **Review**.

**After confirm** — import history with **Roll back**. Shift rows for the period are saved when they match.

---
