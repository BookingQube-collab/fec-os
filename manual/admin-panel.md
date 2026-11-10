# Administration panel — how to use each page

This guide covers every page in the **Administration** section of the sidebar. Labels match the English product UI. Open the app, sign in, and use the left navigation. The Administration group is shown when your role can open at least one page in it.

Default access (before anyone changes toggles on Roles & access):

| Role | What they see in Administration |
| --- | --- |
| CEO, COO | Settings, Roles & access, AI Integrations, Diagnostics, API Explorer, Planned Notifications, Weekly Reports |
| Regional Operations | Settings, Roles & access, Diagnostics, API Explorer, Planned Notifications, Weekly Reports. The AI Integrations card is hidden, and the page itself refuses anyone below role level 95. |
| General Manager | Planned Notifications and Weekly Reports (review included). Not Settings. |
| Duty Manager, Auditor | Planned Notifications (view) and Weekly Reports (view; Duty Manager can also submit). Sync and Dispatch on Planned Notifications are rejected by the server. |
| CFO, HR, and floor roles | Administration settings are not in the menu. Payroll itself is under **People → Payroll**, not here. |

If a CEO changes a green tick or red cross on **Roles & access**, that override replaces the defaults above for that role.

## Remove all payroll (clean retest)

**Where:** Administration → **Settings** (`/admin`). The card is titled **Remove all payroll**. It is shown only when you can both open Administration (`admin.view`) and generate payroll (`payroll.generate`). With the default role map that is **CEO and COO**.

**What it is for:** Delete every payroll run so you can run payroll again from scratch. It is not the per-period delete on People → Payroll. That per-period delete only works for draft, attendance validation, and HR review, and it refuses locked or paid runs. This Settings action removes those too.

**How to run it**

1. Open **Administration → Settings** (`/admin`).
2. Find the **Remove all payroll** card (red border).
3. Click **Remove all payroll**.
4. Read the dialog. It says the action cannot be undone and lists what is removed and what is kept.
5. Type `REMOVE ALL PAYROLL` exactly (capital letters). The confirm button stays disabled until that phrase matches. Spaces at the ends are ignored; any other text is not accepted.
6. Click **Remove all payroll** in the dialog.
7. A success message lists how many periods, lines, payslips, locks, adjustments, overrides, import batches, payslip files, and payroll notifications were removed, and how many overtime claims and air-ticket payroll links were released.
8. **Cancel** closes the dialog and deletes nothing. Closing the dialog clears the typed phrase.

The server checks the same two permissions. Someone who only has one of them, or who calls the action without the phrase, is rejected. The action is the server function `resetAllPayroll` in `src/lib/hr-payroll.functions.ts` (same pattern as the existing single-period delete). There is no separate public HTTP route.

### Removed

- All payroll periods, including draft, in review, processed, paid, locked, and Excel-imported runs
- Payroll lines (removed with the periods)
- Payslips, and stored payslip files whose path starts with `payroll/` in the employee-documents bucket
- Payroll lock and reopen rows
- Payroll adjustments
- Line amount overrides
- Excel import batches
- In-app notifications whose source is a payroll period (delivery logs for those notifications go with them)

### Released, not deleted

- **Overtime claims** stay. Claims that were posted to payroll, or still linked to a payroll period, go back to **HR approved**, and the payroll link is cleared so a new run can pick them up.
- **Air-ticket issues** stay. If an issue was linked to a payroll period, that link is cleared and its payroll payment status returns to **unpaid**. Issues that were never linked to payroll are left as they are.

### Kept

- Employees, users, and roles
- Attendance, punches, device logs, and rosters
- Leave, documents, warnings, probation, resignations, and other HR records
- Payroll policy settings (currency, cycle, payment-method defaults)
- The audit log, including a new `hr.payroll.reset_all` entry

Run it again only if you want another empty payroll. It is safe to run when payroll is already empty: the counts come back as zero.

## Settings

**Route:** `/admin`  
**Menu:** Administration → Settings  
**Who:** CEO, COO, and Regional Operations (`admin.view`). The user list appears at role level 80 or higher. Below that, the page says you need executive or regional access.

**What it is for:** Assign roles to people, open the other administration tools, and (CEO/COO who also manage payroll) wipe payroll for a retest.

**How to open:** Sidebar → Administration → Settings.

**Main actions**

