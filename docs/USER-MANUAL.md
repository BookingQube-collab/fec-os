# FEC-OS User Manual

**FEC Operations Command** — operator and administrator guide.

This manual describes what is in the live product. Menu labels match the English interface. What you can open depends on your role and assigned venues.

---

## 1. Overview

FEC-OS (Family Entertainment Center — Operations Command Center) is the day-to-day operating system for multi-location FECs. Duty managers, GMs, HR, maintenance, finance, and executives use it to run venues, people, maintenance, compliance, procurement, and events from one signed-in workspace.

**Who uses it**

| Role (as shown in the app) | Typical work |
| --- | --- |
| Duty Manager / General Manager | Daily ops, attendance import, incidents, maintenance requests, weekly reports |
| Human Resources | Staff directory, roster import, Time & Attendance mapping and reports, field geofence/GPS check-in, corrections |
| Maintenance Supervisor / Technician | Work orders, requests, logistics, snags, AMC schedule |
| Cashier / Host / Customer Service | Bookings, complaints, assigned tasks |
| Regional Operations / COO / CEO / CFO | Estate dashboards, revenue, decisions, compliance, administration |
| Auditor | Read-oriented compliance and attendance views |

**Main modules** (sidebar departments)

1. **Operations & Command** — Dashboard, Command Center, CEO, Daily Operations, Sites, Reports, Tasks, Supervisor, KPIs, Decisions, Notifications
2. **People & HR** — People, Import roster, Time & Attendance (including Field controls), Performance, Leaderboard, SOPs
3. **Maintenance & Facilities** — Facility Management, Snags, Issues, Maintenance (dashboard, requests, logistics, weekly reports)
4. **PR & Commercial** — Revenue, Forecasts
5. **Guest Experience** — Bookings, Customer, Purchase Orders
6. **Procurement** — Dashboard, Purchase Requisitions, Vendors, My Requests, My Approvals, Configuration
7. **Project Management** — Event portfolio, Events list, Calendar, My event tasks, Reports
8. **Compliance & Safety** — E3 Tracker, Inspections, Compliance Center, License Register, AMC Scheduler, documents, expiry, location tracker, risk register, calendar
9. **Utilities & Resources** — Utilities & Energy, Inventory
10. **Administration** — Settings, AI Integrations, Diagnostics, API Explorer, Planned Reminders, Weekly Reports

Amounts are in **QAR**.

---

## 2. Getting started

### Sign in

1. Open FEC-OS and choose **Sign in**.
2. Use email and password, **Continue with Google**, or **Sign in with this device** (Windows Hello / Face ID / Touch ID) if a passkey is saved.
3. Use **Forgot password?** to receive a reset link.
4. After a password sign-in you may be asked to **Save passkey** for this device.

If you see **Access pending**, your login works but no role is assigned. Contact your administrator.

### How the workspace is laid out

- **Sidebar** — icon rail by department (Operations & Command, People & HR, and so on). Hover or expand to open sub-pages. Use **Search modules…** or press `/` to jump to a page.
- **Top bar** — venue / **All locations**, language, notifications bell, **Surge mode**, help, sign out.
- **Surge ON** — tighter header and nav so exceptions stay in view.
- **Notifications** — bell for items that need you (approvals, assigned work, weekly reports). **View all** opens Inbox and Preferences (in-app / email).

You only see modules your role is allowed to use. Venue roles are limited to assigned sites.

---

## 3. Operations & Command

**Purpose.** See which venues need action, then drill into the site.

### Dashboard

Home estate health: work orders, overdue PMs, critical issues, staff on floor, revenue today, utility cost, expiring AMCs/documents, site readiness, assigned tasks. Period chips: Today, Yesterday, This week, This month.

### Command Center (`/occ`)

Tabs: **Venues**, **Exceptions**, **Protocols**.

- **Venues** — live rollup. Status: Needs action / On watch / On track. Search venues, open a site pack (tickets, incidents, work orders, attractions). Toggle surge for a branch when needed.
- **Handover** — from a venue pack, file shift handover notes for the next supervisor.
- **Exceptions** — estate-wide items that need attention.
- **Protocols** — step cards for guest-safety procedures (for example Lost Child).

### CEO

**Executive dashboard** with estate revenue, EBITDA, margin, branches, urgent tickets, incidents (24h). **Generate daily brief** and **P&L commentary**. Open **Open urgent tickets** and **Incidents — last 24 hours**.

### Sites

**Location performance** — league table and heat map for the last 30 days (revenue, margin, tickets, composite score). Views: Heat map, List.

