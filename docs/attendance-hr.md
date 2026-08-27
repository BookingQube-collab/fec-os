# Attendance consolidation & HR reporting

FEC-OS now includes a Time & Attendance module at **People → Time & Attendance** (`/people/attendance`).

## What it does

Site supervisors upload ZKTeco `user.dat` / `*_attlog.dat` files (or Excel/CSV) per **company + site + device**, or the device can **push** users and punches over Wi‑Fi using ADMS/iClock. HR maps biometric User IDs to employees, reviews exceptions, and exports a multi-sheet workbook.

User IDs are **never** matched company-wide. The identity key is:

`company_id + location_id + device_id + biometric_user_id`

## Roaming technicians (multiple punch sites)

Some staff (for example FEC technicians) punch at more than one venue. They have **one** `staff` row:

- `staff.location_id` = home / primary location (salary and roster headcount)
- `staff.is_roaming` = true so HTML/Excel roster sync **does not archive** them when they are missing from the 63-person venue sheet
- `staff_work_locations` = extra (and home) sites they can work and punch

Map each site’s biometric User ID to the **same** `staff_id`. Do not create one employee per site.

Attendance reports, daily summaries, and profile hours for that person include punches from every mapped site. Filtering the People directory by a site they work at still finds them. Salary / headcount by location counts them on the primary location only.

Edit work sites on **People → staff profile** (`people.edit_roster`). On Mapping, roaming staff appear in every location’s employee dropdown (badge: Multi-site).

### Map a roaming technician’s User IDs

1. Open **People → Time & Attendance → Mapping**.
2. Filter to the punch site (e.g. INF-CC, then KDS-CC, then UA-DM).
3. Find the biometric User ID for that device.
4. Search the employee dropdown for `FEC-TEC01` / Russell — the **Multi-site** badge marks roaming techs. They appear in every site dropdown.
5. Save (or Save all). Punches at that company+site+device+User ID attach to the **same** `staff_id`. Repeat per site; do not create extra staff rows.

## Sites (seeded as attendance-enabled)

1. InflataPark — City Center  
2. Kids Driving School — City Center  
3. Urban Arena — Doha Mall  
4. Carousel — Aspire Park  
5. Crayons & Bricks — Vendome Mall  
6. Crayons & Bricks — Dar Al Salam Mall  

Admin can add/edit/activate further sites and attach extra ZKTeco devices.

## Roles

| Role | Access |
| --- | --- |
| Site supervisor (`duty_manager`, `branch_gm`, `tech_supervisor`) | Assigned sites only. Upload files, view punches/reports, submit corrections. Cannot approve own correction or change global rules. |
| HR | All sites. Mapping, combined reports, approve corrections. |
| Admin (`ceo`, `coo`, `regional_ops`) | Sites, devices, sync settings, shifts, permissions. |
| Management (`ceo`, `coo`, `cfo`, `auditor`) | Read-only dashboard and summaries. |

## Automatic sync (ZKTeco BioPro SA40)

The browser cannot talk to the device. FEC-OS on Vercel also **cannot** open TCP **4370** to a private Wi‑Fi terminal.

| Path | Middleware PC? | What happens |
|------|----------------|--------------|
| USB dump → Import (`user.dat`, `*_attlog.dat`) | No | Keep using this; it remains the reliable fallback |
| **ADMS / Cloud Server push** | **No**, if firmware has ADMS | Device initiates HTTPS to `/iclock/cdata` and `/iclock/getrequest` |
| Pull SDK / pyzk / zkemkeeper on port 4370 | **Yes** — Windows service or Docker on the same LAN, or ZKBio Time | Not built in FEC-OS |

**SA40** datasheets list **ADMS** plus Wi‑Fi. Configure:

1. People → Time & Attendance → **Settings**: paste the device SN (System Info) onto the Inflatapark (or other site) device row.
2. On the device: **Menu → COMM. → Cloud Server Setting** (sometimes labelled **ADMS**).
3. Enable Domain Name **ON**, Server Address = FEC-OS hostname only (no `https://`, no `/iclock`), Server Port **443**, HTTPS **ON** if shown, Proxy **OFF**.
4. Set `ADMS_COMM_KEY` in the server environment and the same value on the device if **Server Auth** exists.
5. Device must reach the public host (venue Wi‑Fi with outbound 443, or VPN). Map User IDs as usual; a name change on the device does **not** clear `staff_id`.

### Fetch punches (click or daily)

Vercel cannot open TCP 4370. Instead HR queues a ZKTeco command; the terminal uploads when it next polls `/iclock/getrequest` (usually 1–2 minutes if `TransInterval=1`).

1. **Click:** People → Time & Attendance → Settings → **Fetch punches** on a device that has a serial number. That queues `DATA QUERY ATTLOG` for the last 48 hours.
2. **Daily:** Vercel Cron `GET /api/public/attendance-adms-poll` (see `vercel.json`) runs around 03:00 UTC / 06:00 Qatar and queues the last 24 hours for every ADMS device. Set `CRON_SECRET` in Vercel. Hobby cannot run hourly crons; for hourly, use an external scheduler (e.g. cron-job.org) against the same URL with `Authorization: Bearer $CRON_SECRET` and `?hours=3`.
3. Apply migration `20260824140000_attendance_adms_commands.sql` so pending commands persist.