1. Use the cards at the top to open **Roles & access**, and, when your level allows, **AI Integrations** and **Diagnostics**.
2. If the browser can install the app, an **Install** card offers **Install app** (or **Add to Home Screen** on iPhone). If the app is already installed, the card only says so.
3. CEO or COO who can generate payroll also see **Remove all payroll**. See the section above.
4. The lower half lists users. Each row shows the display name, employee code, and current role badges.
5. To grant a role (controls are shown at role level 95 or higher): choose **Role**, choose **Scope** (**All branches** or one site), then **Grant**. A toast says **Role granted** and the badge appears.
6. To remove a role, click the trash icon on that badge. A toast says **Role removed**.

**Important fields**

- **Role** — one of CEO, COO, CFO, Regional Operations, General Manager, Duty Manager, Maintenance Supervisor, Maintenance Technician, Cashier / Host, Auditor, Human Resources, Customer Service.
- **Scope** — **All branches** stores no location limit. A specific site limits that role assignment to that branch.

**After save:** The role is stored immediately. The person must sign in again (or refresh their session) before new menus match the new role. There is no separate Save button for the whole page.

**Pitfalls**

- The grant and revoke buttons are shown for role level 95 (CEO and COO), but the server only accepts `admin.manage_roles`, which defaults to **CEO**. A COO who clicks Grant can get **Forbidden**.
- Regional Operations can open Settings and read the user list. They do not see Grant, and they do not see **Remove all payroll** unless payroll generation has been turned on for their role.
- This page does not edit passwords, create login accounts, or delete employees.
- Deleting a role badge removes that role assignment only. It does not delete the user.

## Roles & access

**Route:** `/admin/roles`  
**Menu:** Administration → Roles & access, or the card on Settings  
**Who:** Anyone with `admin.view` (CEO, COO, Regional Operations) can view. Only CEO (`admin.manage_roles`) can change toggles.

**What it is for:** Turn page and capability access on or off for each role. This is the override layer on top of the built-in role map.

**How to open:** Settings card **Roles & access**, or Administration → Roles & access.

**Main actions**

1. Choose a **Role** in the dropdown, or click a role in **All roles**. The badges show how many pages and capabilities that role can use.
2. Under **Pages & modules**, each row is a menu destination (route and capability name). A green tick means allowed. A red cross means denied.
3. If you are CEO, click the tick or cross. It saves immediately. There is no Save button.
4. Under **Capabilities**, the same tick/cross applies to each capability key, including ones that are not a menu page.
5. **Assign roles to users** goes back to Settings.

**Important fields:** The role selector, and each tick/cross. Green = allowed. Red = denied.

**After save:** The change is stored at once. A toast appears only if the save fails (**Could not save access change**). Other users pick up the new grants on their next permission refresh (typically a new request or a reload).

**Pitfalls**

- Viewers see the note that only the CEO can edit. Clicks do nothing for them.
- Turning off `admin.view` for your own role can hide this page from you.
- Turning on `payroll.generate` for a role that already has `admin.view` also lets that role use **Remove all payroll**.
- Page access and the capability list can disagree if you override only one of them. Check both sections when a menu item appears but an action is refused.

## AI Integrations

**Route:** `/admin/ai-integrations`  
**Menu:** Administration → AI Integrations. The Settings card is shown only at role level 95 or higher.  
**Who:** CEO and COO (role level 95 or higher). Everyone else sees: “Only CEO or COO (role level ≥ 95) can manage AI provider credentials.”

**What it is for:** Connect Gemini, Groq, and OpenRouter. Keys stay on the server. These providers feed AI Assist in other modules. This page does not run those assists itself.

**How to open:** Administration → AI Integrations, or the card on Settings.

**Main actions — Providers tab**

1. Open **Providers**.
2. For Gemini, Groq, or OpenRouter, turn **Enable provider** on or off.
3. Paste an **API key** (leave it blank to keep the saved key). Use the eye control to show or hide what you typed.
4. Choose **Default model**, or **Enter model manually** and type a model id.
5. Click **Save**. If a key already exists, confirm the replace dialog before the new key is stored.
6. Click **Test** (**Test Connection**). A toast reports success or the provider error.
7. Click **Refresh models** to reload the model list from the provider.
8. Click **Remove key** and confirm. The key is deleted; the provider stays listed as not configured.
9. Each provider card has a short how-to and a link to get a key.

**Main actions — AI Routing tab**