### Reports

Download PDFs: **Board Pack**, **Branch League**, **Purchase Orders**, **Leakage Cases**. Knowledge-base upload and Q&A sit on the same page.

### Tasks

Opening / closing / hourly checklists with photo proof. Works offline; queued actions sync when the connection returns. Templates and spawned instances.

### Supervisor

**Supervisor Console** — today’s venue KPIs and issues. Select a venue in the top bar first. Export PDF / Excel.

### KPIs

KPI Engine: templates, period scores, **auto-score** from operations, export CSV. Linked to Performance scorecards.

### Decisions

Create a decision record, gather votes, generate an AI summary, update status.

### Notifications

Tabs **Inbox** and **Preferences**. Mark read / mark all read.

---

## 4. Daily Operations

**Purpose.** What needs you today at the venue: staff, incidents, maintenance, stock, and guest issues.

Tabs: **Dashboard**, **Roster**, **Briefings**, **Checklists**, **Incidents**, **Inventory**, **Maintenance**, **Complaints**.

### Dashboard

Venue status (Needs action / On watch / All clear), staff on duty, today’s briefing filed or missing, signals for incidents, urgent maintenance, reorders, complaints.

### Roster (operations shift calendar)

This is the **weekly shift calendar**, not the HR employee directory.

- Tabs: Shift schedule, Calendar, Location staff, Upload history, Generate roster.
- Pick a venue, then **AI Generate Roster** / **Auto-generate roster with AI**, review, **Confirm & save**.
- Upload CSV (staff must already exist in People). **Download Sample** (Roster by date / weekly). **Share to WhatsApp**.
- Manual **Add assignment** for one-off shifts.

### Briefings

**New briefing** — shift attendance counts, key notes, handover items. **AI Assist** can draft notes. Select venue from the header.

### Checklists

Opens **Supervisor checklist** for today (same offline checklist flow as Tasks).

### Incidents

**Report incident** — type, severity, description, action taken. **AI Assist**, then **Share on WhatsApp** or copy. Filter critical / last hours.

### Inventory (daily)

On-hand vs reorder for the branch. Jump to the full Inventory module. Import sheet / Download Sample.

### Maintenance (daily)

**Log issue** with photos; requests appear in Maintenance → Requests. **AI Assist** can classify category, area, and technician.

### Complaints (daily)

Open complaints and **Assign handler**. Full Customer module for intake.

---

## 5. People directory

**Purpose.** Staff master data, training, and the HR import path.

People tabs: **Dashboard**, **Staff**, **Training**. (Shifts and Attendance tabs are hidden duplicates; use Daily Ops roster and Time & Attendance instead. See **Extras (review)**.)

### Dashboard

Headcount (active, on leave, terminated), permanent vs temporary, missing QID / contact / joining date, salary spend by location (QAR), recent hires. Roaming technicians count on their **primary** location only.

### Staff

Directory with search (name, QID, code), filters (location, position, type, E3, active/inactive, missing info).

**What you can do**

- **Add staff** / **Edit staff** — code, name, QID, E3, type, contact, salary, title, location, department, hire date.
- **View** profile — personal, employment, work sites, attendance history, training, performance, transfers.
- **Transfer** location, **Archive** (deactivate), **Restore**.
- **Work sites** — extra punch venues; salary stays on primary. Mark **Roaming** so a venue Excel sync does not archive them.
- **Manage departments** — departments, sub-departments, yearly budget (QAR).
- **Export CSV** / **Export Excel**.
- On People, **Download Sample** / **Import CSV** remain for the older staff CSV path. Prefer **Import roster** for the Employee Roster workbook.

### Training

Enroll staff on courses, mark complete, scores and due dates.

### Staff profile

Open from Staff → View. Set work sites for roaming technicians (for example FEC technicians who punch at more than one venue). Map each site’s biometric User ID to the **same** person — do not create one employee per site.

### Extras (review)

**Pages to review** lists screens taken out of the main People menu because they duplicate another flow. Canonical paths: **Import roster** for the employee workbook; **Time & Attendance** for punches; **Daily Ops → Roster** for the operations calendar.

---

## 6. Import employee roster

**People → Import roster** — canonical HR roster upload.

**Purpose.** Upload the E3 Employee Roster workbook, preview matches, then confirm. This does not replace the Daily Ops shift calendar.

### Period

Choose **Weekly** or **Monthly**, then week start (Sunday) or month. Shift rows are matched and saved for that period only.

### Download sample

