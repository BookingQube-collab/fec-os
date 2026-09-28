-- KRA scorecards from FEC_Master_KRA_Scorecard.xlsx (E3 site assessment v2, 28 Sep 2026).
-- Site tabs are the live master. Framework rows keep the historical cashier/attendant standard.
-- sop_reference stores workbook SOP codes only. Location SOP documents are not imported here.

CREATE TABLE IF NOT EXISTS public.kra_scorecard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  brand text NOT NULL,
  place_name text NOT NULL,
  sheet_title text NOT NULL,
  sop_label text NOT NULL DEFAULT 'SOP V1.1',
  baseline_note text NOT NULL DEFAULT '',
  usage_note text NOT NULL DEFAULT '',
  sort_order int NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.kra_scorecard_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.kra_scorecard_templates(id) ON DELETE CASCADE,
  item_no int NOT NULL,
  title text NOT NULL,
  sop_reference text NOT NULL DEFAULT '',
  target_standard text NOT NULL DEFAULT '',
  weight_cashier numeric NOT NULL DEFAULT 0,
  weight_attendant numeric NOT NULL DEFAULT 0,
  weight_supervisor numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, item_no)
);
CREATE TABLE IF NOT EXISTS public.kra_scorecard_framework_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_category text NOT NULL,
  sort_order int NOT NULL,
  title text NOT NULL,
  expected_standard text NOT NULL DEFAULT '',
  master_sheet_mapping text NOT NULL DEFAULT '',
  points numeric NOT NULL DEFAULT 0,
  how_to_rate text NOT NULL DEFAULT '',
  evidence_to_keep text NOT NULL DEFAULT '',
  UNIQUE (role_category, sort_order),
  CONSTRAINT kra_scorecard_framework_role_chk CHECK (role_category IN ('cashier', 'attendant', 'dual_role'))
);
CREATE TABLE IF NOT EXISTS public.kra_scorecard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.kra_scorecard_templates(id) ON DELETE RESTRICT,
  review_period text NOT NULL,
  reviewer_name text NOT NULL DEFAULT '',
  assigned_post text NOT NULL DEFAULT '',
  role_category text NOT NULL,
  cashier_share numeric NOT NULL DEFAULT 0.5,
  critical_status text NOT NULL DEFAULT 'pending',
  critical_evidence text NOT NULL DEFAULT '',
  agreed_action text NOT NULL DEFAULT '',
  follow_up text NOT NULL DEFAULT '',
  employee_ack_note text,
  employee_ack_at timestamptz,
  reviewer_approval_note text NOT NULL DEFAULT '',
  reviewer_approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kra_scorecard_reviews_role_chk CHECK (role_category IN ('cashier', 'attendant', 'dual_role', 'supervisor')),
  CONSTRAINT kra_scorecard_reviews_critical_chk CHECK (critical_status IN ('pending', 'clear', 'review_required')),
  CONSTRAINT kra_scorecard_reviews_share_chk CHECK (cashier_share >= 0 AND cashier_share <= 1),
  UNIQUE (staff_id, template_id, review_period)
);
CREATE TABLE IF NOT EXISTS public.kra_scorecard_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.kra_scorecard_reviews(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.kra_scorecard_items(id) ON DELETE RESTRICT,
  line_status text NOT NULL DEFAULT 'pending',
  actual_result text NOT NULL DEFAULT '',
  evidence text NOT NULL DEFAULT '',
  rating smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kra_scorecard_lines_status_chk CHECK (line_status IN ('pending', 'applicable', 'na')),
  CONSTRAINT kra_scorecard_lines_rating_chk CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  UNIQUE (review_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_kra_scorecard_items_template ON public.kra_scorecard_items (template_id, item_no);
CREATE INDEX IF NOT EXISTS idx_kra_scorecard_reviews_staff ON public.kra_scorecard_reviews (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kra_scorecard_lines_review ON public.kra_scorecard_lines (review_id);

DROP TRIGGER IF EXISTS trg_kra_scorecard_templates_updated ON public.kra_scorecard_templates;
CREATE TRIGGER trg_kra_scorecard_templates_updated BEFORE UPDATE ON public.kra_scorecard_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_kra_scorecard_items_updated ON public.kra_scorecard_items;
CREATE TRIGGER trg_kra_scorecard_items_updated BEFORE UPDATE ON public.kra_scorecard_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_kra_scorecard_reviews_updated ON public.kra_scorecard_reviews;
CREATE TRIGGER trg_kra_scorecard_reviews_updated BEFORE UPDATE ON public.kra_scorecard_reviews FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_kra_scorecard_lines_updated ON public.kra_scorecard_lines;
CREATE TRIGGER trg_kra_scorecard_lines_updated BEFORE UPDATE ON public.kra_scorecard_lines FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$cashier$kraq$, 1, $kraq$Cash Handling and POS Accuracy$kraq$, $kraq$Processes cash, card and POS transactions accurately; issues correct tickets and receipts; follows approval rules for discounts and refunds; completes closing and handover correctly; reports variances or system issues immediately.$kraq$, $kraq$Reliability (25 pts) + Reliability again for asset care (5 pts) on the Master sheet.$kraq$, 25, $kraq$5 = zero unexplained variance and clean handover. 3 = standard accuracy with minor coaching. 1 = repeated cash / ticket errors.$kraq$, $kraq$POS closing, variance log, refund approvals$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$cashier$kraq$, 2, $kraq$Guest Service and Communication$kraq$, $kraq$Welcomes guests politely; explains prices, packages and rules clearly; remains patient; handles complaints professionally; maintains a friendly and respectful tone.$kraq$, $kraq$Guest Service column.$kraq$, 20, $kraq$5 = warm welcome, clear explanation, calm disputes. 3 = polite and adequate. 1 = complaints about tone or poor explanation.$kraq$, $kraq$Guest feedback, supervisor observation$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$cashier$kraq$, 3, $kraq$Queue Management and Service Speed$kraq$, $kraq$Keeps the counter ready; processes guests efficiently without rushing; manages peak queues; avoids unnecessary delays and requests support when required.$kraq$, $kraq$Initiative column (speed with ownership).$kraq$, 15, $kraq$5 = fast and accurate in peaks, calls for help early. 3 = steady. 1 = avoidable queues or rushed errors.$kraq$, $kraq$Peak observation, transaction times$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$cashier$kraq$, 4, $kraq$Policy and Operational Compliance$kraq$, $kraq$Follows ticketing, wristband and entry procedures; uses only authorised prices and promotions; protects information; follows cash-control rules and management instructions.$kraq$, $kraq$Zone Knowledge column.$kraq$, 15, $kraq$5 = always authorised prices and procedures. 3 = rare slip, self-corrected. 1 = unofficial discounts or policy breaches.$kraq$, $kraq$Audit, refund / discount records$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$cashier$kraq$, 5, $kraq$Attendance and Punctuality$kraq$, $kraq$Reports on time; punches correctly; avoids unauthorised absence; informs the supervisor about delays; stays at the counter until relieved and completes the full shift.$kraq$, $kraq$Attendance column. Report at least 10 minutes before shift start, uniformed and POS-ready.$kraq$, 10, $kraq$5 = always early and ready. 3 = occasional short delay with notice. 1 = repeated lateness or no-show.$kraq$, $kraq$Punch / roster records$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$cashier$kraq$, 6, $kraq$Teamwork and Role Flexibility$kraq$, $kraq$Cooperates with the team; supports busy areas; completes proper handovers; communicates professionally and covers another trained role when required.$kraq$, $kraq$Teamwork column.$kraq$, 10, $kraq$5 = reliable cover across posts. 3 = cooperative in own post. 1 = poor handover or unhelpful under pressure.$kraq$, $kraq$Shift support / handover notes$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$cashier$kraq$, 7, $kraq$Counter Cleanliness, Asset Care and Reporting$kraq$, $kraq$Keeps the counter clean; handles POS equipment and cash drawers carefully; keeps restricted areas clear; reports damage, maintenance or safety concerns during the same shift.$kraq$, $kraq$Reliability column (5 pts of the cashier model).$kraq$, 5, $kraq$5 = guest-ready counter and same-shift reporting. 3 = acceptable. 1 = ignored faults or poor care.$kraq$, $kraq$Closing checklist, maintenance log$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$attendant$kraq$, 1, $kraq$Guest Safety and Supervision$kraq$, $kraq$Continuously monitors the activity area; prevents unsafe behaviour; applies age, height, weight and activity restrictions; controls entry and exit; acts immediately on risks and escalates incidents.$kraq$, $kraq$Reliability column (stays on post; dependable supervision).$kraq$, 25, $kraq$5 = constant post presence and immediate intervention. 3 = generally safe with occasional prompt. 1 = leaves post or ignores risk.$kraq$, $kraq$Incident reports, observation$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$attendant$kraq$, 2, $kraq$Rule Explanation and Policy Compliance$kraq$, $kraq$Explains rules before entry; applies them consistently; checks wristbands, tickets and session eligibility; follows capacity limits; communicates politely but firmly and does not ignore violations.$kraq$, $kraq$Zone Knowledge column.$kraq$, 20, $kraq$5 = clear briefing and consistent enforcement. 3 = knows rules, occasional miss. 1 = ignores violations or incorrect eligibility.$kraq$, $kraq$Wristband / capacity checks$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$attendant$kraq$, 3, $kraq$Guest Service and Communication$kraq$, $kraq$Welcomes guests positively; communicates clearly; remains patient; assists guests; handles difficult situations calmly; avoids arguments and escalates serious complaints.$kraq$, $kraq$Guest Service column. Smile, greet, offer help. Remain calm with children and families.$kraq$, 15, $kraq$5 = proactive, warm, bilingual where able. 3 = polite when asked. 1 = dismissive or argumentative.$kraq$, $kraq$Guest feedback, observation$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$attendant$kraq$, 4, $kraq$Operational Readiness and Productivity$kraq$, $kraq$Checks the area before opening; confirms equipment is safe; remains at the assigned post; supports smooth guest movement; completes checklists and follows rotations and breaks.$kraq$, $kraq$Initiative column.$kraq$, 15, $kraq$5 = ready before guests, owns the checklist. 3 = completes required tasks. 1 = late setup or idle in peaks.$kraq$, $kraq$Opening / closing checklists$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$attendant$kraq$, 5, $kraq$Attendance and Punctuality$kraq$, $kraq$Reports on time; punches correctly; avoids unauthorised absence; informs the supervisor about delays; completes the shift and returns from breaks on time.$kraq$, $kraq$Attendance column. Report at least 10 minutes before shift start, uniformed and post-ready.$kraq$, 10, $kraq$5 = always early and break-disciplined. 3 = rare delay with notice. 1 = repeated lateness.$kraq$, $kraq$Punch / roster records$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$attendant$kraq$, 6, $kraq$Teamwork and Flexibility$kraq$, $kraq$Supports colleagues during busy periods; cooperates across roles; assists in other zones when required; follows allocations; completes handovers and maintains respectful teamwork.$kraq$, $kraq$Teamwork column.$kraq$, 10, $kraq$5 = moves to the busier post as allocated. 3 = helpful in own zone. 1 = resists allocation or poor handover.$kraq$, $kraq$Allocation / handover notes$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$attendant$kraq$, 7, $kraq$Cleanliness, Equipment Care and Incident Reporting$kraq$, $kraq$Keeps the area clean; checks for damage; stops unsafe equipment; reports faults immediately; completes incident reports accurately and protects company property.$kraq$, $kraq$Reliability column (5 pts of the attendant model).$kraq$, 5, $kraq$5 = hygiene standard + same-shift fault log. 3 = clean with occasional prompt. 1 = ignored hazards.$kraq$, $kraq$Hygiene / maintenance / incident logs$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES ($kraq$dual_role$kraq$, 1, $kraq$Dual-role rule$kraq$, $kraq$Dual-role staff are accountable for the full cashier standard AND the full attendant standard. They must remain deployable across both posts without a drop in service quality, complete proper handovers between counter and floor, support the busier post first when allocated, and keep a consistent welcome whether assigned to POS or to an activity zone. On the Master KRA sheet the default duty mix is 50/50. Change the role category to Cashier or Attendant if the employee no longer holds both posts.$kraq$, $kraq$$kraq$, 0, $kraq$$kraq$, $kraq$$kraq$)
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;
INSERT INTO public.kra_scorecard_templates (code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order)
VALUES ($kraq$INF-CC$kraq$, $kraq$InflataPark$kraq$, $kraq$City Center Doha$kraq$, $kraq$E3 | InflataPark | City Center Doha | INDIVIDUAL KRA REVIEW$kraq$, $kraq$SOP V1.1$kraq$, $kraq$Required baseline: 100% assigned safety controls. No personal phones at active posts. No unrelieved post departure.$kraq$, $kraq$See Review Guide. N/A requires reason and approval; missing evidence is Pending. Duplicate this sheet for additional staff.$kraq$, 1)
ON CONFLICT (code) DO UPDATE SET
  brand = EXCLUDED.brand,
  place_name = EXCLUDED.place_name,
  sheet_title = EXCLUDED.sheet_title,
  sop_label = EXCLUDED.sop_label,
  baseline_note = EXCLUDED.baseline_note,
  usage_note = EXCLUDED.usage_note,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 1, $kraq$Safety and safeguarding$kraq$, $kraq$C02-C06; C11$kraq$, $kraq$Maintain assigned supervision, child-release and emergency controls. Act immediately on hazards; preserve privacy and guardian consent.$kraq$, 20, 30, 20
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 2, $kraq$Inflatable readiness$kraq$, $kraq$A01; SR01$kraq$, $kraq$100% required blower, pressure, anchorage and pre-use checks completed before release.$kraq$, 4, 8, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 3, $kraq$Zone supervision$kraq$, $kraq$A01; SR01$kraq$, $kraq$Continuous dispatch, landing and blind-zone coverage; stop admission when coverage fails.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 4, $kraq$Evacuation and closure$kraq$, $kraq$A01; SR01$kraq$, $kraq$Demonstrate approved deflation response; complete and record every closing compartment sweep.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 5, $kraq$Admission and transaction accuracy$kraq$, $kraq$C02; C08$kraq$, $kraq$100% authorized tickets, eligibility and collection checks; accurate assigned cash reconciliation; investigate and report each variance.$kraq$, 25, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 6, $kraq$Staff conduct and presentation$kraq$, $kraq$C10; C11; SR01$kraq$, $kraq$No personal-phone use at active posts; comply with uniform, footwear and hygiene requirements; obtain relief before leaving.$kraq$, 10, 10, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 7, $kraq$Guest service and communication$kraq$, $kraq$C09; C11$kraq$, $kraq$Give accurate prices, duration and restrictions; communicate respectfully; log and escalate unresolved complaints. No pressured reviews.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 8, $kraq$Attendance and shift readiness$kraq$, $kraq$C10$kraq$, $kraq$Ready at rostered start; accurate punches; prompt delay notification; approved break return and handover. Use roster/punch evidence.$kraq$, 10, 10, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 9, $kraq$Cleaning and asset care$kraq$, $kraq$C03; applicable activity SOP$kraq$, $kraq$Complete every assigned cleaning/reset and closing check; secure tools, equipment and belongings without interrupting supervision.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 10, $kraq$Reporting and records$kraq$, $kraq$C04-C07; C10$kraq$, $kraq$Immediately escalate urgent hazards; make truthful timely records; no pre-signing or unauthorized restart. Track action owners.$kraq$, 5, 5, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 11, $kraq$Teamwork and authorized cover$kraq$, $kraq$C01; C03; C10$kraq$, $kraq$Complete required handovers and trained relief duties; stay within authority; do not abandon one live post to cover another.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 12, $kraq$Supervisor control and follow-up$kraq$, $kraq$C01; C03; R01; R08; R11$kraq$, $kraq$Verify competent staffing, relief, release checks and briefing each shift; record hourly checks and follow up assigned corrective actions.$kraq$, 0, 0, 15
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 13, $kraq$Approved food / cookery duties$kraq$, $kraq$F01-F05; R09; R10$kraq$, $kraq$100% assigned hygiene, allergen, temperature and tool controls for approved scope. No food role: approved N/A.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$INF-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_templates (code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order)
VALUES ($kraq$KDS-CC$kraq$, $kraq$Kids City Driving School$kraq$, $kraq$City Center Doha$kraq$, $kraq$E3 | Kids City Driving School | City Center Doha | INDIVIDUAL KRA REVIEW$kraq$, $kraq$SOP V1.1$kraq$, $kraq$Required baseline: 100% assigned safety controls. No personal phones at active posts. No unrelieved post departure.$kraq$, $kraq$See Review Guide. N/A requires reason and approval; missing evidence is Pending. Duplicate this sheet for additional staff.$kraq$, 2)
ON CONFLICT (code) DO UPDATE SET
  brand = EXCLUDED.brand,
  place_name = EXCLUDED.place_name,
  sheet_title = EXCLUDED.sheet_title,
  sop_label = EXCLUDED.sop_label,
  baseline_note = EXCLUDED.baseline_note,
  usage_note = EXCLUDED.usage_note,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 1, $kraq$Safety and safeguarding$kraq$, $kraq$C02-C06; C11$kraq$, $kraq$Maintain assigned supervision, child-release and emergency controls. Act immediately on hazards; preserve privacy and guardian consent.$kraq$, 20, 30, 20
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 2, $kraq$Vehicle and track readiness$kraq$, $kraq$A02, A03; SR01$kraq$, $kraq$Check every used vehicle and track before release; isolate failed vehicles and charging areas.$kraq$, 4, 8, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 3, $kraq$Track and loading control$kraq$, $kraq$A02, A03; SR01$kraq$, $kraq$Observe the live track continuously; stop vehicles before assistance; check approved seating before dispatch.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 4, $kraq$Soft play and group control$kraq$, $kraq$A02, A03; SR01$kraq$, $kraq$Apply supervision-only adult entry, approved limits, session timing and group transition headcounts.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 5, $kraq$Admission and transaction accuracy$kraq$, $kraq$C02; C08$kraq$, $kraq$100% authorized tickets, eligibility and collection checks; accurate assigned cash reconciliation; investigate and report each variance.$kraq$, 25, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 6, $kraq$Staff conduct and presentation$kraq$, $kraq$C10; C11; SR01$kraq$, $kraq$No personal-phone use at active posts; comply with uniform, footwear and hygiene requirements; obtain relief before leaving.$kraq$, 10, 10, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 7, $kraq$Guest service and communication$kraq$, $kraq$C09; C11$kraq$, $kraq$Give accurate prices, duration and restrictions; communicate respectfully; log and escalate unresolved complaints. No pressured reviews.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 8, $kraq$Attendance and shift readiness$kraq$, $kraq$C10$kraq$, $kraq$Ready at rostered start; accurate punches; prompt delay notification; approved break return and handover. Use roster/punch evidence.$kraq$, 10, 10, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 9, $kraq$Cleaning and asset care$kraq$, $kraq$C03; applicable activity SOP$kraq$, $kraq$Complete every assigned cleaning/reset and closing check; secure tools, equipment and belongings without interrupting supervision.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 10, $kraq$Reporting and records$kraq$, $kraq$C04-C07; C10$kraq$, $kraq$Immediately escalate urgent hazards; make truthful timely records; no pre-signing or unauthorized restart. Track action owners.$kraq$, 5, 5, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 11, $kraq$Teamwork and authorized cover$kraq$, $kraq$C01; C03; C10$kraq$, $kraq$Complete required handovers and trained relief duties; stay within authority; do not abandon one live post to cover another.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 12, $kraq$Supervisor control and follow-up$kraq$, $kraq$C01; C03; R01; R08; R11$kraq$, $kraq$Verify competent staffing, relief, release checks and briefing each shift; record hourly checks and follow up assigned corrective actions.$kraq$, 0, 0, 15
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 13, $kraq$Approved food / cookery duties$kraq$, $kraq$F01-F05; R09; R10$kraq$, $kraq$100% assigned hygiene, allergen, temperature and tool controls for approved scope. No food role: approved N/A.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-CC$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_templates (code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order)
VALUES ($kraq$UA-DM$kraq$, $kraq$Urban Arena$kraq$, $kraq$Doha Mall$kraq$, $kraq$E3 | Urban Arena | Doha Mall | INDIVIDUAL KRA REVIEW$kraq$, $kraq$SOP V1.1$kraq$, $kraq$Required baseline: 100% assigned safety controls. No personal phones at active posts. No unrelieved post departure.$kraq$, $kraq$See Review Guide. N/A requires reason and approval; missing evidence is Pending. Duplicate this sheet for additional staff.$kraq$, 3)
ON CONFLICT (code) DO UPDATE SET
  brand = EXCLUDED.brand,
  place_name = EXCLUDED.place_name,
  sheet_title = EXCLUDED.sheet_title,
  sop_label = EXCLUDED.sop_label,
  baseline_note = EXCLUDED.baseline_note,
  usage_note = EXCLUDED.usage_note,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 1, $kraq$Safety and safeguarding$kraq$, $kraq$C02-C06; C11$kraq$, $kraq$Maintain assigned supervision, child-release and emergency controls. Act immediately on hazards; preserve privacy and guardian consent.$kraq$, 20, 30, 20
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 2, $kraq$Game readiness and release$kraq$, $kraq$A02, A03, A05; SR01$kraq$, $kraq$Check each active game; no new or relocated equipment use before approved release and training.$kraq$, 4, 8, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 3, $kraq$Arena and barrier control$kraq$, $kraq$A02, A03, A05; SR01$kraq$, $kraq$Maintain active-zone coverage, clearances and effective barriers; stop unsafe overlapping activities.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 4, $kraq$Accessories and soft play$kraq$, $kraq$A02, A03, A05; SR01$kraq$, $kraq$Control and count darts/cues/controllers; enforce soft-play adult rules; clear guest accounts at close.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 5, $kraq$Admission and transaction accuracy$kraq$, $kraq$C02; C08$kraq$, $kraq$100% authorized tickets, eligibility and collection checks; accurate assigned cash reconciliation; investigate and report each variance.$kraq$, 25, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 6, $kraq$Staff conduct and presentation$kraq$, $kraq$C10; C11; SR01$kraq$, $kraq$No personal-phone use at active posts; comply with uniform, footwear and hygiene requirements; obtain relief before leaving.$kraq$, 10, 10, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 7, $kraq$Guest service and communication$kraq$, $kraq$C09; C11$kraq$, $kraq$Give accurate prices, duration and restrictions; communicate respectfully; log and escalate unresolved complaints. No pressured reviews.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 8, $kraq$Attendance and shift readiness$kraq$, $kraq$C10$kraq$, $kraq$Ready at rostered start; accurate punches; prompt delay notification; approved break return and handover. Use roster/punch evidence.$kraq$, 10, 10, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 9, $kraq$Cleaning and asset care$kraq$, $kraq$C03; applicable activity SOP$kraq$, $kraq$Complete every assigned cleaning/reset and closing check; secure tools, equipment and belongings without interrupting supervision.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 10, $kraq$Reporting and records$kraq$, $kraq$C04-C07; C10$kraq$, $kraq$Immediately escalate urgent hazards; make truthful timely records; no pre-signing or unauthorized restart. Track action owners.$kraq$, 5, 5, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 11, $kraq$Teamwork and authorized cover$kraq$, $kraq$C01; C03; C10$kraq$, $kraq$Complete required handovers and trained relief duties; stay within authority; do not abandon one live post to cover another.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 12, $kraq$Supervisor control and follow-up$kraq$, $kraq$C01; C03; R01; R08; R11$kraq$, $kraq$Verify competent staffing, relief, release checks and briefing each shift; record hourly checks and follow up assigned corrective actions.$kraq$, 0, 0, 15
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 13, $kraq$Approved food / cookery duties$kraq$, $kraq$F01-F05; R09; R10$kraq$, $kraq$100% assigned hygiene, allergen, temperature and tool controls for approved scope. No food role: approved N/A.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$UA-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_templates (code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order)
VALUES ($kraq$KDS-MINI-DM$kraq$, $kraq$KDS Mini$kraq$, $kraq$Doha Mall$kraq$, $kraq$E3 | KDS Mini | Doha Mall | INDIVIDUAL KRA REVIEW$kraq$, $kraq$SOP V1.1$kraq$, $kraq$Required baseline: 100% assigned safety controls. No personal phones at active posts. No unrelieved post departure.$kraq$, $kraq$See Review Guide. N/A requires reason and approval; missing evidence is Pending. Duplicate this sheet for additional staff.$kraq$, 4)
ON CONFLICT (code) DO UPDATE SET
  brand = EXCLUDED.brand,
  place_name = EXCLUDED.place_name,
  sheet_title = EXCLUDED.sheet_title,
  sop_label = EXCLUDED.sop_label,
  baseline_note = EXCLUDED.baseline_note,
  usage_note = EXCLUDED.usage_note,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 1, $kraq$Safety and safeguarding$kraq$, $kraq$C02-C06; C11$kraq$, $kraq$Maintain assigned supervision, child-release and emergency controls. Act immediately on hazards; preserve privacy and guardian consent.$kraq$, 20, 30, 20
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 2, $kraq$Compact-site coverage$kraq$, $kraq$A02; A03 only if approved; SR01$kraq$, $kraq$Keep gate and occupied play area observed; arrange relief or safely suspend activity before leaving.$kraq$, 4, 8, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 3, $kraq$Floor and entrance checks$kraq$, $kraq$A02; A03 only if approved; SR01$kraq$, $kraq$Check ramp, turf, rubber floor, LED edges and latch every opening; isolate unsafe defects.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 4, $kraq$Sessions and approved scope$kraq$, $kraq$A02; A03 only if approved; SR01$kraq$, $kraq$Verify guardian collection and session timing; no driving unless vehicles, track and scope are approved.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 5, $kraq$Admission and transaction accuracy$kraq$, $kraq$C02; C08$kraq$, $kraq$100% authorized tickets, eligibility and collection checks; accurate assigned cash reconciliation; investigate and report each variance.$kraq$, 25, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 6, $kraq$Staff conduct and presentation$kraq$, $kraq$C10; C11; SR01$kraq$, $kraq$No personal-phone use at active posts; comply with uniform, footwear and hygiene requirements; obtain relief before leaving.$kraq$, 10, 10, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 7, $kraq$Guest service and communication$kraq$, $kraq$C09; C11$kraq$, $kraq$Give accurate prices, duration and restrictions; communicate respectfully; log and escalate unresolved complaints. No pressured reviews.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 8, $kraq$Attendance and shift readiness$kraq$, $kraq$C10$kraq$, $kraq$Ready at rostered start; accurate punches; prompt delay notification; approved break return and handover. Use roster/punch evidence.$kraq$, 10, 10, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 9, $kraq$Cleaning and asset care$kraq$, $kraq$C03; applicable activity SOP$kraq$, $kraq$Complete every assigned cleaning/reset and closing check; secure tools, equipment and belongings without interrupting supervision.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 10, $kraq$Reporting and records$kraq$, $kraq$C04-C07; C10$kraq$, $kraq$Immediately escalate urgent hazards; make truthful timely records; no pre-signing or unauthorized restart. Track action owners.$kraq$, 5, 5, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 11, $kraq$Teamwork and authorized cover$kraq$, $kraq$C01; C03; C10$kraq$, $kraq$Complete required handovers and trained relief duties; stay within authority; do not abandon one live post to cover another.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 12, $kraq$Supervisor control and follow-up$kraq$, $kraq$C01; C03; R01; R08; R11$kraq$, $kraq$Verify competent staffing, relief, release checks and briefing each shift; record hourly checks and follow up assigned corrective actions.$kraq$, 0, 0, 15
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 13, $kraq$Approved food / cookery duties$kraq$, $kraq$F01-F05; R09; R10$kraq$, $kraq$100% assigned hygiene, allergen, temperature and tool controls for approved scope. No food role: approved N/A.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$KDS-MINI-DM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_templates (code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order)
VALUES ($kraq$CAR-AP$kraq$, $kraq$Carousel$kraq$, $kraq$Aspire Park$kraq$, $kraq$E3 | Carousel | Aspire Park | INDIVIDUAL KRA REVIEW$kraq$, $kraq$SOP V1.1$kraq$, $kraq$Required baseline: 100% assigned safety controls. No personal phones at active posts. No unrelieved post departure.$kraq$, $kraq$See Review Guide. N/A requires reason and approval; missing evidence is Pending. Duplicate this sheet for additional staff.$kraq$, 5)
ON CONFLICT (code) DO UPDATE SET
  brand = EXCLUDED.brand,
  place_name = EXCLUDED.place_name,
  sheet_title = EXCLUDED.sheet_title,
  sop_label = EXCLUDED.sop_label,
  baseline_note = EXCLUDED.baseline_note,
  usage_note = EXCLUDED.usage_note,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 1, $kraq$Safety and safeguarding$kraq$, $kraq$C02-C06; C11$kraq$, $kraq$Maintain assigned supervision, child-release and emergency controls. Act immediately on hazards; preserve privacy and guardian consent.$kraq$, 20, 30, 20
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 2, $kraq$Ride checks and loading$kraq$, $kraq$A04; SR01$kraq$, $kraq$Complete required pre-use checks and empty cycle; check approved seats/restraints before dispatch.$kraq$, 4, 8, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 3, $kraq$Operator attention$kraq$, $kraq$A04; SR01$kraq$, $kraq$Remain at controls throughout every cycle; no simultaneous cash handling or unrelated device use.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 4, $kraq$Weather and shutdown$kraq$, $kraq$A04; SR01$kraq$, $kraq$Record required weather and surface checks; obey approved stop limits; verify lighting, radio and shutdown.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 5, $kraq$Admission and transaction accuracy$kraq$, $kraq$C02; C08$kraq$, $kraq$100% authorized tickets, eligibility and collection checks; accurate assigned cash reconciliation; investigate and report each variance.$kraq$, 25, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 6, $kraq$Staff conduct and presentation$kraq$, $kraq$C10; C11; SR01$kraq$, $kraq$No personal-phone use at active posts; comply with uniform, footwear and hygiene requirements; obtain relief before leaving.$kraq$, 10, 10, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 7, $kraq$Guest service and communication$kraq$, $kraq$C09; C11$kraq$, $kraq$Give accurate prices, duration and restrictions; communicate respectfully; log and escalate unresolved complaints. No pressured reviews.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 8, $kraq$Attendance and shift readiness$kraq$, $kraq$C10$kraq$, $kraq$Ready at rostered start; accurate punches; prompt delay notification; approved break return and handover. Use roster/punch evidence.$kraq$, 10, 10, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 9, $kraq$Cleaning and asset care$kraq$, $kraq$C03; applicable activity SOP$kraq$, $kraq$Complete every assigned cleaning/reset and closing check; secure tools, equipment and belongings without interrupting supervision.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 10, $kraq$Reporting and records$kraq$, $kraq$C04-C07; C10$kraq$, $kraq$Immediately escalate urgent hazards; make truthful timely records; no pre-signing or unauthorized restart. Track action owners.$kraq$, 5, 5, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 11, $kraq$Teamwork and authorized cover$kraq$, $kraq$C01; C03; C10$kraq$, $kraq$Complete required handovers and trained relief duties; stay within authority; do not abandon one live post to cover another.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 12, $kraq$Supervisor control and follow-up$kraq$, $kraq$C01; C03; R01; R08; R11$kraq$, $kraq$Verify competent staffing, relief, release checks and briefing each shift; record hourly checks and follow up assigned corrective actions.$kraq$, 0, 0, 15
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 13, $kraq$Approved food / cookery duties$kraq$, $kraq$F01-F05; R09; R10$kraq$, $kraq$100% assigned hygiene, allergen, temperature and tool controls for approved scope. No food role: approved N/A.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CAR-AP$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_templates (code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order)
VALUES ($kraq$CB-VM$kraq$, $kraq$Crayons and Bricks$kraq$, $kraq$Place Vendome$kraq$, $kraq$E3 | Crayons and Bricks | Place Vendome | INDIVIDUAL KRA REVIEW$kraq$, $kraq$SOP V1.1$kraq$, $kraq$Required baseline: 100% assigned safety controls. No personal phones at active posts. No unrelieved post departure.$kraq$, $kraq$See Review Guide. N/A requires reason and approval; missing evidence is Pending. Duplicate this sheet for additional staff.$kraq$, 6)
ON CONFLICT (code) DO UPDATE SET
  brand = EXCLUDED.brand,
  place_name = EXCLUDED.place_name,
  sheet_title = EXCLUDED.sheet_title,
  sop_label = EXCLUDED.sop_label,
  baseline_note = EXCLUDED.baseline_note,
  usage_note = EXCLUDED.usage_note,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 1, $kraq$Safety and safeguarding$kraq$, $kraq$C02-C06; C11$kraq$, $kraq$Maintain assigned supervision, child-release and emergency controls. Act immediately on hazards; preserve privacy and guardian consent.$kraq$, 20, 30, 20
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 2, $kraq$Gate and activity supervision$kraq$, $kraq$A06; SR01$kraq$, $kraq$Keep entrance and occupied stations covered; pause activity if competing duties prevent safe supervision.$kraq$, 4, 8, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 3, $kraq$Materials and face painting$kraq$, $kraq$A06; SR01$kraq$, $kraq$Count controlled tools each session; check age-suitable materials, cosmetic products, consent and hygiene.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 4, $kraq$Site release and assets$kraq$, $kraq$A06; SR01$kraq$, $kraq$Confirm released footprint and trading status; reconcile assets and secure access during relocation/closure.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 5, $kraq$Admission and transaction accuracy$kraq$, $kraq$C02; C08$kraq$, $kraq$100% authorized tickets, eligibility and collection checks; accurate assigned cash reconciliation; investigate and report each variance.$kraq$, 25, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 6, $kraq$Staff conduct and presentation$kraq$, $kraq$C10; C11; SR01$kraq$, $kraq$No personal-phone use at active posts; comply with uniform, footwear and hygiene requirements; obtain relief before leaving.$kraq$, 10, 10, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 7, $kraq$Guest service and communication$kraq$, $kraq$C09; C11$kraq$, $kraq$Give accurate prices, duration and restrictions; communicate respectfully; log and escalate unresolved complaints. No pressured reviews.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 8, $kraq$Attendance and shift readiness$kraq$, $kraq$C10$kraq$, $kraq$Ready at rostered start; accurate punches; prompt delay notification; approved break return and handover. Use roster/punch evidence.$kraq$, 10, 10, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 9, $kraq$Cleaning and asset care$kraq$, $kraq$C03; applicable activity SOP$kraq$, $kraq$Complete every assigned cleaning/reset and closing check; secure tools, equipment and belongings without interrupting supervision.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 10, $kraq$Reporting and records$kraq$, $kraq$C04-C07; C10$kraq$, $kraq$Immediately escalate urgent hazards; make truthful timely records; no pre-signing or unauthorized restart. Track action owners.$kraq$, 5, 5, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 11, $kraq$Teamwork and authorized cover$kraq$, $kraq$C01; C03; C10$kraq$, $kraq$Complete required handovers and trained relief duties; stay within authority; do not abandon one live post to cover another.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 12, $kraq$Supervisor control and follow-up$kraq$, $kraq$C01; C03; R01; R08; R11$kraq$, $kraq$Verify competent staffing, relief, release checks and briefing each shift; record hourly checks and follow up assigned corrective actions.$kraq$, 0, 0, 15
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 13, $kraq$Approved food / cookery duties$kraq$, $kraq$F01-F05; R09; R10$kraq$, $kraq$100% assigned hygiene, allergen, temperature and tool controls for approved scope. No food role: approved N/A.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-VM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_templates (code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order)
VALUES ($kraq$CB-DSM$kraq$, $kraq$Crayons and Bricks$kraq$, $kraq$Dar Al Salam Mall$kraq$, $kraq$E3 | Crayons and Bricks | Dar Al Salam Mall | INDIVIDUAL KRA REVIEW$kraq$, $kraq$SOP V1.1$kraq$, $kraq$Required baseline: 100% assigned safety controls. No personal phones at active posts. No unrelieved post departure.$kraq$, $kraq$See Review Guide. N/A requires reason and approval; missing evidence is Pending. Duplicate this sheet for additional staff.$kraq$, 7)
ON CONFLICT (code) DO UPDATE SET
  brand = EXCLUDED.brand,
  place_name = EXCLUDED.place_name,
  sheet_title = EXCLUDED.sheet_title,
  sop_label = EXCLUDED.sop_label,
  baseline_note = EXCLUDED.baseline_note,
  usage_note = EXCLUDED.usage_note,
  sort_order = EXCLUDED.sort_order;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 1, $kraq$Safety and safeguarding$kraq$, $kraq$C02-C06; C11$kraq$, $kraq$Maintain assigned supervision, child-release and emergency controls. Act immediately on hazards; preserve privacy and guardian consent.$kraq$, 20, 30, 20
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 2, $kraq$Gate and guardian control$kraq$, $kraq$A06; SR01$kraq$, $kraq$Maintain frontage sightlines and entrance coverage; verify every child collection.$kraq$, 4, 8, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 3, $kraq$Materials and face painting$kraq$, $kraq$A06; SR01$kraq$, $kraq$Count tools each session; remove unsafe small parts; verify consent and hygienic approved cosmetics.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 4, $kraq$Stock and mall interface$kraq$, $kraq$A06; SR01$kraq$, $kraq$Reconcile material stock, clear mall routes and exits, and complete child/tool closing checks.$kraq$, 3, 6, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 5, $kraq$Admission and transaction accuracy$kraq$, $kraq$C02; C08$kraq$, $kraq$100% authorized tickets, eligibility and collection checks; accurate assigned cash reconciliation; investigate and report each variance.$kraq$, 25, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 6, $kraq$Staff conduct and presentation$kraq$, $kraq$C10; C11; SR01$kraq$, $kraq$No personal-phone use at active posts; comply with uniform, footwear and hygiene requirements; obtain relief before leaving.$kraq$, 10, 10, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 7, $kraq$Guest service and communication$kraq$, $kraq$C09; C11$kraq$, $kraq$Give accurate prices, duration and restrictions; communicate respectfully; log and escalate unresolved complaints. No pressured reviews.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 8, $kraq$Attendance and shift readiness$kraq$, $kraq$C10$kraq$, $kraq$Ready at rostered start; accurate punches; prompt delay notification; approved break return and handover. Use roster/punch evidence.$kraq$, 10, 10, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 9, $kraq$Cleaning and asset care$kraq$, $kraq$C03; applicable activity SOP$kraq$, $kraq$Complete every assigned cleaning/reset and closing check; secure tools, equipment and belongings without interrupting supervision.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 10, $kraq$Reporting and records$kraq$, $kraq$C04-C07; C10$kraq$, $kraq$Immediately escalate urgent hazards; make truthful timely records; no pre-signing or unauthorized restart. Track action owners.$kraq$, 5, 5, 10
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 11, $kraq$Teamwork and authorized cover$kraq$, $kraq$C01; C03; C10$kraq$, $kraq$Complete required handovers and trained relief duties; stay within authority; do not abandon one live post to cover another.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 12, $kraq$Supervisor control and follow-up$kraq$, $kraq$C01; C03; R01; R08; R11$kraq$, $kraq$Verify competent staffing, relief, release checks and briefing each shift; record hourly checks and follow up assigned corrective actions.$kraq$, 0, 0, 15
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, 13, $kraq$Approved food / cookery duties$kraq$, $kraq$F01-F05; R09; R10$kraq$, $kraq$100% assigned hygiene, allergen, temperature and tool controls for approved scope. No food role: approved N/A.$kraq$, 5, 5, 5
FROM public.kra_scorecard_templates t WHERE t.code = $kraq$CB-DSM$kraq$
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;
UPDATE public.kra_scorecard_templates t
SET location_id = l.id
FROM public.locations l
WHERE l.code = t.code AND t.location_id IS NULL;

CREATE OR REPLACE FUNCTION public.kra_scorecard_reviews_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lvl int;
  own boolean;
BEGIN
  lvl := public.current_user_role_level();
  IF lvl >= 50 THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = OLD.staff_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
  ) INTO own;
  IF NOT own THEN
    RAISE EXCEPTION 'Not allowed to update this KRA scorecard';
  END IF;
  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.review_period IS DISTINCT FROM OLD.review_period
    OR NEW.reviewer_name IS DISTINCT FROM OLD.reviewer_name
    OR NEW.assigned_post IS DISTINCT FROM OLD.assigned_post
    OR NEW.role_category IS DISTINCT FROM OLD.role_category
    OR NEW.cashier_share IS DISTINCT FROM OLD.cashier_share
    OR NEW.critical_status IS DISTINCT FROM OLD.critical_status
    OR NEW.critical_evidence IS DISTINCT FROM OLD.critical_evidence
    OR NEW.agreed_action IS DISTINCT FROM OLD.agreed_action
    OR NEW.follow_up IS DISTINCT FROM OLD.follow_up
    OR NEW.reviewer_approval_note IS DISTINCT FROM OLD.reviewer_approval_note
    OR NEW.reviewer_approved_at IS DISTINCT FROM OLD.reviewer_approved_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Employees may only acknowledge their own KRA scorecard';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kra_scorecard_reviews_guard ON public.kra_scorecard_reviews;
CREATE TRIGGER trg_kra_scorecard_reviews_guard
  BEFORE UPDATE ON public.kra_scorecard_reviews
  FOR EACH ROW EXECUTE FUNCTION public.kra_scorecard_reviews_guard();

GRANT SELECT, UPDATE ON public.kra_scorecard_templates TO authenticated;
GRANT SELECT, UPDATE ON public.kra_scorecard_items TO authenticated;
GRANT SELECT ON public.kra_scorecard_framework_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.kra_scorecard_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.kra_scorecard_lines TO authenticated;
GRANT ALL ON public.kra_scorecard_templates TO service_role;
GRANT ALL ON public.kra_scorecard_items TO service_role;
GRANT ALL ON public.kra_scorecard_framework_items TO service_role;
GRANT ALL ON public.kra_scorecard_reviews TO service_role;
GRANT ALL ON public.kra_scorecard_lines TO service_role;

ALTER TABLE public.kra_scorecard_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kra_scorecard_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kra_scorecard_framework_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kra_scorecard_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kra_scorecard_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kra_scorecard_templates_read" ON public.kra_scorecard_templates;
CREATE POLICY "kra_scorecard_templates_read" ON public.kra_scorecard_templates
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "kra_scorecard_templates_write" ON public.kra_scorecard_templates;
CREATE POLICY "kra_scorecard_templates_write" ON public.kra_scorecard_templates
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "kra_scorecard_items_read" ON public.kra_scorecard_items;
CREATE POLICY "kra_scorecard_items_read" ON public.kra_scorecard_items
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "kra_scorecard_items_write" ON public.kra_scorecard_items;
CREATE POLICY "kra_scorecard_items_write" ON public.kra_scorecard_items
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "kra_scorecard_framework_read" ON public.kra_scorecard_framework_items;
CREATE POLICY "kra_scorecard_framework_read" ON public.kra_scorecard_framework_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kra_scorecard_reviews_read" ON public.kra_scorecard_reviews;
CREATE POLICY "kra_scorecard_reviews_read" ON public.kra_scorecard_reviews
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 40
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "kra_scorecard_reviews_insert" ON public.kra_scorecard_reviews;
CREATE POLICY "kra_scorecard_reviews_insert" ON public.kra_scorecard_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 50);
DROP POLICY IF EXISTS "kra_scorecard_reviews_update" ON public.kra_scorecard_reviews;
CREATE POLICY "kra_scorecard_reviews_update" ON public.kra_scorecard_reviews
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role_level() >= 40
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
  )
  WITH CHECK (
    public.current_user_role_level() >= 40
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "kra_scorecard_lines_read" ON public.kra_scorecard_lines;
CREATE POLICY "kra_scorecard_lines_read" ON public.kra_scorecard_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kra_scorecard_reviews r
      WHERE r.id = review_id
        AND (
          public.current_user_role_level() >= 40
          OR r.staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
        )
    )
  );
DROP POLICY IF EXISTS "kra_scorecard_lines_insert" ON public.kra_scorecard_lines;
CREATE POLICY "kra_scorecard_lines_insert" ON public.kra_scorecard_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 50);
DROP POLICY IF EXISTS "kra_scorecard_lines_update" ON public.kra_scorecard_lines;
CREATE POLICY "kra_scorecard_lines_update" ON public.kra_scorecard_lines
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 50)
  WITH CHECK (public.current_user_role_level() >= 50);