Unknown serials are rejected (`AUTH_ERROR`). Fingerprint/face templates are not stored. If the firmware has no HTTPS/ADMS menu, keep USB import or add a small LAN agent later — do not expect the hosted Next.js app to poll 4370.

## Files

**Accepted:** `user.dat` (72-byte records), `*_attlog.dat` (tab-separated punches), `.xlsx` / `.xls`, `.csv` / `.tsv`.

**Rejected:** `template.fp10`, `template.fp10.1`, and other fingerprint/face templates. They are unnecessary and sensitive.

### user.dat

- Record size 72 bytes; file length must divide by 72  
- User ID: little-endian integer at offset 0  
- Name: null-terminated string at offset 11  
- Preview User ID + name before import  

### attlog

Example row:

```
9    2026-08-01 10:16:58    1    0    1    0
```

Parsed as User ID (trimmed), timestamp, verify method, in/out status, work code, reserved/device field.

## Reports

**People → Time & Attendance → Reports** (`/people/attendance/reports`) shows the daily register **after** import. Columns include mapped employee name (`staff.full_name`) and location (venue code + name). Unmapped punches show **Unmapped** for staff and still show the site. Filters: location (All + accessible roster venues), staff search (name / employee code / QID), date range, and status.

**Remove all** (`attendance.import`) purges imported attendance in the **current location scope** (the selected site, or every accessible attendance site when All is selected):

- Deletes: `attendance_logs`, `attendance_daily_summary`, `attendance_import_files` (and stored originals), `attendance_corrections`
- Does **not** delete: staff roster, locations, devices, biometric user mapping, leave/roster/holidays, other modules

Empty reports still show columns, filters, and Remove all. Import files first if the table is empty.

## Import wizard

1. Company → site → device  
2. Optional `user.dat` / employee Excel  
3. One or more attlog / Excel / CSV files (multiple devices/sites via repeated imports)  
4. Auto-detect columns  
5. Preview errors, duplicates, unmatched IDs  
6. Confirm  
7. Async process + daily recalculation  

Re-uploading the same file is idempotent (`punch_hash` = company + device + user + timestamp). Punches within the configured window (default 60s) are kept raw but excluded from totals until HR accepts them.

## Daily rules (all configurable)

- First valid punch = in, last = out  
- 0 punches on a **rostered** day = absent (never auto-absent without roster)  
- 1 punch = missed punch  
- Odd count = review  
- 2+ punches = complete; extras kept and flagged only if the extra-punch rule is on  
- Overnight shifts: out may be after midnight  

Statuses include present, absent, weekly off, public holiday, annual/sick/unpaid leave, late, early departure, missed punch, incomplete, overtime, review required, unscheduled.

Raw punches are never overwritten; corrections live in `attendance_corrections`.

## Field & attendance controls

**People → Time & Attendance → Field** plus **Settings → HR rules / Site geofences**.

- **Geofences:** one lat/lng + radius per site (`attendance_geofences`). Operate vs restrict. Evaluated on app GPS check-in, not ZKTeco punches.
- **GeoTracking:** `staff_location_events` last-known list/map. Roaming techs are the same staff row as Mapping.
- **Face:** `staff_face_enrollments` + optional client liveness. Not an identity-match pipeline.
- **Payroll export:** Attendance listing → Payroll workbook (`format=payroll`). Ready vs blocked (missed punch / review).
- **Notifications:** people-category in-app events (corrections, geofence exit, late/missed sweep).
- **Offline:** IndexedDB queue in the browser; flush on `online`. PWA installability unchanged; do not intercept Next.js navigations.
- **HR rules:** `hr_field_settings` + existing shift templates / duplicate window.

Schema: `supabase/migrations/20260829120000_hr_field_attendance_controls.sql`.

## Security

- Original files stored in private bucket `attendance-imports`, AES-256-GCM when `ATTENDANCE_FILE_ENCRYPTION_KEY` or `AI_CREDENTIALS_ENCRYPTION_KEY` is set  
- Role + location RLS (`user_can_access_attendance` includes HR/auditor for all sites)  
- Audit table `attendance_audit_events`  
- Server-side type/size/template checks; spreadsheet row cap  
- ADMS `/iclock/*`: unknown device SN rejected; optional `ADMS_COMM_KEY` and `ADMS_IP_ALLOWLIST`  

## Apply schema

```bash
npm run db:push
```

## Tests

Parsers and calculation rules: `src/lib/attendance-hr/attendance-hr.test.ts` using fixtures in `src/lib/attendance-hr/fixtures/` (`user.dat`, `JJA1251800498_attlog.dat`). Geofence inside/outside: `geofence.test.ts`. HR notification mapping: `hr-notify.test.ts`.