1. Click **Download sample**.
2. Choose **All locations** or **One site**.
3. Download. The workbook lists **saved employee names and locations** for the selected week or month.
4. Fill **shift start**, **shift end**, and **Duty (Yes/Off)** only.

The sample is a roster template from the directory. **It does not include salary.**

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

## 7. Time & Attendance

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

## 8. Performance, leaderboard, and SOPs

### Performance

**Employee Performance & Recognition.** Tabs: Dashboard, KRA Templates, KPI Templates, Assignments, Evaluations, Achievements, Employee of the Month.

- Assign a KRA + KPI scorecard to staff for the open cycle.
- Evaluations: draft → supervisor review → manager review → employee acknowledgement → finalized. **Refresh from operations** pulls attendance, checklists, complaints, and maintenance.
- Log achievements. Shortlist and approve Employee of the Month (eligibility uses attendance and score rules).
- Staff scoreboard / profile from evaluations.

### Leaderboard

**Staff Leaderboard** — rankings from tasks, incidents, complaints, and bookings. **Refresh scores**, Employee of the Month, recent activity.

### SOPs

**SOP Library** — published procedures, acknowledgments, pending and overdue. Open a document to read and acknowledge.

---

## 9. Maintenance & Facilities

### Facility Management

Open / overdue facility tasks, site readiness, categories (cleaning, HVAC, fire, CCTV, mall approvals). Shortcut to Snags.

### Snags

**Snag Register** — opening defects and contractor follow-up. **New snag** with optional photo. List or Kanban. Statuses from Open through Verified / Closed. Categories include civil, electrical, game machine, mall, and others.

### Issues

Ticket board: open → assigned → in progress → blocked → resolved. **New issue**, AI triage, priority.

### Maintenance

Tabs: **Dashboard**, **My queue**, **All work orders**, **Assets**, **PM schedules**, **Downtime**.

- **New work order** (corrective, preventive, inspection, installation). AI draft available.
- Status: planned, in progress, on hold, completed, cancelled.
- Assets registry; PM schedules and sweep; start/end downtime.

### Requests

**Maintenance Requests** — supervisors submit with photos and priority. Tabs: Requests, New request. Technicians **Accept** (creates a work order), **Start work**, upload before/after photos, **Mark completed**. Daily Ops **Log issue** feeds this queue.

### Logistics

Delivery requests for spare parts, tools, consumables, cleaning materials, safety equipment. Dispatch, warehouse review, signature pad, delivery photos.

### Weekly Report (maintenance)

Team weekly reports: list, new report, **Report Review**, **Executive Report**. Photos and KPIs for maintenance/logistics.

---

## 10. Inventory and utilities

### Inventory

**Inventory & Consumables.** Tabs: **Dashboard**, **Branch stock**, **Catalog**.

- Dashboard — reorder alerts, recent movements, units by branch, grip socks by size, stock health.
- Branch stock — on hand, size filter, **Add stock**, adjust quantity. Status: OK / Low / Out.
- Catalog — master items (grip socks and consumables), par / reorder, add/edit/archive.
- **Import sheet** — CSV or Excel (SKU, item name, size, branch, quantity, reorder). **Sample CSV**.

### Utilities & Energy

Electricity, water, internet, gas, and generator fuel. Cost this month, consumption, bills (QAR), high-usage alerts.

---

## 11. Procurement

**PR & Procurement Control.** Amounts in QAR.

### Dashboard

Open PRs, pending your approval, overdue, spend by department/site, vendor concentration, pipeline stages (Draft → Dept → GM → CEO → Finance → Approved → PO).

### Purchase Requisitions

List or cards. Search, filters (status, site, department, vendor, amount, dates). **New Request** / **New requisition**.

**Create a PR**

1. Describe what you need (site, quantity, when). **AI Assist** can fill department, type, priority, justification, and lines.
2. Review Details / Items / Payment / Files. Edit prices and vendors.
3. **Save draft** or **Submit for approval**.

Statuses include Draft, Submitted, Dept / GM / CEO / Finance review, Approved, Ordered, Returned, Rejected. Over-budget PRs need excess approval. PRs can link to an event.

### My Requests / My Approvals

Requester queue and approver queue. **Send back**, approve, reject.

### Vendors

**Vendor Ecosystem** — directory, AMC coverage, contacts. **New Vendor**, list/cards, filters (Active, Inactive, Near Expiry). Open a vendor for details.

### Configuration

**Delegation of authority** — amount bands (dept head, GM, CEO; finance always required), price-variance threshold, department yearly budgets.

### Purchase Orders (Guest Experience)

Separate **Purchase Orders** page: branch PO queue, **New PO**, **Mark received**. Complements approved PRs.