1. Choose the primary provider, or **None**.
2. Set timeout, retries, **Auto fallback**, and an optional monthly limit (empty means unlimited).
3. Click **Save**. A toast says the routing was saved.

**Main actions — AI Usage tab**

Read-only table: date, provider, model, module, success, fail, tokens, estimated cost, and latency. Empty until calls have been logged.

**Important fields:** API key, default model, enable switch, routing provider, timeout, retries, auto fallback, monthly limit.

**After save:** The key is stored encrypted on the server. The status badge moves among Connected, Not Configured, Disabled, Connection Failed, and Untested after a test. Other screens that use AI Assist start using the saved routing. This page does not rewrite old AI answers.

**Pitfalls**

- If the banner says `AI_CREDENTIALS_ENCRYPTION_KEY` is not set, do not save keys until that server setting exists.
- Replacing a key needs the confirm dialog. Cancel leaves the old key.
- Free-tier limits, model names, and provider terms change. The page disclaimer says to check the provider’s own pages.
- CFO and Regional Operations do not manage keys here, even if they can open other Administration pages.

## Diagnostics

**Route:** `/admin/diagnostics`  
**Menu:** Administration → Diagnostics. The Settings card is shown when you have diagnostics access and role level 80 or higher.  
**Who:** CEO, COO, and Regional Operations (`admin.diagnostics`), and role level at least 80. Others see that executive or regional access is required.

**What it is for:** See whether the app is healthy, review crash incidents, check that expected database tables exist, and read recent audit rows. The hub refreshes about every 30 seconds.

**How to open:** Administration → Diagnostics, or the card on Settings.

**Main actions**

1. Read the four tiles: database latency, open incidents, memory (heap), and the notification pipeline.
2. **Run scan** runs a health scan. A toast says the scan finished.
3. **Export CSV** downloads the crash incidents currently loaded.
4. **Self-healing** cards:
   - **Purge** clears server route and session cache entries. The toast includes how many were cleared.
   - **Alert** sends a crash alert to the configured recipients.
   - **Client** clears this browser’s cached app data and reloads the page. You stay signed in only if the session cookie is still valid; local caches are emptied.
   - **Resolve** marks all open incidents resolved.
5. Tabs:
   - **Incidents** — filter Open or All, refresh, and **Resolve** on one row.
   - **Schema** — each expected table is Present or Missing.
   - **Audit** — recent audit actions, who did them, and the reason when one was stored.

**Important fields:** Incident severity, status, route, and message. Schema rows are present or missing. You do not type a form on this page except the open/all filter.

**After an action:** Incidents and counts refresh. Resolve does not delete the incident row; it marks it resolved. Purge does not delete business data (payroll, staff, attendance). The client clear reloads this browser only.

**Pitfalls**

- **Alert** notifies people. Do not use it as a test unless you mean to.
- **Client** reload drops unsaved work in other tabs of this browser.
- A missing schema row means a migration has not been applied. This page does not apply migrations.
- CFO does not have this capability by default.

## API Explorer

**Route:** `/admin/api-explorer`  
**Menu:** Administration → API Explorer  
**Who:** CEO, COO, and Regional Operations (`admin.view`). Others see that API Explorer requires that access.

**What it is for:** Look up the documented HTTP routes and send a real request from the browser.

**How to open:** Administration → API Explorer.

**Main actions**

1. Search by path, method, or description.
2. Filter by category, or leave **All**.
3. Click an endpoint. The right side shows the method, path, auth requirement, and description.
4. Open **Try it**. Method, path, query string, headers, and body are filled from the example. Edit them if you need to.
5. Send the request. The **Response** tab shows status, headers, body, and how long it took.

**Important fields:** Method, path, query, headers (JSON), and body (JSON for writes). Auth labels tell you whether the route expects your session, an API key, a cron secret, or no auth.

**After send:** The request is executed against this app. A successful POST, PATCH, or DELETE changes data the same way the real screen would. GET reads data. The explorer does not add a second confirmation of its own.

**Pitfalls**

- Treat **Try it** as live. Do not send a delete or a cron sweep unless you intend that effect.
- Cron routes need the cron secret header. Your login session is not enough for those.
- A 401 or 403 means the route’s own permission check failed. Changing the method in the form does not grant you that permission.

## Planned Notifications

