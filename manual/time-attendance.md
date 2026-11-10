# Time & Attendance

**People → Time & Attendance**

**Purpose.** Combine ZKTeco punches with employee records, flag exceptions, and export HR workbooks.

Tabs: **Dashboard**, **Import**, **Attendance**, **Mapping**, **Corrections**, **Field**, **Settings**.

User IDs are never matched company-wide. Mapping is **company + site + device + User ID**.

### Dashboard

Tiles for a date, month, or imported period: Employees, Present, Absent, Late, Missed punches, Unmatched User IDs, pending corrections. Attendance by site, watchlist (frequent late / missed). Unmapped punches stay in Unmatched until Mapping.

### Import

1. **Company** → **Site** → **Device**.
2. **Period** — Weekly or Monthly (only punches in that window are imported).
3. **Files** — `user.dat`, `*_attlog.dat`, Excel, or CSV. **Choose files** or **Choose folder**. Do not upload fingerprint/face templates (`template.fp10`).
4. **Preview**, then **Confirm import**. The daily register is built automatically.

USB / file import is the reliable fallback if the device does not push over Wi‑Fi.

### Attendance

Daily register after biometric and file import (this tab was previously labelled Reports). Staff names appear once User IDs are mapped.

**Listing columns** (same layout as People attendance records):

| Column | Format |
| --- | --- |
| Location | Venue |
| User Name | Mapped name, or Unmapped |
| Date | DD-MM-YYYY |
| First Check-In | HH:MM:SS AM/PM |
| Last Check-Out | HH:MM:SS AM/PM |
| Total Hours Worked | Hours |
| Overtime | Yes/No |
| Overtime Hours | Hours when overtime applies |
| Status | Colour pills |

Filters: location chips (All locations or a site), staff search (name, employee code, QID), From / To, status.

Export **Excel**, **CSV**, **PDF**.

**Remove all** (import permission) permanently deletes punch logs, daily summaries, import files, and corrections for the selected site — or every accessible attendance site when All locations is selected. Staff roster, locations, devices, and biometric mapping are **not** deleted.

Statuses include Present, Absent, Weekly off, Public holiday, leave types, Late, Early departure, Missed punch, Incomplete, Overtime, Review required, Unscheduled.

### Mapping

**Biometric user mapping.** Filter by location; search name, employee code, or QID. Map User ID to employee, **Save map** or **Save all**. **Unmap** / **Remove name** (does not delete punch history). Roaming staff show a **Multi-site** badge and appear in every site’s employee list.

Map each punch site’s User ID to the same staff record.

### Corrections

Supervisors submit; HR/admin **Approve** or **Reject**. You cannot approve your own request. Raw punches are not overwritten.

### Settings

Companies, sites, ZKTeco devices, ADMS push, shift templates, duplicate-window rules.

#### ZKTeco / ADMS device card

On each device row you can:

- See **Online** / **Offline** (the terminal is online while it is polling FEC-OS).
- Enter **Device serial (SN)** from the terminal’s System Info and click **Save SN**.
- Click **Fetch punches** when the device is online. That **queues** a command until the device next polls. Reports stay empty until punches arrive. Status examples: waiting for poll, then waiting for punch upload.
- If the device never polls, use **Import** (USB dump of `user.dat` / attlog) as fallback.

**Cloud Server / ADMS (operator steps on the BioPro SA40)**

1. Connect the terminal to venue Wi‑Fi (COMM → WLAN).
2. Menu → COMM. → Cloud Server Setting (or ADMS).
3. Domain Name **ON**, Proxy **OFF**. Server Address = hostname only (shown on Settings — no `https://`, no path). Server Port **443**. HTTPS **ON** if the firmware shows it.
4. Paste the SN onto the matching device row and **Save SN**.

FEC-OS cannot open a direct TCP connection to the device from the hosted app. USB import remains the fallback.

**Add device** — site, device code, name, optional SN. **Add Ramadan shift example** for a shorter shift template.

### Field & attendance controls

**People → Time & Attendance → Field**

Operational hub for geofencing, GPS tracking, face enrollment, offline check-in queue, and payroll readiness.

| Feature | What to do | Limit |
| --- | --- | --- |
| Geofencing | Settings → HR rules / Site geofences: set lat/lng + radius, Operate or Restrict, then **Active**. | One circle per site. Confirm coordinates; seeds are approximate. ZKTeco punches have no GPS, so fence evaluation applies to **app check-in** only. |
| GeoTracking | Field → **Check in**, **Check out**, or **Location ping** on a phone (login must be linked to a staff row). Last-known map + table refresh about every 30s. Roaming technicians show Multi-site. | Not live hardware tracking. Positions exist only after someone reports location from the browser. |
| Face recognition | Enroll a selfie on Field or the staff profile. Optional liveness (move slightly). Turn on **Require selfie on app check-in** in Settings. | Enrollment + client liveness only. FEC-OS does **not** identify employees from photos. |
| Biometric / payroll | Mapping is unchanged. Attendance → **Payroll workbook**, or Field payroll card. Rows are blocked if missed punch or review-required. | Integrates ZKTeco daily totals with payroll export; it does not post into a third-party payroll product. |
| Notifications | In-app on correction submit/approve/reject, geofence exit / restricted area, and **Notify late / missed punches**. Toggles live under Settings → HR rules. Open **Notifications** (people category). | In-app first. Email/SMS follow each user’s notification preferences if those channels are already on. |
| Dashboards | T&A Dashboard: history / field visits / upcoming roster tiles and chart. | Upcoming counts roster rows for the next 7 days. Visits count app GPS events, not BioPro punches. |
| Offline & sync | Installable PWA. If the phone is offline, check-ins sit in a **Pending sync** tray on this device and flush when online. | Browser queue only. BioPro terminals do not work offline through Vercel. |
| Customisable | Settings → **HR rules**: default radius, duplicate-punch window, notification toggles, GPS/face requirements, plus per-site geofences and existing shift templates. | Org structure is still Locations + roaming work sites. |

Apply migration `20260829120000_hr_field_attendance_controls.sql` (`npm run db:push`) before geofences and GPS events persist.

---