---

## 12. Project Management (Events)

**Purpose.** Plan and run events (birthdays, groups, productions) with gates, budget, and linked PRs / people / maintenance.

Nav: **Dashboard** (Event portfolio), **Events**, **Calendar**, **My event tasks**, **Reports**. **New event**.

### Event workspace

Open an event: **Home**, **Scope**, **Schedule**, **Budget**.

- Home — phase timeline (kickoff through close), priority actions, critical gates, workstreams (Procurement, People, Maintenance, Logistics). RAG health.
- Scope — deliverables, BOQ and permits.
- Schedule — WBS (phase, workstream, task, subtask), milestones.
- Budget — draft / approved / locked; contracted vs actual.

**Plan assist** can draft a plan; nothing saves until you confirm.

### Calendar / My event tasks / Reports

Calendar of events. Personal task list. Reports such as project status and finance views, with export and an optional AI brief.

---

## 13. Compliance & Safety

### E3 Tracker (Compliance tracker)

Tabs: Dashboard, Master Register, Maintenance contracts, Contract tracker, Vendor Register, Monthly Scheduler, Missing Documents, License Documents, QCDD, Fire Alarm, Pest Control, CCTV, Kitchen Compliance, Third Party Certification.

- **Master Register** — add/edit items, Google Drive links, **Import**, **Download Sample**, **Remove All**.
- Domain trackers filter the same register (AMC vs licenses).
- **License Documents** — browse Drive-linked files by location; edit links in Master Register.

### Inspections / AMC Scheduler

AMC service schedule, contracts, renewals (30 days), service history. **Add contract**, record payments, mark visits done, attach reports.

### Compliance Center

Incidents, Audits, Obligations, Mall requests.

### Other compliance pages

- **License Register** and **Legal Documents**
- **Expiry Alerts** / **Expiry Calendar**
- **Location Tracker**
- **Risk Register**
- **Compliance Calendar** (and Documents library)
- Global expiry banner when items are due

---

## 14. Guest Experience and commercial

### Bookings

Parties, groups, corporate, school. Pipeline: quote → deposit → confirmed → delivered (also cancelled / no-show). Tabs: Bookings, New booking.

### Customer

Complaints intake: walk-in, phone, email, social, survey. Statuses: new, investigating, resolved, escalated, dismissed. **AI Assist** for triage. **Resolve**.

### Revenue

Tabs: **BookingQube MTD**, **Branch P&L**, **Leakage**, **Asset ROI**. Sync BookingQube when permitted. Leakage cases and recovery. Amounts in QAR.

### Forecasts

**Forecast Scenarios** — what-if assumptions and AI commentary.

---

## 15. Administration

### Settings

**Administration** — grant or revoke roles and location scope (executive). **Install app** (PWA) when offered.

Roles include CEO, COO, CFO, Regional Operations, General Manager, Duty Manager, Maintenance Supervisor, Maintenance Technician, Cashier / Host, Auditor, Human Resources, Customer Service.

### AI Integrations

CEO/COO: Providers, AI Routing, AI Usage. Connect Gemini, Groq, OpenRouter. Keys stay on the server. **Test Connection**. Used by AI Assist across briefings, incidents, PRs, maintenance, events, and forecasts.

### Diagnostics

**System Diagnostics & Crash Hub** — health scan, crash incidents, schema checklist, audit stream, self-healing tools (executive).

### API Explorer

Try documented API routes (administrators).

### Planned Reminders

Scheduled in-app reminders.

### Weekly Reports (operations)

**My Reports**, **New Report**, **Review Panel**, **Executive Dashboard**.

Supervisor form: week and location, KPI snapshot, operations, people & customer, highlights, next week, optional photos. **Save draft** / **Submit report**. Reviewers send back or accept. Executives generate the weekly executive report (PDF / Excel).

---

## 16. Tips

- **Two rosters.** People → Import roster = HR employee workbook and duty Yes/Off. Daily Ops → Roster = who works which shift this week.
- **Attendance names.** If Attendance shows Unmapped, finish Mapping, then refresh.
- **Roaming technicians.** One staff record, extra work sites, map User ID at each punch site.
- **Fetch punches** only works while the device is **Online**. Otherwise USB import.
- **Venue vs HR.** Venue roles: assigned sites, Safe Sync only, cannot approve their own attendance correction.
- **AI Assist** drafts only — always review before Submit / Confirm.
- **Currency** is QAR unless a field says otherwise.

---

*FEC-OS · FEC Operations Command · Operator manual. Labels match the English product UI.*