**Route:** `/notifications/planned`  
**Menu:** Administration → Planned Notifications  
**Who:** CEO, COO, Regional Operations, General Manager, Duty Manager, and Auditor can open the page (`notifications.planned.view`). **Sync reminders** and **Dispatch due** require `notifications.planned.manage` (CEO, COO, Regional Operations, General Manager).

**What it is for:** See upcoming reminders for AMC renewals, service schedules, compliance documents, and preventive-maintenance due dates, then send the ones that are due into the notification inbox.

**How to open:** Administration → Planned Notifications.

**Main actions**

1. Read the table: type, title, due date, scheduled time, and status. The list is upcoming reminders only.
2. Click **Sync reminders** to scan those sources and add new reminder rows. The toast says how many were created. Existing reminders are not duplicated.
3. Click **Dispatch due** to send reminders whose scheduled time has arrived. The toast says how many notifications were sent. They show up in the **Notifications** inbox (the link under the buttons).

**Important fields:** None to type. The table is the record.

**After sync or dispatch:** The table reloads. Dispatched items are notifications in the inbox. Sync does not email anyone by itself; dispatch creates the in-app notification.

**Pitfalls**

- An empty table is normal before the first sync. The page says to click **Sync reminders**.
- Duty Manager and Auditor see the buttons, but the server refuses Sync and Dispatch. Use a General Manager or an executive account.
- This page does not edit the underlying AMC contract, document, or PM record. Fix those in their own modules, then sync again.

## Weekly reports

These pages sit in the Administration sidebar group and also share a bar at the top of the weekly-reports area: **Supervisor Reports**, **Review Queue** (if you can review), and **Executive Reports** (if you can generate them). The page title is **Weekly Operations Reports**.

Default capabilities:

- View: CEO, COO, Regional Operations, General Manager, Duty Manager, Maintenance Supervisor, Auditor
- Submit: those, except Auditor
- Review: CEO, COO, Regional Operations, General Manager
- Executive generate: CEO, COO, Regional Operations

Anyone without view sees “You do not have access to weekly operations reporting.”

### Supervisor reports

**Route:** `/operations/weekly-reports`  
**Menu:** Administration → Weekly Reports, then the **Supervisor Reports** tab  
**Who:** Anyone with weekly-reports view.

**What it is for:** See one week of location reports and export that list.

**How to open:** Administration → Weekly Reports. The first tab is this list.

**Main actions**

1. Set **Week** (a date; the report week is the Monday of that week), **Location** (or all locations), and **Status** (or all statuses).
2. Read the table: location, week, status, revenue, footfall, complaints, priority. Open a row to view or edit it.
3. **Export PDF** or **Export Excel** downloads the rows currently filtered.
4. If you can submit, **Add new report** opens a blank form. On other weekly-report tabs, a smaller **Add new report** button does the same.

**Statuses you will see:** Draft, Submitted, Under Review, Sent Back, Approved, In Executive Report, Closed.

**After filters change:** The table reloads for that week and location. Export uses the same rows, not the whole history.

**Pitfalls**

- The week filter is a single date. Pick a day inside the week you want; the stored week starts on Monday.
- An empty table means no report for that week and filter, not that the module is broken. Use **Create your first weekly report** when it is shown.
- Auditor can view and export, not create.

### New or edit a supervisor report

**Routes:** `/operations/weekly-reports/new` and `/operations/weekly-reports/[id]`  
**Menu:** **Add new report**, or the sidebar item **New Report** when you can submit. Editing opens from a row on the list.  
**Who:** Submit capability to change a report. Viewers can open an existing report read-only.

**What it is for:** One location’s weekly operations report for Head of Operations and the executive pack.

**How to open:** **Add new report**, or click a report on the list.

**Main actions**

1. Work through the sections. A progress line shows how many are complete. **Quick fill** copies template hints into empty fields only.
2. **Save draft**. On a new report, the address changes to that report’s id and a toast says **Draft saved**. You can then attach photos.
3. **Add photo** after the first save (maintenance, incidents, or events; the hint says max 10 MB).
4. **Submit report**. A toast says **Report submitted** and you return to the supervisor list.

**Sections and fields**

- **Week & Location** — location, week starting Monday, submitted-by name.
- **KPI Snapshot** — revenue (QAR), footfall, and the numbers the executive dashboard reads.
- **People & Customer** — staff scheduled, staff present, absentees / late staff, complaint count, positive feedback, incident count and details. Attendance rate is calculated from present ÷ scheduled.
- **Operations** — maintenance issues, maintenance open, maintenance closed, compliance updates, compliance score (0–100), inventory / stock issues, cashier / POS issues, marketing / events.
- **Highlights** — top achievements, top challenges, support required, critical issues.
- **Next Week** — priority (critical, high, medium, low) and the action plan.
- **Attachments** — optional photos. Save a draft first.

**After save:** Draft stays editable. After submit, the report leaves the editable states. It can be edited again only if a reviewer **Send back** (status Sent Back) or while it is still Draft.

**Pitfalls**

- Photos on a brand-new form fail until you save a draft. The form says so.
- Submitted, under review, approved, included in the executive report, and closed reports are read-only until sent back.
- Two reports for the same location and week can be rejected by the server. If save fails, open the existing row instead of starting another new form.
- Revenue is QAR.

### Review queue

**Route:** `/operations/weekly-reports/review`  
**Menu:** **Review Queue** tab, shown when you can review  
**Who:** CEO, COO, Regional Operations, General Manager. Others who can open weekly reports but cannot review see “You do not have permission to approve or review reports.”

**What it is for:** Compare location reports for a week, write remarks, and move each report along.

**How to open:** Weekly reports → **Review Queue**.

**Main actions**

1. Set **Week starting (Monday)**.
2. Click **Review** on a row. The panel shows that location and week.
3. Type **Review remarks** and set **Priority** (critical, high, medium, low). The priority starts from the report’s current priority.
4. Choose one:
   - **Approve**
   - **Send back** — the supervisor can edit again
   - **Mark reviewed**
   - **Flag missing info**
   - **Add remarks** — saves an internal comment without the status buttons
5. A toast says **Review saved** or **Remarks saved**. The selection clears after a review action.

**After save:** The list reloads. Send back is what unlocks the supervisor form. Approve does not by itself generate the executive PDF; that is the next page.

**Pitfalls**

- Select a row before the buttons apply. With no selection, the panel only tells you to select a report.
- Remarks are the reviewer’s note. They are not a chat with the site unless the site opens the report and can see the sent-back state.
- Flag missing info marks the report; it does not email the supervisor from this screen.

### Executive reports

**Route:** `/operations/weekly-reports/executive`  
**Menu:** **Executive Reports** tab  
**Who:** CEO, COO, and Regional Operations can generate and delete (`weekly_reports.executive`). The tab is hidden without that capability.

**What it is for:** Build one CEO/GM pack for a week from the supervisor reports, then open, print, or download it.

**How to open:** Weekly reports → **Executive Reports**.

**Main actions**

1. Set **Week starting (Monday)**.
2. Click **Generate Executive Report**. On success you are taken to that report’s page. The toast says **Executive report generated**.
3. The table lists existing packs: week, mode (**AI generated** or **Rule-based synthesis**), and created time. **View report** opens one.
4. **Delete** asks you to confirm, then removes that executive pack only. Supervisor reports are not deleted. The toast says the delete succeeded.

**After generate:** You land on `/operations/weekly-reports/executive/[id]`. If some locations did not submit, the report can still be created and will say submissions are missing. Generation uses AI when AI Integrations is connected; otherwise it uses the rule-based summary.

**Pitfalls**

- Generating does not submit the site reports for you. Missing sites stay missing.
- Delete here removes the executive pack, not the supervisor weekly reports and not payroll.
- There is no separate publish button on the list. Opening the report is how you read it.

### One executive report

**Route:** `/operations/weekly-reports/executive/[id]`  
**Menu:** **View report** from the executive list  
**Who:** Same executive capability to delete. Anyone who can open the executive area can read a report they can reach.

**What it is for:** Read the consolidated week: location ranking, risks, decisions, and the head-of-operations assessment.

**How to open:** Executive list → **View report**.

**Main actions**

1. Read the report on the page.
2. **Print** uses the browser print dialog.
3. **Download PDF** saves a PDF of the structured report.
4. **Delete** confirms, removes this pack, and returns you to the executive list.
5. **Back to executive reports** returns to the list without deleting.

**After print or PDF:** Nothing is changed in the database. Delete is the only action here that removes data, and it removes this executive pack only.

**Pitfalls**

- If the page says the report was not found, it was deleted or the link is wrong. Go back to the list.
- A decision section can say there are no decisions for the week. That is an empty section, not an error.
- PDF download needs the report content to be in the structured form. If download fails, the toast shows the error; the on-screen report is still there.
