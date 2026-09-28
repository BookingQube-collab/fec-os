-- Location SOP manuals from A:\FEC\SOP (E3 site manuals V1.0, issued 21 Sep 2026).
-- Procedure text is extracted from those Word files. The files are stored in the sop-documents bucket.

ALTER TABLE public.sop_documents
  ADD COLUMN IF NOT EXISTS kra_template_id uuid REFERENCES public.kra_scorecard_templates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sop_code text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_mime text;

CREATE INDEX IF NOT EXISTS idx_sop_documents_kra_template
  ON public.sop_documents (kra_template_id, sop_code);

UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT ARRAY(
    SELECT DISTINCT mime
    FROM unnest(
      COALESCE(allowed_mime_types, ARRAY[]::text[]) || ARRAY[
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ]
    ) AS mime
  )
)
WHERE id = 'sop-documents';

CREATE OR REPLACE FUNCTION public.user_can_read_site_sop(_template_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role_level() >= 40
    OR EXISTS (
      SELECT 1
      FROM public.kra_scorecard_reviews r
      JOIN public.staff s ON s.id = r.staff_id
      WHERE r.template_id = _template_id
        AND s.user_id = auth.uid()
        AND s.deleted_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_read_site_sop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_read_site_sop(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_can_read_sop_file(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sop_documents d
    WHERE d.file_path = _name
      AND (
        d.kra_template_id IS NULL
        OR public.user_can_read_site_sop(d.kra_template_id)
      )
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.sop_documents d WHERE d.file_path = _name
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_read_sop_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_read_sop_file(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "sop_documents read" ON public.sop_documents;
CREATE POLICY "sop_documents read" ON public.sop_documents
  FOR SELECT TO authenticated
  USING (
    (
      kra_template_id IS NULL
      AND (location_id IS NULL OR public.user_can_access_location(location_id))
    )
    OR (
      kra_template_id IS NOT NULL
      AND public.user_can_read_site_sop(kra_template_id)
    )
  );

DROP POLICY IF EXISTS "sop_sections read" ON public.sop_sections;
CREATE POLICY "sop_sections read" ON public.sop_sections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sop_documents d
      WHERE d.id = sop_sections.document_id
        AND (
          (
            d.kra_template_id IS NULL
            AND (d.location_id IS NULL OR public.user_can_access_location(d.location_id))
          )
          OR (
            d.kra_template_id IS NOT NULL
            AND public.user_can_read_site_sop(d.kra_template_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS "sop docs storage read" ON storage.objects;
CREATE POLICY "sop docs storage read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'sop-documents'
    AND public.user_can_read_sop_file(name)
  );

DELETE FROM public.sop_sections s USING public.sop_documents d WHERE s.document_id = d.id AND d.code LIKE $fecsop$INF-CC-%$fecsop$;
INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-MANUAL$fecsop$,
  $fecsop$Site SOP manual$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$MANUAL$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, $fecsop$Contents and navigation$fecsop$, $fecsop$DOCUMENT GUIDE
SECTION
PAGE
Site profile and local operating procedures
3–4
Document control and Qatar framework
5–8
Common operating procedures C01 to C09
9–17
Activity procedures A01
18
Conditional food and cookery procedures F01 to F05
19–23
Qatar and international requirements
24–25
Site records and forms R01 to R10
26–35
Training and management review
36
References and document framework
37–39$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$How to use the manual$fecsop$, $fecsop$This document is the standalone site manual for InflataPark at City Center Doha. Read the site instructions, then apply C01 to C09 and the activity procedures included here. The food and cookery section is conditional: use only procedures within the site’s approved scope and mark non-applicable activities in R08.
Complete R08 before site release and R03 for each activity. Use R01 and R02 daily. Record exceptions on R04 to R09; use R10 to document the approved food hazard-control plan.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$InflataPark$fecsop$, $fecsop$LOCATION 01  /  CITY CENTER DOHA  /  INF-CC
SITE CONTROL
REQUIREMENT
Operating scope
Indoor inflatable attraction
Responsible owner
Site Supervisor; accountable to Head of Operations
Required procedures
C01 to C09; A01. F01 to F05 only for approved food or cookery activities.
Staff deployment
Inflatable operator and zone attendants; entrance control; supervisor and relief.
InflataPark | Operator-published reference image [S01]. Verify current layout through R08.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Operational priorities$fecsop$, $fecsop$Slide dispatch, landing zones, inflation pressure and evacuation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$Daily supervisor checklist$fecsop$, $fecsop$Before opening: complete R01, confirm staffing and relief, inspect exits and release each activity. During operation: control admission, maintain sightlines and record required checks. At close: account for every child, isolate defects, reconcile sales and complete R02.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$Site operating procedures$fecsop$, $fecsop$INF-CC  /  SOP 01  /  InflataPark at City Center Doha
1. Before opening, supervisor identifies released inflatable zones, assigned attendants, pressure readings and failed areas on the day’s plan. Operator verifies blower and asset pairing, anchorage and the agreed empty evacuation readiness check.
2. At entry, confirm the correct session, activity restrictions and guardian arrangement. Apply the legacy 100 kg restriction only after it is mapped and validated to the applicable main inflatable. Do not treat it as a load rating for every feature.
3. Allocate separate coverage for slide dispatch and landing wherever a single operator cannot safely see both. Assign interior patrol and entrance coverage; stage sessions by size and ability when mixing presents collision risk.
4. Keep shoe storage outside evacuation routes and use a simple location or token system. Record lost property discreetly. Any proposed Camera 18 repositioning requires a written technical plan and confirmation of applicable approvals; a technician’s verbal opinion is not regulatory evidence.
5. On partial deflation or blower failure, stop the whole affected interconnected zone and clear users through the tested route. Keep guests away from collapsed fabric. Technical staff assess the cause, including power supply and blower protection, before written restart.
6. At close, physically sweep all compartments before deflation, account for children, inspect damage and follow the OEM shutdown. Avoid trapping moisture by packing wet fabric; use the approved drying and storage arrangement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 7, $fecsop$Critical local hold points$fecsop$, $fecsop$No verified pressure range or evacuation method: inflatable stays closed.
AC leaks or wet flooring near electrical supplies: isolate affected area and obtain repair.
Blind zones without assigned coverage: reduce active area and capacity, or close.
Proposed arts or crafts extension into mall space: no setup before written property approval and revised fire and flow review.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 8, $fecsop$Evidence required before release$fecsop$, $fecsop$Current approved plan; blower and inflatable register; specialist inspection; pressure instrument and settings; numbered exit and rescue routes; zone coverage study; validated weight and capacity limits; property emergency contacts; approved food scope; camera plan. Complete R08 and R03 for each zone.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 9, $fecsop$Document control and authorization$fecsop$, $fecsop$CONTROL 02
Role
Accountability
GM or authorized executive
Approve policy, resources and delegated financial limits; no commercial waiver of safety restrictions.
Head of Operations
Own the manual, approve site deployment and capacity reductions, review incidents and authorize site release after technical evidence.
Site supervisor
Complete opening decision, assign posts and relief, check controls during trade, stop unsafe activity and sign handover.
Maintenance lead and inspector
Validate equipment records, technical limits, inspection scope and repairs; issue written technical release.
Food PIC
Approve recipes, suppliers, allergen controls, food monitoring and disposition; stop unsafe food service.
HR and training lead
Verify role competency, induction, working arrangements and training records.
IT and privacy lead
Protect POS, CCTV and guest records; approve access and technical recovery.
Every employee
Intervene early, stop danger, summon help and record facts honestly.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 10, $fecsop$Release sequence$fecsop$, $fecsop$Inspect the site and complete R08. Confirm licenses, emergency plan, equipment inspection certificates, operating cards, food permissions and staffing. Demonstrate opening, evacuation and relevant equipment rescue. Close critical findings. Obtain the approvals below and issue a controlled copy to the site. Release can exclude a clearly separated activity.
Approval
Name and signature
Date
Technical validation
Food validation if applicable
Head of Operations
GM or authorized executive
Review annually and after an incident, equipment change, menu change, layout change or regulatory change. The document owner records revisions, withdraws superseded copies and arranges staff retraining. This revision takes effect at each site only after the required approvals are completed.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 11, $fecsop$Approval and document control$fecsop$, $fecsop$DC01  |  Applies to all procedures in the INF-CC site manual
CONTROL FIELD
CONTROLLED VALUE
Manual ID and revision
E3-INF-CC-MAN-001 / Revision 1.0
Document date
21 September 2026
Effective date
To be entered after approval: __________________
Scheduled review
12 months from effective date, or earlier following change or incident
Status
For approval; no signature or authority approval is implied
Owner and master copy
Head of Operations FEC and IT / designated controlled document repository
Superseded revision
First standalone site issue; derived from corporate manual revision 4.0.
Procedure identification
E3-INF-CC-C01 to C09; applicable A modules; F01 to F05; R01 to R10.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 12, $fecsop$Preparation review and approval$fecsop$, $fecsop$ROLE
NAME
SIGNATURE
DATE
Prepared by Operations
Technical review Maintenance or Inspector
Food safety review Food Lead
Qatar compliance review Designated Lead
Approved by GM or Authorized Executive
Each reviewer confirms only the scope within their competence. The approved manual is released with completed site verification R08 and activity cards R03. A management signature does not replace a statutory permit or equipment inspection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 13, $fecsop$Language and communication$fecsop$, $fecsop$Maintain this English master and controlled translations where required by the relevant authority or staff comprehension needs. E3 requires Arabic and English guest safety notices and receipts. Staff must demonstrate understanding of their assigned procedures; record the briefing language and assessment result.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 14, $fecsop$Revision distribution and records$fecsop$, $fecsop$DC02  |  Document lifecycle and traceability
REV
CHANGE
RELEASE
1.0
First standalone manual for INF-CC. Contains local instructions, full applicable SOPs and site records. Based on corporate revision 4.0.
Pending site approval$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 15, $fecsop$Controlled distribution$fecsop$, $fecsop$COPY OR ACCESS ID
LOCATION OR HOLDER
ISSUED BY AND DATE
OLD COPY WITHDRAWN
The document controller records approval and effective date, grants access to the approved master, distributes site copies and removes superseded copies. Printed copies are uncontrolled unless registered. Amendments require impact review, approval and briefing before use. Site supervisors must not edit safety limits locally without authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 16, $fecsop$Records management$fecsop$, $fecsop$RECORD FAMILY
CUSTODIAN AND CONTROL
R01 R02 R07 daily operations
Site Supervisor; complete during the shift and review exceptions before handover.
R03 R04 equipment and defects
Maintenance Lead with Operations; link to asset serial, inspection evidence and return-to-service authorization.
R05 incidents and safeguarding
Authorized Operations and safeguarding personnel; restricted access and preservation of evidence.
R06 finance and complaints
Finance and Site Supervisor; reconcile transactions and retain approval references.
R08 site authorization
Head of Operations; link current licenses, plans, training and permissions.
R09 R10 food and cookery
Food PIC; retain supplier, batch, monitoring, deviation and verification evidence.
The compliance lead approves a retention schedule using applicable law, permit conditions, insurer requirements and legal holds. Record retention period, disposal authority and storage location for each record class. Do not apply a generic operating-log period to CCTV, child, medical or financial records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 17, $fecsop$Qatar compliance and procedure framework$fecsop$, $fecsop$DC03  |  Requirements mapping and site release
This is the E3 controlled-document format. Applicable Qatar laws, permit conditions, approved property plans and manufacturer instructions govern its implementation. ISO 10013 provides guidance on organisation-specific documented information [S20]; it is not a Qatar government template or evidence of certification.
REQUIREMENT AREA
REQUIRED SITE EVIDENCE
MANUAL LINK
Commercial activities
Licensed entity, trading name, commercial registration and permitted activities for each location.
R08; LOC01–07
Food service and cookery
Applicable permissions; current MoPH code; named food PIC; approved menu, process flow, hazard analysis and monitoring records.
F01–F05; R09 R10
Fire and life safety
Current Civil Defence and property approvals as applicable; occupancy, exits, assembly and emergency access arrangements.
C01 C06; R08
Outdoor work and heat
Applicable Ministerial Decision 17 of 2021; work scheduling, heat risk assessment, WBGT checks and welfare arrangements.
CAR-AP; R03 R08
Consumer information
Current applicable consumer-protection requirements; displayed prices, accurate service information, receipts and complaint route [S21].
C02 C09; R06
CCTV and personal information
Applicable law and permissions; approved camera plan, access and retention controls.
C09; R08
Equipment integrity
Asset-specific manuals, inspection scope and certificates, validated limits, competent operators and rescue arrangements.
A01–A06; R03 R04$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 18, $fecsop$Standard procedure structure$fecsop$, $fecsop$Each operating SOP identifies its purpose, scope, responsible roles, operating steps, corrective action, required records and reference basis. Revision, approval and effective-date controls in DC01 apply to the complete manual. Local work instructions must identify the related SOP and asset or activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 19, $fecsop$Release rule$fecsop$, $fecsop$The compliance lead records the applicable authority, document title, revision or issue date, relevant requirement and supporting evidence. Resolve discrepancies before site release. If authority requirements or manufacturer instructions conflict, stop the affected activity and obtain a documented technical or regulatory resolution. Smaller sites may simplify administration but must retain the necessary safety coverage.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 20, $fecsop$Qatar requirements and verification register$fecsop$, $fecsop$REQUIREMENTS 01
The compliance lead must maintain current authority requirements and supporting documents for each licensed entity and site. Complete all verification items before authorization. This register supports compliance management and does not replace statutory approvals.
Area
Required operating evidence
Verification required
Business and premises
Correct CR and commercial activity, premises permission, landlord agreement and conditions for each attraction or food activity. Track expiry and owner.
Site documents required; verify permit scope.
Fire and life safety
Current applicable Civil Defence approval, approved occupancy and drawings, alarm and firefighting maintenance, exit plan and property emergency interface.
Retain current Civil Defence approvals, plans and inspection schedules.
Food services
Applicable MoPH and municipal approvals, food handler fitness and training evidence, PIC, approved food safety plan and current MoPH food service code.
MoPH purpose verified [S08]; October 2020 copy reviewed [S19]. Current edition to confirm.
Outdoor and heat exposed work
Implement Ministerial Decision 17 of 2021: work schedule, risk assessment, monitoring, water, rest and training.
Official decision translation hosted by ILO reviewed [S09].
CCTV and privacy
Confirm applicability of Law 9 of 2011 and personal data requirements; retain approved camera plan, retention basis and access rules.
Law title found; full current legal requirements not verified [S16].
Guest information
Compliance lead validates Arabic consumer information, receipts, price displays, terms and complaint process. E3 requires bilingual safety notices and receipts.
E3 policy; local legal wording to verify.
Employment and contractors
HR verifies work authorization, lawful schedules, breaks, competent staff, contractor permissions and insurance conditions.
Site HR and contract evidence required.
Heat rule: covered work is prohibited from 10:00 to 15:30, 1 June to 15 September. Stop exposed work when WBGT exceeds 32.1°C. E3 uses 32.1°C or above as its conservative stop trigger. WBGT is not ordinary air temperature. Training, risk assessment and health surveillance requirements remain relevant beyond opening hours [S09].
Missing or expired permission: stop the affected activity and obtain written clearance. A renewal application, supplier assurance or mall verbal agreement is not itself permission to operate.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 21, $fecsop$International standards and inspection approach$fecsop$, $fecsop$REQUIREMENTS 02
Use these references to specify and verify the safety system. They are not automatically Qatar law. The competent inspector must confirm the edition, scope, installation date, amendments and local acceptance for each asset. Full paid standards were not reviewed clause by clause.
Reference
Application
Evidence to obtain
ISO 45001 2018 with applicable amendment [S10]
Worker safety management framework.
Risk register, worker participation, training, investigations and audit trail.
ISO 9001 2015 with applicable amendment [S11]
Documented service and quality controls.
Controlled procedures, supplier checks, complaint closure and change records.
ISO 22000 2018 and Codex CXC 1 1969 revised 2022 [S12 S13]
Food safety management and HACCP framework.
Validated menu based hazards, monitoring, corrective action and verification.
EN 14960 family and HSE inflatable guidance [S14]
Appropriate inflatable play devices.
Applicable standard and OEM limits, initial and periodic inspection, pressure and evacuation evidence.
EN 1176 family including enclosed play and inspection parts; EN 1177
Soft play and impact attenuating surfacing where within scope.
Inspector to select current applicable editions and confirm design, entrapment, access and surface tests.
ASTM F2970 25 [S15]
Trampoline courts within its scope.
Current catalogue identified; obtain full standard and applicable installation review.
EN 13814 family or appropriate ASTM F24 standards
Carousel and other amusement devices where applicable.
Inspector to establish accepted design, operation and inspection basis; do not mix design codes.
HSE HSG175 third edition [S17]
Supplementary amusement operation guidance.
Competent inspections, operating manual, maintenance, modification and operator training.
E3 baseline: preopening checks every operating day; active observation throughout use; formal supervisor checks hourly; detailed weekly walk; monthly management audit. Commission specialist inspections at the OEM, authority or inspector interval, with annual independent review as the proposed company baseline for rides and applicable inflatables. Shorter requirements prevail.
A daily checklist does not replace engineering inspection. Certificates must identify the actual serial number, scope, test results, defects and next due date. Do not describe E3 as ISO certified unless a valid certificate covers the relevant entity and activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 22, $fecsop$Implementation training and management review$fecsop$, $fecsop$IMPLEMENTATION 01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 23, $fecsop$Before frontline release$fecsop$, $fecsop$Head of Operations assigns an owner to every R08 gap. Verify legal permissions and all critical equipment, food and emergency controls first. Keep unresolved activities closed. Obtain missing technical manuals and full applicable standards through the responsible competent professionals. Approve a site specific effective date only when the release conditions are met.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 24, $fecsop$Practical competency$fecsop$, $fecsop$Role
Must demonstrate before independent work
Every employee
Stop authority, emergency communication, child safeguarding and defect reporting.
Entrance and cashier
Correct ticket, capacity count, guardian matching, refund control and outage process.
Activity operator
Preuse check, restrictions, safe dispatch, intervention, shutdown and equipment emergency response.
Supervisor
Post coverage and relief, opening decision, evacuation coordination and incident evidence.
Food staff and PIC
Handwashing, separation, probe use, allergy order, batch disposition and cleaning.
Cookery instructor
Age appropriate task briefing, child count, tool control, allergy controls and hot zone separation.
Training record: employee ______ role ______ SOP codes ______ trainer ______ date ______ practical scenario ______ result ______ retraining ______ authorization ______. Reading or signing the manual alone is insufficient. Repeat assessment after a relevant incident, change or failed observation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 25, $fecsop$First month after release$fecsop$, $fecsop$Week 1: supervise opening and closing every day and resolve unclear instructions. Week 2: observe peak capacity and relief arrangements. Week 3: run a relevant scenario such as lost child, deflation, ride stoppage or food withdrawal. Week 4: audit records and adjust deployment from actual evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 26, $fecsop$Monthly review$fecsop$, $fecsop$Review incidents and near misses per guest visits, critical defects, overdue inspections, staffing gaps, food control failures, complaints, cash variances, training competence and action closure. Do not reward low incident counts in a way that discourages reporting. Record management decisions, budgets, owners and due dates.
No site is released by this document alone. The completed evidence and demonstrated behavior are the basis for safe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 27, $fecsop$Reference register$fecsop$, $fecsop$SOURCES 01
Reference review date 21 September 2026. Maintain current editions of applicable standards, authority requirements and manufacturer instructions. Photograph captions identify their sources; publicity images do not replace current site inspection records.
S01 E3 attraction directory and source photographs
Reference photographs identify InflataPark, Urban Arena, Kidz Driving School and Crayons and Bricks Place Vendôme. Directory location and time fields conflict with other listings; not used as verified addresses or hours.
S02 City Center Doha Inflata Park
Mall source establishing the venue at City Center.
S03 City Center Doha Kids City Driving School
Mall source supporting the correction of the KDS activity identity.
S04 BookingQube InflataPark
Ticketing reference. Equipment limits must follow validated manufacturer instructions.
S05 BookingQube Kids City Driving School
Describes driving and soft play. Product offer is not an asset inventory.
S06 BookingQube Urban Arena
Identifies Doha Mall and advertised driving, arena, console and soft play categories.
S07 BookingQube Crayons and Bricks Vendome
Creative activity description. Current trading status and facilities need confirmation.
S08 MoPH Food Safety Code of Practice for Food Services
Ministry text reproduced by Lexis. Purpose and HACCP approach accessible; current official edition not retrieved. Historical operational text reviewed separately [S19].
S09 Qatar Ministerial Decision 17 of 2021 on heat stress
ILO hosts the decision translation. Articles 2 to 4 establish covered hours and mitigation duties; original Arabic and later applicable requirements must be checked for legal use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 28, $fecsop$Standards references and verification requirements$fecsop$, $fecsop$SOURCES 02
S10 ISO 45001 2018
Occupational health and safety management catalogue; includes amendment information.
S11 ISO 9001 2015
Quality management catalogue. Confirm applicable amendments and transition at adoption.
S12 ISO 22000 2018
Food safety management catalogue; includes HACCP and prerequisite program context.
S13 Codex codes of practice
Lists General Principles of Food Hygiene CXC 1 1969, revised 2022.
S14 HSE inflatable safety advice
Public practical guidance. UK legal and scheme references are not presented as Qatar obligations.
S15 ASTM F2970 25
Current edition identified through ASTM catalogue. Full paid clauses not reviewed.
S16 Qatar CCTV Law 9 of 2011
Title identified in Qatar legal portal search. Confirm current legal text before setting retention periods or approving camera alterations.
S17 HSE HSG175 third edition
Supplementary amusement management and inspection guidance. Not an assertion that UK law applies in Qatar.
S18 Hamad Medical Corporation Ambulance Service
Supports immediate 999 contact, accurate location and following dispatcher instructions.
S19 MoPH food code October 2020 copy
Third party hosted ministry document, revision 0. Sections 6.8.2, 7.2, 7.3, 7.5 and 7.6 reviewed for food limits; confirm authenticity and current official revision before release.
Outstanding site records: attach current photographs, measured plans, approvals and asset records for INF-CC. Confirm any approved food or cookery scope, menus and facilities. Complete R08 and the relevant activity cards before authorizing operations.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 29, $fecsop$Document format and Qatar references$fecsop$, $fecsop$SOURCES 03  |  Format review dated 21 September 2026$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 30, $fecsop$S20 ISO 10013 2021$fecsop$, $fecsop$Quality management systems — Guidance for documented information. The published scope supports development and maintenance of documentation tailored to an organisation. The E3 layout, numbering, A4 paper, approval blocks and registers are company document controls; they are not prescribed Qatar typography or a claim of ISO certification.
https://www.iso.org/standard/75736.html$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 31, $fecsop$S21 Qatar Ministry of Commerce and Industry$fecsop$, $fecsop$Consumer Services identifies Law No. 8 of 2008 and official consumer-rights guidance. Maintain accurate information, pricing and the appropriate complaint route; confirm applicable legal and permit details before adopting site-specific terms.
https://www.moci.gov.qa/en/consumer$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 32, $fecsop$Application of Qatar requirements$fecsop$, $fecsop$Maintain current official requirements in the compliance register. The MoPH food-service code uses a HACCP-based approach [S08]. Outdoor work is assessed against Ministerial Decision 17 of 2021 [S09]. Fire, occupancy and emergency arrangements must follow the applicable site approvals. Government forms required for licenses or inspections remain separate from this internal SOP manual.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 33, $fecsop$Controlled format specification$fecsop$, $fecsop$ELEMENT
E3 DOCUMENT RULE
Page and typography
A4 portrait; clear heading hierarchy; readable body text; repeating document identification and page count.
Identification
Manual and procedure IDs; revision; effective date; owner; controlled approval and distribution.
Procedure content
Purpose; scope and responsibility; operating steps; corrective action; records and reference basis.
Site application
Location title and code; applicable modules; staffing coverage; inspection and release evidence.
Change control
Recorded revision, reviewer approvals, withdrawal of old copies and staff briefing.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-MANUAL$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C01$fecsop$,
  $fecsop$C01 Opening and staffing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C01$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Ensure the site opens only with safe facilities, competent staff and released activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Site supervisor  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Read the last handover and defect register before admitting anyone. Confirm the site and every proposed activity have current release status; remove closed activities from ticket sales.
2. Record who is actually present and competent. Name the duty supervisor, first aid responder, entrance controller, activity attendants and relief staff. Conduct a short briefing on defects, expected groups, emergency roles and guest needs.
3. Walk the guest route and every activity. Check exits, evacuation gates, floor condition, barriers, lighting, accessible routes, first aid supplies and communication. Verify property systems through the agreed interface; do not trigger fire alarms without coordination.
4. Operators complete the equipment specific preuse checks and empty test cycles required on R03. Confirm safety signage, limits, emergency controls and inspection validity. Check that isolated equipment cannot be accessed.
5. Food PIC releases food service separately. Cashier checks approved prices, bilingual receipt output, float and payment terminal. Confirm clocks, wristbands or ticket numbers and the guest count method.
6. Supervisor checks the results, records OPEN, PART OPEN or CLOSED and signs R01. Photograph significant defects without capturing identifiable guests unnecessarily. Admit only to released areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not open with a blocked exit, missing safety critical operator, unknown capacity, failed safety device, unsafe food service or an overdue required equipment examination. A small site may share administrative roles, but cannot leave its entrance or activity unsupervised to serve a customer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 opening record, staff post plan and asset check sheets. Head of Operations reviews failed openings and recurring staffing gaps. Provide planned relief; if relief fails, pause admissions and clear or close the affected activity safely.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C02$fecsop$,
  $fecsop$C02 Admission capacity and guest release$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C02$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control admission, capacity, participation and authorized child collection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Entrance controller and supervisor  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Explain the purchased activity, time, price, restrictions, supervision arrangement and refund terms before payment. Use approved Arabic and English information and practical demonstrations when needed.
2. Check the relevant activity card for age, height, weight, clothing, ability, capacity and permitted accompanying adults. Apply limits discreetly. Do not rely on appearance to judge a borderline restriction or ask staff to make medical diagnoses.
3. Use a linked child and guardian identifier for sessions involving children. Record necessary contact and collection details in the approved system. Tell the guardian whether they must remain inside or immediately available; never imply childcare without an approved service.
4. Count all people for premises occupancy, including adults and staff. Count participants separately for each activity. Effective capacity is the lowest validated premises, equipment and staffed supervision capacity. Stop sales and admission at the limit.
5. Brief guests before the activity starts. Remove loose items and require activity appropriate footwear or socks. Offer reasonable support for disability or sensory needs within safe equipment use; escalate uncertain accommodations before participation.
6. At departure verify the collection identifier and authorized adult. Resolve missing bands or disputed collection through the supervisor using independent checks. Keep the child safely supervised; do not release solely because an adult knows their name.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop entry when counting fails, guardian arrangements are unclear, limits cannot be verified, a child is distressed or a guest cannot comply with essential safety rules. Never lock an emergency escape route to contain children.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 occupancy checks, session entry and exit records, and R05 for release exceptions. Only necessary guest information is collected. No ad hoc ID photographs on personal phones.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C03$fecsop$,
  $fecsop$C03 Supervision handover and closing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C03$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain active supervision and a complete shift handover and safe closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and activity operators  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Position attendants from the approved zone plan, including blind corners, raised platforms, slide landing areas and exits. Keep a clear line of sight and move through the assigned zone. CCTV supplements physical supervision.
2. Intervene immediately in dangerous behavior, overcrowding, equipment changes or blocked routes. Explain the rule, stop the specific unsafe action and remove the guest from the activity when needed. Do not allow revenue targets to influence safety decisions.
3. Record a supervisor check each hour and after a group arrival, spill, fault or significant weather change. Confirm headcounts, staff coverage, hygiene, queue position and defect barriers. An hourly check does not replace continuous supervision.
4. Before breaks or shift changes, the replacement receives the guest count, current restrictions, incidents, equipment state and pending tasks face to face. The departing operator remains until the replacement accepts the post.
5. Before closing, stop sales in time to deliver paid sessions. Check all play levels, toilets if within the site, party spaces and quiet corners without unsafe entry. Account for every child and guardian. Complete the final ride or session and unload safely.
6. Shut equipment down in the OEM sequence. Clean and isolate defects; secure chemicals, batteries, cash and lost property. Keep required refrigeration, alarms and security systems running. Sign R02 and give the next shift unresolved actions and owners.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Pause the affected activity when visibility, lighting, noise or staffing prevents effective supervision. No operator may run a ride while handling cash or responding to unrelated messages.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R02 handover and closing, R04 faults and the hourly log. Supervisor reconciles remaining guests before locking public access; emergency egress follows the property plan.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C04$fecsop$,
  $fecsop$C04 Injury medical emergency and evidence$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C04$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Coordinate prompt emergency assistance, protect guests and preserve incident evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop the immediate source of harm. Secure the area without causing a second incident. Call the trained first aid responder and supervisor; do not move a casualty unless necessary to escape immediate danger or directed by emergency responders.
2. For a serious injury, breathing difficulty, unconsciousness, suspected severe allergic reaction or other urgent medical concern, call 999 immediately. Give the site name, mall or park, floor, closest access point, patient details and hazards; follow the dispatcher’s instructions [S18].
3. Send a named staff member to guide responders from the agreed entrance. Notify mall or park security. Keep a clear access route and arrange continued supervision or safe evacuation of other guests.
4. Contact the guardian promptly. Provide first aid only within current training and the emergency dispatcher’s instructions. Do not administer routine medicines, diagnose the injury or pressure the guest to resume play.
5. Preserve the scene and equipment state where safe. Record factual observations, times and witness contacts. Ask IT or security to preserve relevant original footage and record who accessed it. Do not film the injured person for staff chat groups.
6. Inform Head of Operations immediately for serious events. Complete R05 before the end of shift. The designated compliance lead assesses authority, property and insurer notifications without delaying any statutory deadline. Investigate causes and check equivalent assets across sites.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Equipment involved remains isolated until the technical cause and safe return conditions are established. Severe or unexplained incidents require competent technical review. A customer declining treatment does not clear the equipment.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 incident report, preservation log, technical findings and corrective actions. Reopening requires written technical clearance where relevant and Operations authorization. Respond with care and facts; do not speculate about blame or liability.
Reference basis: HMC emergency access guidance [S18] and E3 incident procedure$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C05$fecsop$,
  $fecsop$C05 Missing child and safeguarding$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C05$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Locate missing children promptly and protect children from harm.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Treat a missing child report as urgent. Obtain the child’s description, name, last known location and time, guardian contact and any relevant support needs. Notify property security and the supervisor immediately; assign one incident coordinator.
2. Stop new admissions if they distract from the response. Staff monitor normal entry and exit points while maintaining free emergency escape. Allocate named search zones and report cleared zones to the coordinator. Do not abandon other children.
3. Ask authorized security personnel to review relevant CCTV. Share the minimum description needed over the agreed radio channel; do not broadcast sensitive family information or circulate a child’s photo in public chat groups.
4. If abduction is suspected, the child is in immediate danger or security cannot resolve the situation promptly, contact police through 999. Do not wait for a preset search period or a manager’s permission in a credible emergency.
5. For a found child, use a visible safe location with two staff where practicable. Verify the collecting adult against the entry record and independent identifying information. Escalate discrepancies to security; never resolve a custody dispute yourself.
6. For safeguarding concerns, listen without leading questions, record the child’s words accurately and refer immediately to the safeguarding lead and appropriate emergency or protection authority. Never promise secrecy or investigate an allegation against yourself.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No isolated one to one contact, unauthorized photography, corporal punishment or unnecessary touching. Seek guardian consent for routine assistance. Necessary immediate action to prevent serious harm must not be delayed for consent; document it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 records search timeline, staff zones, security reference, guardian checks and outcome. Keep safeguarding information restricted. Release staff accused of harm from child contact pending a fair review, without presenting allegations as proven.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C06$fecsop$,
  $fecsop$C06 Fire evacuation and utility failure$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C06$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Evacuate safely and control the effects of fire and essential utility failure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor under property emergency command  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. On an alarm, smoke, fire or instruction to evacuate, raise the alert and call emergency services when required. Follow the approved property evacuation plan. Stop admissions and activities; do not delay for cash, shoes or personal belongings.
2. Operators stop rides and release guests by the trained method. Clear inflatable users promptly while safe inflation is maintained if possible; do not turn off blowers as a routine evacuation step while users remain unless electrical or fire danger requires it.
3. Direct people by the safe approved route. Use the planned assistance arrangements for children and people with reduced mobility. Do not use ordinary lifts in a fire. Staff must not enter smoke, climb structures or improvise rescues.
4. Sweep only assigned areas that remain safe, report unchecked areas and proceed to the assembly point. Reconcile staff, groups and child records as far as practicable; give missing person details and last known locations to responders. Never reenter to search.
5. For a power failure without fire, stop affected admissions, maintain emergency lighting and arrange safe equipment unloading or inflatable evacuation. An emergency stop reset does not prove the installation is safe. Protect refrigerated food using F02.
6. For loss of water, drainage, ventilation or essential lighting, stop the affected food or guest activity. Isolate contamination and inform the property. Resume only after the responsible technical or food lead verifies restoration and the supervisor records authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No trade during a fire alarm or unsafe evacuation condition. Only the property or emergency authority can clear reentry after their incident; Operations then separately checks attraction readiness. Never silence or bypass alarms to continue service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 event record and R08 emergency plan. Drills follow property and authority requirements; E3 proposes a quarterly staff scenario exercise and at least a six monthly coordinated evacuation exercise, subject to property agreement. Record learning and retrain failed roles.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C07$fecsop$,
  $fecsop$C07 Maintenance isolation and change control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C07$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C07  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent access to defective equipment and authorize return to service using evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Maintenance lead and supervisor  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop use, remove guests and secure the defect area. Identify the asset and write the fault and time on R04. For a critical defect, physically prevent access; a sign alone is insufficient.
2. A competent authorized technician isolates every relevant energy source, including electrical, mechanical, stored pressure and battery power. Apply the documented lockout method and verify isolation before work. Operators do not open energized cabinets or bridge safety devices.
3. Maintenance raises the repair request and purchase requisition with defect evidence and urgency. Route commercial approval through the authorized matrix. Isolation happens immediately and is not conditional on purchase approval.
4. Use qualified contractors with property permits, task risk assessment and controlled work area. Confirm parts are suitable and traceable. Record repair details and required inspections; do not accept temporary tape or improvised fasteners as structural repair.
5. After repair, the technician records measurements and OEM test results. A competent independent examiner reviews safety critical repairs or modifications where required. Restore guards, remove tools, account for workers and complete empty tests before any guest trial.
6. Technical signoff confirms equipment condition; Operations authorizes reopening and updates the activity card, training and asset history. For new games, changed locations, cut frames, added food equipment or changed software safety settings, complete change review before installation or use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not reopen after a failed safety device, unknown fault, structural damage or unexplained repeated stop until the cause is resolved. Customer testing is never a commissioning method. No verbal repair closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R04 defect and release record; asset register, parts and inspection certificates. Critical faults are escalated immediately; major issues receive same shift management review. E3 planning targets do not authorize unsafe continued operation.
Reference basis: E3 maintenance workflow; supplementary lifecycle guidance in HSG175 [S17]$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C08$fecsop$,
  $fecsop$C08 Cleaning chemicals and infection control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C08$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C08  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control hygiene hazards, chemicals and contamination in public and activity areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and cleaning lead  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Use an approved cleaning schedule identifying the surface, product, dilution, contact time, method, frequency and responsible person. Check compatibility with inflatable fabrics, pads, screens and food contact equipment. Keep chemical safety information available.
2. Before opening, remove debris, clean high contact areas and confirm floors and equipment are dry and safe. Clean shared accessories between users where required by the activity assessment. Inspect public contact surfaces hourly and clean whenever soiled.
3. For vomit, blood, faeces or other body fluid, close the contaminated area immediately and protect neighboring play or food. A trained cleaner uses the assessed PPE and appropriate disinfectant. Do not dry brush or spray contamination toward guests.
4. Remove visible contamination, clean, apply the approved disinfectant at its specified concentration and contact time, then rinse where required. Remove damaged porous material that cannot be safely decontaminated. Dispose of waste in the designated sealed route.
5. Keep cleaning tools separated between toilets, general areas and food. Label chemicals and lock them away from children and food. Never mix products or put chemicals into beverage containers. Isolate electrical equipment safely before cleaning.
6. Supervisor checks completion, dryness, chemical removal and any required ventilation before reopening. For suspected communicable illness clusters, notify the food or health lead and seek appropriate authority guidance; preserve records of affected sessions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Close affected areas when contamination cannot be contained, potable water or handwashing is unavailable, pests affect safety, or the correct cleaning method is unknown. Odor and visual appearance alone do not establish hygiene.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning record, product instructions, pest records and R05 where illness is reported. Ball pits and inaccessible enclosed areas need a documented deep cleaning method and schedule set from use, manufacturer guidance and risk, not an invented universal interval.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-C09$fecsop$,
  $fecsop$C09 Payments complaints records and continuity$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C09$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-C09  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain traceable payments, fair complaint handling and secure operating records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor cashier and IT lead  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Process each sale in the approved POS under individual credentials. Display approved prices and issue receipts showing purchased service and payment. Record authorized discounts, refunds and complimentary entries with reason and approver; never share manager credentials.
2. If POS or connectivity fails, notify IT and stop new sales unless a preapproved numbered offline ticket and payment process is available. Continue accurate capacity and child release controls. Never accept card details in messages or use personal accounts for company payments.
3. At close, reconcile cash, terminal batches, POS totals, online bookings, refunds, voids and offline tickets. Two people count where available. At a small site, use a sealed cash handover and independent Finance review. Record differences without offsetting them against unrelated transactions.
4. Acknowledge complaints, establish facts and offer a solution within authority. Escalate safety, safeguarding, discrimination, food illness and data concerns immediately. Do not tie a refund or complimentary service to removing a review or giving a positive rating.
5. Restrict guest, CCTV, HR and incident data by role. Use company systems, secure passwords and approved backups. Preserve incident footage promptly; do not copy it to personal devices. Confirm legal retention and camera alteration requirements before making changes.
6. On suspected cyber compromise, contact IT, protect affected systems through the approved response and preserve logs. IT validates recovery and reconciles transactions before reconnection. AI kiosks cannot override admission limits, access children’s records freely or initiate equipment movement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop transactions when traceability, payment security or safe capacity control is lost. A camera fault affecting an approved safeguarding control requires a supervisor risk decision and compensating staff coverage or closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R06 reconciliation and complaint records, IT tickets and access log. Apply the approved retention schedule in DC02; incident and child records require specific access, preservation and retention decisions. Legal hold overrides deletion. CCTV retention is separately verified, not set by this manual.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-C09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-A01$fecsop$,
  $fecsop$A01 Inflatable operation and loss of pressure$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A01$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-A01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-A01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate inflatable attractions within validated pressure and evacuation conditions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-A01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Authorized inflatable operator  |  Applies to: INF-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-A01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Match the asset, blower and inspection record. Check seams, fabric, anchors, blower guards, tube connections, valves, mats and exit access. Use the approved pressure instrument and record pressure against the OEM range before admission.
2. Complete the manufacturer and competent inspector approved empty deflation and evacuation readiness check. Record that escape time and shape retention are adequate. Do not perform improvised daily power interruptions on a complex installation without its validated procedure.
3. Assign posts to every active zone, slide dispatch point and blind area. Separate users by size and ability; enforce the approved capacity and restrictions. Keep pockets clear, remove sharp accessories and apply the approved socks and clothing rules.
4. Dispatch slides only after the previous rider clears the landing zone. Prevent climbing outer walls, headfirst sliding, flips, wrestling and intentional collisions. Keep access points clear and close any zone that cannot be observed effectively.
5. Observe inflation continuously; log pressure at the approved interval and after a blower or power change. E3 proposes hourly logging unless the OEM or risk assessment requires a shorter interval. Stop at sagging, unusual noise, detached tubing or out of range pressure.
6. On deflation, stop entry, give a clear exit instruction and guide everyone by the designated nearest safe exits. Confirm all zones clear. Do not reinflate with people trapped within folds; call trained rescue or emergency services where needed. Investigate and obtain technical clearance before restarting.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-A01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No operation without valid pressure limits, usable measuring equipment, safe anchorage, an effective evacuation method or required inspection. Do not import outdoor wind limits as indoor structural design criteria.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-A01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 pressure range and response card, R01 readings, R04 faults and periodic inspection evidence. Legacy “over 100 kg” rule requires asset specific validation.
Reference basis: HSE inflatable guidance [S14] informs pressure, supervision and evacuation safeguards; detailed deployment is E3 policy$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-A01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-F01$fecsop$,
  $fecsop$F01 Food scope suppliers and personal hygiene$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F01$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-F01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control food scope, supplier acceptance, staff hygiene and cross-contamination.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to cafés kitchens parties edible art and cookery$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$Use a separate food release for each site. Classify the offer as sealed packaged resale, open ready to eat preparation, cooking or reheating, or children’s cookery. A license for one scope does not establish permission for another. The complete current MoPH food code and permit conditions must be checked by the food lead before operational approval [S08].
1. Appoint a trained PIC whenever food is handled. Confirm staff fitness and required local food handler documentation. Staff report vomiting, diarrhoea, infected wounds or relevant illness before starting; the PIC excludes or restricts duties and obtains appropriate clearance.
2. Provide a dedicated accessible handwash point with potable water, soap and hygienic drying. Wash before food handling and after toilets, cleaning, cash, raw food and contamination. Gloves do not replace handwashing; change them between incompatible tasks.
3. Use approved suppliers and keep delivery, batch, expiry and traceability records. Inspect transport hygiene, packaging, pests, damage and temperatures before accepting food. Reject untraceable, expired, damaged or out of limit deliveries; log the reason.
4. Keep raw foods separate from ready to eat products, with raw items below them in storage. Separate allergens and chemicals. Label opened containers and prepared items with identity, preparation or opening time, use by decision and responsible person. Use earliest expiry first.
5. Use standardized recipes and approved substitutions only. Retain ingredient labels for allergen checks. Do not assume a halal claim or imported product approval from a brand name; obtain relevant supplier and regulatory evidence.
6. Restrict children and unauthorized staff from production areas. Store knives and hot equipment safely. Agree catering delivery access and waste removal with the property; protect guest routes and maintain cold or hot chain during transfer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No open food handling without handwashing, safe water, traceability and a competent PIC. Use R07 and R09. A mall food court, external caterer or birthday cake supplier does not remove E3’s checks at receipt and service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$Approved food scope, supplier register, staff fitness records, R07 cleaning, R09 batches and R10 hazard-control plan. Food PIC reviews evidence before release. Reference basis: MoPH food-service code [S08 S19].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-F02$fecsop$,
  $fecsop$F02 Food temperature control and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F02$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-F02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain validated food temperatures and documented corrective action throughout the process.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Qatar code benchmarks and proposed E3 monitoring$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$The October 2020 MoPH code copy [S19] informs these benchmarks. Confirm the current official edition and validate each menu before release. Monitoring frequencies are E3 controls unless specified otherwise. Use a calibrated clean food probe and record actual product readings, not just equipment displays.
Stage
E3 operating limit and monitoring
If the check fails
Chilled food
Receive and display below 4°C; E3 storage target 0 to 3°C unless the product requires colder. Check deliveries, opening, every 2 hours and close; displays after 30 minutes and hourly.
Reject delivery. Isolate stock; assess documented time and temperature. Unknown history means discard.
Frozen food
Receive and hold below minus 18°C; E3 target minus 20°C unless the product requires colder. Check deliveries and storage as above.
Reject thawed or abused stock. Transfer only under PIC control; do not refreeze without an approved process.
Cooking and reheating
E3 default core temperature at least 75°C for 30 seconds; use a validated recipe and check each batch at the coldest point. Reheat only once.
Continue heating if safe and recheck. Never serve an unverified batch; discard if safe recovery is not established.
Hot holding
Above 64°C; E3 target at least 65°C. Check at setup, after 30 minutes and hourly. Measure the coldest food, not only unit air.
Remove from service. Discard if below 64°C for over 2 hours or history is unknown; PIC controls any earlier recovery. Do not top up.
Cooling if authorized
Cool to 5°C or below within 2 hours; record start, interim and final core readings. Then maintain the approved chilled storage target.
Do not cool at sites without validated equipment. Discard failed or unrecorded batches unless a qualified lead approves a validated corrective process.
Cold chain failure: keep doors closed, record discovery time and temperatures, transfer to verified storage where possible and label HOLD. The PIC decides disposition from evidence. A normal fridge reading after power returns does not prove the food remained safe.
Probe verification: check against an appropriate reference such as a correctly prepared ice slurry; the food lead sets the instrument tolerance and calibration interval. Take the instrument out of use if outside its validated tolerance. Record calibration and any affected food decisions.
The October 2020 code has ambiguous cooling subparagraphs; this manual adopts its stricter 2 hour endpoint pending PIC confirmation. Do not substitute a foreign 6 hour rule. Validate capacity, portion size and cooling equipment. R09 records each batch and decision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$The PIC applies the stage-specific action above, records the affected batch and decision in R09, and escalates repeated failures to the food lead.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 temperature and disposition records; R10 validated process plan; probe verification and equipment service records. Reference basis: MoPH code copy [S19], subject to current-edition verification.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-F03$fecsop$,
  $fecsop$F03 Allergens service and suspected food illness$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F03$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-F03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent allergen exposure and respond to suspected food illness or allergic reactions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to: INF-CC; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Maintain an ingredient and allergen matrix for every recipe, bought in item, sauce, garnish and activity ingredient. Check manufacturer labels on each change or delivery substitution. Include allergens beyond any standard list when a guest identifies them.
2. Ask about allergies at booking and confirm at service. Pass the request to the PIC, who checks the written recipe and cross contact controls. Never guess, remove a visible ingredient as a cure, or promise “allergen free” without a validated basis.
3. Use clean dedicated equipment and protected ingredients for an approved allergy order. Prevent shared scoops, oil, cloths, gloves or work surfaces from transferring allergens. Identify the order and hand it directly to the correct guest or guardian.
4. If the kitchen cannot control the identified risk, explain that clearly before accepting the order or cookery participant. Offer only a genuinely suitable alternative confirmed from its ingredients and handling. Do not rely on a waiver to permit an unsafe food exposure.
5. Serve within the approved temperature and time controls. Protect displays and use utensils rather than bare hands for ready to eat food. Reject unapproved home prepared food for shared service; any approved outside cake needs traceability, ingredients and storage instructions.
6. For suspected serious allergic reaction call 999 and follow trained first aid and dispatcher instructions. For suspected food illness, stop the implicated product, preserve batch and supplier records and quarantine relevant food safely. Notify Operations and the food compliance lead for authority action and traceability investigation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop serving when ingredients are unknown, an allergy order is mixed up, food is contaminated or a temperature history is missing. Do not quietly replace the dish without recording the incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 allergen and batch records, R05 illness or reaction report, supplier traceability and product withdrawal record. Record affected sites and customers where lawful. Do not dispose of potential evidence until the food lead determines safe preservation and any authority needs.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-F04$fecsop$,
  $fecsop$F04 Children cookery class operation$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F04$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-F04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Conduct approved children’s cookery sessions with safe food, tools and supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Cookery lead and food PIC  |  Applies to: INF-CC; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Approve the recipe, age range, ingredient list, allergen matrix, equipment and lesson plan before advertising. Define a cold assembly or decorating class separately from a hot cooking class. No cooking activity is assumed to exist at a location simply because it serves food.
2. Before accepting participants, obtain guardian consent, contact and relevant allergy information. Set the class size from safe workstations, instructor sightlines, task hazards and escape space. Assign an instructor and a separate safety or entry support role where simultaneous tasks require it.
3. Clean and release the work area. Provide handwashing, child suitable utensils, stable work surfaces and protected ingredients. Keep craft paints, dough and cleaning products separate. Secure hair and loose clothing; supervise handwashing before food contact.
4. Demonstrate each task before issuing tools. Start with low risk preparation. E3 default: children do not handle raw meat, hot oil, boiling liquids, powered blades, gas controls or ovens. Any higher risk teaching requires a specific assessed and authorized program.
5. Adults control hot trays and cooking. Keep a physical hot zone outside child reach and routes. Check food temperatures and cool products to a safe handling temperature before returning them to children. Do not allow tasting of raw batter or uncooked flour mixtures.
6. Count tools back and verify all participants before collection. Label take home food with ingredients and allergens, preparation date and the validated storage and use instructions. Discard food handled unsafely and reset the workstation between classes.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Cancel or pause the class for an uncontrolled allergy, missing guardian arrangement, unsuitable staffing, lost tool, failed handwashing or inability to separate hot work. A small kiosk may offer only the low risk food scope that its facilities can safely support.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 cookery card, participant consent, R09 recipe and allergen release, temperature checks and R07 cleaning. A parent’s presence does not replace the instructor’s safety duty.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-F05$fecsop$,
  $fecsop$F05 Kitchen equipment cleaning and shutdown$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F05$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-INF-CC-F05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate and clean kitchen equipment safely and complete a controlled shutdown.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC and maintenance lead  |  Applies to: INF-CC; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before use inspect guards, power leads, switches, hot surfaces, drainage and required extraction. Check refrigerators, ice machines and beverage equipment for cleanliness and correct condition. Do not use equipment with a safety fault.
2. Operate cooking appliances only with the approved ventilation and fire protection arrangements. No LPG cylinders, portable burners or new heat producing equipment without the necessary property and authority approval. Never bypass a guard or use water on an electrical or cooking oil fire.
3. For slush, ice, coffee and similar machines, use potable water and approved ingredients. Record batch and expiry, follow manufacturer cleaning and disassembly intervals, and keep nozzles and food contact parts protected. Do not continually top up old product.
4. Separate cash handling and food handling. Use a controlled cleaning sequence: remove debris, wash, rinse where needed, sanitize using the approved product, contact time and concentration, then air dry. Follow a dishwasher’s validated temperature or chemical cycle where fitted.
5. For maintenance, stop food production in the affected zone, protect or remove food and apply C07. The food PIC checks for metal, glass, chemicals, pests and residue before food service restarts. Obtain specialist support for kitchen equipment where internal competence is absent.
6. At close, dispose of expired or unsafe food, label retained stock, record temperatures, clean surfaces and drains, remove waste and complete pest checks. Shut down heat and nonessential equipment through its procedure while preserving refrigeration and required safety systems.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop cooking for failed extraction, uncontrolled grease, fire protection impairment, unsafe gas or electricity, sewage backup or pest contamination. Only trained authorized staff use the correct firefighting equipment when safe; evacuation takes priority.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning and pest log, R09 food records, R04 maintenance and food restart authorization. Agree specialist service scope, preventive maintenance and contractor access in writing; Operations does not substitute informal cash payment for maintenance approvals.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-F05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R01$fecsop$,
  $fecsop$R01 Daily opening and hourly record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R01$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R01  |  Copy for each site and operating day
Site INF-CC ____  Date __________  Supervisor __________  Shift __________
First aid responder __________  Entrance controller __________  Relief __________
Preopening check
Pass Fail NA
Defect or evidence reference
Permissions inspection dates and previous handover reviewed
Post coverage and relief confirmed
Exits routes lights and communication ready
First aid and emergency information ready
Equipment checks and empty tests completed
Limits signs barriers and gates correct
Cleaning and dry safe surfaces confirmed
Food PIC release completed or food absent
POS receipts float and counting method ready
Defective areas isolated and removed from sale
Decision: OPEN / PART OPEN / CLOSED    Excluded areas __________________
Supervisor signature __________  Time __________  Defect record numbers __________
Time
Premises count / limit
Activity count / limit
Posts safe
Action and initials
Repeat hourly and after changes. Record actual inflatable pressure or weather values on the asset sheet when applicable. A failed critical check cannot be marked N/A. Attach operator sheets for every ride, vehicle, inflatable and game requiring preuse tests.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R02$fecsop$,
  $fecsop$R02 Closing and shift handover$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R02$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R02  |  Copy for each shift
Site INF-CC ____  Date __________  Outgoing __________  Incoming __________
Closing check
Result
Exception and action
All guests cleared and children collected
Play levels rooms and quiet areas checked
Equipment stopped and secured in OEM sequence
Food temperatures stock and disposal recorded
Cleaning waste and pest check complete
Faults tagged and inaccessible
Cash POS card and tickets reconciled
Lost property logged and secured
Doors cameras alarms and required utilities checked$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Handover notes$fecsop$, $fecsop$Topic
Outstanding item and owner
Incidents and safeguarding
Bookings groups and allergies
Equipment and contractor visits
Staffing and relief
Stock and food
IT cash and other actions
Keys and controlled items transferred __________________________________
Final guest count ______  Closure time ______  Next shift restrictions __________
Outgoing signature __________  Incoming acceptance __________  Time __________
If there is no incoming shift, submit the record to the supervisor’s designated manager and secure the approved master copy. Do not close a defect because the venue is closed for the night.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R03$fecsop$,
  $fecsop$R03 Activity operating card and risk review$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R03$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R03  |  One approved card for every activity or distinct zone
Site INF-CC ____  Activity __________  Asset and serial __________  Revision __________
Field
Validated entry and source document
OEM manual and inspection expiry
Approved age height weight and ability restrictions
Equipment participants and premises occupancy limits
Operating settings pressure speed or weather limits
Staff posts and minimum coverage including relief
PPE clothing footwear and loose item controls
Preuse inspection and empty test sequence
Loading briefing session and unloading sequence
Emergency stop isolation and rescue method
Cleaning inspection and maintenance intervals
Technical reviewer and Operations approval
Attach a marked plan showing gates, sightlines, escape, emergency controls and the guest flow. No universal staffing ratio is established by this form.
Hazard and persons exposed
Existing control
Further action and owner
Residual risk
Suggested assessment: likelihood 1 to 5 × severity 1 to 5. E3 management reviews 10 to 25 before release; 15 to 25 remains closed pending risk reduction. Any missing critical safeguard overrides the score. Risk scores do not prove engineering compliance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R04$fecsop$,
  $fecsop$R04 Defect isolation and return to service$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R04$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R04  |  One record per defect
Site INF-CC ____  Asset __________  Serial __________  Record number __________
Detected by __________  Date and time __________  Severity __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Fault and immediate control$fecsop$, $fecsop$Describe what was observed and operating conditions __________________________
___________________________________________________________________
Guest exposure or incident link __________  Photo or log reference __________
Activity stopped at __________  Barrier and tag __________  Sales blocked __________
Energy isolation by __________  Lock or permit reference __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Repair and verification$fecsop$, $fecsop$Maintenance owner __________  PR or work order __________  Due date __________
Repair and parts fitted __________________________________________________
___________________________________________________________________
Cause identified __________  Similar assets checked __________
Required test
Acceptance criterion
Actual result
Tester$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Reopening decision$fecsop$, $fecsop$Specialist inspection needed? YES / NO    Basis ______________________________
Technical clearance by __________  Date __________  Certificate __________
Guards tools work area and staff briefing checked by __________________________
Operations release by __________  Time __________  Restrictions _______________
Result: CLOSED / RELEASED WITH VALIDATED RESTRICTIONS / RELEASED
A signature without test evidence is not technical clearance. A restricted release cannot bypass a failed safety device or keep an unresolved critical hazard accessible.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R05$fecsop$,
  $fecsop$R05 Incident missing child and safeguarding record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R05$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R05  |  Restricted access
Site INF-CC ____  Record number __________  Date and time __________
Type: INJURY / NEAR MISS / FOOD / MISSING CHILD / SAFEGUARDING / OTHER
Reporter __________  Supervisor __________  Activity or food batch __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Facts and immediate response$fecsop$, $fecsop$What happened and where ______________________________________________
___________________________________________________________________
Observed condition or exact words ________________________________________
___________________________________________________________________
First aid responder __________  Action within training _________________________
999 called at __________  Property security at __________  Guardian at __________
Emergency service reference __________  Guest or guardian contact ______________
Time
Action or search zone
Person
Outcome$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Evidence and safe collection$fecsop$, $fecsop$Witness details held at __________  CCTV time range __________  Preservation by __________
Equipment isolation reference __________  Photos or batch evidence __________
Child release verification and authorized adult _______________________________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Followup and closure$fecsop$, $fecsop$Operations notified __________  Compliance notification decision __________
Authority or insurer reference __________  Action owner and deadline __________
Root cause and prevention ______________________________________________
Closure reviewer __________  Date __________  Reopening record __________
Record observations separately from opinions. Do not copy medical or safeguarding detail into ordinary group chats. For an unresolved emergency, continue response rather than completing paperwork.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R06$fecsop$,
  $fecsop$R06 Cash reconciliation and service recovery$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R06$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R06  |  Cashier and supervisor record
Site INF-CC ____  Date __________  Cashier __________  POS shift __________
Reconciliation item
QAR or count
Evidence reference
Opening cash float
Cash sales and other authorized cash movements
Cash refunds and documented cash drops
Expected closing cash
Actual closing cash
Variance actual minus expected
Card POS total versus terminal settlement
Online sales and admissions matched
Offline tickets issued used void and returned
Discounts refunds and complimentary admissions
Expected cash = float + cash receipts - cash refunds - recorded cash removals. Explain every other authorized movement. Do not include card receipts in expected physical cash.
Variance explanation __________  Finance escalation __________  Seal number __________
Cashier signature __________  Independent review __________  Time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Complaint or service recovery$fecsop$, $fecsop$Reference __________  Guest contact if needed __________  Date __________
Issue and facts ________________________________________________________
Resolution offered __________  Refund or concession __________
Authority and approval reference __________  Followup owner __________
Guest informed at __________  Root cause action __________  Closed by __________
Safety or safeguarding complaint linked to R05 __________. Do not offer a concession in exchange for a rating or review removal.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R07$fecsop$,
  $fecsop$R07 Cleaning inspection and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R07$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R07  |  Working hygiene and safety record
Site INF-CC ____  Date __________  Supervisor or PIC __________
Area or item
Product method and contact time
Due / done
Checked by
Product dilution or concentration verified __________  Test method __________
Contamination isolation reference __________  Reopened by and time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Weekly safety and pest walk$fecsop$, $fecsop$Check
Finding and owner
Due date
Closed evidence
Structure barriers pads and floors
Exits signs fire access and first aid
Electrical guards charging and lighting
Hygiene water drains and pest signs
Food permits allergens and temperatures
Training staffing and overdue defects
Pest contractor reference __________  Chemical treatment restrictions __________
No spraying during occupied food or play sessions. Follow the authorized reentry and food protection instructions.
Inspector __________  Signature __________  Management review date __________
Critical finding: stop now, record R04 or R05 and escalate immediately. Assign every corrective action an owner and evidence requirement. A due date cannot justify continued unsafe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R08$fecsop$,
  $fecsop$R08 Site validation and emergency information$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R08$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R08  |  Site authorization for INF-CC
Site INF-CC ____  Legal name __________  Address unit floor __________
Release evidence
Document reference
Verified by and date
Trading food and premises permissions where applicable
Approved occupancy plan and escape arrangements
Asset inventory manuals and specialist inspections
R03 cards and critical limit validation
Staffing sightlines relief and first aid coverage
Food scope and menu controls or recorded N/A
Fire maintenance property interfaces and insurance
CCTV privacy access and retention basis
Emergency and rescue demonstrations completed
Current site photographs and measured plan$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Emergency information to post at the site$fecsop$, $fecsop$Emergency services 999 [S18]    Property security __________    Duty supervisor __________
Site access and responder meeting point ___________________________________
Primary exit __________  Alternative exit __________  Assembly location __________
Assistance and refuge arrangement __________  First aid location __________
Electrical isolation __________  Fire controls held by __________  Backup contact __________
Attach the approved marked plan. Do not create an escape route from a photograph.
Activities excluded from release __________________________________________
Technical signoff __________  Food signoff __________  Operations __________
GM authorization __________  Effective date __________  Review date __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R09$fecsop$,
  $fecsop$R09 Food batch allergen and cookery record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R09$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R09  |  Copy sheets as needed
Site INF-CC ____  Date __________  PIC __________  Menu or class __________
Food or ingredient
Supplier batch expiry
Receipt temperature
Accept reject
Batch and step
Start time and temp
Check time and temp
Action and initials
Steps include cooking, reheating, cooling and holding. Copy for each batch and required check. Fridge or freezer unit __________  Opening ______  2 hourly ______  Close ______
Recipe or menu item
All ingredients and allergens
Cross contact controls
PIC release$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Cookery or edible activity session$fecsop$, $fecsop$Recipe revision __________  Age group __________  Approved capacity __________
Instructor __________  Entry and safety support __________  Actual participants __________
Guardian consent and allergy check reference __________  Tool count out / in __________
Handwash and station release __________  Hot work adult __________
Take home label and use instructions __________  Children collected __________
Unsafe food or allergen incident reference __________  Disposition approved by __________
Record probe verification, recipe validation and any supplier substitution on attached sheets. Keep participant medical and contact details in the restricted register, not on a public counter.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$INF-CC-R10$fecsop$,
  $fecsop$R10 Food hazard analysis and control plan$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R10$fecsop$,
  $fecsop$site-manuals/INF-CC/E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$INF-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R10  |  Complete for each approved menu or cookery process
Site INF-CC ____  Menu or recipe __________  Revision ______  Food PIC __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Process and intended use$fecsop$, $fecsop$Product and ingredients __________  Intended consumers __________  Allergens __________Process flow reference __________  Flow verified on site by __________  Date __________Storage and shelf life basis __________  Take-home instructions __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Hazard assessment$fecsop$, $fecsop$PROCESS STEP
HAZARD AND CAUSE
CONTROL MEASURE
CCP DECISION AND BASIS
Assess biological, chemical, physical and allergen hazards. The qualified food lead determines whether each control is managed through prerequisite hygiene procedures or as a critical control point. Do not classify every temperature check automatically as a CCP.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Control and verification$fecsop$, $fecsop$CONTROL ELEMENT
APPROVED PLAN
Critical limit and validation source
Monitoring what how when and responsible person
Immediate correction and affected product disposition
Root cause and preventive action
Verification method frequency and reviewer
Required monitoring and deviation records
Approved by Food Lead __________  Signature __________  Date __________Operator briefing completed __________  Review due __________
Revalidate following a menu, supplier, allergen, equipment, process, capacity or regulatory change. Link actual batch monitoring to R09. This worksheet supports a site-specific HACCP plan; it does not constitute approval of an unassessed process. Reference basis: MoPH HACCP approach [S08] and Codex hygiene framework [S13].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$INF-CC-R10$fecsop$;

INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, $fecsop$Imported from E3_INF-CC_Site_SOP_Manual_V1.0.docx$fecsop$
FROM public.sop_documents d
WHERE d.code LIKE $fecsop$INF-CC-%$fecsop$
  AND NOT EXISTS (
    SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id AND v.version = 1
  );

DELETE FROM public.sop_sections s USING public.sop_documents d WHERE s.document_id = d.id AND d.code LIKE $fecsop$KDS-CC-%$fecsop$;
INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-MANUAL$fecsop$,
  $fecsop$Site SOP manual$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$MANUAL$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, $fecsop$Contents and navigation$fecsop$, $fecsop$DOCUMENT GUIDE
SECTION
PAGE
Site profile and local operating procedures
3–4
Document control and Qatar framework
5–8
Common operating procedures C01 to C09
9–17
Activity procedures A02, A03
18–19
Conditional food and cookery procedures F01 to F05
20–24
Qatar and international requirements
25–26
Site records and forms R01 to R10
27–36
Training and management review
37
References and document framework
38–40$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$How to use the manual$fecsop$, $fecsop$This document is the standalone site manual for Kids City Driving School at City Center Doha. Read the site instructions, then apply C01 to C09 and the activity procedures included here. The food and cookery section is conditional: use only procedures within the site’s approved scope and mark non-applicable activities in R08.
Complete R08 before site release and R03 for each activity. Use R01 and R02 daily. Record exceptions on R04 to R09; use R10 to document the approved food hazard-control plan.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Kids City Driving School$fecsop$, $fecsop$LOCATION 02  /  CITY CENTER DOHA  /  KDS-CC
SITE CONTROL
REQUIREMENT
Operating scope
Children’s driving and soft play
Responsible owner
Site Supervisor; accountable to Head of Operations
Required procedures
C01 to C09; A02, A03. F01 to F05 only for approved food or cookery activities.
Staff deployment
Track operator; soft play attendant; entrance control; supervisor and relief.
Kids City Driving School | Operator-published reference image [S01]. Verify current layout through R08.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Operational priorities$fecsop$, $fecsop$Vehicle checks, protected loading, track control and separate soft play capacity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$Daily supervisor checklist$fecsop$, $fecsop$Before opening: complete R01, confirm staffing and relief, inspect exits and release each activity. During operation: control admission, maintain sightlines and record required checks. At close: account for every child, isolate defects, reconcile sales and complete R02.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$Site operating procedures$fecsop$, $fecsop$KDS-CC  /  SOP 02  /  Kids City Driving School at City Center Doha
1. Open track and soft play separately. Record a daily inspection for every vehicle, track barrier and play zone. Remove a failed vehicle from guest access and update available fleet capacity before selling sessions.
2. Keep a protected loading position and a separate spectator route. Before each driving session, explain start, stop, direction and no exit while moving. Verify the child can safely use the controls and that any passenger seat is approved.
3. Maintain dedicated track observation and entry control. Stop all approaching vehicles before recovering a stalled vehicle or assisting a child on track. For combined tickets, transfer children between attractions through a supervised neutral area.
4. Adults enter soft play for approved supervision only. Reconcile the inherited 90 kg rule with the specific structure and trampoline, if any. A driving ticket does not waive soft play restrictions.
5. For birthdays or school groups, record organizer, group count, guardian responsibilities, allergen needs, time slots and settlement. Name a host in addition to mandatory operating posts. Count the group at arrival, each transition and departure.
6. At close, secure keys, vehicle controls and charging access. Inspect barriers after the final session, record collisions and faults, reconcile accessories and ensure no child remains in the mini city or play structure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 7, $fecsop$Local stop conditions$fecsop$, $fecsop$No safe separation from pedestrians, unreliable braking or remote stop, inadequate lighting, damaged containment, exposed charging leads or insufficient sightlines means the affected activity closes. Do not carry out vehicle battery changes in a live guest lane.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 8, $fecsop$Evidence required before release$fecsop$, $fecsop$Validated legal name; plan showing track and pedestrian paths; each vehicle’s type, serial number, speed and loading limits; charging method and battery chemistry; play structure limits; zone staffing and relief; party occupancy; emergency access; food permission and outside cake policy. Attach vehicle daily check sheets to R01.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 9, $fecsop$Document control and authorization$fecsop$, $fecsop$CONTROL 02
Role
Accountability
GM or authorized executive
Approve policy, resources and delegated financial limits; no commercial waiver of safety restrictions.
Head of Operations
Own the manual, approve site deployment and capacity reductions, review incidents and authorize site release after technical evidence.
Site supervisor
Complete opening decision, assign posts and relief, check controls during trade, stop unsafe activity and sign handover.
Maintenance lead and inspector
Validate equipment records, technical limits, inspection scope and repairs; issue written technical release.
Food PIC
Approve recipes, suppliers, allergen controls, food monitoring and disposition; stop unsafe food service.
HR and training lead
Verify role competency, induction, working arrangements and training records.
IT and privacy lead
Protect POS, CCTV and guest records; approve access and technical recovery.
Every employee
Intervene early, stop danger, summon help and record facts honestly.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 10, $fecsop$Release sequence$fecsop$, $fecsop$Inspect the site and complete R08. Confirm licenses, emergency plan, equipment inspection certificates, operating cards, food permissions and staffing. Demonstrate opening, evacuation and relevant equipment rescue. Close critical findings. Obtain the approvals below and issue a controlled copy to the site. Release can exclude a clearly separated activity.
Approval
Name and signature
Date
Technical validation
Food validation if applicable
Head of Operations
GM or authorized executive
Review annually and after an incident, equipment change, menu change, layout change or regulatory change. The document owner records revisions, withdraws superseded copies and arranges staff retraining. This revision takes effect at each site only after the required approvals are completed.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 11, $fecsop$Approval and document control$fecsop$, $fecsop$DC01  |  Applies to all procedures in the KDS-CC site manual
CONTROL FIELD
CONTROLLED VALUE
Manual ID and revision
E3-KDS-CC-MAN-001 / Revision 1.0
Document date
21 September 2026
Effective date
To be entered after approval: __________________
Scheduled review
12 months from effective date, or earlier following change or incident
Status
For approval; no signature or authority approval is implied
Owner and master copy
Head of Operations FEC and IT / designated controlled document repository
Superseded revision
First standalone site issue; derived from corporate manual revision 4.0.
Procedure identification
E3-KDS-CC-C01 to C09; applicable A modules; F01 to F05; R01 to R10.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 12, $fecsop$Preparation review and approval$fecsop$, $fecsop$ROLE
NAME
SIGNATURE
DATE
Prepared by Operations
Technical review Maintenance or Inspector
Food safety review Food Lead
Qatar compliance review Designated Lead
Approved by GM or Authorized Executive
Each reviewer confirms only the scope within their competence. The approved manual is released with completed site verification R08 and activity cards R03. A management signature does not replace a statutory permit or equipment inspection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 13, $fecsop$Language and communication$fecsop$, $fecsop$Maintain this English master and controlled translations where required by the relevant authority or staff comprehension needs. E3 requires Arabic and English guest safety notices and receipts. Staff must demonstrate understanding of their assigned procedures; record the briefing language and assessment result.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 14, $fecsop$Revision distribution and records$fecsop$, $fecsop$DC02  |  Document lifecycle and traceability
REV
CHANGE
RELEASE
1.0
First standalone manual for KDS-CC. Contains local instructions, full applicable SOPs and site records. Based on corporate revision 4.0.
Pending site approval$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 15, $fecsop$Controlled distribution$fecsop$, $fecsop$COPY OR ACCESS ID
LOCATION OR HOLDER
ISSUED BY AND DATE
OLD COPY WITHDRAWN
The document controller records approval and effective date, grants access to the approved master, distributes site copies and removes superseded copies. Printed copies are uncontrolled unless registered. Amendments require impact review, approval and briefing before use. Site supervisors must not edit safety limits locally without authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 16, $fecsop$Records management$fecsop$, $fecsop$RECORD FAMILY
CUSTODIAN AND CONTROL
R01 R02 R07 daily operations
Site Supervisor; complete during the shift and review exceptions before handover.
R03 R04 equipment and defects
Maintenance Lead with Operations; link to asset serial, inspection evidence and return-to-service authorization.
R05 incidents and safeguarding
Authorized Operations and safeguarding personnel; restricted access and preservation of evidence.
R06 finance and complaints
Finance and Site Supervisor; reconcile transactions and retain approval references.
R08 site authorization
Head of Operations; link current licenses, plans, training and permissions.
R09 R10 food and cookery
Food PIC; retain supplier, batch, monitoring, deviation and verification evidence.
The compliance lead approves a retention schedule using applicable law, permit conditions, insurer requirements and legal holds. Record retention period, disposal authority and storage location for each record class. Do not apply a generic operating-log period to CCTV, child, medical or financial records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 17, $fecsop$Qatar compliance and procedure framework$fecsop$, $fecsop$DC03  |  Requirements mapping and site release
This is the E3 controlled-document format. Applicable Qatar laws, permit conditions, approved property plans and manufacturer instructions govern its implementation. ISO 10013 provides guidance on organisation-specific documented information [S20]; it is not a Qatar government template or evidence of certification.
REQUIREMENT AREA
REQUIRED SITE EVIDENCE
MANUAL LINK
Commercial activities
Licensed entity, trading name, commercial registration and permitted activities for each location.
R08; LOC01–07
Food service and cookery
Applicable permissions; current MoPH code; named food PIC; approved menu, process flow, hazard analysis and monitoring records.
F01–F05; R09 R10
Fire and life safety
Current Civil Defence and property approvals as applicable; occupancy, exits, assembly and emergency access arrangements.
C01 C06; R08
Outdoor work and heat
Applicable Ministerial Decision 17 of 2021; work scheduling, heat risk assessment, WBGT checks and welfare arrangements.
CAR-AP; R03 R08
Consumer information
Current applicable consumer-protection requirements; displayed prices, accurate service information, receipts and complaint route [S21].
C02 C09; R06
CCTV and personal information
Applicable law and permissions; approved camera plan, access and retention controls.
C09; R08
Equipment integrity
Asset-specific manuals, inspection scope and certificates, validated limits, competent operators and rescue arrangements.
A01–A06; R03 R04$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 18, $fecsop$Standard procedure structure$fecsop$, $fecsop$Each operating SOP identifies its purpose, scope, responsible roles, operating steps, corrective action, required records and reference basis. Revision, approval and effective-date controls in DC01 apply to the complete manual. Local work instructions must identify the related SOP and asset or activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 19, $fecsop$Release rule$fecsop$, $fecsop$The compliance lead records the applicable authority, document title, revision or issue date, relevant requirement and supporting evidence. Resolve discrepancies before site release. If authority requirements or manufacturer instructions conflict, stop the affected activity and obtain a documented technical or regulatory resolution. Smaller sites may simplify administration but must retain the necessary safety coverage.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 20, $fecsop$Qatar requirements and verification register$fecsop$, $fecsop$REQUIREMENTS 01
The compliance lead must maintain current authority requirements and supporting documents for each licensed entity and site. Complete all verification items before authorization. This register supports compliance management and does not replace statutory approvals.
Area
Required operating evidence
Verification required
Business and premises
Correct CR and commercial activity, premises permission, landlord agreement and conditions for each attraction or food activity. Track expiry and owner.
Site documents required; verify permit scope.
Fire and life safety
Current applicable Civil Defence approval, approved occupancy and drawings, alarm and firefighting maintenance, exit plan and property emergency interface.
Retain current Civil Defence approvals, plans and inspection schedules.
Food services
Applicable MoPH and municipal approvals, food handler fitness and training evidence, PIC, approved food safety plan and current MoPH food service code.
MoPH purpose verified [S08]; October 2020 copy reviewed [S19]. Current edition to confirm.
Outdoor and heat exposed work
Implement Ministerial Decision 17 of 2021: work schedule, risk assessment, monitoring, water, rest and training.
Official decision translation hosted by ILO reviewed [S09].
CCTV and privacy
Confirm applicability of Law 9 of 2011 and personal data requirements; retain approved camera plan, retention basis and access rules.
Law title found; full current legal requirements not verified [S16].
Guest information
Compliance lead validates Arabic consumer information, receipts, price displays, terms and complaint process. E3 requires bilingual safety notices and receipts.
E3 policy; local legal wording to verify.
Employment and contractors
HR verifies work authorization, lawful schedules, breaks, competent staff, contractor permissions and insurance conditions.
Site HR and contract evidence required.
Heat rule: covered work is prohibited from 10:00 to 15:30, 1 June to 15 September. Stop exposed work when WBGT exceeds 32.1°C. E3 uses 32.1°C or above as its conservative stop trigger. WBGT is not ordinary air temperature. Training, risk assessment and health surveillance requirements remain relevant beyond opening hours [S09].
Missing or expired permission: stop the affected activity and obtain written clearance. A renewal application, supplier assurance or mall verbal agreement is not itself permission to operate.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 21, $fecsop$International standards and inspection approach$fecsop$, $fecsop$REQUIREMENTS 02
Use these references to specify and verify the safety system. They are not automatically Qatar law. The competent inspector must confirm the edition, scope, installation date, amendments and local acceptance for each asset. Full paid standards were not reviewed clause by clause.
Reference
Application
Evidence to obtain
ISO 45001 2018 with applicable amendment [S10]
Worker safety management framework.
Risk register, worker participation, training, investigations and audit trail.
ISO 9001 2015 with applicable amendment [S11]
Documented service and quality controls.
Controlled procedures, supplier checks, complaint closure and change records.
ISO 22000 2018 and Codex CXC 1 1969 revised 2022 [S12 S13]
Food safety management and HACCP framework.
Validated menu based hazards, monitoring, corrective action and verification.
EN 14960 family and HSE inflatable guidance [S14]
Appropriate inflatable play devices.
Applicable standard and OEM limits, initial and periodic inspection, pressure and evacuation evidence.
EN 1176 family including enclosed play and inspection parts; EN 1177
Soft play and impact attenuating surfacing where within scope.
Inspector to select current applicable editions and confirm design, entrapment, access and surface tests.
ASTM F2970 25 [S15]
Trampoline courts within its scope.
Current catalogue identified; obtain full standard and applicable installation review.
EN 13814 family or appropriate ASTM F24 standards
Carousel and other amusement devices where applicable.
Inspector to establish accepted design, operation and inspection basis; do not mix design codes.
HSE HSG175 third edition [S17]
Supplementary amusement operation guidance.
Competent inspections, operating manual, maintenance, modification and operator training.
E3 baseline: preopening checks every operating day; active observation throughout use; formal supervisor checks hourly; detailed weekly walk; monthly management audit. Commission specialist inspections at the OEM, authority or inspector interval, with annual independent review as the proposed company baseline for rides and applicable inflatables. Shorter requirements prevail.
A daily checklist does not replace engineering inspection. Certificates must identify the actual serial number, scope, test results, defects and next due date. Do not describe E3 as ISO certified unless a valid certificate covers the relevant entity and activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 22, $fecsop$Implementation training and management review$fecsop$, $fecsop$IMPLEMENTATION 01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 23, $fecsop$Before frontline release$fecsop$, $fecsop$Head of Operations assigns an owner to every R08 gap. Verify legal permissions and all critical equipment, food and emergency controls first. Keep unresolved activities closed. Obtain missing technical manuals and full applicable standards through the responsible competent professionals. Approve a site specific effective date only when the release conditions are met.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 24, $fecsop$Practical competency$fecsop$, $fecsop$Role
Must demonstrate before independent work
Every employee
Stop authority, emergency communication, child safeguarding and defect reporting.
Entrance and cashier
Correct ticket, capacity count, guardian matching, refund control and outage process.
Activity operator
Preuse check, restrictions, safe dispatch, intervention, shutdown and equipment emergency response.
Supervisor
Post coverage and relief, opening decision, evacuation coordination and incident evidence.
Food staff and PIC
Handwashing, separation, probe use, allergy order, batch disposition and cleaning.
Cookery instructor
Age appropriate task briefing, child count, tool control, allergy controls and hot zone separation.
Training record: employee ______ role ______ SOP codes ______ trainer ______ date ______ practical scenario ______ result ______ retraining ______ authorization ______. Reading or signing the manual alone is insufficient. Repeat assessment after a relevant incident, change or failed observation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 25, $fecsop$First month after release$fecsop$, $fecsop$Week 1: supervise opening and closing every day and resolve unclear instructions. Week 2: observe peak capacity and relief arrangements. Week 3: run a relevant scenario such as lost child, deflation, ride stoppage or food withdrawal. Week 4: audit records and adjust deployment from actual evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 26, $fecsop$Monthly review$fecsop$, $fecsop$Review incidents and near misses per guest visits, critical defects, overdue inspections, staffing gaps, food control failures, complaints, cash variances, training competence and action closure. Do not reward low incident counts in a way that discourages reporting. Record management decisions, budgets, owners and due dates.
No site is released by this document alone. The completed evidence and demonstrated behavior are the basis for safe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 27, $fecsop$Reference register$fecsop$, $fecsop$SOURCES 01
Reference review date 21 September 2026. Maintain current editions of applicable standards, authority requirements and manufacturer instructions. Photograph captions identify their sources; publicity images do not replace current site inspection records.
S01 E3 attraction directory and source photographs
Reference photographs identify InflataPark, Urban Arena, Kidz Driving School and Crayons and Bricks Place Vendôme. Directory location and time fields conflict with other listings; not used as verified addresses or hours.
S02 City Center Doha Inflata Park
Mall source establishing the venue at City Center.
S03 City Center Doha Kids City Driving School
Mall source supporting the correction of the KDS activity identity.
S04 BookingQube InflataPark
Ticketing reference. Equipment limits must follow validated manufacturer instructions.
S05 BookingQube Kids City Driving School
Describes driving and soft play. Product offer is not an asset inventory.
S06 BookingQube Urban Arena
Identifies Doha Mall and advertised driving, arena, console and soft play categories.
S07 BookingQube Crayons and Bricks Vendome
Creative activity description. Current trading status and facilities need confirmation.
S08 MoPH Food Safety Code of Practice for Food Services
Ministry text reproduced by Lexis. Purpose and HACCP approach accessible; current official edition not retrieved. Historical operational text reviewed separately [S19].
S09 Qatar Ministerial Decision 17 of 2021 on heat stress
ILO hosts the decision translation. Articles 2 to 4 establish covered hours and mitigation duties; original Arabic and later applicable requirements must be checked for legal use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 28, $fecsop$Standards references and verification requirements$fecsop$, $fecsop$SOURCES 02
S10 ISO 45001 2018
Occupational health and safety management catalogue; includes amendment information.
S11 ISO 9001 2015
Quality management catalogue. Confirm applicable amendments and transition at adoption.
S12 ISO 22000 2018
Food safety management catalogue; includes HACCP and prerequisite program context.
S13 Codex codes of practice
Lists General Principles of Food Hygiene CXC 1 1969, revised 2022.
S14 HSE inflatable safety advice
Public practical guidance. UK legal and scheme references are not presented as Qatar obligations.
S15 ASTM F2970 25
Current edition identified through ASTM catalogue. Full paid clauses not reviewed.
S16 Qatar CCTV Law 9 of 2011
Title identified in Qatar legal portal search. Confirm current legal text before setting retention periods or approving camera alterations.
S17 HSE HSG175 third edition
Supplementary amusement management and inspection guidance. Not an assertion that UK law applies in Qatar.
S18 Hamad Medical Corporation Ambulance Service
Supports immediate 999 contact, accurate location and following dispatcher instructions.
S19 MoPH food code October 2020 copy
Third party hosted ministry document, revision 0. Sections 6.8.2, 7.2, 7.3, 7.5 and 7.6 reviewed for food limits; confirm authenticity and current official revision before release.
Outstanding site records: attach current photographs, measured plans, approvals and asset records for KDS-CC. Confirm any approved food or cookery scope, menus and facilities. Complete R08 and the relevant activity cards before authorizing operations.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 29, $fecsop$Document format and Qatar references$fecsop$, $fecsop$SOURCES 03  |  Format review dated 21 September 2026$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 30, $fecsop$S20 ISO 10013 2021$fecsop$, $fecsop$Quality management systems — Guidance for documented information. The published scope supports development and maintenance of documentation tailored to an organisation. The E3 layout, numbering, A4 paper, approval blocks and registers are company document controls; they are not prescribed Qatar typography or a claim of ISO certification.
https://www.iso.org/standard/75736.html$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 31, $fecsop$S21 Qatar Ministry of Commerce and Industry$fecsop$, $fecsop$Consumer Services identifies Law No. 8 of 2008 and official consumer-rights guidance. Maintain accurate information, pricing and the appropriate complaint route; confirm applicable legal and permit details before adopting site-specific terms.
https://www.moci.gov.qa/en/consumer$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 32, $fecsop$Application of Qatar requirements$fecsop$, $fecsop$Maintain current official requirements in the compliance register. The MoPH food-service code uses a HACCP-based approach [S08]. Outdoor work is assessed against Ministerial Decision 17 of 2021 [S09]. Fire, occupancy and emergency arrangements must follow the applicable site approvals. Government forms required for licenses or inspections remain separate from this internal SOP manual.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 33, $fecsop$Controlled format specification$fecsop$, $fecsop$ELEMENT
E3 DOCUMENT RULE
Page and typography
A4 portrait; clear heading hierarchy; readable body text; repeating document identification and page count.
Identification
Manual and procedure IDs; revision; effective date; owner; controlled approval and distribution.
Procedure content
Purpose; scope and responsibility; operating steps; corrective action; records and reference basis.
Site application
Location title and code; applicable modules; staffing coverage; inspection and release evidence.
Change control
Recorded revision, reviewer approvals, withdrawal of old copies and staff briefing.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-MANUAL$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C01$fecsop$,
  $fecsop$C01 Opening and staffing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C01$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Ensure the site opens only with safe facilities, competent staff and released activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Site supervisor  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Read the last handover and defect register before admitting anyone. Confirm the site and every proposed activity have current release status; remove closed activities from ticket sales.
2. Record who is actually present and competent. Name the duty supervisor, first aid responder, entrance controller, activity attendants and relief staff. Conduct a short briefing on defects, expected groups, emergency roles and guest needs.
3. Walk the guest route and every activity. Check exits, evacuation gates, floor condition, barriers, lighting, accessible routes, first aid supplies and communication. Verify property systems through the agreed interface; do not trigger fire alarms without coordination.
4. Operators complete the equipment specific preuse checks and empty test cycles required on R03. Confirm safety signage, limits, emergency controls and inspection validity. Check that isolated equipment cannot be accessed.
5. Food PIC releases food service separately. Cashier checks approved prices, bilingual receipt output, float and payment terminal. Confirm clocks, wristbands or ticket numbers and the guest count method.
6. Supervisor checks the results, records OPEN, PART OPEN or CLOSED and signs R01. Photograph significant defects without capturing identifiable guests unnecessarily. Admit only to released areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not open with a blocked exit, missing safety critical operator, unknown capacity, failed safety device, unsafe food service or an overdue required equipment examination. A small site may share administrative roles, but cannot leave its entrance or activity unsupervised to serve a customer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 opening record, staff post plan and asset check sheets. Head of Operations reviews failed openings and recurring staffing gaps. Provide planned relief; if relief fails, pause admissions and clear or close the affected activity safely.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C02$fecsop$,
  $fecsop$C02 Admission capacity and guest release$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C02$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control admission, capacity, participation and authorized child collection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Entrance controller and supervisor  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Explain the purchased activity, time, price, restrictions, supervision arrangement and refund terms before payment. Use approved Arabic and English information and practical demonstrations when needed.
2. Check the relevant activity card for age, height, weight, clothing, ability, capacity and permitted accompanying adults. Apply limits discreetly. Do not rely on appearance to judge a borderline restriction or ask staff to make medical diagnoses.
3. Use a linked child and guardian identifier for sessions involving children. Record necessary contact and collection details in the approved system. Tell the guardian whether they must remain inside or immediately available; never imply childcare without an approved service.
4. Count all people for premises occupancy, including adults and staff. Count participants separately for each activity. Effective capacity is the lowest validated premises, equipment and staffed supervision capacity. Stop sales and admission at the limit.
5. Brief guests before the activity starts. Remove loose items and require activity appropriate footwear or socks. Offer reasonable support for disability or sensory needs within safe equipment use; escalate uncertain accommodations before participation.
6. At departure verify the collection identifier and authorized adult. Resolve missing bands or disputed collection through the supervisor using independent checks. Keep the child safely supervised; do not release solely because an adult knows their name.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop entry when counting fails, guardian arrangements are unclear, limits cannot be verified, a child is distressed or a guest cannot comply with essential safety rules. Never lock an emergency escape route to contain children.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 occupancy checks, session entry and exit records, and R05 for release exceptions. Only necessary guest information is collected. No ad hoc ID photographs on personal phones.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C03$fecsop$,
  $fecsop$C03 Supervision handover and closing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C03$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain active supervision and a complete shift handover and safe closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and activity operators  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Position attendants from the approved zone plan, including blind corners, raised platforms, slide landing areas and exits. Keep a clear line of sight and move through the assigned zone. CCTV supplements physical supervision.
2. Intervene immediately in dangerous behavior, overcrowding, equipment changes or blocked routes. Explain the rule, stop the specific unsafe action and remove the guest from the activity when needed. Do not allow revenue targets to influence safety decisions.
3. Record a supervisor check each hour and after a group arrival, spill, fault or significant weather change. Confirm headcounts, staff coverage, hygiene, queue position and defect barriers. An hourly check does not replace continuous supervision.
4. Before breaks or shift changes, the replacement receives the guest count, current restrictions, incidents, equipment state and pending tasks face to face. The departing operator remains until the replacement accepts the post.
5. Before closing, stop sales in time to deliver paid sessions. Check all play levels, toilets if within the site, party spaces and quiet corners without unsafe entry. Account for every child and guardian. Complete the final ride or session and unload safely.
6. Shut equipment down in the OEM sequence. Clean and isolate defects; secure chemicals, batteries, cash and lost property. Keep required refrigeration, alarms and security systems running. Sign R02 and give the next shift unresolved actions and owners.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Pause the affected activity when visibility, lighting, noise or staffing prevents effective supervision. No operator may run a ride while handling cash or responding to unrelated messages.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R02 handover and closing, R04 faults and the hourly log. Supervisor reconciles remaining guests before locking public access; emergency egress follows the property plan.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C04$fecsop$,
  $fecsop$C04 Injury medical emergency and evidence$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C04$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Coordinate prompt emergency assistance, protect guests and preserve incident evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop the immediate source of harm. Secure the area without causing a second incident. Call the trained first aid responder and supervisor; do not move a casualty unless necessary to escape immediate danger or directed by emergency responders.
2. For a serious injury, breathing difficulty, unconsciousness, suspected severe allergic reaction or other urgent medical concern, call 999 immediately. Give the site name, mall or park, floor, closest access point, patient details and hazards; follow the dispatcher’s instructions [S18].
3. Send a named staff member to guide responders from the agreed entrance. Notify mall or park security. Keep a clear access route and arrange continued supervision or safe evacuation of other guests.
4. Contact the guardian promptly. Provide first aid only within current training and the emergency dispatcher’s instructions. Do not administer routine medicines, diagnose the injury or pressure the guest to resume play.
5. Preserve the scene and equipment state where safe. Record factual observations, times and witness contacts. Ask IT or security to preserve relevant original footage and record who accessed it. Do not film the injured person for staff chat groups.
6. Inform Head of Operations immediately for serious events. Complete R05 before the end of shift. The designated compliance lead assesses authority, property and insurer notifications without delaying any statutory deadline. Investigate causes and check equivalent assets across sites.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Equipment involved remains isolated until the technical cause and safe return conditions are established. Severe or unexplained incidents require competent technical review. A customer declining treatment does not clear the equipment.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 incident report, preservation log, technical findings and corrective actions. Reopening requires written technical clearance where relevant and Operations authorization. Respond with care and facts; do not speculate about blame or liability.
Reference basis: HMC emergency access guidance [S18] and E3 incident procedure$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C05$fecsop$,
  $fecsop$C05 Missing child and safeguarding$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C05$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Locate missing children promptly and protect children from harm.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Treat a missing child report as urgent. Obtain the child’s description, name, last known location and time, guardian contact and any relevant support needs. Notify property security and the supervisor immediately; assign one incident coordinator.
2. Stop new admissions if they distract from the response. Staff monitor normal entry and exit points while maintaining free emergency escape. Allocate named search zones and report cleared zones to the coordinator. Do not abandon other children.
3. Ask authorized security personnel to review relevant CCTV. Share the minimum description needed over the agreed radio channel; do not broadcast sensitive family information or circulate a child’s photo in public chat groups.
4. If abduction is suspected, the child is in immediate danger or security cannot resolve the situation promptly, contact police through 999. Do not wait for a preset search period or a manager’s permission in a credible emergency.
5. For a found child, use a visible safe location with two staff where practicable. Verify the collecting adult against the entry record and independent identifying information. Escalate discrepancies to security; never resolve a custody dispute yourself.
6. For safeguarding concerns, listen without leading questions, record the child’s words accurately and refer immediately to the safeguarding lead and appropriate emergency or protection authority. Never promise secrecy or investigate an allegation against yourself.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No isolated one to one contact, unauthorized photography, corporal punishment or unnecessary touching. Seek guardian consent for routine assistance. Necessary immediate action to prevent serious harm must not be delayed for consent; document it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 records search timeline, staff zones, security reference, guardian checks and outcome. Keep safeguarding information restricted. Release staff accused of harm from child contact pending a fair review, without presenting allegations as proven.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C06$fecsop$,
  $fecsop$C06 Fire evacuation and utility failure$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C06$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Evacuate safely and control the effects of fire and essential utility failure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor under property emergency command  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. On an alarm, smoke, fire or instruction to evacuate, raise the alert and call emergency services when required. Follow the approved property evacuation plan. Stop admissions and activities; do not delay for cash, shoes or personal belongings.
2. Operators stop rides and release guests by the trained method. Clear inflatable users promptly while safe inflation is maintained if possible; do not turn off blowers as a routine evacuation step while users remain unless electrical or fire danger requires it.
3. Direct people by the safe approved route. Use the planned assistance arrangements for children and people with reduced mobility. Do not use ordinary lifts in a fire. Staff must not enter smoke, climb structures or improvise rescues.
4. Sweep only assigned areas that remain safe, report unchecked areas and proceed to the assembly point. Reconcile staff, groups and child records as far as practicable; give missing person details and last known locations to responders. Never reenter to search.
5. For a power failure without fire, stop affected admissions, maintain emergency lighting and arrange safe equipment unloading or inflatable evacuation. An emergency stop reset does not prove the installation is safe. Protect refrigerated food using F02.
6. For loss of water, drainage, ventilation or essential lighting, stop the affected food or guest activity. Isolate contamination and inform the property. Resume only after the responsible technical or food lead verifies restoration and the supervisor records authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No trade during a fire alarm or unsafe evacuation condition. Only the property or emergency authority can clear reentry after their incident; Operations then separately checks attraction readiness. Never silence or bypass alarms to continue service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 event record and R08 emergency plan. Drills follow property and authority requirements; E3 proposes a quarterly staff scenario exercise and at least a six monthly coordinated evacuation exercise, subject to property agreement. Record learning and retrain failed roles.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C07$fecsop$,
  $fecsop$C07 Maintenance isolation and change control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C07$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C07  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent access to defective equipment and authorize return to service using evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Maintenance lead and supervisor  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop use, remove guests and secure the defect area. Identify the asset and write the fault and time on R04. For a critical defect, physically prevent access; a sign alone is insufficient.
2. A competent authorized technician isolates every relevant energy source, including electrical, mechanical, stored pressure and battery power. Apply the documented lockout method and verify isolation before work. Operators do not open energized cabinets or bridge safety devices.
3. Maintenance raises the repair request and purchase requisition with defect evidence and urgency. Route commercial approval through the authorized matrix. Isolation happens immediately and is not conditional on purchase approval.
4. Use qualified contractors with property permits, task risk assessment and controlled work area. Confirm parts are suitable and traceable. Record repair details and required inspections; do not accept temporary tape or improvised fasteners as structural repair.
5. After repair, the technician records measurements and OEM test results. A competent independent examiner reviews safety critical repairs or modifications where required. Restore guards, remove tools, account for workers and complete empty tests before any guest trial.
6. Technical signoff confirms equipment condition; Operations authorizes reopening and updates the activity card, training and asset history. For new games, changed locations, cut frames, added food equipment or changed software safety settings, complete change review before installation or use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not reopen after a failed safety device, unknown fault, structural damage or unexplained repeated stop until the cause is resolved. Customer testing is never a commissioning method. No verbal repair closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R04 defect and release record; asset register, parts and inspection certificates. Critical faults are escalated immediately; major issues receive same shift management review. E3 planning targets do not authorize unsafe continued operation.
Reference basis: E3 maintenance workflow; supplementary lifecycle guidance in HSG175 [S17]$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C08$fecsop$,
  $fecsop$C08 Cleaning chemicals and infection control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C08$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C08  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control hygiene hazards, chemicals and contamination in public and activity areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and cleaning lead  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Use an approved cleaning schedule identifying the surface, product, dilution, contact time, method, frequency and responsible person. Check compatibility with inflatable fabrics, pads, screens and food contact equipment. Keep chemical safety information available.
2. Before opening, remove debris, clean high contact areas and confirm floors and equipment are dry and safe. Clean shared accessories between users where required by the activity assessment. Inspect public contact surfaces hourly and clean whenever soiled.
3. For vomit, blood, faeces or other body fluid, close the contaminated area immediately and protect neighboring play or food. A trained cleaner uses the assessed PPE and appropriate disinfectant. Do not dry brush or spray contamination toward guests.
4. Remove visible contamination, clean, apply the approved disinfectant at its specified concentration and contact time, then rinse where required. Remove damaged porous material that cannot be safely decontaminated. Dispose of waste in the designated sealed route.
5. Keep cleaning tools separated between toilets, general areas and food. Label chemicals and lock them away from children and food. Never mix products or put chemicals into beverage containers. Isolate electrical equipment safely before cleaning.
6. Supervisor checks completion, dryness, chemical removal and any required ventilation before reopening. For suspected communicable illness clusters, notify the food or health lead and seek appropriate authority guidance; preserve records of affected sessions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Close affected areas when contamination cannot be contained, potable water or handwashing is unavailable, pests affect safety, or the correct cleaning method is unknown. Odor and visual appearance alone do not establish hygiene.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning record, product instructions, pest records and R05 where illness is reported. Ball pits and inaccessible enclosed areas need a documented deep cleaning method and schedule set from use, manufacturer guidance and risk, not an invented universal interval.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-C09$fecsop$,
  $fecsop$C09 Payments complaints records and continuity$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C09$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-C09  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain traceable payments, fair complaint handling and secure operating records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor cashier and IT lead  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Process each sale in the approved POS under individual credentials. Display approved prices and issue receipts showing purchased service and payment. Record authorized discounts, refunds and complimentary entries with reason and approver; never share manager credentials.
2. If POS or connectivity fails, notify IT and stop new sales unless a preapproved numbered offline ticket and payment process is available. Continue accurate capacity and child release controls. Never accept card details in messages or use personal accounts for company payments.
3. At close, reconcile cash, terminal batches, POS totals, online bookings, refunds, voids and offline tickets. Two people count where available. At a small site, use a sealed cash handover and independent Finance review. Record differences without offsetting them against unrelated transactions.
4. Acknowledge complaints, establish facts and offer a solution within authority. Escalate safety, safeguarding, discrimination, food illness and data concerns immediately. Do not tie a refund or complimentary service to removing a review or giving a positive rating.
5. Restrict guest, CCTV, HR and incident data by role. Use company systems, secure passwords and approved backups. Preserve incident footage promptly; do not copy it to personal devices. Confirm legal retention and camera alteration requirements before making changes.
6. On suspected cyber compromise, contact IT, protect affected systems through the approved response and preserve logs. IT validates recovery and reconciles transactions before reconnection. AI kiosks cannot override admission limits, access children’s records freely or initiate equipment movement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop transactions when traceability, payment security or safe capacity control is lost. A camera fault affecting an approved safeguarding control requires a supervisor risk decision and compensating staff coverage or closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R06 reconciliation and complaint records, IT tickets and access log. Apply the approved retention schedule in DC02; incident and child records require specific access, preservation and retention decisions. Legal hold overrides deletion. CCTV retention is separately verified, not set by this manual.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-C09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-A02$fecsop$,
  $fecsop$A02 Soft play and trampoline zones$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A02$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-A02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent injury through inspection, participant separation and active play supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Play supervisor  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before opening, walk and inspect accessible levels using safe staff access. Check nets, pads, fixings, exposed edges, slide joints, entrapment hazards, floors, access gates and fire escape from enclosed play. Record inaccessible inspection points for technical followup.
2. For trampoline equipment, separately verify mat, spring covers, frame padding, surrounding clearance and any pit or landing system against its inspection plan. A soft play check does not release a trampoline court.
3. Separate toddler and larger child use by approved zones or sessions. Apply activity specific height, weight and capacity limits. At KDS, adults enter for permitted supervision; UA adults do not enter soft play for recreational participation. Necessary assisted access follows an approved plan.
4. Brief safe use. Slides are feet first with landing clear. Prohibit climbing nets from outside, pushing, climbing against slide flow, food and loose hard objects. For trampolines, prevent double bouncing and multiple users on a single bed; no flips unless a separately approved coached activity exists.
5. Maintain active supervision at hidden corners, level transitions and landing areas. A parent staying inside does not replace an assigned attendant. Stop the activity if a child is distressed, trapped, fatigued or unable to follow safe instructions.
6. Retrieve a distressed or trapped child using the equipment specific trained method. Do not cut nets or dismantle structures as routine retrieval. In immediate danger summon emergency services and protect other guests. Isolate the affected zone for inspection after an incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not use damaged containment, uncovered hard parts, unidentified gaps, unsafe impact surfaces or zones with no practicable rescue access. The inherited 90 kg rule is not a universal equipment rating; retain any tighter established limit while resolving it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 per zone, R01 inspection and R04 defects. Inspector validates EN 1176 and EN 1177 applicability; trampoline scope is assessed separately against an appropriate standard such as ASTM F2970 25 [S15].
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-A03$fecsop$,
  $fecsop$A03 Driving tracks vehicles and charging$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A03$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-A03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control vehicle movement, loading, pedestrian separation and battery charging.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Track operator and maintenance lead  |  Applies to: KDS-CC$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Identify each vehicle and approved track configuration. Inspect steering, speed control, stopping response, wheels, seat, restraint if specified, body panels and battery enclosure. Test remote stop where fitted. Keep defective vehicles physically off the track.
2. Inspect barriers, direction signs, surface grip, intersections, loading bay and pedestrian separation. Confirm permitted number of vehicles, speed settings and spacing from the approved card. No pedestrian shortcuts through an active track.
3. Confirm the child meets the vehicle restrictions, can reach controls and understands the stop signal. Use a stationary demonstration. Seat passengers only in approved positions and fit restraints as specified; a photograph of two children does not establish seating permission.
4. Load only with the vehicle stopped and propulsion controlled. Release vehicles with safe spacing. Monitor intersections and loading. Prohibit deliberate collisions, overtaking where not approved and getting out on an active track.
5. If a vehicle stalls, a child exits or a barrier is struck, stop approaching traffic before anyone enters the lane. Recover the child and vehicle using the trained procedure. Following a collision, inspect both vehicle and barriers before release.
6. Charge only in the approved ventilated protected area away from guests and exits, with the correct charger and electrical protection. Check the battery condition and chemistry specific instructions. Do not charge swollen, hot, leaking or damaged packs. Isolate safely and escalate; smoke or fire requires evacuation and emergency response.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No unapproved speed changes, mismatched chargers, charging in public circulation or operation without dependable stopping. Keep chargers and leads inaccessible to children. Overnight charging requires an approved OEM and property fire risk arrangement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 vehicle and track limits, daily vehicle checks, charging log and R04 faults. Battery disposal uses an approved route. Vehicle number, speed and child limits remain blank until supplied by the OEM and validated on site.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-A03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-F01$fecsop$,
  $fecsop$F01 Food scope suppliers and personal hygiene$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F01$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-F01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control food scope, supplier acceptance, staff hygiene and cross-contamination.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to cafés kitchens parties edible art and cookery$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$Use a separate food release for each site. Classify the offer as sealed packaged resale, open ready to eat preparation, cooking or reheating, or children’s cookery. A license for one scope does not establish permission for another. The complete current MoPH food code and permit conditions must be checked by the food lead before operational approval [S08].
1. Appoint a trained PIC whenever food is handled. Confirm staff fitness and required local food handler documentation. Staff report vomiting, diarrhoea, infected wounds or relevant illness before starting; the PIC excludes or restricts duties and obtains appropriate clearance.
2. Provide a dedicated accessible handwash point with potable water, soap and hygienic drying. Wash before food handling and after toilets, cleaning, cash, raw food and contamination. Gloves do not replace handwashing; change them between incompatible tasks.
3. Use approved suppliers and keep delivery, batch, expiry and traceability records. Inspect transport hygiene, packaging, pests, damage and temperatures before accepting food. Reject untraceable, expired, damaged or out of limit deliveries; log the reason.
4. Keep raw foods separate from ready to eat products, with raw items below them in storage. Separate allergens and chemicals. Label opened containers and prepared items with identity, preparation or opening time, use by decision and responsible person. Use earliest expiry first.
5. Use standardized recipes and approved substitutions only. Retain ingredient labels for allergen checks. Do not assume a halal claim or imported product approval from a brand name; obtain relevant supplier and regulatory evidence.
6. Restrict children and unauthorized staff from production areas. Store knives and hot equipment safely. Agree catering delivery access and waste removal with the property; protect guest routes and maintain cold or hot chain during transfer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No open food handling without handwashing, safe water, traceability and a competent PIC. Use R07 and R09. A mall food court, external caterer or birthday cake supplier does not remove E3’s checks at receipt and service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$Approved food scope, supplier register, staff fitness records, R07 cleaning, R09 batches and R10 hazard-control plan. Food PIC reviews evidence before release. Reference basis: MoPH food-service code [S08 S19].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-F02$fecsop$,
  $fecsop$F02 Food temperature control and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F02$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-F02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain validated food temperatures and documented corrective action throughout the process.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Qatar code benchmarks and proposed E3 monitoring$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$The October 2020 MoPH code copy [S19] informs these benchmarks. Confirm the current official edition and validate each menu before release. Monitoring frequencies are E3 controls unless specified otherwise. Use a calibrated clean food probe and record actual product readings, not just equipment displays.
Stage
E3 operating limit and monitoring
If the check fails
Chilled food
Receive and display below 4°C; E3 storage target 0 to 3°C unless the product requires colder. Check deliveries, opening, every 2 hours and close; displays after 30 minutes and hourly.
Reject delivery. Isolate stock; assess documented time and temperature. Unknown history means discard.
Frozen food
Receive and hold below minus 18°C; E3 target minus 20°C unless the product requires colder. Check deliveries and storage as above.
Reject thawed or abused stock. Transfer only under PIC control; do not refreeze without an approved process.
Cooking and reheating
E3 default core temperature at least 75°C for 30 seconds; use a validated recipe and check each batch at the coldest point. Reheat only once.
Continue heating if safe and recheck. Never serve an unverified batch; discard if safe recovery is not established.
Hot holding
Above 64°C; E3 target at least 65°C. Check at setup, after 30 minutes and hourly. Measure the coldest food, not only unit air.
Remove from service. Discard if below 64°C for over 2 hours or history is unknown; PIC controls any earlier recovery. Do not top up.
Cooling if authorized
Cool to 5°C or below within 2 hours; record start, interim and final core readings. Then maintain the approved chilled storage target.
Do not cool at sites without validated equipment. Discard failed or unrecorded batches unless a qualified lead approves a validated corrective process.
Cold chain failure: keep doors closed, record discovery time and temperatures, transfer to verified storage where possible and label HOLD. The PIC decides disposition from evidence. A normal fridge reading after power returns does not prove the food remained safe.
Probe verification: check against an appropriate reference such as a correctly prepared ice slurry; the food lead sets the instrument tolerance and calibration interval. Take the instrument out of use if outside its validated tolerance. Record calibration and any affected food decisions.
The October 2020 code has ambiguous cooling subparagraphs; this manual adopts its stricter 2 hour endpoint pending PIC confirmation. Do not substitute a foreign 6 hour rule. Validate capacity, portion size and cooling equipment. R09 records each batch and decision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$The PIC applies the stage-specific action above, records the affected batch and decision in R09, and escalates repeated failures to the food lead.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 temperature and disposition records; R10 validated process plan; probe verification and equipment service records. Reference basis: MoPH code copy [S19], subject to current-edition verification.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-F03$fecsop$,
  $fecsop$F03 Allergens service and suspected food illness$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F03$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-F03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent allergen exposure and respond to suspected food illness or allergic reactions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to: KDS-CC; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Maintain an ingredient and allergen matrix for every recipe, bought in item, sauce, garnish and activity ingredient. Check manufacturer labels on each change or delivery substitution. Include allergens beyond any standard list when a guest identifies them.
2. Ask about allergies at booking and confirm at service. Pass the request to the PIC, who checks the written recipe and cross contact controls. Never guess, remove a visible ingredient as a cure, or promise “allergen free” without a validated basis.
3. Use clean dedicated equipment and protected ingredients for an approved allergy order. Prevent shared scoops, oil, cloths, gloves or work surfaces from transferring allergens. Identify the order and hand it directly to the correct guest or guardian.
4. If the kitchen cannot control the identified risk, explain that clearly before accepting the order or cookery participant. Offer only a genuinely suitable alternative confirmed from its ingredients and handling. Do not rely on a waiver to permit an unsafe food exposure.
5. Serve within the approved temperature and time controls. Protect displays and use utensils rather than bare hands for ready to eat food. Reject unapproved home prepared food for shared service; any approved outside cake needs traceability, ingredients and storage instructions.
6. For suspected serious allergic reaction call 999 and follow trained first aid and dispatcher instructions. For suspected food illness, stop the implicated product, preserve batch and supplier records and quarantine relevant food safely. Notify Operations and the food compliance lead for authority action and traceability investigation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop serving when ingredients are unknown, an allergy order is mixed up, food is contaminated or a temperature history is missing. Do not quietly replace the dish without recording the incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 allergen and batch records, R05 illness or reaction report, supplier traceability and product withdrawal record. Record affected sites and customers where lawful. Do not dispose of potential evidence until the food lead determines safe preservation and any authority needs.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-F04$fecsop$,
  $fecsop$F04 Children cookery class operation$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F04$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-F04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Conduct approved children’s cookery sessions with safe food, tools and supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Cookery lead and food PIC  |  Applies to: KDS-CC; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Approve the recipe, age range, ingredient list, allergen matrix, equipment and lesson plan before advertising. Define a cold assembly or decorating class separately from a hot cooking class. No cooking activity is assumed to exist at a location simply because it serves food.
2. Before accepting participants, obtain guardian consent, contact and relevant allergy information. Set the class size from safe workstations, instructor sightlines, task hazards and escape space. Assign an instructor and a separate safety or entry support role where simultaneous tasks require it.
3. Clean and release the work area. Provide handwashing, child suitable utensils, stable work surfaces and protected ingredients. Keep craft paints, dough and cleaning products separate. Secure hair and loose clothing; supervise handwashing before food contact.
4. Demonstrate each task before issuing tools. Start with low risk preparation. E3 default: children do not handle raw meat, hot oil, boiling liquids, powered blades, gas controls or ovens. Any higher risk teaching requires a specific assessed and authorized program.
5. Adults control hot trays and cooking. Keep a physical hot zone outside child reach and routes. Check food temperatures and cool products to a safe handling temperature before returning them to children. Do not allow tasting of raw batter or uncooked flour mixtures.
6. Count tools back and verify all participants before collection. Label take home food with ingredients and allergens, preparation date and the validated storage and use instructions. Discard food handled unsafely and reset the workstation between classes.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Cancel or pause the class for an uncontrolled allergy, missing guardian arrangement, unsuitable staffing, lost tool, failed handwashing or inability to separate hot work. A small kiosk may offer only the low risk food scope that its facilities can safely support.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 cookery card, participant consent, R09 recipe and allergen release, temperature checks and R07 cleaning. A parent’s presence does not replace the instructor’s safety duty.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-F05$fecsop$,
  $fecsop$F05 Kitchen equipment cleaning and shutdown$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F05$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-CC-F05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate and clean kitchen equipment safely and complete a controlled shutdown.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC and maintenance lead  |  Applies to: KDS-CC; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before use inspect guards, power leads, switches, hot surfaces, drainage and required extraction. Check refrigerators, ice machines and beverage equipment for cleanliness and correct condition. Do not use equipment with a safety fault.
2. Operate cooking appliances only with the approved ventilation and fire protection arrangements. No LPG cylinders, portable burners or new heat producing equipment without the necessary property and authority approval. Never bypass a guard or use water on an electrical or cooking oil fire.
3. For slush, ice, coffee and similar machines, use potable water and approved ingredients. Record batch and expiry, follow manufacturer cleaning and disassembly intervals, and keep nozzles and food contact parts protected. Do not continually top up old product.
4. Separate cash handling and food handling. Use a controlled cleaning sequence: remove debris, wash, rinse where needed, sanitize using the approved product, contact time and concentration, then air dry. Follow a dishwasher’s validated temperature or chemical cycle where fitted.
5. For maintenance, stop food production in the affected zone, protect or remove food and apply C07. The food PIC checks for metal, glass, chemicals, pests and residue before food service restarts. Obtain specialist support for kitchen equipment where internal competence is absent.
6. At close, dispose of expired or unsafe food, label retained stock, record temperatures, clean surfaces and drains, remove waste and complete pest checks. Shut down heat and nonessential equipment through its procedure while preserving refrigeration and required safety systems.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop cooking for failed extraction, uncontrolled grease, fire protection impairment, unsafe gas or electricity, sewage backup or pest contamination. Only trained authorized staff use the correct firefighting equipment when safe; evacuation takes priority.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning and pest log, R09 food records, R04 maintenance and food restart authorization. Agree specialist service scope, preventive maintenance and contractor access in writing; Operations does not substitute informal cash payment for maintenance approvals.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-F05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R01$fecsop$,
  $fecsop$R01 Daily opening and hourly record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R01$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R01  |  Copy for each site and operating day
Site KDS-CC ____  Date __________  Supervisor __________  Shift __________
First aid responder __________  Entrance controller __________  Relief __________
Preopening check
Pass Fail NA
Defect or evidence reference
Permissions inspection dates and previous handover reviewed
Post coverage and relief confirmed
Exits routes lights and communication ready
First aid and emergency information ready
Equipment checks and empty tests completed
Limits signs barriers and gates correct
Cleaning and dry safe surfaces confirmed
Food PIC release completed or food absent
POS receipts float and counting method ready
Defective areas isolated and removed from sale
Decision: OPEN / PART OPEN / CLOSED    Excluded areas __________________
Supervisor signature __________  Time __________  Defect record numbers __________
Time
Premises count / limit
Activity count / limit
Posts safe
Action and initials
Repeat hourly and after changes. Record actual inflatable pressure or weather values on the asset sheet when applicable. A failed critical check cannot be marked N/A. Attach operator sheets for every ride, vehicle, inflatable and game requiring preuse tests.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R02$fecsop$,
  $fecsop$R02 Closing and shift handover$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R02$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R02  |  Copy for each shift
Site KDS-CC ____  Date __________  Outgoing __________  Incoming __________
Closing check
Result
Exception and action
All guests cleared and children collected
Play levels rooms and quiet areas checked
Equipment stopped and secured in OEM sequence
Food temperatures stock and disposal recorded
Cleaning waste and pest check complete
Faults tagged and inaccessible
Cash POS card and tickets reconciled
Lost property logged and secured
Doors cameras alarms and required utilities checked$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Handover notes$fecsop$, $fecsop$Topic
Outstanding item and owner
Incidents and safeguarding
Bookings groups and allergies
Equipment and contractor visits
Staffing and relief
Stock and food
IT cash and other actions
Keys and controlled items transferred __________________________________
Final guest count ______  Closure time ______  Next shift restrictions __________
Outgoing signature __________  Incoming acceptance __________  Time __________
If there is no incoming shift, submit the record to the supervisor’s designated manager and secure the approved master copy. Do not close a defect because the venue is closed for the night.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R03$fecsop$,
  $fecsop$R03 Activity operating card and risk review$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R03$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R03  |  One approved card for every activity or distinct zone
Site KDS-CC ____  Activity __________  Asset and serial __________  Revision __________
Field
Validated entry and source document
OEM manual and inspection expiry
Approved age height weight and ability restrictions
Equipment participants and premises occupancy limits
Operating settings pressure speed or weather limits
Staff posts and minimum coverage including relief
PPE clothing footwear and loose item controls
Preuse inspection and empty test sequence
Loading briefing session and unloading sequence
Emergency stop isolation and rescue method
Cleaning inspection and maintenance intervals
Technical reviewer and Operations approval
Attach a marked plan showing gates, sightlines, escape, emergency controls and the guest flow. No universal staffing ratio is established by this form.
Hazard and persons exposed
Existing control
Further action and owner
Residual risk
Suggested assessment: likelihood 1 to 5 × severity 1 to 5. E3 management reviews 10 to 25 before release; 15 to 25 remains closed pending risk reduction. Any missing critical safeguard overrides the score. Risk scores do not prove engineering compliance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R04$fecsop$,
  $fecsop$R04 Defect isolation and return to service$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R04$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R04  |  One record per defect
Site KDS-CC ____  Asset __________  Serial __________  Record number __________
Detected by __________  Date and time __________  Severity __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Fault and immediate control$fecsop$, $fecsop$Describe what was observed and operating conditions __________________________
___________________________________________________________________
Guest exposure or incident link __________  Photo or log reference __________
Activity stopped at __________  Barrier and tag __________  Sales blocked __________
Energy isolation by __________  Lock or permit reference __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Repair and verification$fecsop$, $fecsop$Maintenance owner __________  PR or work order __________  Due date __________
Repair and parts fitted __________________________________________________
___________________________________________________________________
Cause identified __________  Similar assets checked __________
Required test
Acceptance criterion
Actual result
Tester$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Reopening decision$fecsop$, $fecsop$Specialist inspection needed? YES / NO    Basis ______________________________
Technical clearance by __________  Date __________  Certificate __________
Guards tools work area and staff briefing checked by __________________________
Operations release by __________  Time __________  Restrictions _______________
Result: CLOSED / RELEASED WITH VALIDATED RESTRICTIONS / RELEASED
A signature without test evidence is not technical clearance. A restricted release cannot bypass a failed safety device or keep an unresolved critical hazard accessible.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R05$fecsop$,
  $fecsop$R05 Incident missing child and safeguarding record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R05$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R05  |  Restricted access
Site KDS-CC ____  Record number __________  Date and time __________
Type: INJURY / NEAR MISS / FOOD / MISSING CHILD / SAFEGUARDING / OTHER
Reporter __________  Supervisor __________  Activity or food batch __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Facts and immediate response$fecsop$, $fecsop$What happened and where ______________________________________________
___________________________________________________________________
Observed condition or exact words ________________________________________
___________________________________________________________________
First aid responder __________  Action within training _________________________
999 called at __________  Property security at __________  Guardian at __________
Emergency service reference __________  Guest or guardian contact ______________
Time
Action or search zone
Person
Outcome$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Evidence and safe collection$fecsop$, $fecsop$Witness details held at __________  CCTV time range __________  Preservation by __________
Equipment isolation reference __________  Photos or batch evidence __________
Child release verification and authorized adult _______________________________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Followup and closure$fecsop$, $fecsop$Operations notified __________  Compliance notification decision __________
Authority or insurer reference __________  Action owner and deadline __________
Root cause and prevention ______________________________________________
Closure reviewer __________  Date __________  Reopening record __________
Record observations separately from opinions. Do not copy medical or safeguarding detail into ordinary group chats. For an unresolved emergency, continue response rather than completing paperwork.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R06$fecsop$,
  $fecsop$R06 Cash reconciliation and service recovery$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R06$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R06  |  Cashier and supervisor record
Site KDS-CC ____  Date __________  Cashier __________  POS shift __________
Reconciliation item
QAR or count
Evidence reference
Opening cash float
Cash sales and other authorized cash movements
Cash refunds and documented cash drops
Expected closing cash
Actual closing cash
Variance actual minus expected
Card POS total versus terminal settlement
Online sales and admissions matched
Offline tickets issued used void and returned
Discounts refunds and complimentary admissions
Expected cash = float + cash receipts - cash refunds - recorded cash removals. Explain every other authorized movement. Do not include card receipts in expected physical cash.
Variance explanation __________  Finance escalation __________  Seal number __________
Cashier signature __________  Independent review __________  Time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Complaint or service recovery$fecsop$, $fecsop$Reference __________  Guest contact if needed __________  Date __________
Issue and facts ________________________________________________________
Resolution offered __________  Refund or concession __________
Authority and approval reference __________  Followup owner __________
Guest informed at __________  Root cause action __________  Closed by __________
Safety or safeguarding complaint linked to R05 __________. Do not offer a concession in exchange for a rating or review removal.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R07$fecsop$,
  $fecsop$R07 Cleaning inspection and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R07$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R07  |  Working hygiene and safety record
Site KDS-CC ____  Date __________  Supervisor or PIC __________
Area or item
Product method and contact time
Due / done
Checked by
Product dilution or concentration verified __________  Test method __________
Contamination isolation reference __________  Reopened by and time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Weekly safety and pest walk$fecsop$, $fecsop$Check
Finding and owner
Due date
Closed evidence
Structure barriers pads and floors
Exits signs fire access and first aid
Electrical guards charging and lighting
Hygiene water drains and pest signs
Food permits allergens and temperatures
Training staffing and overdue defects
Pest contractor reference __________  Chemical treatment restrictions __________
No spraying during occupied food or play sessions. Follow the authorized reentry and food protection instructions.
Inspector __________  Signature __________  Management review date __________
Critical finding: stop now, record R04 or R05 and escalate immediately. Assign every corrective action an owner and evidence requirement. A due date cannot justify continued unsafe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R08$fecsop$,
  $fecsop$R08 Site validation and emergency information$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R08$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R08  |  Site authorization for KDS-CC
Site KDS-CC ____  Legal name __________  Address unit floor __________
Release evidence
Document reference
Verified by and date
Trading food and premises permissions where applicable
Approved occupancy plan and escape arrangements
Asset inventory manuals and specialist inspections
R03 cards and critical limit validation
Staffing sightlines relief and first aid coverage
Food scope and menu controls or recorded N/A
Fire maintenance property interfaces and insurance
CCTV privacy access and retention basis
Emergency and rescue demonstrations completed
Current site photographs and measured plan$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Emergency information to post at the site$fecsop$, $fecsop$Emergency services 999 [S18]    Property security __________    Duty supervisor __________
Site access and responder meeting point ___________________________________
Primary exit __________  Alternative exit __________  Assembly location __________
Assistance and refuge arrangement __________  First aid location __________
Electrical isolation __________  Fire controls held by __________  Backup contact __________
Attach the approved marked plan. Do not create an escape route from a photograph.
Activities excluded from release __________________________________________
Technical signoff __________  Food signoff __________  Operations __________
GM authorization __________  Effective date __________  Review date __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R09$fecsop$,
  $fecsop$R09 Food batch allergen and cookery record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R09$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R09  |  Copy sheets as needed
Site KDS-CC ____  Date __________  PIC __________  Menu or class __________
Food or ingredient
Supplier batch expiry
Receipt temperature
Accept reject
Batch and step
Start time and temp
Check time and temp
Action and initials
Steps include cooking, reheating, cooling and holding. Copy for each batch and required check. Fridge or freezer unit __________  Opening ______  2 hourly ______  Close ______
Recipe or menu item
All ingredients and allergens
Cross contact controls
PIC release$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Cookery or edible activity session$fecsop$, $fecsop$Recipe revision __________  Age group __________  Approved capacity __________
Instructor __________  Entry and safety support __________  Actual participants __________
Guardian consent and allergy check reference __________  Tool count out / in __________
Handwash and station release __________  Hot work adult __________
Take home label and use instructions __________  Children collected __________
Unsafe food or allergen incident reference __________  Disposition approved by __________
Record probe verification, recipe validation and any supplier substitution on attached sheets. Keep participant medical and contact details in the restricted register, not on a public counter.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-CC-R10$fecsop$,
  $fecsop$R10 Food hazard analysis and control plan$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R10$fecsop$,
  $fecsop$site-manuals/KDS-CC/E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-CC$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R10  |  Complete for each approved menu or cookery process
Site KDS-CC ____  Menu or recipe __________  Revision ______  Food PIC __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Process and intended use$fecsop$, $fecsop$Product and ingredients __________  Intended consumers __________  Allergens __________Process flow reference __________  Flow verified on site by __________  Date __________Storage and shelf life basis __________  Take-home instructions __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Hazard assessment$fecsop$, $fecsop$PROCESS STEP
HAZARD AND CAUSE
CONTROL MEASURE
CCP DECISION AND BASIS
Assess biological, chemical, physical and allergen hazards. The qualified food lead determines whether each control is managed through prerequisite hygiene procedures or as a critical control point. Do not classify every temperature check automatically as a CCP.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Control and verification$fecsop$, $fecsop$CONTROL ELEMENT
APPROVED PLAN
Critical limit and validation source
Monitoring what how when and responsible person
Immediate correction and affected product disposition
Root cause and preventive action
Verification method frequency and reviewer
Required monitoring and deviation records
Approved by Food Lead __________  Signature __________  Date __________Operator briefing completed __________  Review due __________
Revalidate following a menu, supplier, allergen, equipment, process, capacity or regulatory change. Link actual batch monitoring to R09. This worksheet supports a site-specific HACCP plan; it does not constitute approval of an unassessed process. Reference basis: MoPH HACCP approach [S08] and Codex hygiene framework [S13].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-CC-R10$fecsop$;

INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, $fecsop$Imported from E3_KDS-CC_Site_SOP_Manual_V1.0.docx$fecsop$
FROM public.sop_documents d
WHERE d.code LIKE $fecsop$KDS-CC-%$fecsop$
  AND NOT EXISTS (
    SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id AND v.version = 1
  );

DELETE FROM public.sop_sections s USING public.sop_documents d WHERE s.document_id = d.id AND d.code LIKE $fecsop$UA-DM-%$fecsop$;
INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-MANUAL$fecsop$,
  $fecsop$Site SOP manual$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$MANUAL$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, $fecsop$Contents and navigation$fecsop$, $fecsop$DOCUMENT GUIDE
SECTION
PAGE
Site profile and local operating procedures
3–4
Document control and Qatar framework
5–8
Common operating procedures C01 to C09
9–17
Activity procedures A02, A03, A05
18–20
Conditional food and cookery procedures F01 to F05
21–25
Qatar and international requirements
26–27
Site records and forms R01 to R10
28–37
Training and management review
38
References and document framework
39–41$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$How to use the manual$fecsop$, $fecsop$This document is the standalone site manual for Urban Arena at Doha Mall. Read the site instructions, then apply C01 to C09 and the activity procedures included here. The food and cookery section is conditional: use only procedures within the site’s approved scope and mark non-applicable activities in R08.
Complete R08 before site release and R03 for each activity. Use R01 and R02 daily. Record exceptions on R04 to R09; use R10 to document the approved food hazard-control plan.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Urban Arena$fecsop$, $fecsop$LOCATION 03  /  DOHA MALL  /  UA-DM
SITE CONTROL
REQUIREMENT
Operating scope
Interactive games and activity zones
Responsible owner
Site Supervisor; accountable to Head of Operations
Required procedures
C01 to C09; A02, A03, A05. F01 to F05 only for approved food or cookery activities.
Staff deployment
Attendants by active game or arena; entrance control; supervisor and relief.
Urban Arena | Operator-published reference image [S01]. Verify current layout through R08.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Operational priorities$fecsop$, $fecsop$Game separation, low-light circulation, accessory checks and activity-specific release.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$Daily supervisor checklist$fecsop$, $fecsop$Before opening: complete R01, confirm staffing and relief, inspect exits and release each activity. During operation: control admission, maintain sightlines and record required checks. At close: account for every child, isolate defects, reconcile sales and complete R02.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$Site operating procedures$fecsop$, $fecsop$UA-DM  /  SOP 03  /  Urban Arena at Doha Mall
1. Walk the site under actual operating lighting. Check changes in floor level, emergency visibility, game clearances, exit paths and screens. Count and test accessories and release each game individually.
2. Keep driving lanes, mini golf swings, darts throws, billiard cue space and projectile enclosures physically separate from through traffic. A painted line is insufficient if users can enter an active hazard zone.
3. Brief every group on stop signals, no contact and safe retrieval. Control laser tag or projectile sessions with a named marshal. Confirm the actual projectile system and protective equipment before opening; marketing language does not define the risk.
4. Keep drinks and food in the designated area. Clear spills and remove electrical equipment from use when affected. Use approved signage and provide a convenient safe place to leave drinks before entering games.
5. For Phantom Horse, Ion Impact, touch tables and any other new delivery, verify model, manufacturer, manuals, installation, safe clearances, controls and training. A delivery note is not an operating release. Use C07 before relocation or adding another unit.
6. At close, clear console accounts, secure darts and cues, count controls and game accessories, inspect soft play and record faults. Keep any unreleased equipment blocked in POS and physically isolated.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 7, $fecsop$Small area decisions within a larger venue$fecsop$, $fecsop$Reduce simultaneous game use where equipment swing or movement envelopes overlap. Keep soft play child supervision separate from adult games. The no recreational adult participation rule in soft play does not prevent an approved assisted rescue or accessibility arrangement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 8, $fecsop$Evidence required before release$fecsop$, $fecsop$Current inventory, game type and manuals; floor plan with clearances; lighting assessment; vehicle and projectile risk assessments; optical safety information; staffing per active arena; emergency stop and communication demonstration; bilingual rules; party flow; documented commissioning of recent deliveries.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 9, $fecsop$Document control and authorization$fecsop$, $fecsop$CONTROL 02
Role
Accountability
GM or authorized executive
Approve policy, resources and delegated financial limits; no commercial waiver of safety restrictions.
Head of Operations
Own the manual, approve site deployment and capacity reductions, review incidents and authorize site release after technical evidence.
Site supervisor
Complete opening decision, assign posts and relief, check controls during trade, stop unsafe activity and sign handover.
Maintenance lead and inspector
Validate equipment records, technical limits, inspection scope and repairs; issue written technical release.
Food PIC
Approve recipes, suppliers, allergen controls, food monitoring and disposition; stop unsafe food service.
HR and training lead
Verify role competency, induction, working arrangements and training records.
IT and privacy lead
Protect POS, CCTV and guest records; approve access and technical recovery.
Every employee
Intervene early, stop danger, summon help and record facts honestly.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 10, $fecsop$Release sequence$fecsop$, $fecsop$Inspect the site and complete R08. Confirm licenses, emergency plan, equipment inspection certificates, operating cards, food permissions and staffing. Demonstrate opening, evacuation and relevant equipment rescue. Close critical findings. Obtain the approvals below and issue a controlled copy to the site. Release can exclude a clearly separated activity.
Approval
Name and signature
Date
Technical validation
Food validation if applicable
Head of Operations
GM or authorized executive
Review annually and after an incident, equipment change, menu change, layout change or regulatory change. The document owner records revisions, withdraws superseded copies and arranges staff retraining. This revision takes effect at each site only after the required approvals are completed.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 11, $fecsop$Approval and document control$fecsop$, $fecsop$DC01  |  Applies to all procedures in the UA-DM site manual
CONTROL FIELD
CONTROLLED VALUE
Manual ID and revision
E3-UA-DM-MAN-001 / Revision 1.0
Document date
21 September 2026
Effective date
To be entered after approval: __________________
Scheduled review
12 months from effective date, or earlier following change or incident
Status
For approval; no signature or authority approval is implied
Owner and master copy
Head of Operations FEC and IT / designated controlled document repository
Superseded revision
First standalone site issue; derived from corporate manual revision 4.0.
Procedure identification
E3-UA-DM-C01 to C09; applicable A modules; F01 to F05; R01 to R10.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 12, $fecsop$Preparation review and approval$fecsop$, $fecsop$ROLE
NAME
SIGNATURE
DATE
Prepared by Operations
Technical review Maintenance or Inspector
Food safety review Food Lead
Qatar compliance review Designated Lead
Approved by GM or Authorized Executive
Each reviewer confirms only the scope within their competence. The approved manual is released with completed site verification R08 and activity cards R03. A management signature does not replace a statutory permit or equipment inspection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 13, $fecsop$Language and communication$fecsop$, $fecsop$Maintain this English master and controlled translations where required by the relevant authority or staff comprehension needs. E3 requires Arabic and English guest safety notices and receipts. Staff must demonstrate understanding of their assigned procedures; record the briefing language and assessment result.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 14, $fecsop$Revision distribution and records$fecsop$, $fecsop$DC02  |  Document lifecycle and traceability
REV
CHANGE
RELEASE
1.0
First standalone manual for UA-DM. Contains local instructions, full applicable SOPs and site records. Based on corporate revision 4.0.
Pending site approval$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 15, $fecsop$Controlled distribution$fecsop$, $fecsop$COPY OR ACCESS ID
LOCATION OR HOLDER
ISSUED BY AND DATE
OLD COPY WITHDRAWN
The document controller records approval and effective date, grants access to the approved master, distributes site copies and removes superseded copies. Printed copies are uncontrolled unless registered. Amendments require impact review, approval and briefing before use. Site supervisors must not edit safety limits locally without authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 16, $fecsop$Records management$fecsop$, $fecsop$RECORD FAMILY
CUSTODIAN AND CONTROL
R01 R02 R07 daily operations
Site Supervisor; complete during the shift and review exceptions before handover.
R03 R04 equipment and defects
Maintenance Lead with Operations; link to asset serial, inspection evidence and return-to-service authorization.
R05 incidents and safeguarding
Authorized Operations and safeguarding personnel; restricted access and preservation of evidence.
R06 finance and complaints
Finance and Site Supervisor; reconcile transactions and retain approval references.
R08 site authorization
Head of Operations; link current licenses, plans, training and permissions.
R09 R10 food and cookery
Food PIC; retain supplier, batch, monitoring, deviation and verification evidence.
The compliance lead approves a retention schedule using applicable law, permit conditions, insurer requirements and legal holds. Record retention period, disposal authority and storage location for each record class. Do not apply a generic operating-log period to CCTV, child, medical or financial records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 17, $fecsop$Qatar compliance and procedure framework$fecsop$, $fecsop$DC03  |  Requirements mapping and site release
This is the E3 controlled-document format. Applicable Qatar laws, permit conditions, approved property plans and manufacturer instructions govern its implementation. ISO 10013 provides guidance on organisation-specific documented information [S20]; it is not a Qatar government template or evidence of certification.
REQUIREMENT AREA
REQUIRED SITE EVIDENCE
MANUAL LINK
Commercial activities
Licensed entity, trading name, commercial registration and permitted activities for each location.
R08; LOC01–07
Food service and cookery
Applicable permissions; current MoPH code; named food PIC; approved menu, process flow, hazard analysis and monitoring records.
F01–F05; R09 R10
Fire and life safety
Current Civil Defence and property approvals as applicable; occupancy, exits, assembly and emergency access arrangements.
C01 C06; R08
Outdoor work and heat
Applicable Ministerial Decision 17 of 2021; work scheduling, heat risk assessment, WBGT checks and welfare arrangements.
CAR-AP; R03 R08
Consumer information
Current applicable consumer-protection requirements; displayed prices, accurate service information, receipts and complaint route [S21].
C02 C09; R06
CCTV and personal information
Applicable law and permissions; approved camera plan, access and retention controls.
C09; R08
Equipment integrity
Asset-specific manuals, inspection scope and certificates, validated limits, competent operators and rescue arrangements.
A01–A06; R03 R04$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 18, $fecsop$Standard procedure structure$fecsop$, $fecsop$Each operating SOP identifies its purpose, scope, responsible roles, operating steps, corrective action, required records and reference basis. Revision, approval and effective-date controls in DC01 apply to the complete manual. Local work instructions must identify the related SOP and asset or activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 19, $fecsop$Release rule$fecsop$, $fecsop$The compliance lead records the applicable authority, document title, revision or issue date, relevant requirement and supporting evidence. Resolve discrepancies before site release. If authority requirements or manufacturer instructions conflict, stop the affected activity and obtain a documented technical or regulatory resolution. Smaller sites may simplify administration but must retain the necessary safety coverage.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 20, $fecsop$Qatar requirements and verification register$fecsop$, $fecsop$REQUIREMENTS 01
The compliance lead must maintain current authority requirements and supporting documents for each licensed entity and site. Complete all verification items before authorization. This register supports compliance management and does not replace statutory approvals.
Area
Required operating evidence
Verification required
Business and premises
Correct CR and commercial activity, premises permission, landlord agreement and conditions for each attraction or food activity. Track expiry and owner.
Site documents required; verify permit scope.
Fire and life safety
Current applicable Civil Defence approval, approved occupancy and drawings, alarm and firefighting maintenance, exit plan and property emergency interface.
Retain current Civil Defence approvals, plans and inspection schedules.
Food services
Applicable MoPH and municipal approvals, food handler fitness and training evidence, PIC, approved food safety plan and current MoPH food service code.
MoPH purpose verified [S08]; October 2020 copy reviewed [S19]. Current edition to confirm.
Outdoor and heat exposed work
Implement Ministerial Decision 17 of 2021: work schedule, risk assessment, monitoring, water, rest and training.
Official decision translation hosted by ILO reviewed [S09].
CCTV and privacy
Confirm applicability of Law 9 of 2011 and personal data requirements; retain approved camera plan, retention basis and access rules.
Law title found; full current legal requirements not verified [S16].
Guest information
Compliance lead validates Arabic consumer information, receipts, price displays, terms and complaint process. E3 requires bilingual safety notices and receipts.
E3 policy; local legal wording to verify.
Employment and contractors
HR verifies work authorization, lawful schedules, breaks, competent staff, contractor permissions and insurance conditions.
Site HR and contract evidence required.
Heat rule: covered work is prohibited from 10:00 to 15:30, 1 June to 15 September. Stop exposed work when WBGT exceeds 32.1°C. E3 uses 32.1°C or above as its conservative stop trigger. WBGT is not ordinary air temperature. Training, risk assessment and health surveillance requirements remain relevant beyond opening hours [S09].
Missing or expired permission: stop the affected activity and obtain written clearance. A renewal application, supplier assurance or mall verbal agreement is not itself permission to operate.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 21, $fecsop$International standards and inspection approach$fecsop$, $fecsop$REQUIREMENTS 02
Use these references to specify and verify the safety system. They are not automatically Qatar law. The competent inspector must confirm the edition, scope, installation date, amendments and local acceptance for each asset. Full paid standards were not reviewed clause by clause.
Reference
Application
Evidence to obtain
ISO 45001 2018 with applicable amendment [S10]
Worker safety management framework.
Risk register, worker participation, training, investigations and audit trail.
ISO 9001 2015 with applicable amendment [S11]
Documented service and quality controls.
Controlled procedures, supplier checks, complaint closure and change records.
ISO 22000 2018 and Codex CXC 1 1969 revised 2022 [S12 S13]
Food safety management and HACCP framework.
Validated menu based hazards, monitoring, corrective action and verification.
EN 14960 family and HSE inflatable guidance [S14]
Appropriate inflatable play devices.
Applicable standard and OEM limits, initial and periodic inspection, pressure and evacuation evidence.
EN 1176 family including enclosed play and inspection parts; EN 1177
Soft play and impact attenuating surfacing where within scope.
Inspector to select current applicable editions and confirm design, entrapment, access and surface tests.
ASTM F2970 25 [S15]
Trampoline courts within its scope.
Current catalogue identified; obtain full standard and applicable installation review.
EN 13814 family or appropriate ASTM F24 standards
Carousel and other amusement devices where applicable.
Inspector to establish accepted design, operation and inspection basis; do not mix design codes.
HSE HSG175 third edition [S17]
Supplementary amusement operation guidance.
Competent inspections, operating manual, maintenance, modification and operator training.
E3 baseline: preopening checks every operating day; active observation throughout use; formal supervisor checks hourly; detailed weekly walk; monthly management audit. Commission specialist inspections at the OEM, authority or inspector interval, with annual independent review as the proposed company baseline for rides and applicable inflatables. Shorter requirements prevail.
A daily checklist does not replace engineering inspection. Certificates must identify the actual serial number, scope, test results, defects and next due date. Do not describe E3 as ISO certified unless a valid certificate covers the relevant entity and activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 22, $fecsop$Implementation training and management review$fecsop$, $fecsop$IMPLEMENTATION 01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 23, $fecsop$Before frontline release$fecsop$, $fecsop$Head of Operations assigns an owner to every R08 gap. Verify legal permissions and all critical equipment, food and emergency controls first. Keep unresolved activities closed. Obtain missing technical manuals and full applicable standards through the responsible competent professionals. Approve a site specific effective date only when the release conditions are met.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 24, $fecsop$Practical competency$fecsop$, $fecsop$Role
Must demonstrate before independent work
Every employee
Stop authority, emergency communication, child safeguarding and defect reporting.
Entrance and cashier
Correct ticket, capacity count, guardian matching, refund control and outage process.
Activity operator
Preuse check, restrictions, safe dispatch, intervention, shutdown and equipment emergency response.
Supervisor
Post coverage and relief, opening decision, evacuation coordination and incident evidence.
Food staff and PIC
Handwashing, separation, probe use, allergy order, batch disposition and cleaning.
Cookery instructor
Age appropriate task briefing, child count, tool control, allergy controls and hot zone separation.
Training record: employee ______ role ______ SOP codes ______ trainer ______ date ______ practical scenario ______ result ______ retraining ______ authorization ______. Reading or signing the manual alone is insufficient. Repeat assessment after a relevant incident, change or failed observation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 25, $fecsop$First month after release$fecsop$, $fecsop$Week 1: supervise opening and closing every day and resolve unclear instructions. Week 2: observe peak capacity and relief arrangements. Week 3: run a relevant scenario such as lost child, deflation, ride stoppage or food withdrawal. Week 4: audit records and adjust deployment from actual evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 26, $fecsop$Monthly review$fecsop$, $fecsop$Review incidents and near misses per guest visits, critical defects, overdue inspections, staffing gaps, food control failures, complaints, cash variances, training competence and action closure. Do not reward low incident counts in a way that discourages reporting. Record management decisions, budgets, owners and due dates.
No site is released by this document alone. The completed evidence and demonstrated behavior are the basis for safe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 27, $fecsop$Reference register$fecsop$, $fecsop$SOURCES 01
Reference review date 21 September 2026. Maintain current editions of applicable standards, authority requirements and manufacturer instructions. Photograph captions identify their sources; publicity images do not replace current site inspection records.
S01 E3 attraction directory and source photographs
Reference photographs identify InflataPark, Urban Arena, Kidz Driving School and Crayons and Bricks Place Vendôme. Directory location and time fields conflict with other listings; not used as verified addresses or hours.
S02 City Center Doha Inflata Park
Mall source establishing the venue at City Center.
S03 City Center Doha Kids City Driving School
Mall source supporting the correction of the KDS activity identity.
S04 BookingQube InflataPark
Ticketing reference. Equipment limits must follow validated manufacturer instructions.
S05 BookingQube Kids City Driving School
Describes driving and soft play. Product offer is not an asset inventory.
S06 BookingQube Urban Arena
Identifies Doha Mall and advertised driving, arena, console and soft play categories.
S07 BookingQube Crayons and Bricks Vendome
Creative activity description. Current trading status and facilities need confirmation.
S08 MoPH Food Safety Code of Practice for Food Services
Ministry text reproduced by Lexis. Purpose and HACCP approach accessible; current official edition not retrieved. Historical operational text reviewed separately [S19].
S09 Qatar Ministerial Decision 17 of 2021 on heat stress
ILO hosts the decision translation. Articles 2 to 4 establish covered hours and mitigation duties; original Arabic and later applicable requirements must be checked for legal use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 28, $fecsop$Standards references and verification requirements$fecsop$, $fecsop$SOURCES 02
S10 ISO 45001 2018
Occupational health and safety management catalogue; includes amendment information.
S11 ISO 9001 2015
Quality management catalogue. Confirm applicable amendments and transition at adoption.
S12 ISO 22000 2018
Food safety management catalogue; includes HACCP and prerequisite program context.
S13 Codex codes of practice
Lists General Principles of Food Hygiene CXC 1 1969, revised 2022.
S14 HSE inflatable safety advice
Public practical guidance. UK legal and scheme references are not presented as Qatar obligations.
S15 ASTM F2970 25
Current edition identified through ASTM catalogue. Full paid clauses not reviewed.
S16 Qatar CCTV Law 9 of 2011
Title identified in Qatar legal portal search. Confirm current legal text before setting retention periods or approving camera alterations.
S17 HSE HSG175 third edition
Supplementary amusement management and inspection guidance. Not an assertion that UK law applies in Qatar.
S18 Hamad Medical Corporation Ambulance Service
Supports immediate 999 contact, accurate location and following dispatcher instructions.
S19 MoPH food code October 2020 copy
Third party hosted ministry document, revision 0. Sections 6.8.2, 7.2, 7.3, 7.5 and 7.6 reviewed for food limits; confirm authenticity and current official revision before release.
Outstanding site records: attach current photographs, measured plans, approvals and asset records for UA-DM. Confirm any approved food or cookery scope, menus and facilities. Complete R08 and the relevant activity cards before authorizing operations.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 29, $fecsop$Document format and Qatar references$fecsop$, $fecsop$SOURCES 03  |  Format review dated 21 September 2026$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 30, $fecsop$S20 ISO 10013 2021$fecsop$, $fecsop$Quality management systems — Guidance for documented information. The published scope supports development and maintenance of documentation tailored to an organisation. The E3 layout, numbering, A4 paper, approval blocks and registers are company document controls; they are not prescribed Qatar typography or a claim of ISO certification.
https://www.iso.org/standard/75736.html$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 31, $fecsop$S21 Qatar Ministry of Commerce and Industry$fecsop$, $fecsop$Consumer Services identifies Law No. 8 of 2008 and official consumer-rights guidance. Maintain accurate information, pricing and the appropriate complaint route; confirm applicable legal and permit details before adopting site-specific terms.
https://www.moci.gov.qa/en/consumer$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 32, $fecsop$Application of Qatar requirements$fecsop$, $fecsop$Maintain current official requirements in the compliance register. The MoPH food-service code uses a HACCP-based approach [S08]. Outdoor work is assessed against Ministerial Decision 17 of 2021 [S09]. Fire, occupancy and emergency arrangements must follow the applicable site approvals. Government forms required for licenses or inspections remain separate from this internal SOP manual.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 33, $fecsop$Controlled format specification$fecsop$, $fecsop$ELEMENT
E3 DOCUMENT RULE
Page and typography
A4 portrait; clear heading hierarchy; readable body text; repeating document identification and page count.
Identification
Manual and procedure IDs; revision; effective date; owner; controlled approval and distribution.
Procedure content
Purpose; scope and responsibility; operating steps; corrective action; records and reference basis.
Site application
Location title and code; applicable modules; staffing coverage; inspection and release evidence.
Change control
Recorded revision, reviewer approvals, withdrawal of old copies and staff briefing.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-MANUAL$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C01$fecsop$,
  $fecsop$C01 Opening and staffing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C01$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Ensure the site opens only with safe facilities, competent staff and released activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Site supervisor  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Read the last handover and defect register before admitting anyone. Confirm the site and every proposed activity have current release status; remove closed activities from ticket sales.
2. Record who is actually present and competent. Name the duty supervisor, first aid responder, entrance controller, activity attendants and relief staff. Conduct a short briefing on defects, expected groups, emergency roles and guest needs.
3. Walk the guest route and every activity. Check exits, evacuation gates, floor condition, barriers, lighting, accessible routes, first aid supplies and communication. Verify property systems through the agreed interface; do not trigger fire alarms without coordination.
4. Operators complete the equipment specific preuse checks and empty test cycles required on R03. Confirm safety signage, limits, emergency controls and inspection validity. Check that isolated equipment cannot be accessed.
5. Food PIC releases food service separately. Cashier checks approved prices, bilingual receipt output, float and payment terminal. Confirm clocks, wristbands or ticket numbers and the guest count method.
6. Supervisor checks the results, records OPEN, PART OPEN or CLOSED and signs R01. Photograph significant defects without capturing identifiable guests unnecessarily. Admit only to released areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not open with a blocked exit, missing safety critical operator, unknown capacity, failed safety device, unsafe food service or an overdue required equipment examination. A small site may share administrative roles, but cannot leave its entrance or activity unsupervised to serve a customer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 opening record, staff post plan and asset check sheets. Head of Operations reviews failed openings and recurring staffing gaps. Provide planned relief; if relief fails, pause admissions and clear or close the affected activity safely.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C02$fecsop$,
  $fecsop$C02 Admission capacity and guest release$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C02$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control admission, capacity, participation and authorized child collection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Entrance controller and supervisor  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Explain the purchased activity, time, price, restrictions, supervision arrangement and refund terms before payment. Use approved Arabic and English information and practical demonstrations when needed.
2. Check the relevant activity card for age, height, weight, clothing, ability, capacity and permitted accompanying adults. Apply limits discreetly. Do not rely on appearance to judge a borderline restriction or ask staff to make medical diagnoses.
3. Use a linked child and guardian identifier for sessions involving children. Record necessary contact and collection details in the approved system. Tell the guardian whether they must remain inside or immediately available; never imply childcare without an approved service.
4. Count all people for premises occupancy, including adults and staff. Count participants separately for each activity. Effective capacity is the lowest validated premises, equipment and staffed supervision capacity. Stop sales and admission at the limit.
5. Brief guests before the activity starts. Remove loose items and require activity appropriate footwear or socks. Offer reasonable support for disability or sensory needs within safe equipment use; escalate uncertain accommodations before participation.
6. At departure verify the collection identifier and authorized adult. Resolve missing bands or disputed collection through the supervisor using independent checks. Keep the child safely supervised; do not release solely because an adult knows their name.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop entry when counting fails, guardian arrangements are unclear, limits cannot be verified, a child is distressed or a guest cannot comply with essential safety rules. Never lock an emergency escape route to contain children.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 occupancy checks, session entry and exit records, and R05 for release exceptions. Only necessary guest information is collected. No ad hoc ID photographs on personal phones.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C03$fecsop$,
  $fecsop$C03 Supervision handover and closing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C03$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain active supervision and a complete shift handover and safe closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and activity operators  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Position attendants from the approved zone plan, including blind corners, raised platforms, slide landing areas and exits. Keep a clear line of sight and move through the assigned zone. CCTV supplements physical supervision.
2. Intervene immediately in dangerous behavior, overcrowding, equipment changes or blocked routes. Explain the rule, stop the specific unsafe action and remove the guest from the activity when needed. Do not allow revenue targets to influence safety decisions.
3. Record a supervisor check each hour and after a group arrival, spill, fault or significant weather change. Confirm headcounts, staff coverage, hygiene, queue position and defect barriers. An hourly check does not replace continuous supervision.
4. Before breaks or shift changes, the replacement receives the guest count, current restrictions, incidents, equipment state and pending tasks face to face. The departing operator remains until the replacement accepts the post.
5. Before closing, stop sales in time to deliver paid sessions. Check all play levels, toilets if within the site, party spaces and quiet corners without unsafe entry. Account for every child and guardian. Complete the final ride or session and unload safely.
6. Shut equipment down in the OEM sequence. Clean and isolate defects; secure chemicals, batteries, cash and lost property. Keep required refrigeration, alarms and security systems running. Sign R02 and give the next shift unresolved actions and owners.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Pause the affected activity when visibility, lighting, noise or staffing prevents effective supervision. No operator may run a ride while handling cash or responding to unrelated messages.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R02 handover and closing, R04 faults and the hourly log. Supervisor reconciles remaining guests before locking public access; emergency egress follows the property plan.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C04$fecsop$,
  $fecsop$C04 Injury medical emergency and evidence$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C04$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Coordinate prompt emergency assistance, protect guests and preserve incident evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop the immediate source of harm. Secure the area without causing a second incident. Call the trained first aid responder and supervisor; do not move a casualty unless necessary to escape immediate danger or directed by emergency responders.
2. For a serious injury, breathing difficulty, unconsciousness, suspected severe allergic reaction or other urgent medical concern, call 999 immediately. Give the site name, mall or park, floor, closest access point, patient details and hazards; follow the dispatcher’s instructions [S18].
3. Send a named staff member to guide responders from the agreed entrance. Notify mall or park security. Keep a clear access route and arrange continued supervision or safe evacuation of other guests.
4. Contact the guardian promptly. Provide first aid only within current training and the emergency dispatcher’s instructions. Do not administer routine medicines, diagnose the injury or pressure the guest to resume play.
5. Preserve the scene and equipment state where safe. Record factual observations, times and witness contacts. Ask IT or security to preserve relevant original footage and record who accessed it. Do not film the injured person for staff chat groups.
6. Inform Head of Operations immediately for serious events. Complete R05 before the end of shift. The designated compliance lead assesses authority, property and insurer notifications without delaying any statutory deadline. Investigate causes and check equivalent assets across sites.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Equipment involved remains isolated until the technical cause and safe return conditions are established. Severe or unexplained incidents require competent technical review. A customer declining treatment does not clear the equipment.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 incident report, preservation log, technical findings and corrective actions. Reopening requires written technical clearance where relevant and Operations authorization. Respond with care and facts; do not speculate about blame or liability.
Reference basis: HMC emergency access guidance [S18] and E3 incident procedure$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C05$fecsop$,
  $fecsop$C05 Missing child and safeguarding$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C05$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Locate missing children promptly and protect children from harm.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Treat a missing child report as urgent. Obtain the child’s description, name, last known location and time, guardian contact and any relevant support needs. Notify property security and the supervisor immediately; assign one incident coordinator.
2. Stop new admissions if they distract from the response. Staff monitor normal entry and exit points while maintaining free emergency escape. Allocate named search zones and report cleared zones to the coordinator. Do not abandon other children.
3. Ask authorized security personnel to review relevant CCTV. Share the minimum description needed over the agreed radio channel; do not broadcast sensitive family information or circulate a child’s photo in public chat groups.
4. If abduction is suspected, the child is in immediate danger or security cannot resolve the situation promptly, contact police through 999. Do not wait for a preset search period or a manager’s permission in a credible emergency.
5. For a found child, use a visible safe location with two staff where practicable. Verify the collecting adult against the entry record and independent identifying information. Escalate discrepancies to security; never resolve a custody dispute yourself.
6. For safeguarding concerns, listen without leading questions, record the child’s words accurately and refer immediately to the safeguarding lead and appropriate emergency or protection authority. Never promise secrecy or investigate an allegation against yourself.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No isolated one to one contact, unauthorized photography, corporal punishment or unnecessary touching. Seek guardian consent for routine assistance. Necessary immediate action to prevent serious harm must not be delayed for consent; document it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 records search timeline, staff zones, security reference, guardian checks and outcome. Keep safeguarding information restricted. Release staff accused of harm from child contact pending a fair review, without presenting allegations as proven.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C06$fecsop$,
  $fecsop$C06 Fire evacuation and utility failure$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C06$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Evacuate safely and control the effects of fire and essential utility failure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor under property emergency command  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. On an alarm, smoke, fire or instruction to evacuate, raise the alert and call emergency services when required. Follow the approved property evacuation plan. Stop admissions and activities; do not delay for cash, shoes or personal belongings.
2. Operators stop rides and release guests by the trained method. Clear inflatable users promptly while safe inflation is maintained if possible; do not turn off blowers as a routine evacuation step while users remain unless electrical or fire danger requires it.
3. Direct people by the safe approved route. Use the planned assistance arrangements for children and people with reduced mobility. Do not use ordinary lifts in a fire. Staff must not enter smoke, climb structures or improvise rescues.
4. Sweep only assigned areas that remain safe, report unchecked areas and proceed to the assembly point. Reconcile staff, groups and child records as far as practicable; give missing person details and last known locations to responders. Never reenter to search.
5. For a power failure without fire, stop affected admissions, maintain emergency lighting and arrange safe equipment unloading or inflatable evacuation. An emergency stop reset does not prove the installation is safe. Protect refrigerated food using F02.
6. For loss of water, drainage, ventilation or essential lighting, stop the affected food or guest activity. Isolate contamination and inform the property. Resume only after the responsible technical or food lead verifies restoration and the supervisor records authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No trade during a fire alarm or unsafe evacuation condition. Only the property or emergency authority can clear reentry after their incident; Operations then separately checks attraction readiness. Never silence or bypass alarms to continue service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 event record and R08 emergency plan. Drills follow property and authority requirements; E3 proposes a quarterly staff scenario exercise and at least a six monthly coordinated evacuation exercise, subject to property agreement. Record learning and retrain failed roles.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C07$fecsop$,
  $fecsop$C07 Maintenance isolation and change control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C07$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C07  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent access to defective equipment and authorize return to service using evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Maintenance lead and supervisor  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop use, remove guests and secure the defect area. Identify the asset and write the fault and time on R04. For a critical defect, physically prevent access; a sign alone is insufficient.
2. A competent authorized technician isolates every relevant energy source, including electrical, mechanical, stored pressure and battery power. Apply the documented lockout method and verify isolation before work. Operators do not open energized cabinets or bridge safety devices.
3. Maintenance raises the repair request and purchase requisition with defect evidence and urgency. Route commercial approval through the authorized matrix. Isolation happens immediately and is not conditional on purchase approval.
4. Use qualified contractors with property permits, task risk assessment and controlled work area. Confirm parts are suitable and traceable. Record repair details and required inspections; do not accept temporary tape or improvised fasteners as structural repair.
5. After repair, the technician records measurements and OEM test results. A competent independent examiner reviews safety critical repairs or modifications where required. Restore guards, remove tools, account for workers and complete empty tests before any guest trial.
6. Technical signoff confirms equipment condition; Operations authorizes reopening and updates the activity card, training and asset history. For new games, changed locations, cut frames, added food equipment or changed software safety settings, complete change review before installation or use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not reopen after a failed safety device, unknown fault, structural damage or unexplained repeated stop until the cause is resolved. Customer testing is never a commissioning method. No verbal repair closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R04 defect and release record; asset register, parts and inspection certificates. Critical faults are escalated immediately; major issues receive same shift management review. E3 planning targets do not authorize unsafe continued operation.
Reference basis: E3 maintenance workflow; supplementary lifecycle guidance in HSG175 [S17]$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C08$fecsop$,
  $fecsop$C08 Cleaning chemicals and infection control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C08$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C08  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control hygiene hazards, chemicals and contamination in public and activity areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and cleaning lead  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Use an approved cleaning schedule identifying the surface, product, dilution, contact time, method, frequency and responsible person. Check compatibility with inflatable fabrics, pads, screens and food contact equipment. Keep chemical safety information available.
2. Before opening, remove debris, clean high contact areas and confirm floors and equipment are dry and safe. Clean shared accessories between users where required by the activity assessment. Inspect public contact surfaces hourly and clean whenever soiled.
3. For vomit, blood, faeces or other body fluid, close the contaminated area immediately and protect neighboring play or food. A trained cleaner uses the assessed PPE and appropriate disinfectant. Do not dry brush or spray contamination toward guests.
4. Remove visible contamination, clean, apply the approved disinfectant at its specified concentration and contact time, then rinse where required. Remove damaged porous material that cannot be safely decontaminated. Dispose of waste in the designated sealed route.
5. Keep cleaning tools separated between toilets, general areas and food. Label chemicals and lock them away from children and food. Never mix products or put chemicals into beverage containers. Isolate electrical equipment safely before cleaning.
6. Supervisor checks completion, dryness, chemical removal and any required ventilation before reopening. For suspected communicable illness clusters, notify the food or health lead and seek appropriate authority guidance; preserve records of affected sessions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Close affected areas when contamination cannot be contained, potable water or handwashing is unavailable, pests affect safety, or the correct cleaning method is unknown. Odor and visual appearance alone do not establish hygiene.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning record, product instructions, pest records and R05 where illness is reported. Ball pits and inaccessible enclosed areas need a documented deep cleaning method and schedule set from use, manufacturer guidance and risk, not an invented universal interval.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-C09$fecsop$,
  $fecsop$C09 Payments complaints records and continuity$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C09$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-C09  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain traceable payments, fair complaint handling and secure operating records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor cashier and IT lead  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Process each sale in the approved POS under individual credentials. Display approved prices and issue receipts showing purchased service and payment. Record authorized discounts, refunds and complimentary entries with reason and approver; never share manager credentials.
2. If POS or connectivity fails, notify IT and stop new sales unless a preapproved numbered offline ticket and payment process is available. Continue accurate capacity and child release controls. Never accept card details in messages or use personal accounts for company payments.
3. At close, reconcile cash, terminal batches, POS totals, online bookings, refunds, voids and offline tickets. Two people count where available. At a small site, use a sealed cash handover and independent Finance review. Record differences without offsetting them against unrelated transactions.
4. Acknowledge complaints, establish facts and offer a solution within authority. Escalate safety, safeguarding, discrimination, food illness and data concerns immediately. Do not tie a refund or complimentary service to removing a review or giving a positive rating.
5. Restrict guest, CCTV, HR and incident data by role. Use company systems, secure passwords and approved backups. Preserve incident footage promptly; do not copy it to personal devices. Confirm legal retention and camera alteration requirements before making changes.
6. On suspected cyber compromise, contact IT, protect affected systems through the approved response and preserve logs. IT validates recovery and reconciles transactions before reconnection. AI kiosks cannot override admission limits, access children’s records freely or initiate equipment movement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop transactions when traceability, payment security or safe capacity control is lost. A camera fault affecting an approved safeguarding control requires a supervisor risk decision and compensating staff coverage or closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R06 reconciliation and complaint records, IT tickets and access log. Apply the approved retention schedule in DC02; incident and child records require specific access, preservation and retention decisions. Legal hold overrides deletion. CCTV retention is separately verified, not set by this manual.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-C09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-A02$fecsop$,
  $fecsop$A02 Soft play and trampoline zones$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A02$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-A02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent injury through inspection, participant separation and active play supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Play supervisor  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before opening, walk and inspect accessible levels using safe staff access. Check nets, pads, fixings, exposed edges, slide joints, entrapment hazards, floors, access gates and fire escape from enclosed play. Record inaccessible inspection points for technical followup.
2. For trampoline equipment, separately verify mat, spring covers, frame padding, surrounding clearance and any pit or landing system against its inspection plan. A soft play check does not release a trampoline court.
3. Separate toddler and larger child use by approved zones or sessions. Apply activity specific height, weight and capacity limits. At KDS, adults enter for permitted supervision; UA adults do not enter soft play for recreational participation. Necessary assisted access follows an approved plan.
4. Brief safe use. Slides are feet first with landing clear. Prohibit climbing nets from outside, pushing, climbing against slide flow, food and loose hard objects. For trampolines, prevent double bouncing and multiple users on a single bed; no flips unless a separately approved coached activity exists.
5. Maintain active supervision at hidden corners, level transitions and landing areas. A parent staying inside does not replace an assigned attendant. Stop the activity if a child is distressed, trapped, fatigued or unable to follow safe instructions.
6. Retrieve a distressed or trapped child using the equipment specific trained method. Do not cut nets or dismantle structures as routine retrieval. In immediate danger summon emergency services and protect other guests. Isolate the affected zone for inspection after an incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not use damaged containment, uncovered hard parts, unidentified gaps, unsafe impact surfaces or zones with no practicable rescue access. The inherited 90 kg rule is not a universal equipment rating; retain any tighter established limit while resolving it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 per zone, R01 inspection and R04 defects. Inspector validates EN 1176 and EN 1177 applicability; trampoline scope is assessed separately against an appropriate standard such as ASTM F2970 25 [S15].
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-A03$fecsop$,
  $fecsop$A03 Driving tracks vehicles and charging$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A03$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-A03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control vehicle movement, loading, pedestrian separation and battery charging.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Track operator and maintenance lead  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Identify each vehicle and approved track configuration. Inspect steering, speed control, stopping response, wheels, seat, restraint if specified, body panels and battery enclosure. Test remote stop where fitted. Keep defective vehicles physically off the track.
2. Inspect barriers, direction signs, surface grip, intersections, loading bay and pedestrian separation. Confirm permitted number of vehicles, speed settings and spacing from the approved card. No pedestrian shortcuts through an active track.
3. Confirm the child meets the vehicle restrictions, can reach controls and understands the stop signal. Use a stationary demonstration. Seat passengers only in approved positions and fit restraints as specified; a photograph of two children does not establish seating permission.
4. Load only with the vehicle stopped and propulsion controlled. Release vehicles with safe spacing. Monitor intersections and loading. Prohibit deliberate collisions, overtaking where not approved and getting out on an active track.
5. If a vehicle stalls, a child exits or a barrier is struck, stop approaching traffic before anyone enters the lane. Recover the child and vehicle using the trained procedure. Following a collision, inspect both vehicle and barriers before release.
6. Charge only in the approved ventilated protected area away from guests and exits, with the correct charger and electrical protection. Check the battery condition and chemistry specific instructions. Do not charge swollen, hot, leaking or damaged packs. Isolate safely and escalate; smoke or fire requires evacuation and emergency response.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No unapproved speed changes, mismatched chargers, charging in public circulation or operation without dependable stopping. Keep chargers and leads inaccessible to children. Overnight charging requires an approved OEM and property fire risk arrangement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 vehicle and track limits, daily vehicle checks, charging log and R04 faults. Battery disposal uses an approved route. Vehicle number, speed and child limits remain blank until supplied by the OEM and validated on site.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-A05$fecsop$,
  $fecsop$A05 Interactive games arenas and sports$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A05$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-A05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate each game within its validated movement, separation and equipment limits.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Activity supervisor  |  Applies to: UA-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Release each activity individually. Record whether it is an arcade game, simulator, mini golf, darts, billiards, laser tag, projectile game or driving attraction. Marketing names such as Phantom Horse or Ion Impact do not establish equipment type or safe limits.
2. For mini golf, inspect edging, floor transitions, fixtures and lighting. Use the approved club and ball; one player swings while others wait outside the swing area. No raised full swings, running, climbing themed objects or reaching into mechanisms.
3. For darts, use a protected throwing lane with no crossing route, one active thrower and a clear retrieval signal. Confirm dart type and age restrictions. For billiards, maintain cue clearance, control chalk and balls and prohibit climbing or sitting on tables.
4. For laser tag, inspect escape routes, barriers and trip points under actual game lighting. Brief no physical contact and a stop signal. Staff must be able to stop the session and communicate. Verify the device’s optical safety and cleaning requirements.
5. For paintless paintball or any projectile system, obtain the exact device classification, ammunition, energy limits, enclosure design and required PPE. Keep it closed until these are validated. “Paintless” does not mean harmless or remove eye protection requirements.
6. For simulators and arcade machines, test restraints and movement boundaries where fitted, secure cabinets, keep cables protected and clear spilled drinks immediately. Stop on discomfort, tracking failure or unstable movement. Lock console settings to appropriate content and clear guest logins after sessions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No shared floor space between a projectile lane, vehicle lane and unrestricted public circulation. Physical relocation or new games require C07 commissioning. Close dark areas if safe evacuation visibility is inadequate.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$One R03 card per activity, daily game checks, accessory count and R04 defects. Apply A03 separately to AR driving. The public UA listing establishes offered categories, not the current commissioned inventory [S06].
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-A05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-F01$fecsop$,
  $fecsop$F01 Food scope suppliers and personal hygiene$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F01$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-F01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control food scope, supplier acceptance, staff hygiene and cross-contamination.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to cafés kitchens parties edible art and cookery$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$Use a separate food release for each site. Classify the offer as sealed packaged resale, open ready to eat preparation, cooking or reheating, or children’s cookery. A license for one scope does not establish permission for another. The complete current MoPH food code and permit conditions must be checked by the food lead before operational approval [S08].
1. Appoint a trained PIC whenever food is handled. Confirm staff fitness and required local food handler documentation. Staff report vomiting, diarrhoea, infected wounds or relevant illness before starting; the PIC excludes or restricts duties and obtains appropriate clearance.
2. Provide a dedicated accessible handwash point with potable water, soap and hygienic drying. Wash before food handling and after toilets, cleaning, cash, raw food and contamination. Gloves do not replace handwashing; change them between incompatible tasks.
3. Use approved suppliers and keep delivery, batch, expiry and traceability records. Inspect transport hygiene, packaging, pests, damage and temperatures before accepting food. Reject untraceable, expired, damaged or out of limit deliveries; log the reason.
4. Keep raw foods separate from ready to eat products, with raw items below them in storage. Separate allergens and chemicals. Label opened containers and prepared items with identity, preparation or opening time, use by decision and responsible person. Use earliest expiry first.
5. Use standardized recipes and approved substitutions only. Retain ingredient labels for allergen checks. Do not assume a halal claim or imported product approval from a brand name; obtain relevant supplier and regulatory evidence.
6. Restrict children and unauthorized staff from production areas. Store knives and hot equipment safely. Agree catering delivery access and waste removal with the property; protect guest routes and maintain cold or hot chain during transfer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No open food handling without handwashing, safe water, traceability and a competent PIC. Use R07 and R09. A mall food court, external caterer or birthday cake supplier does not remove E3’s checks at receipt and service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$Approved food scope, supplier register, staff fitness records, R07 cleaning, R09 batches and R10 hazard-control plan. Food PIC reviews evidence before release. Reference basis: MoPH food-service code [S08 S19].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-F02$fecsop$,
  $fecsop$F02 Food temperature control and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F02$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-F02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain validated food temperatures and documented corrective action throughout the process.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Qatar code benchmarks and proposed E3 monitoring$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$The October 2020 MoPH code copy [S19] informs these benchmarks. Confirm the current official edition and validate each menu before release. Monitoring frequencies are E3 controls unless specified otherwise. Use a calibrated clean food probe and record actual product readings, not just equipment displays.
Stage
E3 operating limit and monitoring
If the check fails
Chilled food
Receive and display below 4°C; E3 storage target 0 to 3°C unless the product requires colder. Check deliveries, opening, every 2 hours and close; displays after 30 minutes and hourly.
Reject delivery. Isolate stock; assess documented time and temperature. Unknown history means discard.
Frozen food
Receive and hold below minus 18°C; E3 target minus 20°C unless the product requires colder. Check deliveries and storage as above.
Reject thawed or abused stock. Transfer only under PIC control; do not refreeze without an approved process.
Cooking and reheating
E3 default core temperature at least 75°C for 30 seconds; use a validated recipe and check each batch at the coldest point. Reheat only once.
Continue heating if safe and recheck. Never serve an unverified batch; discard if safe recovery is not established.
Hot holding
Above 64°C; E3 target at least 65°C. Check at setup, after 30 minutes and hourly. Measure the coldest food, not only unit air.
Remove from service. Discard if below 64°C for over 2 hours or history is unknown; PIC controls any earlier recovery. Do not top up.
Cooling if authorized
Cool to 5°C or below within 2 hours; record start, interim and final core readings. Then maintain the approved chilled storage target.
Do not cool at sites without validated equipment. Discard failed or unrecorded batches unless a qualified lead approves a validated corrective process.
Cold chain failure: keep doors closed, record discovery time and temperatures, transfer to verified storage where possible and label HOLD. The PIC decides disposition from evidence. A normal fridge reading after power returns does not prove the food remained safe.
Probe verification: check against an appropriate reference such as a correctly prepared ice slurry; the food lead sets the instrument tolerance and calibration interval. Take the instrument out of use if outside its validated tolerance. Record calibration and any affected food decisions.
The October 2020 code has ambiguous cooling subparagraphs; this manual adopts its stricter 2 hour endpoint pending PIC confirmation. Do not substitute a foreign 6 hour rule. Validate capacity, portion size and cooling equipment. R09 records each batch and decision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$The PIC applies the stage-specific action above, records the affected batch and decision in R09, and escalates repeated failures to the food lead.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 temperature and disposition records; R10 validated process plan; probe verification and equipment service records. Reference basis: MoPH code copy [S19], subject to current-edition verification.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-F03$fecsop$,
  $fecsop$F03 Allergens service and suspected food illness$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F03$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-F03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent allergen exposure and respond to suspected food illness or allergic reactions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to: UA-DM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Maintain an ingredient and allergen matrix for every recipe, bought in item, sauce, garnish and activity ingredient. Check manufacturer labels on each change or delivery substitution. Include allergens beyond any standard list when a guest identifies them.
2. Ask about allergies at booking and confirm at service. Pass the request to the PIC, who checks the written recipe and cross contact controls. Never guess, remove a visible ingredient as a cure, or promise “allergen free” without a validated basis.
3. Use clean dedicated equipment and protected ingredients for an approved allergy order. Prevent shared scoops, oil, cloths, gloves or work surfaces from transferring allergens. Identify the order and hand it directly to the correct guest or guardian.
4. If the kitchen cannot control the identified risk, explain that clearly before accepting the order or cookery participant. Offer only a genuinely suitable alternative confirmed from its ingredients and handling. Do not rely on a waiver to permit an unsafe food exposure.
5. Serve within the approved temperature and time controls. Protect displays and use utensils rather than bare hands for ready to eat food. Reject unapproved home prepared food for shared service; any approved outside cake needs traceability, ingredients and storage instructions.
6. For suspected serious allergic reaction call 999 and follow trained first aid and dispatcher instructions. For suspected food illness, stop the implicated product, preserve batch and supplier records and quarantine relevant food safely. Notify Operations and the food compliance lead for authority action and traceability investigation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop serving when ingredients are unknown, an allergy order is mixed up, food is contaminated or a temperature history is missing. Do not quietly replace the dish without recording the incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 allergen and batch records, R05 illness or reaction report, supplier traceability and product withdrawal record. Record affected sites and customers where lawful. Do not dispose of potential evidence until the food lead determines safe preservation and any authority needs.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-F04$fecsop$,
  $fecsop$F04 Children cookery class operation$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F04$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-F04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Conduct approved children’s cookery sessions with safe food, tools and supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Cookery lead and food PIC  |  Applies to: UA-DM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Approve the recipe, age range, ingredient list, allergen matrix, equipment and lesson plan before advertising. Define a cold assembly or decorating class separately from a hot cooking class. No cooking activity is assumed to exist at a location simply because it serves food.
2. Before accepting participants, obtain guardian consent, contact and relevant allergy information. Set the class size from safe workstations, instructor sightlines, task hazards and escape space. Assign an instructor and a separate safety or entry support role where simultaneous tasks require it.
3. Clean and release the work area. Provide handwashing, child suitable utensils, stable work surfaces and protected ingredients. Keep craft paints, dough and cleaning products separate. Secure hair and loose clothing; supervise handwashing before food contact.
4. Demonstrate each task before issuing tools. Start with low risk preparation. E3 default: children do not handle raw meat, hot oil, boiling liquids, powered blades, gas controls or ovens. Any higher risk teaching requires a specific assessed and authorized program.
5. Adults control hot trays and cooking. Keep a physical hot zone outside child reach and routes. Check food temperatures and cool products to a safe handling temperature before returning them to children. Do not allow tasting of raw batter or uncooked flour mixtures.
6. Count tools back and verify all participants before collection. Label take home food with ingredients and allergens, preparation date and the validated storage and use instructions. Discard food handled unsafely and reset the workstation between classes.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Cancel or pause the class for an uncontrolled allergy, missing guardian arrangement, unsuitable staffing, lost tool, failed handwashing or inability to separate hot work. A small kiosk may offer only the low risk food scope that its facilities can safely support.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 cookery card, participant consent, R09 recipe and allergen release, temperature checks and R07 cleaning. A parent’s presence does not replace the instructor’s safety duty.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-F05$fecsop$,
  $fecsop$F05 Kitchen equipment cleaning and shutdown$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F05$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-UA-DM-F05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate and clean kitchen equipment safely and complete a controlled shutdown.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC and maintenance lead  |  Applies to: UA-DM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before use inspect guards, power leads, switches, hot surfaces, drainage and required extraction. Check refrigerators, ice machines and beverage equipment for cleanliness and correct condition. Do not use equipment with a safety fault.
2. Operate cooking appliances only with the approved ventilation and fire protection arrangements. No LPG cylinders, portable burners or new heat producing equipment without the necessary property and authority approval. Never bypass a guard or use water on an electrical or cooking oil fire.
3. For slush, ice, coffee and similar machines, use potable water and approved ingredients. Record batch and expiry, follow manufacturer cleaning and disassembly intervals, and keep nozzles and food contact parts protected. Do not continually top up old product.
4. Separate cash handling and food handling. Use a controlled cleaning sequence: remove debris, wash, rinse where needed, sanitize using the approved product, contact time and concentration, then air dry. Follow a dishwasher’s validated temperature or chemical cycle where fitted.
5. For maintenance, stop food production in the affected zone, protect or remove food and apply C07. The food PIC checks for metal, glass, chemicals, pests and residue before food service restarts. Obtain specialist support for kitchen equipment where internal competence is absent.
6. At close, dispose of expired or unsafe food, label retained stock, record temperatures, clean surfaces and drains, remove waste and complete pest checks. Shut down heat and nonessential equipment through its procedure while preserving refrigeration and required safety systems.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop cooking for failed extraction, uncontrolled grease, fire protection impairment, unsafe gas or electricity, sewage backup or pest contamination. Only trained authorized staff use the correct firefighting equipment when safe; evacuation takes priority.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning and pest log, R09 food records, R04 maintenance and food restart authorization. Agree specialist service scope, preventive maintenance and contractor access in writing; Operations does not substitute informal cash payment for maintenance approvals.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-F05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R01$fecsop$,
  $fecsop$R01 Daily opening and hourly record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R01$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R01  |  Copy for each site and operating day
Site UA-DM ____  Date __________  Supervisor __________  Shift __________
First aid responder __________  Entrance controller __________  Relief __________
Preopening check
Pass Fail NA
Defect or evidence reference
Permissions inspection dates and previous handover reviewed
Post coverage and relief confirmed
Exits routes lights and communication ready
First aid and emergency information ready
Equipment checks and empty tests completed
Limits signs barriers and gates correct
Cleaning and dry safe surfaces confirmed
Food PIC release completed or food absent
POS receipts float and counting method ready
Defective areas isolated and removed from sale
Decision: OPEN / PART OPEN / CLOSED    Excluded areas __________________
Supervisor signature __________  Time __________  Defect record numbers __________
Time
Premises count / limit
Activity count / limit
Posts safe
Action and initials
Repeat hourly and after changes. Record actual inflatable pressure or weather values on the asset sheet when applicable. A failed critical check cannot be marked N/A. Attach operator sheets for every ride, vehicle, inflatable and game requiring preuse tests.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R02$fecsop$,
  $fecsop$R02 Closing and shift handover$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R02$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R02  |  Copy for each shift
Site UA-DM ____  Date __________  Outgoing __________  Incoming __________
Closing check
Result
Exception and action
All guests cleared and children collected
Play levels rooms and quiet areas checked
Equipment stopped and secured in OEM sequence
Food temperatures stock and disposal recorded
Cleaning waste and pest check complete
Faults tagged and inaccessible
Cash POS card and tickets reconciled
Lost property logged and secured
Doors cameras alarms and required utilities checked$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Handover notes$fecsop$, $fecsop$Topic
Outstanding item and owner
Incidents and safeguarding
Bookings groups and allergies
Equipment and contractor visits
Staffing and relief
Stock and food
IT cash and other actions
Keys and controlled items transferred __________________________________
Final guest count ______  Closure time ______  Next shift restrictions __________
Outgoing signature __________  Incoming acceptance __________  Time __________
If there is no incoming shift, submit the record to the supervisor’s designated manager and secure the approved master copy. Do not close a defect because the venue is closed for the night.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R03$fecsop$,
  $fecsop$R03 Activity operating card and risk review$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R03$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R03  |  One approved card for every activity or distinct zone
Site UA-DM ____  Activity __________  Asset and serial __________  Revision __________
Field
Validated entry and source document
OEM manual and inspection expiry
Approved age height weight and ability restrictions
Equipment participants and premises occupancy limits
Operating settings pressure speed or weather limits
Staff posts and minimum coverage including relief
PPE clothing footwear and loose item controls
Preuse inspection and empty test sequence
Loading briefing session and unloading sequence
Emergency stop isolation and rescue method
Cleaning inspection and maintenance intervals
Technical reviewer and Operations approval
Attach a marked plan showing gates, sightlines, escape, emergency controls and the guest flow. No universal staffing ratio is established by this form.
Hazard and persons exposed
Existing control
Further action and owner
Residual risk
Suggested assessment: likelihood 1 to 5 × severity 1 to 5. E3 management reviews 10 to 25 before release; 15 to 25 remains closed pending risk reduction. Any missing critical safeguard overrides the score. Risk scores do not prove engineering compliance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R04$fecsop$,
  $fecsop$R04 Defect isolation and return to service$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R04$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R04  |  One record per defect
Site UA-DM ____  Asset __________  Serial __________  Record number __________
Detected by __________  Date and time __________  Severity __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Fault and immediate control$fecsop$, $fecsop$Describe what was observed and operating conditions __________________________
___________________________________________________________________
Guest exposure or incident link __________  Photo or log reference __________
Activity stopped at __________  Barrier and tag __________  Sales blocked __________
Energy isolation by __________  Lock or permit reference __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Repair and verification$fecsop$, $fecsop$Maintenance owner __________  PR or work order __________  Due date __________
Repair and parts fitted __________________________________________________
___________________________________________________________________
Cause identified __________  Similar assets checked __________
Required test
Acceptance criterion
Actual result
Tester$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Reopening decision$fecsop$, $fecsop$Specialist inspection needed? YES / NO    Basis ______________________________
Technical clearance by __________  Date __________  Certificate __________
Guards tools work area and staff briefing checked by __________________________
Operations release by __________  Time __________  Restrictions _______________
Result: CLOSED / RELEASED WITH VALIDATED RESTRICTIONS / RELEASED
A signature without test evidence is not technical clearance. A restricted release cannot bypass a failed safety device or keep an unresolved critical hazard accessible.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R05$fecsop$,
  $fecsop$R05 Incident missing child and safeguarding record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R05$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R05  |  Restricted access
Site UA-DM ____  Record number __________  Date and time __________
Type: INJURY / NEAR MISS / FOOD / MISSING CHILD / SAFEGUARDING / OTHER
Reporter __________  Supervisor __________  Activity or food batch __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Facts and immediate response$fecsop$, $fecsop$What happened and where ______________________________________________
___________________________________________________________________
Observed condition or exact words ________________________________________
___________________________________________________________________
First aid responder __________  Action within training _________________________
999 called at __________  Property security at __________  Guardian at __________
Emergency service reference __________  Guest or guardian contact ______________
Time
Action or search zone
Person
Outcome$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Evidence and safe collection$fecsop$, $fecsop$Witness details held at __________  CCTV time range __________  Preservation by __________
Equipment isolation reference __________  Photos or batch evidence __________
Child release verification and authorized adult _______________________________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Followup and closure$fecsop$, $fecsop$Operations notified __________  Compliance notification decision __________
Authority or insurer reference __________  Action owner and deadline __________
Root cause and prevention ______________________________________________
Closure reviewer __________  Date __________  Reopening record __________
Record observations separately from opinions. Do not copy medical or safeguarding detail into ordinary group chats. For an unresolved emergency, continue response rather than completing paperwork.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R06$fecsop$,
  $fecsop$R06 Cash reconciliation and service recovery$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R06$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R06  |  Cashier and supervisor record
Site UA-DM ____  Date __________  Cashier __________  POS shift __________
Reconciliation item
QAR or count
Evidence reference
Opening cash float
Cash sales and other authorized cash movements
Cash refunds and documented cash drops
Expected closing cash
Actual closing cash
Variance actual minus expected
Card POS total versus terminal settlement
Online sales and admissions matched
Offline tickets issued used void and returned
Discounts refunds and complimentary admissions
Expected cash = float + cash receipts - cash refunds - recorded cash removals. Explain every other authorized movement. Do not include card receipts in expected physical cash.
Variance explanation __________  Finance escalation __________  Seal number __________
Cashier signature __________  Independent review __________  Time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Complaint or service recovery$fecsop$, $fecsop$Reference __________  Guest contact if needed __________  Date __________
Issue and facts ________________________________________________________
Resolution offered __________  Refund or concession __________
Authority and approval reference __________  Followup owner __________
Guest informed at __________  Root cause action __________  Closed by __________
Safety or safeguarding complaint linked to R05 __________. Do not offer a concession in exchange for a rating or review removal.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R07$fecsop$,
  $fecsop$R07 Cleaning inspection and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R07$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R07  |  Working hygiene and safety record
Site UA-DM ____  Date __________  Supervisor or PIC __________
Area or item
Product method and contact time
Due / done
Checked by
Product dilution or concentration verified __________  Test method __________
Contamination isolation reference __________  Reopened by and time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Weekly safety and pest walk$fecsop$, $fecsop$Check
Finding and owner
Due date
Closed evidence
Structure barriers pads and floors
Exits signs fire access and first aid
Electrical guards charging and lighting
Hygiene water drains and pest signs
Food permits allergens and temperatures
Training staffing and overdue defects
Pest contractor reference __________  Chemical treatment restrictions __________
No spraying during occupied food or play sessions. Follow the authorized reentry and food protection instructions.
Inspector __________  Signature __________  Management review date __________
Critical finding: stop now, record R04 or R05 and escalate immediately. Assign every corrective action an owner and evidence requirement. A due date cannot justify continued unsafe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R08$fecsop$,
  $fecsop$R08 Site validation and emergency information$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R08$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R08  |  Site authorization for UA-DM
Site UA-DM ____  Legal name __________  Address unit floor __________
Release evidence
Document reference
Verified by and date
Trading food and premises permissions where applicable
Approved occupancy plan and escape arrangements
Asset inventory manuals and specialist inspections
R03 cards and critical limit validation
Staffing sightlines relief and first aid coverage
Food scope and menu controls or recorded N/A
Fire maintenance property interfaces and insurance
CCTV privacy access and retention basis
Emergency and rescue demonstrations completed
Current site photographs and measured plan$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Emergency information to post at the site$fecsop$, $fecsop$Emergency services 999 [S18]    Property security __________    Duty supervisor __________
Site access and responder meeting point ___________________________________
Primary exit __________  Alternative exit __________  Assembly location __________
Assistance and refuge arrangement __________  First aid location __________
Electrical isolation __________  Fire controls held by __________  Backup contact __________
Attach the approved marked plan. Do not create an escape route from a photograph.
Activities excluded from release __________________________________________
Technical signoff __________  Food signoff __________  Operations __________
GM authorization __________  Effective date __________  Review date __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R09$fecsop$,
  $fecsop$R09 Food batch allergen and cookery record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R09$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R09  |  Copy sheets as needed
Site UA-DM ____  Date __________  PIC __________  Menu or class __________
Food or ingredient
Supplier batch expiry
Receipt temperature
Accept reject
Batch and step
Start time and temp
Check time and temp
Action and initials
Steps include cooking, reheating, cooling and holding. Copy for each batch and required check. Fridge or freezer unit __________  Opening ______  2 hourly ______  Close ______
Recipe or menu item
All ingredients and allergens
Cross contact controls
PIC release$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Cookery or edible activity session$fecsop$, $fecsop$Recipe revision __________  Age group __________  Approved capacity __________
Instructor __________  Entry and safety support __________  Actual participants __________
Guardian consent and allergy check reference __________  Tool count out / in __________
Handwash and station release __________  Hot work adult __________
Take home label and use instructions __________  Children collected __________
Unsafe food or allergen incident reference __________  Disposition approved by __________
Record probe verification, recipe validation and any supplier substitution on attached sheets. Keep participant medical and contact details in the restricted register, not on a public counter.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$UA-DM-R10$fecsop$,
  $fecsop$R10 Food hazard analysis and control plan$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R10$fecsop$,
  $fecsop$site-manuals/UA-DM/E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$UA-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R10  |  Complete for each approved menu or cookery process
Site UA-DM ____  Menu or recipe __________  Revision ______  Food PIC __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Process and intended use$fecsop$, $fecsop$Product and ingredients __________  Intended consumers __________  Allergens __________Process flow reference __________  Flow verified on site by __________  Date __________Storage and shelf life basis __________  Take-home instructions __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Hazard assessment$fecsop$, $fecsop$PROCESS STEP
HAZARD AND CAUSE
CONTROL MEASURE
CCP DECISION AND BASIS
Assess biological, chemical, physical and allergen hazards. The qualified food lead determines whether each control is managed through prerequisite hygiene procedures or as a critical control point. Do not classify every temperature check automatically as a CCP.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Control and verification$fecsop$, $fecsop$CONTROL ELEMENT
APPROVED PLAN
Critical limit and validation source
Monitoring what how when and responsible person
Immediate correction and affected product disposition
Root cause and preventive action
Verification method frequency and reviewer
Required monitoring and deviation records
Approved by Food Lead __________  Signature __________  Date __________Operator briefing completed __________  Review due __________
Revalidate following a menu, supplier, allergen, equipment, process, capacity or regulatory change. Link actual batch monitoring to R09. This worksheet supports a site-specific HACCP plan; it does not constitute approval of an unassessed process. Reference basis: MoPH HACCP approach [S08] and Codex hygiene framework [S13].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$UA-DM-R10$fecsop$;

INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, $fecsop$Imported from E3_UA-DM_Site_SOP_Manual_V1.0.docx$fecsop$
FROM public.sop_documents d
WHERE d.code LIKE $fecsop$UA-DM-%$fecsop$
  AND NOT EXISTS (
    SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id AND v.version = 1
  );

DELETE FROM public.sop_sections s USING public.sop_documents d WHERE s.document_id = d.id AND d.code LIKE $fecsop$KDS-MINI-DM-%$fecsop$;
INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-MANUAL$fecsop$,
  $fecsop$Site SOP manual$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$MANUAL$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, $fecsop$Contents and navigation$fecsop$, $fecsop$DOCUMENT GUIDE
SECTION
PAGE
Site profile and local operating procedures
3–4
Document control and Qatar framework
5–8
Common operating procedures C01 to C09
9–17
Activity procedures A02, A03
18–19
Conditional food and cookery procedures F01 to F05
20–24
Qatar and international requirements
25–26
Site records and forms R01 to R10
27–36
Training and management review
37
References and document framework
38–40$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$How to use the manual$fecsop$, $fecsop$This document is the standalone site manual for KDS Mini at Doha Mall. Read the site instructions, then apply C01 to C09 and the activity procedures included here. The food and cookery section is conditional: use only procedures within the site’s approved scope and mark non-applicable activities in R08.
Complete R08 before site release and R03 for each activity. Use R01 and R02 daily. Record exceptions on R04 to R09; use R10 to document the approved food hazard-control plan.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$KDS Mini$fecsop$, $fecsop$LOCATION 04  /  DOHA MALL  /  KDS-MINI-DM
SITE CONTROL
REQUIREMENT
Operating scope
Compact children’s play area
Responsible owner
Site Supervisor; accountable to Head of Operations
Required procedures
C01 to C09; A02, A03 (A03 only if driving is approved). F01 to F05 only for approved food or cookery activities.
Staff deployment
Entrance control and play supervision; separate coverage whenever tasks compete.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Site records$fecsop$, $fecsop$Attach the current approved floor plan, site photographs, asset register and emergency access plan to the controlled site copy. Confirm the operating footprint and all installed activities before release.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$Operational priorities$fecsop$, $fecsop$Entrance visibility, flooring, ramp, child collection and uninterrupted supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$Daily supervisor checklist$fecsop$, $fecsop$Before opening: complete R01, confirm staffing and relief, inspect exits and release each activity. During operation: control admission, maintain sightlines and record required checks. At close: account for every child, isolate defects, reconcile sales and complete R02.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 7, $fecsop$Site operating procedures$fecsop$, $fecsop$KDS-MINI-DM  /  SOP 04  /  KDS Mini at Doha Mall
Site scope: compact play area. Verify the measured footprint, installed activities and current condition through R08. Opening checks must cover the ramp, turf, rubber flooring, fixtures and entrance gate. Maintain photographs specific to this site.
Required modules: C01 to C09 and A02 for confirmed play equipment. A03 is conditional on a verified driving offer. Food activity is N/A unless separately approved and equipped.
1. Inspect ramp edges, floor transitions, turf adhesion, padding, rubber surfacing, exposed LEDs, sockets, furniture and gate fixings before every opening. Record snag closure from physical evidence, not the construction contractor’s verbal assurance.
2. Keep reception positioned so the child entrance is visible. Assign an entrance controller and a play attendant whenever these tasks compete. If a single worker cannot both sell and supervise continuously, suspend sales or pause the activity until relief is available.
3. Use a visible child and guardian matching system and a simple live occupancy count. Do not use a small floor area as justification for informal collection. Keep pushchairs and shoes outside the escape and loading path.
4. Admit by the validated capacity and age groups. Reduce the active area if an isolated snag can be safely segregated without narrowing egress. A critical defect, unsafe gate or hidden play zone closes the affected area.
5. Maintain clear sightlines through furniture placement and daily housekeeping. No staff break, toilet absence, cleaning task or cash handover may leave children unobserved. Shared mall support must be actually available, not assumed.
6. At closing inspect behind and beneath accessible play features, verify collection, isolate equipment, clean and secure. Any proposed car removal or introduction uses an inventory and controlled handover; do not assume old vehicles remain operational.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 8, $fecsop$Compact site deployment rule$fecsop$, $fecsop$Management may combine supervisor and cashier duties only when all safety posts remain covered. Schedule visits, deliveries and deep cleaning outside public sessions. Fewer attractions can reduce the paperwork volume; they do not reduce safeguarding or exit requirements.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 9, $fecsop$Evidence required before release$fecsop$, $fecsop$Measured plan and capacity; current equipment and snag register; approved ramp and surface checks; entrance and exit arrangement; staff sightline demonstration; nearby responder and security contacts; legal trading name; photographs of all sides and fixtures. Complete R08 before operational release.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 10, $fecsop$Document control and authorization$fecsop$, $fecsop$CONTROL 02
Role
Accountability
GM or authorized executive
Approve policy, resources and delegated financial limits; no commercial waiver of safety restrictions.
Head of Operations
Own the manual, approve site deployment and capacity reductions, review incidents and authorize site release after technical evidence.
Site supervisor
Complete opening decision, assign posts and relief, check controls during trade, stop unsafe activity and sign handover.
Maintenance lead and inspector
Validate equipment records, technical limits, inspection scope and repairs; issue written technical release.
Food PIC
Approve recipes, suppliers, allergen controls, food monitoring and disposition; stop unsafe food service.
HR and training lead
Verify role competency, induction, working arrangements and training records.
IT and privacy lead
Protect POS, CCTV and guest records; approve access and technical recovery.
Every employee
Intervene early, stop danger, summon help and record facts honestly.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 11, $fecsop$Release sequence$fecsop$, $fecsop$Inspect the site and complete R08. Confirm licenses, emergency plan, equipment inspection certificates, operating cards, food permissions and staffing. Demonstrate opening, evacuation and relevant equipment rescue. Close critical findings. Obtain the approvals below and issue a controlled copy to the site. Release can exclude a clearly separated activity.
Approval
Name and signature
Date
Technical validation
Food validation if applicable
Head of Operations
GM or authorized executive
Review annually and after an incident, equipment change, menu change, layout change or regulatory change. The document owner records revisions, withdraws superseded copies and arranges staff retraining. This revision takes effect at each site only after the required approvals are completed.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 12, $fecsop$Approval and document control$fecsop$, $fecsop$DC01  |  Applies to all procedures in the KDS-MINI-DM site manual
CONTROL FIELD
CONTROLLED VALUE
Manual ID and revision
E3-KDS-MINI-DM-MAN-001 / Revision 1.0
Document date
21 September 2026
Effective date
To be entered after approval: __________________
Scheduled review
12 months from effective date, or earlier following change or incident
Status
For approval; no signature or authority approval is implied
Owner and master copy
Head of Operations FEC and IT / designated controlled document repository
Superseded revision
First standalone site issue; derived from corporate manual revision 4.0.
Procedure identification
E3-KDS-MINI-DM-C01 to C09; applicable A modules; F01 to F05; R01 to R10.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 13, $fecsop$Preparation review and approval$fecsop$, $fecsop$ROLE
NAME
SIGNATURE
DATE
Prepared by Operations
Technical review Maintenance or Inspector
Food safety review Food Lead
Qatar compliance review Designated Lead
Approved by GM or Authorized Executive
Each reviewer confirms only the scope within their competence. The approved manual is released with completed site verification R08 and activity cards R03. A management signature does not replace a statutory permit or equipment inspection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 14, $fecsop$Language and communication$fecsop$, $fecsop$Maintain this English master and controlled translations where required by the relevant authority or staff comprehension needs. E3 requires Arabic and English guest safety notices and receipts. Staff must demonstrate understanding of their assigned procedures; record the briefing language and assessment result.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 15, $fecsop$Revision distribution and records$fecsop$, $fecsop$DC02  |  Document lifecycle and traceability
REV
CHANGE
RELEASE
1.0
First standalone manual for KDS-MINI-DM. Contains local instructions, full applicable SOPs and site records. Based on corporate revision 4.0.
Pending site approval$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 16, $fecsop$Controlled distribution$fecsop$, $fecsop$COPY OR ACCESS ID
LOCATION OR HOLDER
ISSUED BY AND DATE
OLD COPY WITHDRAWN
The document controller records approval and effective date, grants access to the approved master, distributes site copies and removes superseded copies. Printed copies are uncontrolled unless registered. Amendments require impact review, approval and briefing before use. Site supervisors must not edit safety limits locally without authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 17, $fecsop$Records management$fecsop$, $fecsop$RECORD FAMILY
CUSTODIAN AND CONTROL
R01 R02 R07 daily operations
Site Supervisor; complete during the shift and review exceptions before handover.
R03 R04 equipment and defects
Maintenance Lead with Operations; link to asset serial, inspection evidence and return-to-service authorization.
R05 incidents and safeguarding
Authorized Operations and safeguarding personnel; restricted access and preservation of evidence.
R06 finance and complaints
Finance and Site Supervisor; reconcile transactions and retain approval references.
R08 site authorization
Head of Operations; link current licenses, plans, training and permissions.
R09 R10 food and cookery
Food PIC; retain supplier, batch, monitoring, deviation and verification evidence.
The compliance lead approves a retention schedule using applicable law, permit conditions, insurer requirements and legal holds. Record retention period, disposal authority and storage location for each record class. Do not apply a generic operating-log period to CCTV, child, medical or financial records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 18, $fecsop$Qatar compliance and procedure framework$fecsop$, $fecsop$DC03  |  Requirements mapping and site release
This is the E3 controlled-document format. Applicable Qatar laws, permit conditions, approved property plans and manufacturer instructions govern its implementation. ISO 10013 provides guidance on organisation-specific documented information [S20]; it is not a Qatar government template or evidence of certification.
REQUIREMENT AREA
REQUIRED SITE EVIDENCE
MANUAL LINK
Commercial activities
Licensed entity, trading name, commercial registration and permitted activities for each location.
R08; LOC01–07
Food service and cookery
Applicable permissions; current MoPH code; named food PIC; approved menu, process flow, hazard analysis and monitoring records.
F01–F05; R09 R10
Fire and life safety
Current Civil Defence and property approvals as applicable; occupancy, exits, assembly and emergency access arrangements.
C01 C06; R08
Outdoor work and heat
Applicable Ministerial Decision 17 of 2021; work scheduling, heat risk assessment, WBGT checks and welfare arrangements.
CAR-AP; R03 R08
Consumer information
Current applicable consumer-protection requirements; displayed prices, accurate service information, receipts and complaint route [S21].
C02 C09; R06
CCTV and personal information
Applicable law and permissions; approved camera plan, access and retention controls.
C09; R08
Equipment integrity
Asset-specific manuals, inspection scope and certificates, validated limits, competent operators and rescue arrangements.
A01–A06; R03 R04$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 19, $fecsop$Standard procedure structure$fecsop$, $fecsop$Each operating SOP identifies its purpose, scope, responsible roles, operating steps, corrective action, required records and reference basis. Revision, approval and effective-date controls in DC01 apply to the complete manual. Local work instructions must identify the related SOP and asset or activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 20, $fecsop$Release rule$fecsop$, $fecsop$The compliance lead records the applicable authority, document title, revision or issue date, relevant requirement and supporting evidence. Resolve discrepancies before site release. If authority requirements or manufacturer instructions conflict, stop the affected activity and obtain a documented technical or regulatory resolution. Smaller sites may simplify administration but must retain the necessary safety coverage.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 21, $fecsop$Qatar requirements and verification register$fecsop$, $fecsop$REQUIREMENTS 01
The compliance lead must maintain current authority requirements and supporting documents for each licensed entity and site. Complete all verification items before authorization. This register supports compliance management and does not replace statutory approvals.
Area
Required operating evidence
Verification required
Business and premises
Correct CR and commercial activity, premises permission, landlord agreement and conditions for each attraction or food activity. Track expiry and owner.
Site documents required; verify permit scope.
Fire and life safety
Current applicable Civil Defence approval, approved occupancy and drawings, alarm and firefighting maintenance, exit plan and property emergency interface.
Retain current Civil Defence approvals, plans and inspection schedules.
Food services
Applicable MoPH and municipal approvals, food handler fitness and training evidence, PIC, approved food safety plan and current MoPH food service code.
MoPH purpose verified [S08]; October 2020 copy reviewed [S19]. Current edition to confirm.
Outdoor and heat exposed work
Implement Ministerial Decision 17 of 2021: work schedule, risk assessment, monitoring, water, rest and training.
Official decision translation hosted by ILO reviewed [S09].
CCTV and privacy
Confirm applicability of Law 9 of 2011 and personal data requirements; retain approved camera plan, retention basis and access rules.
Law title found; full current legal requirements not verified [S16].
Guest information
Compliance lead validates Arabic consumer information, receipts, price displays, terms and complaint process. E3 requires bilingual safety notices and receipts.
E3 policy; local legal wording to verify.
Employment and contractors
HR verifies work authorization, lawful schedules, breaks, competent staff, contractor permissions and insurance conditions.
Site HR and contract evidence required.
Heat rule: covered work is prohibited from 10:00 to 15:30, 1 June to 15 September. Stop exposed work when WBGT exceeds 32.1°C. E3 uses 32.1°C or above as its conservative stop trigger. WBGT is not ordinary air temperature. Training, risk assessment and health surveillance requirements remain relevant beyond opening hours [S09].
Missing or expired permission: stop the affected activity and obtain written clearance. A renewal application, supplier assurance or mall verbal agreement is not itself permission to operate.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 22, $fecsop$International standards and inspection approach$fecsop$, $fecsop$REQUIREMENTS 02
Use these references to specify and verify the safety system. They are not automatically Qatar law. The competent inspector must confirm the edition, scope, installation date, amendments and local acceptance for each asset. Full paid standards were not reviewed clause by clause.
Reference
Application
Evidence to obtain
ISO 45001 2018 with applicable amendment [S10]
Worker safety management framework.
Risk register, worker participation, training, investigations and audit trail.
ISO 9001 2015 with applicable amendment [S11]
Documented service and quality controls.
Controlled procedures, supplier checks, complaint closure and change records.
ISO 22000 2018 and Codex CXC 1 1969 revised 2022 [S12 S13]
Food safety management and HACCP framework.
Validated menu based hazards, monitoring, corrective action and verification.
EN 14960 family and HSE inflatable guidance [S14]
Appropriate inflatable play devices.
Applicable standard and OEM limits, initial and periodic inspection, pressure and evacuation evidence.
EN 1176 family including enclosed play and inspection parts; EN 1177
Soft play and impact attenuating surfacing where within scope.
Inspector to select current applicable editions and confirm design, entrapment, access and surface tests.
ASTM F2970 25 [S15]
Trampoline courts within its scope.
Current catalogue identified; obtain full standard and applicable installation review.
EN 13814 family or appropriate ASTM F24 standards
Carousel and other amusement devices where applicable.
Inspector to establish accepted design, operation and inspection basis; do not mix design codes.
HSE HSG175 third edition [S17]
Supplementary amusement operation guidance.
Competent inspections, operating manual, maintenance, modification and operator training.
E3 baseline: preopening checks every operating day; active observation throughout use; formal supervisor checks hourly; detailed weekly walk; monthly management audit. Commission specialist inspections at the OEM, authority or inspector interval, with annual independent review as the proposed company baseline for rides and applicable inflatables. Shorter requirements prevail.
A daily checklist does not replace engineering inspection. Certificates must identify the actual serial number, scope, test results, defects and next due date. Do not describe E3 as ISO certified unless a valid certificate covers the relevant entity and activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 23, $fecsop$Implementation training and management review$fecsop$, $fecsop$IMPLEMENTATION 01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 24, $fecsop$Before frontline release$fecsop$, $fecsop$Head of Operations assigns an owner to every R08 gap. Verify legal permissions and all critical equipment, food and emergency controls first. Keep unresolved activities closed. Obtain missing technical manuals and full applicable standards through the responsible competent professionals. Approve a site specific effective date only when the release conditions are met.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 25, $fecsop$Practical competency$fecsop$, $fecsop$Role
Must demonstrate before independent work
Every employee
Stop authority, emergency communication, child safeguarding and defect reporting.
Entrance and cashier
Correct ticket, capacity count, guardian matching, refund control and outage process.
Activity operator
Preuse check, restrictions, safe dispatch, intervention, shutdown and equipment emergency response.
Supervisor
Post coverage and relief, opening decision, evacuation coordination and incident evidence.
Food staff and PIC
Handwashing, separation, probe use, allergy order, batch disposition and cleaning.
Cookery instructor
Age appropriate task briefing, child count, tool control, allergy controls and hot zone separation.
Training record: employee ______ role ______ SOP codes ______ trainer ______ date ______ practical scenario ______ result ______ retraining ______ authorization ______. Reading or signing the manual alone is insufficient. Repeat assessment after a relevant incident, change or failed observation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 26, $fecsop$First month after release$fecsop$, $fecsop$Week 1: supervise opening and closing every day and resolve unclear instructions. Week 2: observe peak capacity and relief arrangements. Week 3: run a relevant scenario such as lost child, deflation, ride stoppage or food withdrawal. Week 4: audit records and adjust deployment from actual evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 27, $fecsop$Monthly review$fecsop$, $fecsop$Review incidents and near misses per guest visits, critical defects, overdue inspections, staffing gaps, food control failures, complaints, cash variances, training competence and action closure. Do not reward low incident counts in a way that discourages reporting. Record management decisions, budgets, owners and due dates.
No site is released by this document alone. The completed evidence and demonstrated behavior are the basis for safe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 28, $fecsop$Reference register$fecsop$, $fecsop$SOURCES 01
Reference review date 21 September 2026. Maintain current editions of applicable standards, authority requirements and manufacturer instructions. Photograph captions identify their sources; publicity images do not replace current site inspection records.
S01 E3 attraction directory and source photographs
Reference photographs identify InflataPark, Urban Arena, Kidz Driving School and Crayons and Bricks Place Vendôme. Directory location and time fields conflict with other listings; not used as verified addresses or hours.
S02 City Center Doha Inflata Park
Mall source establishing the venue at City Center.
S03 City Center Doha Kids City Driving School
Mall source supporting the correction of the KDS activity identity.
S04 BookingQube InflataPark
Ticketing reference. Equipment limits must follow validated manufacturer instructions.
S05 BookingQube Kids City Driving School
Describes driving and soft play. Product offer is not an asset inventory.
S06 BookingQube Urban Arena
Identifies Doha Mall and advertised driving, arena, console and soft play categories.
S07 BookingQube Crayons and Bricks Vendome
Creative activity description. Current trading status and facilities need confirmation.
S08 MoPH Food Safety Code of Practice for Food Services
Ministry text reproduced by Lexis. Purpose and HACCP approach accessible; current official edition not retrieved. Historical operational text reviewed separately [S19].
S09 Qatar Ministerial Decision 17 of 2021 on heat stress
ILO hosts the decision translation. Articles 2 to 4 establish covered hours and mitigation duties; original Arabic and later applicable requirements must be checked for legal use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 29, $fecsop$Standards references and verification requirements$fecsop$, $fecsop$SOURCES 02
S10 ISO 45001 2018
Occupational health and safety management catalogue; includes amendment information.
S11 ISO 9001 2015
Quality management catalogue. Confirm applicable amendments and transition at adoption.
S12 ISO 22000 2018
Food safety management catalogue; includes HACCP and prerequisite program context.
S13 Codex codes of practice
Lists General Principles of Food Hygiene CXC 1 1969, revised 2022.
S14 HSE inflatable safety advice
Public practical guidance. UK legal and scheme references are not presented as Qatar obligations.
S15 ASTM F2970 25
Current edition identified through ASTM catalogue. Full paid clauses not reviewed.
S16 Qatar CCTV Law 9 of 2011
Title identified in Qatar legal portal search. Confirm current legal text before setting retention periods or approving camera alterations.
S17 HSE HSG175 third edition
Supplementary amusement management and inspection guidance. Not an assertion that UK law applies in Qatar.
S18 Hamad Medical Corporation Ambulance Service
Supports immediate 999 contact, accurate location and following dispatcher instructions.
S19 MoPH food code October 2020 copy
Third party hosted ministry document, revision 0. Sections 6.8.2, 7.2, 7.3, 7.5 and 7.6 reviewed for food limits; confirm authenticity and current official revision before release.
Outstanding site records: attach current photographs, measured plans, approvals and asset records for KDS-MINI-DM. Confirm any approved food or cookery scope, menus and facilities. Complete R08 and the relevant activity cards before authorizing operations.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 30, $fecsop$Document format and Qatar references$fecsop$, $fecsop$SOURCES 03  |  Format review dated 21 September 2026$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 31, $fecsop$S20 ISO 10013 2021$fecsop$, $fecsop$Quality management systems — Guidance for documented information. The published scope supports development and maintenance of documentation tailored to an organisation. The E3 layout, numbering, A4 paper, approval blocks and registers are company document controls; they are not prescribed Qatar typography or a claim of ISO certification.
https://www.iso.org/standard/75736.html$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 32, $fecsop$S21 Qatar Ministry of Commerce and Industry$fecsop$, $fecsop$Consumer Services identifies Law No. 8 of 2008 and official consumer-rights guidance. Maintain accurate information, pricing and the appropriate complaint route; confirm applicable legal and permit details before adopting site-specific terms.
https://www.moci.gov.qa/en/consumer$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 33, $fecsop$Application of Qatar requirements$fecsop$, $fecsop$Maintain current official requirements in the compliance register. The MoPH food-service code uses a HACCP-based approach [S08]. Outdoor work is assessed against Ministerial Decision 17 of 2021 [S09]. Fire, occupancy and emergency arrangements must follow the applicable site approvals. Government forms required for licenses or inspections remain separate from this internal SOP manual.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 34, $fecsop$Controlled format specification$fecsop$, $fecsop$ELEMENT
E3 DOCUMENT RULE
Page and typography
A4 portrait; clear heading hierarchy; readable body text; repeating document identification and page count.
Identification
Manual and procedure IDs; revision; effective date; owner; controlled approval and distribution.
Procedure content
Purpose; scope and responsibility; operating steps; corrective action; records and reference basis.
Site application
Location title and code; applicable modules; staffing coverage; inspection and release evidence.
Change control
Recorded revision, reviewer approvals, withdrawal of old copies and staff briefing.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-MANUAL$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C01$fecsop$,
  $fecsop$C01 Opening and staffing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C01$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Ensure the site opens only with safe facilities, competent staff and released activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Site supervisor  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Read the last handover and defect register before admitting anyone. Confirm the site and every proposed activity have current release status; remove closed activities from ticket sales.
2. Record who is actually present and competent. Name the duty supervisor, first aid responder, entrance controller, activity attendants and relief staff. Conduct a short briefing on defects, expected groups, emergency roles and guest needs.
3. Walk the guest route and every activity. Check exits, evacuation gates, floor condition, barriers, lighting, accessible routes, first aid supplies and communication. Verify property systems through the agreed interface; do not trigger fire alarms without coordination.
4. Operators complete the equipment specific preuse checks and empty test cycles required on R03. Confirm safety signage, limits, emergency controls and inspection validity. Check that isolated equipment cannot be accessed.
5. Food PIC releases food service separately. Cashier checks approved prices, bilingual receipt output, float and payment terminal. Confirm clocks, wristbands or ticket numbers and the guest count method.
6. Supervisor checks the results, records OPEN, PART OPEN or CLOSED and signs R01. Photograph significant defects without capturing identifiable guests unnecessarily. Admit only to released areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not open with a blocked exit, missing safety critical operator, unknown capacity, failed safety device, unsafe food service or an overdue required equipment examination. A small site may share administrative roles, but cannot leave its entrance or activity unsupervised to serve a customer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 opening record, staff post plan and asset check sheets. Head of Operations reviews failed openings and recurring staffing gaps. Provide planned relief; if relief fails, pause admissions and clear or close the affected activity safely.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C02$fecsop$,
  $fecsop$C02 Admission capacity and guest release$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C02$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control admission, capacity, participation and authorized child collection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Entrance controller and supervisor  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Explain the purchased activity, time, price, restrictions, supervision arrangement and refund terms before payment. Use approved Arabic and English information and practical demonstrations when needed.
2. Check the relevant activity card for age, height, weight, clothing, ability, capacity and permitted accompanying adults. Apply limits discreetly. Do not rely on appearance to judge a borderline restriction or ask staff to make medical diagnoses.
3. Use a linked child and guardian identifier for sessions involving children. Record necessary contact and collection details in the approved system. Tell the guardian whether they must remain inside or immediately available; never imply childcare without an approved service.
4. Count all people for premises occupancy, including adults and staff. Count participants separately for each activity. Effective capacity is the lowest validated premises, equipment and staffed supervision capacity. Stop sales and admission at the limit.
5. Brief guests before the activity starts. Remove loose items and require activity appropriate footwear or socks. Offer reasonable support for disability or sensory needs within safe equipment use; escalate uncertain accommodations before participation.
6. At departure verify the collection identifier and authorized adult. Resolve missing bands or disputed collection through the supervisor using independent checks. Keep the child safely supervised; do not release solely because an adult knows their name.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop entry when counting fails, guardian arrangements are unclear, limits cannot be verified, a child is distressed or a guest cannot comply with essential safety rules. Never lock an emergency escape route to contain children.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 occupancy checks, session entry and exit records, and R05 for release exceptions. Only necessary guest information is collected. No ad hoc ID photographs on personal phones.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C03$fecsop$,
  $fecsop$C03 Supervision handover and closing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C03$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain active supervision and a complete shift handover and safe closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and activity operators  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Position attendants from the approved zone plan, including blind corners, raised platforms, slide landing areas and exits. Keep a clear line of sight and move through the assigned zone. CCTV supplements physical supervision.
2. Intervene immediately in dangerous behavior, overcrowding, equipment changes or blocked routes. Explain the rule, stop the specific unsafe action and remove the guest from the activity when needed. Do not allow revenue targets to influence safety decisions.
3. Record a supervisor check each hour and after a group arrival, spill, fault or significant weather change. Confirm headcounts, staff coverage, hygiene, queue position and defect barriers. An hourly check does not replace continuous supervision.
4. Before breaks or shift changes, the replacement receives the guest count, current restrictions, incidents, equipment state and pending tasks face to face. The departing operator remains until the replacement accepts the post.
5. Before closing, stop sales in time to deliver paid sessions. Check all play levels, toilets if within the site, party spaces and quiet corners without unsafe entry. Account for every child and guardian. Complete the final ride or session and unload safely.
6. Shut equipment down in the OEM sequence. Clean and isolate defects; secure chemicals, batteries, cash and lost property. Keep required refrigeration, alarms and security systems running. Sign R02 and give the next shift unresolved actions and owners.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Pause the affected activity when visibility, lighting, noise or staffing prevents effective supervision. No operator may run a ride while handling cash or responding to unrelated messages.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R02 handover and closing, R04 faults and the hourly log. Supervisor reconciles remaining guests before locking public access; emergency egress follows the property plan.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C04$fecsop$,
  $fecsop$C04 Injury medical emergency and evidence$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C04$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Coordinate prompt emergency assistance, protect guests and preserve incident evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop the immediate source of harm. Secure the area without causing a second incident. Call the trained first aid responder and supervisor; do not move a casualty unless necessary to escape immediate danger or directed by emergency responders.
2. For a serious injury, breathing difficulty, unconsciousness, suspected severe allergic reaction or other urgent medical concern, call 999 immediately. Give the site name, mall or park, floor, closest access point, patient details and hazards; follow the dispatcher’s instructions [S18].
3. Send a named staff member to guide responders from the agreed entrance. Notify mall or park security. Keep a clear access route and arrange continued supervision or safe evacuation of other guests.
4. Contact the guardian promptly. Provide first aid only within current training and the emergency dispatcher’s instructions. Do not administer routine medicines, diagnose the injury or pressure the guest to resume play.
5. Preserve the scene and equipment state where safe. Record factual observations, times and witness contacts. Ask IT or security to preserve relevant original footage and record who accessed it. Do not film the injured person for staff chat groups.
6. Inform Head of Operations immediately for serious events. Complete R05 before the end of shift. The designated compliance lead assesses authority, property and insurer notifications without delaying any statutory deadline. Investigate causes and check equivalent assets across sites.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Equipment involved remains isolated until the technical cause and safe return conditions are established. Severe or unexplained incidents require competent technical review. A customer declining treatment does not clear the equipment.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 incident report, preservation log, technical findings and corrective actions. Reopening requires written technical clearance where relevant and Operations authorization. Respond with care and facts; do not speculate about blame or liability.
Reference basis: HMC emergency access guidance [S18] and E3 incident procedure$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C05$fecsop$,
  $fecsop$C05 Missing child and safeguarding$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C05$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Locate missing children promptly and protect children from harm.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Treat a missing child report as urgent. Obtain the child’s description, name, last known location and time, guardian contact and any relevant support needs. Notify property security and the supervisor immediately; assign one incident coordinator.
2. Stop new admissions if they distract from the response. Staff monitor normal entry and exit points while maintaining free emergency escape. Allocate named search zones and report cleared zones to the coordinator. Do not abandon other children.
3. Ask authorized security personnel to review relevant CCTV. Share the minimum description needed over the agreed radio channel; do not broadcast sensitive family information or circulate a child’s photo in public chat groups.
4. If abduction is suspected, the child is in immediate danger or security cannot resolve the situation promptly, contact police through 999. Do not wait for a preset search period or a manager’s permission in a credible emergency.
5. For a found child, use a visible safe location with two staff where practicable. Verify the collecting adult against the entry record and independent identifying information. Escalate discrepancies to security; never resolve a custody dispute yourself.
6. For safeguarding concerns, listen without leading questions, record the child’s words accurately and refer immediately to the safeguarding lead and appropriate emergency or protection authority. Never promise secrecy or investigate an allegation against yourself.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No isolated one to one contact, unauthorized photography, corporal punishment or unnecessary touching. Seek guardian consent for routine assistance. Necessary immediate action to prevent serious harm must not be delayed for consent; document it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 records search timeline, staff zones, security reference, guardian checks and outcome. Keep safeguarding information restricted. Release staff accused of harm from child contact pending a fair review, without presenting allegations as proven.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C06$fecsop$,
  $fecsop$C06 Fire evacuation and utility failure$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C06$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Evacuate safely and control the effects of fire and essential utility failure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor under property emergency command  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. On an alarm, smoke, fire or instruction to evacuate, raise the alert and call emergency services when required. Follow the approved property evacuation plan. Stop admissions and activities; do not delay for cash, shoes or personal belongings.
2. Operators stop rides and release guests by the trained method. Clear inflatable users promptly while safe inflation is maintained if possible; do not turn off blowers as a routine evacuation step while users remain unless electrical or fire danger requires it.
3. Direct people by the safe approved route. Use the planned assistance arrangements for children and people with reduced mobility. Do not use ordinary lifts in a fire. Staff must not enter smoke, climb structures or improvise rescues.
4. Sweep only assigned areas that remain safe, report unchecked areas and proceed to the assembly point. Reconcile staff, groups and child records as far as practicable; give missing person details and last known locations to responders. Never reenter to search.
5. For a power failure without fire, stop affected admissions, maintain emergency lighting and arrange safe equipment unloading or inflatable evacuation. An emergency stop reset does not prove the installation is safe. Protect refrigerated food using F02.
6. For loss of water, drainage, ventilation or essential lighting, stop the affected food or guest activity. Isolate contamination and inform the property. Resume only after the responsible technical or food lead verifies restoration and the supervisor records authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No trade during a fire alarm or unsafe evacuation condition. Only the property or emergency authority can clear reentry after their incident; Operations then separately checks attraction readiness. Never silence or bypass alarms to continue service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 event record and R08 emergency plan. Drills follow property and authority requirements; E3 proposes a quarterly staff scenario exercise and at least a six monthly coordinated evacuation exercise, subject to property agreement. Record learning and retrain failed roles.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C07$fecsop$,
  $fecsop$C07 Maintenance isolation and change control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C07$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C07  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent access to defective equipment and authorize return to service using evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Maintenance lead and supervisor  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop use, remove guests and secure the defect area. Identify the asset and write the fault and time on R04. For a critical defect, physically prevent access; a sign alone is insufficient.
2. A competent authorized technician isolates every relevant energy source, including electrical, mechanical, stored pressure and battery power. Apply the documented lockout method and verify isolation before work. Operators do not open energized cabinets or bridge safety devices.
3. Maintenance raises the repair request and purchase requisition with defect evidence and urgency. Route commercial approval through the authorized matrix. Isolation happens immediately and is not conditional on purchase approval.
4. Use qualified contractors with property permits, task risk assessment and controlled work area. Confirm parts are suitable and traceable. Record repair details and required inspections; do not accept temporary tape or improvised fasteners as structural repair.
5. After repair, the technician records measurements and OEM test results. A competent independent examiner reviews safety critical repairs or modifications where required. Restore guards, remove tools, account for workers and complete empty tests before any guest trial.
6. Technical signoff confirms equipment condition; Operations authorizes reopening and updates the activity card, training and asset history. For new games, changed locations, cut frames, added food equipment or changed software safety settings, complete change review before installation or use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not reopen after a failed safety device, unknown fault, structural damage or unexplained repeated stop until the cause is resolved. Customer testing is never a commissioning method. No verbal repair closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R04 defect and release record; asset register, parts and inspection certificates. Critical faults are escalated immediately; major issues receive same shift management review. E3 planning targets do not authorize unsafe continued operation.
Reference basis: E3 maintenance workflow; supplementary lifecycle guidance in HSG175 [S17]$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C08$fecsop$,
  $fecsop$C08 Cleaning chemicals and infection control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C08$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C08  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control hygiene hazards, chemicals and contamination in public and activity areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and cleaning lead  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Use an approved cleaning schedule identifying the surface, product, dilution, contact time, method, frequency and responsible person. Check compatibility with inflatable fabrics, pads, screens and food contact equipment. Keep chemical safety information available.
2. Before opening, remove debris, clean high contact areas and confirm floors and equipment are dry and safe. Clean shared accessories between users where required by the activity assessment. Inspect public contact surfaces hourly and clean whenever soiled.
3. For vomit, blood, faeces or other body fluid, close the contaminated area immediately and protect neighboring play or food. A trained cleaner uses the assessed PPE and appropriate disinfectant. Do not dry brush or spray contamination toward guests.
4. Remove visible contamination, clean, apply the approved disinfectant at its specified concentration and contact time, then rinse where required. Remove damaged porous material that cannot be safely decontaminated. Dispose of waste in the designated sealed route.
5. Keep cleaning tools separated between toilets, general areas and food. Label chemicals and lock them away from children and food. Never mix products or put chemicals into beverage containers. Isolate electrical equipment safely before cleaning.
6. Supervisor checks completion, dryness, chemical removal and any required ventilation before reopening. For suspected communicable illness clusters, notify the food or health lead and seek appropriate authority guidance; preserve records of affected sessions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Close affected areas when contamination cannot be contained, potable water or handwashing is unavailable, pests affect safety, or the correct cleaning method is unknown. Odor and visual appearance alone do not establish hygiene.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning record, product instructions, pest records and R05 where illness is reported. Ball pits and inaccessible enclosed areas need a documented deep cleaning method and schedule set from use, manufacturer guidance and risk, not an invented universal interval.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-C09$fecsop$,
  $fecsop$C09 Payments complaints records and continuity$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C09$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-C09  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain traceable payments, fair complaint handling and secure operating records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor cashier and IT lead  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Process each sale in the approved POS under individual credentials. Display approved prices and issue receipts showing purchased service and payment. Record authorized discounts, refunds and complimentary entries with reason and approver; never share manager credentials.
2. If POS or connectivity fails, notify IT and stop new sales unless a preapproved numbered offline ticket and payment process is available. Continue accurate capacity and child release controls. Never accept card details in messages or use personal accounts for company payments.
3. At close, reconcile cash, terminal batches, POS totals, online bookings, refunds, voids and offline tickets. Two people count where available. At a small site, use a sealed cash handover and independent Finance review. Record differences without offsetting them against unrelated transactions.
4. Acknowledge complaints, establish facts and offer a solution within authority. Escalate safety, safeguarding, discrimination, food illness and data concerns immediately. Do not tie a refund or complimentary service to removing a review or giving a positive rating.
5. Restrict guest, CCTV, HR and incident data by role. Use company systems, secure passwords and approved backups. Preserve incident footage promptly; do not copy it to personal devices. Confirm legal retention and camera alteration requirements before making changes.
6. On suspected cyber compromise, contact IT, protect affected systems through the approved response and preserve logs. IT validates recovery and reconciles transactions before reconnection. AI kiosks cannot override admission limits, access children’s records freely or initiate equipment movement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop transactions when traceability, payment security or safe capacity control is lost. A camera fault affecting an approved safeguarding control requires a supervisor risk decision and compensating staff coverage or closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R06 reconciliation and complaint records, IT tickets and access log. Apply the approved retention schedule in DC02; incident and child records require specific access, preservation and retention decisions. Legal hold overrides deletion. CCTV retention is separately verified, not set by this manual.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-C09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-A02$fecsop$,
  $fecsop$A02 Soft play and trampoline zones$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A02$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-A02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent injury through inspection, participant separation and active play supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Play supervisor  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before opening, walk and inspect accessible levels using safe staff access. Check nets, pads, fixings, exposed edges, slide joints, entrapment hazards, floors, access gates and fire escape from enclosed play. Record inaccessible inspection points for technical followup.
2. For trampoline equipment, separately verify mat, spring covers, frame padding, surrounding clearance and any pit or landing system against its inspection plan. A soft play check does not release a trampoline court.
3. Separate toddler and larger child use by approved zones or sessions. Apply activity specific height, weight and capacity limits. At KDS, adults enter for permitted supervision; UA adults do not enter soft play for recreational participation. Necessary assisted access follows an approved plan.
4. Brief safe use. Slides are feet first with landing clear. Prohibit climbing nets from outside, pushing, climbing against slide flow, food and loose hard objects. For trampolines, prevent double bouncing and multiple users on a single bed; no flips unless a separately approved coached activity exists.
5. Maintain active supervision at hidden corners, level transitions and landing areas. A parent staying inside does not replace an assigned attendant. Stop the activity if a child is distressed, trapped, fatigued or unable to follow safe instructions.
6. Retrieve a distressed or trapped child using the equipment specific trained method. Do not cut nets or dismantle structures as routine retrieval. In immediate danger summon emergency services and protect other guests. Isolate the affected zone for inspection after an incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not use damaged containment, uncovered hard parts, unidentified gaps, unsafe impact surfaces or zones with no practicable rescue access. The inherited 90 kg rule is not a universal equipment rating; retain any tighter established limit while resolving it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 per zone, R01 inspection and R04 defects. Inspector validates EN 1176 and EN 1177 applicability; trampoline scope is assessed separately against an appropriate standard such as ASTM F2970 25 [S15].
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-A03$fecsop$,
  $fecsop$A03 Driving tracks vehicles and charging$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A03$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-A03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control vehicle movement, loading, pedestrian separation and battery charging.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Track operator and maintenance lead  |  Applies to: KDS-MINI-DM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Identify each vehicle and approved track configuration. Inspect steering, speed control, stopping response, wheels, seat, restraint if specified, body panels and battery enclosure. Test remote stop where fitted. Keep defective vehicles physically off the track.
2. Inspect barriers, direction signs, surface grip, intersections, loading bay and pedestrian separation. Confirm permitted number of vehicles, speed settings and spacing from the approved card. No pedestrian shortcuts through an active track.
3. Confirm the child meets the vehicle restrictions, can reach controls and understands the stop signal. Use a stationary demonstration. Seat passengers only in approved positions and fit restraints as specified; a photograph of two children does not establish seating permission.
4. Load only with the vehicle stopped and propulsion controlled. Release vehicles with safe spacing. Monitor intersections and loading. Prohibit deliberate collisions, overtaking where not approved and getting out on an active track.
5. If a vehicle stalls, a child exits or a barrier is struck, stop approaching traffic before anyone enters the lane. Recover the child and vehicle using the trained procedure. Following a collision, inspect both vehicle and barriers before release.
6. Charge only in the approved ventilated protected area away from guests and exits, with the correct charger and electrical protection. Check the battery condition and chemistry specific instructions. Do not charge swollen, hot, leaking or damaged packs. Isolate safely and escalate; smoke or fire requires evacuation and emergency response.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No unapproved speed changes, mismatched chargers, charging in public circulation or operation without dependable stopping. Keep chargers and leads inaccessible to children. Overnight charging requires an approved OEM and property fire risk arrangement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 vehicle and track limits, daily vehicle checks, charging log and R04 faults. Battery disposal uses an approved route. Vehicle number, speed and child limits remain blank until supplied by the OEM and validated on site.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-A03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-F01$fecsop$,
  $fecsop$F01 Food scope suppliers and personal hygiene$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F01$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-F01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control food scope, supplier acceptance, staff hygiene and cross-contamination.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to cafés kitchens parties edible art and cookery$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$Use a separate food release for each site. Classify the offer as sealed packaged resale, open ready to eat preparation, cooking or reheating, or children’s cookery. A license for one scope does not establish permission for another. The complete current MoPH food code and permit conditions must be checked by the food lead before operational approval [S08].
1. Appoint a trained PIC whenever food is handled. Confirm staff fitness and required local food handler documentation. Staff report vomiting, diarrhoea, infected wounds or relevant illness before starting; the PIC excludes or restricts duties and obtains appropriate clearance.
2. Provide a dedicated accessible handwash point with potable water, soap and hygienic drying. Wash before food handling and after toilets, cleaning, cash, raw food and contamination. Gloves do not replace handwashing; change them between incompatible tasks.
3. Use approved suppliers and keep delivery, batch, expiry and traceability records. Inspect transport hygiene, packaging, pests, damage and temperatures before accepting food. Reject untraceable, expired, damaged or out of limit deliveries; log the reason.
4. Keep raw foods separate from ready to eat products, with raw items below them in storage. Separate allergens and chemicals. Label opened containers and prepared items with identity, preparation or opening time, use by decision and responsible person. Use earliest expiry first.
5. Use standardized recipes and approved substitutions only. Retain ingredient labels for allergen checks. Do not assume a halal claim or imported product approval from a brand name; obtain relevant supplier and regulatory evidence.
6. Restrict children and unauthorized staff from production areas. Store knives and hot equipment safely. Agree catering delivery access and waste removal with the property; protect guest routes and maintain cold or hot chain during transfer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No open food handling without handwashing, safe water, traceability and a competent PIC. Use R07 and R09. A mall food court, external caterer or birthday cake supplier does not remove E3’s checks at receipt and service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$Approved food scope, supplier register, staff fitness records, R07 cleaning, R09 batches and R10 hazard-control plan. Food PIC reviews evidence before release. Reference basis: MoPH food-service code [S08 S19].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-F02$fecsop$,
  $fecsop$F02 Food temperature control and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F02$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-F02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain validated food temperatures and documented corrective action throughout the process.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Qatar code benchmarks and proposed E3 monitoring$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$The October 2020 MoPH code copy [S19] informs these benchmarks. Confirm the current official edition and validate each menu before release. Monitoring frequencies are E3 controls unless specified otherwise. Use a calibrated clean food probe and record actual product readings, not just equipment displays.
Stage
E3 operating limit and monitoring
If the check fails
Chilled food
Receive and display below 4°C; E3 storage target 0 to 3°C unless the product requires colder. Check deliveries, opening, every 2 hours and close; displays after 30 minutes and hourly.
Reject delivery. Isolate stock; assess documented time and temperature. Unknown history means discard.
Frozen food
Receive and hold below minus 18°C; E3 target minus 20°C unless the product requires colder. Check deliveries and storage as above.
Reject thawed or abused stock. Transfer only under PIC control; do not refreeze without an approved process.
Cooking and reheating
E3 default core temperature at least 75°C for 30 seconds; use a validated recipe and check each batch at the coldest point. Reheat only once.
Continue heating if safe and recheck. Never serve an unverified batch; discard if safe recovery is not established.
Hot holding
Above 64°C; E3 target at least 65°C. Check at setup, after 30 minutes and hourly. Measure the coldest food, not only unit air.
Remove from service. Discard if below 64°C for over 2 hours or history is unknown; PIC controls any earlier recovery. Do not top up.
Cooling if authorized
Cool to 5°C or below within 2 hours; record start, interim and final core readings. Then maintain the approved chilled storage target.
Do not cool at sites without validated equipment. Discard failed or unrecorded batches unless a qualified lead approves a validated corrective process.
Cold chain failure: keep doors closed, record discovery time and temperatures, transfer to verified storage where possible and label HOLD. The PIC decides disposition from evidence. A normal fridge reading after power returns does not prove the food remained safe.
Probe verification: check against an appropriate reference such as a correctly prepared ice slurry; the food lead sets the instrument tolerance and calibration interval. Take the instrument out of use if outside its validated tolerance. Record calibration and any affected food decisions.
The October 2020 code has ambiguous cooling subparagraphs; this manual adopts its stricter 2 hour endpoint pending PIC confirmation. Do not substitute a foreign 6 hour rule. Validate capacity, portion size and cooling equipment. R09 records each batch and decision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$The PIC applies the stage-specific action above, records the affected batch and decision in R09, and escalates repeated failures to the food lead.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 temperature and disposition records; R10 validated process plan; probe verification and equipment service records. Reference basis: MoPH code copy [S19], subject to current-edition verification.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-F03$fecsop$,
  $fecsop$F03 Allergens service and suspected food illness$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F03$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-F03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent allergen exposure and respond to suspected food illness or allergic reactions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to: KDS-MINI-DM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Maintain an ingredient and allergen matrix for every recipe, bought in item, sauce, garnish and activity ingredient. Check manufacturer labels on each change or delivery substitution. Include allergens beyond any standard list when a guest identifies them.
2. Ask about allergies at booking and confirm at service. Pass the request to the PIC, who checks the written recipe and cross contact controls. Never guess, remove a visible ingredient as a cure, or promise “allergen free” without a validated basis.
3. Use clean dedicated equipment and protected ingredients for an approved allergy order. Prevent shared scoops, oil, cloths, gloves or work surfaces from transferring allergens. Identify the order and hand it directly to the correct guest or guardian.
4. If the kitchen cannot control the identified risk, explain that clearly before accepting the order or cookery participant. Offer only a genuinely suitable alternative confirmed from its ingredients and handling. Do not rely on a waiver to permit an unsafe food exposure.
5. Serve within the approved temperature and time controls. Protect displays and use utensils rather than bare hands for ready to eat food. Reject unapproved home prepared food for shared service; any approved outside cake needs traceability, ingredients and storage instructions.
6. For suspected serious allergic reaction call 999 and follow trained first aid and dispatcher instructions. For suspected food illness, stop the implicated product, preserve batch and supplier records and quarantine relevant food safely. Notify Operations and the food compliance lead for authority action and traceability investigation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop serving when ingredients are unknown, an allergy order is mixed up, food is contaminated or a temperature history is missing. Do not quietly replace the dish without recording the incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 allergen and batch records, R05 illness or reaction report, supplier traceability and product withdrawal record. Record affected sites and customers where lawful. Do not dispose of potential evidence until the food lead determines safe preservation and any authority needs.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-F04$fecsop$,
  $fecsop$F04 Children cookery class operation$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F04$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-F04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Conduct approved children’s cookery sessions with safe food, tools and supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Cookery lead and food PIC  |  Applies to: KDS-MINI-DM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Approve the recipe, age range, ingredient list, allergen matrix, equipment and lesson plan before advertising. Define a cold assembly or decorating class separately from a hot cooking class. No cooking activity is assumed to exist at a location simply because it serves food.
2. Before accepting participants, obtain guardian consent, contact and relevant allergy information. Set the class size from safe workstations, instructor sightlines, task hazards and escape space. Assign an instructor and a separate safety or entry support role where simultaneous tasks require it.
3. Clean and release the work area. Provide handwashing, child suitable utensils, stable work surfaces and protected ingredients. Keep craft paints, dough and cleaning products separate. Secure hair and loose clothing; supervise handwashing before food contact.
4. Demonstrate each task before issuing tools. Start with low risk preparation. E3 default: children do not handle raw meat, hot oil, boiling liquids, powered blades, gas controls or ovens. Any higher risk teaching requires a specific assessed and authorized program.
5. Adults control hot trays and cooking. Keep a physical hot zone outside child reach and routes. Check food temperatures and cool products to a safe handling temperature before returning them to children. Do not allow tasting of raw batter or uncooked flour mixtures.
6. Count tools back and verify all participants before collection. Label take home food with ingredients and allergens, preparation date and the validated storage and use instructions. Discard food handled unsafely and reset the workstation between classes.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Cancel or pause the class for an uncontrolled allergy, missing guardian arrangement, unsuitable staffing, lost tool, failed handwashing or inability to separate hot work. A small kiosk may offer only the low risk food scope that its facilities can safely support.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 cookery card, participant consent, R09 recipe and allergen release, temperature checks and R07 cleaning. A parent’s presence does not replace the instructor’s safety duty.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-F05$fecsop$,
  $fecsop$F05 Kitchen equipment cleaning and shutdown$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F05$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-KDS-MINI-DM-F05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate and clean kitchen equipment safely and complete a controlled shutdown.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC and maintenance lead  |  Applies to: KDS-MINI-DM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before use inspect guards, power leads, switches, hot surfaces, drainage and required extraction. Check refrigerators, ice machines and beverage equipment for cleanliness and correct condition. Do not use equipment with a safety fault.
2. Operate cooking appliances only with the approved ventilation and fire protection arrangements. No LPG cylinders, portable burners or new heat producing equipment without the necessary property and authority approval. Never bypass a guard or use water on an electrical or cooking oil fire.
3. For slush, ice, coffee and similar machines, use potable water and approved ingredients. Record batch and expiry, follow manufacturer cleaning and disassembly intervals, and keep nozzles and food contact parts protected. Do not continually top up old product.
4. Separate cash handling and food handling. Use a controlled cleaning sequence: remove debris, wash, rinse where needed, sanitize using the approved product, contact time and concentration, then air dry. Follow a dishwasher’s validated temperature or chemical cycle where fitted.
5. For maintenance, stop food production in the affected zone, protect or remove food and apply C07. The food PIC checks for metal, glass, chemicals, pests and residue before food service restarts. Obtain specialist support for kitchen equipment where internal competence is absent.
6. At close, dispose of expired or unsafe food, label retained stock, record temperatures, clean surfaces and drains, remove waste and complete pest checks. Shut down heat and nonessential equipment through its procedure while preserving refrigeration and required safety systems.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop cooking for failed extraction, uncontrolled grease, fire protection impairment, unsafe gas or electricity, sewage backup or pest contamination. Only trained authorized staff use the correct firefighting equipment when safe; evacuation takes priority.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning and pest log, R09 food records, R04 maintenance and food restart authorization. Agree specialist service scope, preventive maintenance and contractor access in writing; Operations does not substitute informal cash payment for maintenance approvals.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-F05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R01$fecsop$,
  $fecsop$R01 Daily opening and hourly record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R01$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R01  |  Copy for each site and operating day
Site KDS-MINI-DM ____  Date __________  Supervisor __________  Shift __________
First aid responder __________  Entrance controller __________  Relief __________
Preopening check
Pass Fail NA
Defect or evidence reference
Permissions inspection dates and previous handover reviewed
Post coverage and relief confirmed
Exits routes lights and communication ready
First aid and emergency information ready
Equipment checks and empty tests completed
Limits signs barriers and gates correct
Cleaning and dry safe surfaces confirmed
Food PIC release completed or food absent
POS receipts float and counting method ready
Defective areas isolated and removed from sale
Decision: OPEN / PART OPEN / CLOSED    Excluded areas __________________
Supervisor signature __________  Time __________  Defect record numbers __________
Time
Premises count / limit
Activity count / limit
Posts safe
Action and initials
Repeat hourly and after changes. Record actual inflatable pressure or weather values on the asset sheet when applicable. A failed critical check cannot be marked N/A. Attach operator sheets for every ride, vehicle, inflatable and game requiring preuse tests.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R02$fecsop$,
  $fecsop$R02 Closing and shift handover$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R02$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R02  |  Copy for each shift
Site KDS-MINI-DM ____  Date __________  Outgoing __________  Incoming __________
Closing check
Result
Exception and action
All guests cleared and children collected
Play levels rooms and quiet areas checked
Equipment stopped and secured in OEM sequence
Food temperatures stock and disposal recorded
Cleaning waste and pest check complete
Faults tagged and inaccessible
Cash POS card and tickets reconciled
Lost property logged and secured
Doors cameras alarms and required utilities checked$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Handover notes$fecsop$, $fecsop$Topic
Outstanding item and owner
Incidents and safeguarding
Bookings groups and allergies
Equipment and contractor visits
Staffing and relief
Stock and food
IT cash and other actions
Keys and controlled items transferred __________________________________
Final guest count ______  Closure time ______  Next shift restrictions __________
Outgoing signature __________  Incoming acceptance __________  Time __________
If there is no incoming shift, submit the record to the supervisor’s designated manager and secure the approved master copy. Do not close a defect because the venue is closed for the night.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R03$fecsop$,
  $fecsop$R03 Activity operating card and risk review$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R03$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R03  |  One approved card for every activity or distinct zone
Site KDS-MINI-DM ____  Activity __________  Asset and serial __________  Revision __________
Field
Validated entry and source document
OEM manual and inspection expiry
Approved age height weight and ability restrictions
Equipment participants and premises occupancy limits
Operating settings pressure speed or weather limits
Staff posts and minimum coverage including relief
PPE clothing footwear and loose item controls
Preuse inspection and empty test sequence
Loading briefing session and unloading sequence
Emergency stop isolation and rescue method
Cleaning inspection and maintenance intervals
Technical reviewer and Operations approval
Attach a marked plan showing gates, sightlines, escape, emergency controls and the guest flow. No universal staffing ratio is established by this form.
Hazard and persons exposed
Existing control
Further action and owner
Residual risk
Suggested assessment: likelihood 1 to 5 × severity 1 to 5. E3 management reviews 10 to 25 before release; 15 to 25 remains closed pending risk reduction. Any missing critical safeguard overrides the score. Risk scores do not prove engineering compliance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R04$fecsop$,
  $fecsop$R04 Defect isolation and return to service$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R04$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R04  |  One record per defect
Site KDS-MINI-DM ____  Asset __________  Serial __________  Record number __________
Detected by __________  Date and time __________  Severity __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Fault and immediate control$fecsop$, $fecsop$Describe what was observed and operating conditions __________________________
___________________________________________________________________
Guest exposure or incident link __________  Photo or log reference __________
Activity stopped at __________  Barrier and tag __________  Sales blocked __________
Energy isolation by __________  Lock or permit reference __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Repair and verification$fecsop$, $fecsop$Maintenance owner __________  PR or work order __________  Due date __________
Repair and parts fitted __________________________________________________
___________________________________________________________________
Cause identified __________  Similar assets checked __________
Required test
Acceptance criterion
Actual result
Tester$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Reopening decision$fecsop$, $fecsop$Specialist inspection needed? YES / NO    Basis ______________________________
Technical clearance by __________  Date __________  Certificate __________
Guards tools work area and staff briefing checked by __________________________
Operations release by __________  Time __________  Restrictions _______________
Result: CLOSED / RELEASED WITH VALIDATED RESTRICTIONS / RELEASED
A signature without test evidence is not technical clearance. A restricted release cannot bypass a failed safety device or keep an unresolved critical hazard accessible.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R05$fecsop$,
  $fecsop$R05 Incident missing child and safeguarding record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R05$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R05  |  Restricted access
Site KDS-MINI-DM ____  Record number __________  Date and time __________
Type: INJURY / NEAR MISS / FOOD / MISSING CHILD / SAFEGUARDING / OTHER
Reporter __________  Supervisor __________  Activity or food batch __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Facts and immediate response$fecsop$, $fecsop$What happened and where ______________________________________________
___________________________________________________________________
Observed condition or exact words ________________________________________
___________________________________________________________________
First aid responder __________  Action within training _________________________
999 called at __________  Property security at __________  Guardian at __________
Emergency service reference __________  Guest or guardian contact ______________
Time
Action or search zone
Person
Outcome$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Evidence and safe collection$fecsop$, $fecsop$Witness details held at __________  CCTV time range __________  Preservation by __________
Equipment isolation reference __________  Photos or batch evidence __________
Child release verification and authorized adult _______________________________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Followup and closure$fecsop$, $fecsop$Operations notified __________  Compliance notification decision __________
Authority or insurer reference __________  Action owner and deadline __________
Root cause and prevention ______________________________________________
Closure reviewer __________  Date __________  Reopening record __________
Record observations separately from opinions. Do not copy medical or safeguarding detail into ordinary group chats. For an unresolved emergency, continue response rather than completing paperwork.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R06$fecsop$,
  $fecsop$R06 Cash reconciliation and service recovery$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R06$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R06  |  Cashier and supervisor record
Site KDS-MINI-DM ____  Date __________  Cashier __________  POS shift __________
Reconciliation item
QAR or count
Evidence reference
Opening cash float
Cash sales and other authorized cash movements
Cash refunds and documented cash drops
Expected closing cash
Actual closing cash
Variance actual minus expected
Card POS total versus terminal settlement
Online sales and admissions matched
Offline tickets issued used void and returned
Discounts refunds and complimentary admissions
Expected cash = float + cash receipts - cash refunds - recorded cash removals. Explain every other authorized movement. Do not include card receipts in expected physical cash.
Variance explanation __________  Finance escalation __________  Seal number __________
Cashier signature __________  Independent review __________  Time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Complaint or service recovery$fecsop$, $fecsop$Reference __________  Guest contact if needed __________  Date __________
Issue and facts ________________________________________________________
Resolution offered __________  Refund or concession __________
Authority and approval reference __________  Followup owner __________
Guest informed at __________  Root cause action __________  Closed by __________
Safety or safeguarding complaint linked to R05 __________. Do not offer a concession in exchange for a rating or review removal.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R07$fecsop$,
  $fecsop$R07 Cleaning inspection and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R07$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R07  |  Working hygiene and safety record
Site KDS-MINI-DM ____  Date __________  Supervisor or PIC __________
Area or item
Product method and contact time
Due / done
Checked by
Product dilution or concentration verified __________  Test method __________
Contamination isolation reference __________  Reopened by and time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Weekly safety and pest walk$fecsop$, $fecsop$Check
Finding and owner
Due date
Closed evidence
Structure barriers pads and floors
Exits signs fire access and first aid
Electrical guards charging and lighting
Hygiene water drains and pest signs
Food permits allergens and temperatures
Training staffing and overdue defects
Pest contractor reference __________  Chemical treatment restrictions __________
No spraying during occupied food or play sessions. Follow the authorized reentry and food protection instructions.
Inspector __________  Signature __________  Management review date __________
Critical finding: stop now, record R04 or R05 and escalate immediately. Assign every corrective action an owner and evidence requirement. A due date cannot justify continued unsafe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R08$fecsop$,
  $fecsop$R08 Site validation and emergency information$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R08$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R08  |  Site authorization for KDS-MINI-DM
Site KDS-MINI-DM ____  Legal name __________  Address unit floor __________
Release evidence
Document reference
Verified by and date
Trading food and premises permissions where applicable
Approved occupancy plan and escape arrangements
Asset inventory manuals and specialist inspections
R03 cards and critical limit validation
Staffing sightlines relief and first aid coverage
Food scope and menu controls or recorded N/A
Fire maintenance property interfaces and insurance
CCTV privacy access and retention basis
Emergency and rescue demonstrations completed
Current site photographs and measured plan$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Emergency information to post at the site$fecsop$, $fecsop$Emergency services 999 [S18]    Property security __________    Duty supervisor __________
Site access and responder meeting point ___________________________________
Primary exit __________  Alternative exit __________  Assembly location __________
Assistance and refuge arrangement __________  First aid location __________
Electrical isolation __________  Fire controls held by __________  Backup contact __________
Attach the approved marked plan. Do not create an escape route from a photograph.
Activities excluded from release __________________________________________
Technical signoff __________  Food signoff __________  Operations __________
GM authorization __________  Effective date __________  Review date __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R09$fecsop$,
  $fecsop$R09 Food batch allergen and cookery record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R09$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R09  |  Copy sheets as needed
Site KDS-MINI-DM ____  Date __________  PIC __________  Menu or class __________
Food or ingredient
Supplier batch expiry
Receipt temperature
Accept reject
Batch and step
Start time and temp
Check time and temp
Action and initials
Steps include cooking, reheating, cooling and holding. Copy for each batch and required check. Fridge or freezer unit __________  Opening ______  2 hourly ______  Close ______
Recipe or menu item
All ingredients and allergens
Cross contact controls
PIC release$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Cookery or edible activity session$fecsop$, $fecsop$Recipe revision __________  Age group __________  Approved capacity __________
Instructor __________  Entry and safety support __________  Actual participants __________
Guardian consent and allergy check reference __________  Tool count out / in __________
Handwash and station release __________  Hot work adult __________
Take home label and use instructions __________  Children collected __________
Unsafe food or allergen incident reference __________  Disposition approved by __________
Record probe verification, recipe validation and any supplier substitution on attached sheets. Keep participant medical and contact details in the restricted register, not on a public counter.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$KDS-MINI-DM-R10$fecsop$,
  $fecsop$R10 Food hazard analysis and control plan$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R10$fecsop$,
  $fecsop$site-manuals/KDS-MINI-DM/E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$KDS-MINI-DM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R10  |  Complete for each approved menu or cookery process
Site KDS-MINI-DM ____  Menu or recipe __________  Revision ______  Food PIC __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Process and intended use$fecsop$, $fecsop$Product and ingredients __________  Intended consumers __________  Allergens __________Process flow reference __________  Flow verified on site by __________  Date __________Storage and shelf life basis __________  Take-home instructions __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Hazard assessment$fecsop$, $fecsop$PROCESS STEP
HAZARD AND CAUSE
CONTROL MEASURE
CCP DECISION AND BASIS
Assess biological, chemical, physical and allergen hazards. The qualified food lead determines whether each control is managed through prerequisite hygiene procedures or as a critical control point. Do not classify every temperature check automatically as a CCP.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Control and verification$fecsop$, $fecsop$CONTROL ELEMENT
APPROVED PLAN
Critical limit and validation source
Monitoring what how when and responsible person
Immediate correction and affected product disposition
Root cause and preventive action
Verification method frequency and reviewer
Required monitoring and deviation records
Approved by Food Lead __________  Signature __________  Date __________Operator briefing completed __________  Review due __________
Revalidate following a menu, supplier, allergen, equipment, process, capacity or regulatory change. Link actual batch monitoring to R09. This worksheet supports a site-specific HACCP plan; it does not constitute approval of an unassessed process. Reference basis: MoPH HACCP approach [S08] and Codex hygiene framework [S13].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$KDS-MINI-DM-R10$fecsop$;

INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, $fecsop$Imported from E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx$fecsop$
FROM public.sop_documents d
WHERE d.code LIKE $fecsop$KDS-MINI-DM-%$fecsop$
  AND NOT EXISTS (
    SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id AND v.version = 1
  );

DELETE FROM public.sop_sections s USING public.sop_documents d WHERE s.document_id = d.id AND d.code LIKE $fecsop$CAR-AP-%$fecsop$;
INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-MANUAL$fecsop$,
  $fecsop$Site SOP manual$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$MANUAL$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, $fecsop$Contents and navigation$fecsop$, $fecsop$DOCUMENT GUIDE
SECTION
PAGE
Site profile and local operating procedures
3–4
Document control and Qatar framework
5–8
Common operating procedures C01 to C09
9–17
Activity procedures A04
18
Conditional food and cookery procedures F01 to F05
19–23
Qatar and international requirements
24–25
Site records and forms R01 to R10
26–35
Training and management review
36
References and document framework
37–39$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$How to use the manual$fecsop$, $fecsop$This document is the standalone site manual for Carousel at Aspire Park. Read the site instructions, then apply C01 to C09 and the activity procedures included here. The food and cookery section is conditional: use only procedures within the site’s approved scope and mark non-applicable activities in R08.
Complete R08 before site release and R03 for each activity. Use R01 and R02 daily. Record exceptions on R04 to R09; use R10 to document the approved food hazard-control plan.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Carousel$fecsop$, $fecsop$LOCATION 05  /  ASPIRE PARK  /  CAR-AP
SITE CONTROL
REQUIREMENT
Operating scope
Outdoor passenger ride
Responsible owner
Site Supervisor; accountable to Head of Operations
Required procedures
C01 to C09; A04. F01 to F05 only for approved food or cookery activities.
Staff deployment
Dedicated ride operator; loading support as assessed; trained relief.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Site records$fecsop$, $fecsop$Attach the current approved floor plan, site photographs, asset register and emergency access plan to the controlled site copy. Confirm the operating footprint and all installed activities before release.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$Operational priorities$fecsop$, $fecsop$Ride inspection, loading control, restraints, weather and safe passenger recovery.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$Daily supervisor checklist$fecsop$, $fecsop$Before opening: complete R01, confirm staffing and relief, inspect exits and release each activity. During operation: control admission, maintain sightlines and record required checks. At close: account for every child, isolate defects, reconcile sales and complete R02.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 7, $fecsop$Site operating procedures$fecsop$, $fecsop$CAR-AP  /  SOP 05  /  Carousel at Aspire Park
Site scope: outdoor carousel. Record the manufacturer, model, approved seat capacity and weather limits in R03. Retain current site photographs and inspection records. Operating limits must relate to this ride and must not be copied from another attraction.
Required modules: C01 to C09 and A04. Apply food rules only if a separately permitted concession exists.
1. Before opening inspect the ride, perimeter, loading surface, lighting, exposed cabling and storm or water damage. Complete the required empty cycle and test controls through the approved method. Confirm operator and relief competency.
2. Measure and record local weather using the required instruments. OEM wind, rain and lightning instructions govern the ride. Do not use the HSE inflatable wind threshold for this carousel. If ride limits are missing, withhold operation until established.
3. Apply Qatar’s heat work requirements to relevant outdoor tasks including setup, cleaning and maintenance. Provide cool drinking water, effective shaded rest, heat training and health arrangements. Use approved WBGT monitoring and the stop rule in Requirements 01 [S09].
4. Inspect touch surfaces for unsafe heat and ensure guests can wait safely. Stop for unsafe surfaces, dust or reduced visibility, rain affecting traction or electrics, lightning risk, or adverse weather instructions from the park.
5. Manage a contained queue and supervised loading gate. Keep pedestrians and bicycles outside the ride perimeter. The operator remains at the controls through each cycle; ticketing and guest enquiries must not distract them.
6. If weather worsens, stop admissions, complete a safe stop, unload and guide guests to the approved substantial shelter. Do not shelter under the ride or trees during lightning. Secure the ride by the OEM method and reopen only after inspection and documented clearance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 8, $fecsop$After dark and emergency access$fecsop$, $fecsop$Verify lighting covers the complete perimeter and loading area without glare obscuring the operator’s view. Keep the park access route and agreed responder meeting point clear. Have a working phone or radio and a backup contact route.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 9, $fecsop$Evidence required before release$fecsop$, $fecsop$Ride model and serial; engineering and inspection records; operating and weather limits; load and restraint instructions; emergency lowering or recovery method; secure overnight condition; shelter and assembly location; park permission; post plan; WBGT device and heat assessment. Complete R03 and R08.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 10, $fecsop$Document control and authorization$fecsop$, $fecsop$CONTROL 02
Role
Accountability
GM or authorized executive
Approve policy, resources and delegated financial limits; no commercial waiver of safety restrictions.
Head of Operations
Own the manual, approve site deployment and capacity reductions, review incidents and authorize site release after technical evidence.
Site supervisor
Complete opening decision, assign posts and relief, check controls during trade, stop unsafe activity and sign handover.
Maintenance lead and inspector
Validate equipment records, technical limits, inspection scope and repairs; issue written technical release.
Food PIC
Approve recipes, suppliers, allergen controls, food monitoring and disposition; stop unsafe food service.
HR and training lead
Verify role competency, induction, working arrangements and training records.
IT and privacy lead
Protect POS, CCTV and guest records; approve access and technical recovery.
Every employee
Intervene early, stop danger, summon help and record facts honestly.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 11, $fecsop$Release sequence$fecsop$, $fecsop$Inspect the site and complete R08. Confirm licenses, emergency plan, equipment inspection certificates, operating cards, food permissions and staffing. Demonstrate opening, evacuation and relevant equipment rescue. Close critical findings. Obtain the approvals below and issue a controlled copy to the site. Release can exclude a clearly separated activity.
Approval
Name and signature
Date
Technical validation
Food validation if applicable
Head of Operations
GM or authorized executive
Review annually and after an incident, equipment change, menu change, layout change or regulatory change. The document owner records revisions, withdraws superseded copies and arranges staff retraining. This revision takes effect at each site only after the required approvals are completed.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 12, $fecsop$Approval and document control$fecsop$, $fecsop$DC01  |  Applies to all procedures in the CAR-AP site manual
CONTROL FIELD
CONTROLLED VALUE
Manual ID and revision
E3-CAR-AP-MAN-001 / Revision 1.0
Document date
21 September 2026
Effective date
To be entered after approval: __________________
Scheduled review
12 months from effective date, or earlier following change or incident
Status
For approval; no signature or authority approval is implied
Owner and master copy
Head of Operations FEC and IT / designated controlled document repository
Superseded revision
First standalone site issue; derived from corporate manual revision 4.0.
Procedure identification
E3-CAR-AP-C01 to C09; applicable A modules; F01 to F05; R01 to R10.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 13, $fecsop$Preparation review and approval$fecsop$, $fecsop$ROLE
NAME
SIGNATURE
DATE
Prepared by Operations
Technical review Maintenance or Inspector
Food safety review Food Lead
Qatar compliance review Designated Lead
Approved by GM or Authorized Executive
Each reviewer confirms only the scope within their competence. The approved manual is released with completed site verification R08 and activity cards R03. A management signature does not replace a statutory permit or equipment inspection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 14, $fecsop$Language and communication$fecsop$, $fecsop$Maintain this English master and controlled translations where required by the relevant authority or staff comprehension needs. E3 requires Arabic and English guest safety notices and receipts. Staff must demonstrate understanding of their assigned procedures; record the briefing language and assessment result.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 15, $fecsop$Revision distribution and records$fecsop$, $fecsop$DC02  |  Document lifecycle and traceability
REV
CHANGE
RELEASE
1.0
First standalone manual for CAR-AP. Contains local instructions, full applicable SOPs and site records. Based on corporate revision 4.0.
Pending site approval$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 16, $fecsop$Controlled distribution$fecsop$, $fecsop$COPY OR ACCESS ID
LOCATION OR HOLDER
ISSUED BY AND DATE
OLD COPY WITHDRAWN
The document controller records approval and effective date, grants access to the approved master, distributes site copies and removes superseded copies. Printed copies are uncontrolled unless registered. Amendments require impact review, approval and briefing before use. Site supervisors must not edit safety limits locally without authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 17, $fecsop$Records management$fecsop$, $fecsop$RECORD FAMILY
CUSTODIAN AND CONTROL
R01 R02 R07 daily operations
Site Supervisor; complete during the shift and review exceptions before handover.
R03 R04 equipment and defects
Maintenance Lead with Operations; link to asset serial, inspection evidence and return-to-service authorization.
R05 incidents and safeguarding
Authorized Operations and safeguarding personnel; restricted access and preservation of evidence.
R06 finance and complaints
Finance and Site Supervisor; reconcile transactions and retain approval references.
R08 site authorization
Head of Operations; link current licenses, plans, training and permissions.
R09 R10 food and cookery
Food PIC; retain supplier, batch, monitoring, deviation and verification evidence.
The compliance lead approves a retention schedule using applicable law, permit conditions, insurer requirements and legal holds. Record retention period, disposal authority and storage location for each record class. Do not apply a generic operating-log period to CCTV, child, medical or financial records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 18, $fecsop$Qatar compliance and procedure framework$fecsop$, $fecsop$DC03  |  Requirements mapping and site release
This is the E3 controlled-document format. Applicable Qatar laws, permit conditions, approved property plans and manufacturer instructions govern its implementation. ISO 10013 provides guidance on organisation-specific documented information [S20]; it is not a Qatar government template or evidence of certification.
REQUIREMENT AREA
REQUIRED SITE EVIDENCE
MANUAL LINK
Commercial activities
Licensed entity, trading name, commercial registration and permitted activities for each location.
R08; LOC01–07
Food service and cookery
Applicable permissions; current MoPH code; named food PIC; approved menu, process flow, hazard analysis and monitoring records.
F01–F05; R09 R10
Fire and life safety
Current Civil Defence and property approvals as applicable; occupancy, exits, assembly and emergency access arrangements.
C01 C06; R08
Outdoor work and heat
Applicable Ministerial Decision 17 of 2021; work scheduling, heat risk assessment, WBGT checks and welfare arrangements.
CAR-AP; R03 R08
Consumer information
Current applicable consumer-protection requirements; displayed prices, accurate service information, receipts and complaint route [S21].
C02 C09; R06
CCTV and personal information
Applicable law and permissions; approved camera plan, access and retention controls.
C09; R08
Equipment integrity
Asset-specific manuals, inspection scope and certificates, validated limits, competent operators and rescue arrangements.
A01–A06; R03 R04$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 19, $fecsop$Standard procedure structure$fecsop$, $fecsop$Each operating SOP identifies its purpose, scope, responsible roles, operating steps, corrective action, required records and reference basis. Revision, approval and effective-date controls in DC01 apply to the complete manual. Local work instructions must identify the related SOP and asset or activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 20, $fecsop$Release rule$fecsop$, $fecsop$The compliance lead records the applicable authority, document title, revision or issue date, relevant requirement and supporting evidence. Resolve discrepancies before site release. If authority requirements or manufacturer instructions conflict, stop the affected activity and obtain a documented technical or regulatory resolution. Smaller sites may simplify administration but must retain the necessary safety coverage.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 21, $fecsop$Qatar requirements and verification register$fecsop$, $fecsop$REQUIREMENTS 01
The compliance lead must maintain current authority requirements and supporting documents for each licensed entity and site. Complete all verification items before authorization. This register supports compliance management and does not replace statutory approvals.
Area
Required operating evidence
Verification required
Business and premises
Correct CR and commercial activity, premises permission, landlord agreement and conditions for each attraction or food activity. Track expiry and owner.
Site documents required; verify permit scope.
Fire and life safety
Current applicable Civil Defence approval, approved occupancy and drawings, alarm and firefighting maintenance, exit plan and property emergency interface.
Retain current Civil Defence approvals, plans and inspection schedules.
Food services
Applicable MoPH and municipal approvals, food handler fitness and training evidence, PIC, approved food safety plan and current MoPH food service code.
MoPH purpose verified [S08]; October 2020 copy reviewed [S19]. Current edition to confirm.
Outdoor and heat exposed work
Implement Ministerial Decision 17 of 2021: work schedule, risk assessment, monitoring, water, rest and training.
Official decision translation hosted by ILO reviewed [S09].
CCTV and privacy
Confirm applicability of Law 9 of 2011 and personal data requirements; retain approved camera plan, retention basis and access rules.
Law title found; full current legal requirements not verified [S16].
Guest information
Compliance lead validates Arabic consumer information, receipts, price displays, terms and complaint process. E3 requires bilingual safety notices and receipts.
E3 policy; local legal wording to verify.
Employment and contractors
HR verifies work authorization, lawful schedules, breaks, competent staff, contractor permissions and insurance conditions.
Site HR and contract evidence required.
Heat rule: covered work is prohibited from 10:00 to 15:30, 1 June to 15 September. Stop exposed work when WBGT exceeds 32.1°C. E3 uses 32.1°C or above as its conservative stop trigger. WBGT is not ordinary air temperature. Training, risk assessment and health surveillance requirements remain relevant beyond opening hours [S09].
Missing or expired permission: stop the affected activity and obtain written clearance. A renewal application, supplier assurance or mall verbal agreement is not itself permission to operate.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 22, $fecsop$International standards and inspection approach$fecsop$, $fecsop$REQUIREMENTS 02
Use these references to specify and verify the safety system. They are not automatically Qatar law. The competent inspector must confirm the edition, scope, installation date, amendments and local acceptance for each asset. Full paid standards were not reviewed clause by clause.
Reference
Application
Evidence to obtain
ISO 45001 2018 with applicable amendment [S10]
Worker safety management framework.
Risk register, worker participation, training, investigations and audit trail.
ISO 9001 2015 with applicable amendment [S11]
Documented service and quality controls.
Controlled procedures, supplier checks, complaint closure and change records.
ISO 22000 2018 and Codex CXC 1 1969 revised 2022 [S12 S13]
Food safety management and HACCP framework.
Validated menu based hazards, monitoring, corrective action and verification.
EN 14960 family and HSE inflatable guidance [S14]
Appropriate inflatable play devices.
Applicable standard and OEM limits, initial and periodic inspection, pressure and evacuation evidence.
EN 1176 family including enclosed play and inspection parts; EN 1177
Soft play and impact attenuating surfacing where within scope.
Inspector to select current applicable editions and confirm design, entrapment, access and surface tests.
ASTM F2970 25 [S15]
Trampoline courts within its scope.
Current catalogue identified; obtain full standard and applicable installation review.
EN 13814 family or appropriate ASTM F24 standards
Carousel and other amusement devices where applicable.
Inspector to establish accepted design, operation and inspection basis; do not mix design codes.
HSE HSG175 third edition [S17]
Supplementary amusement operation guidance.
Competent inspections, operating manual, maintenance, modification and operator training.
E3 baseline: preopening checks every operating day; active observation throughout use; formal supervisor checks hourly; detailed weekly walk; monthly management audit. Commission specialist inspections at the OEM, authority or inspector interval, with annual independent review as the proposed company baseline for rides and applicable inflatables. Shorter requirements prevail.
A daily checklist does not replace engineering inspection. Certificates must identify the actual serial number, scope, test results, defects and next due date. Do not describe E3 as ISO certified unless a valid certificate covers the relevant entity and activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 23, $fecsop$Implementation training and management review$fecsop$, $fecsop$IMPLEMENTATION 01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 24, $fecsop$Before frontline release$fecsop$, $fecsop$Head of Operations assigns an owner to every R08 gap. Verify legal permissions and all critical equipment, food and emergency controls first. Keep unresolved activities closed. Obtain missing technical manuals and full applicable standards through the responsible competent professionals. Approve a site specific effective date only when the release conditions are met.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 25, $fecsop$Practical competency$fecsop$, $fecsop$Role
Must demonstrate before independent work
Every employee
Stop authority, emergency communication, child safeguarding and defect reporting.
Entrance and cashier
Correct ticket, capacity count, guardian matching, refund control and outage process.
Activity operator
Preuse check, restrictions, safe dispatch, intervention, shutdown and equipment emergency response.
Supervisor
Post coverage and relief, opening decision, evacuation coordination and incident evidence.
Food staff and PIC
Handwashing, separation, probe use, allergy order, batch disposition and cleaning.
Cookery instructor
Age appropriate task briefing, child count, tool control, allergy controls and hot zone separation.
Training record: employee ______ role ______ SOP codes ______ trainer ______ date ______ practical scenario ______ result ______ retraining ______ authorization ______. Reading or signing the manual alone is insufficient. Repeat assessment after a relevant incident, change or failed observation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 26, $fecsop$First month after release$fecsop$, $fecsop$Week 1: supervise opening and closing every day and resolve unclear instructions. Week 2: observe peak capacity and relief arrangements. Week 3: run a relevant scenario such as lost child, deflation, ride stoppage or food withdrawal. Week 4: audit records and adjust deployment from actual evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 27, $fecsop$Monthly review$fecsop$, $fecsop$Review incidents and near misses per guest visits, critical defects, overdue inspections, staffing gaps, food control failures, complaints, cash variances, training competence and action closure. Do not reward low incident counts in a way that discourages reporting. Record management decisions, budgets, owners and due dates.
No site is released by this document alone. The completed evidence and demonstrated behavior are the basis for safe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 28, $fecsop$Reference register$fecsop$, $fecsop$SOURCES 01
Reference review date 21 September 2026. Maintain current editions of applicable standards, authority requirements and manufacturer instructions. Photograph captions identify their sources; publicity images do not replace current site inspection records.
S01 E3 attraction directory and source photographs
Reference photographs identify InflataPark, Urban Arena, Kidz Driving School and Crayons and Bricks Place Vendôme. Directory location and time fields conflict with other listings; not used as verified addresses or hours.
S02 City Center Doha Inflata Park
Mall source establishing the venue at City Center.
S03 City Center Doha Kids City Driving School
Mall source supporting the correction of the KDS activity identity.
S04 BookingQube InflataPark
Ticketing reference. Equipment limits must follow validated manufacturer instructions.
S05 BookingQube Kids City Driving School
Describes driving and soft play. Product offer is not an asset inventory.
S06 BookingQube Urban Arena
Identifies Doha Mall and advertised driving, arena, console and soft play categories.
S07 BookingQube Crayons and Bricks Vendome
Creative activity description. Current trading status and facilities need confirmation.
S08 MoPH Food Safety Code of Practice for Food Services
Ministry text reproduced by Lexis. Purpose and HACCP approach accessible; current official edition not retrieved. Historical operational text reviewed separately [S19].
S09 Qatar Ministerial Decision 17 of 2021 on heat stress
ILO hosts the decision translation. Articles 2 to 4 establish covered hours and mitigation duties; original Arabic and later applicable requirements must be checked for legal use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 29, $fecsop$Standards references and verification requirements$fecsop$, $fecsop$SOURCES 02
S10 ISO 45001 2018
Occupational health and safety management catalogue; includes amendment information.
S11 ISO 9001 2015
Quality management catalogue. Confirm applicable amendments and transition at adoption.
S12 ISO 22000 2018
Food safety management catalogue; includes HACCP and prerequisite program context.
S13 Codex codes of practice
Lists General Principles of Food Hygiene CXC 1 1969, revised 2022.
S14 HSE inflatable safety advice
Public practical guidance. UK legal and scheme references are not presented as Qatar obligations.
S15 ASTM F2970 25
Current edition identified through ASTM catalogue. Full paid clauses not reviewed.
S16 Qatar CCTV Law 9 of 2011
Title identified in Qatar legal portal search. Confirm current legal text before setting retention periods or approving camera alterations.
S17 HSE HSG175 third edition
Supplementary amusement management and inspection guidance. Not an assertion that UK law applies in Qatar.
S18 Hamad Medical Corporation Ambulance Service
Supports immediate 999 contact, accurate location and following dispatcher instructions.
S19 MoPH food code October 2020 copy
Third party hosted ministry document, revision 0. Sections 6.8.2, 7.2, 7.3, 7.5 and 7.6 reviewed for food limits; confirm authenticity and current official revision before release.
Outstanding site records: attach current photographs, measured plans, approvals and asset records for CAR-AP. Confirm any approved food or cookery scope, menus and facilities. Complete R08 and the relevant activity cards before authorizing operations.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 30, $fecsop$Document format and Qatar references$fecsop$, $fecsop$SOURCES 03  |  Format review dated 21 September 2026$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 31, $fecsop$S20 ISO 10013 2021$fecsop$, $fecsop$Quality management systems — Guidance for documented information. The published scope supports development and maintenance of documentation tailored to an organisation. The E3 layout, numbering, A4 paper, approval blocks and registers are company document controls; they are not prescribed Qatar typography or a claim of ISO certification.
https://www.iso.org/standard/75736.html$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 32, $fecsop$S21 Qatar Ministry of Commerce and Industry$fecsop$, $fecsop$Consumer Services identifies Law No. 8 of 2008 and official consumer-rights guidance. Maintain accurate information, pricing and the appropriate complaint route; confirm applicable legal and permit details before adopting site-specific terms.
https://www.moci.gov.qa/en/consumer$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 33, $fecsop$Application of Qatar requirements$fecsop$, $fecsop$Maintain current official requirements in the compliance register. The MoPH food-service code uses a HACCP-based approach [S08]. Outdoor work is assessed against Ministerial Decision 17 of 2021 [S09]. Fire, occupancy and emergency arrangements must follow the applicable site approvals. Government forms required for licenses or inspections remain separate from this internal SOP manual.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 34, $fecsop$Controlled format specification$fecsop$, $fecsop$ELEMENT
E3 DOCUMENT RULE
Page and typography
A4 portrait; clear heading hierarchy; readable body text; repeating document identification and page count.
Identification
Manual and procedure IDs; revision; effective date; owner; controlled approval and distribution.
Procedure content
Purpose; scope and responsibility; operating steps; corrective action; records and reference basis.
Site application
Location title and code; applicable modules; staffing coverage; inspection and release evidence.
Change control
Recorded revision, reviewer approvals, withdrawal of old copies and staff briefing.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-MANUAL$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C01$fecsop$,
  $fecsop$C01 Opening and staffing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C01$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Ensure the site opens only with safe facilities, competent staff and released activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Site supervisor  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Read the last handover and defect register before admitting anyone. Confirm the site and every proposed activity have current release status; remove closed activities from ticket sales.
2. Record who is actually present and competent. Name the duty supervisor, first aid responder, entrance controller, activity attendants and relief staff. Conduct a short briefing on defects, expected groups, emergency roles and guest needs.
3. Walk the guest route and every activity. Check exits, evacuation gates, floor condition, barriers, lighting, accessible routes, first aid supplies and communication. Verify property systems through the agreed interface; do not trigger fire alarms without coordination.
4. Operators complete the equipment specific preuse checks and empty test cycles required on R03. Confirm safety signage, limits, emergency controls and inspection validity. Check that isolated equipment cannot be accessed.
5. Food PIC releases food service separately. Cashier checks approved prices, bilingual receipt output, float and payment terminal. Confirm clocks, wristbands or ticket numbers and the guest count method.
6. Supervisor checks the results, records OPEN, PART OPEN or CLOSED and signs R01. Photograph significant defects without capturing identifiable guests unnecessarily. Admit only to released areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not open with a blocked exit, missing safety critical operator, unknown capacity, failed safety device, unsafe food service or an overdue required equipment examination. A small site may share administrative roles, but cannot leave its entrance or activity unsupervised to serve a customer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 opening record, staff post plan and asset check sheets. Head of Operations reviews failed openings and recurring staffing gaps. Provide planned relief; if relief fails, pause admissions and clear or close the affected activity safely.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C02$fecsop$,
  $fecsop$C02 Admission capacity and guest release$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C02$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control admission, capacity, participation and authorized child collection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Entrance controller and supervisor  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Explain the purchased activity, time, price, restrictions, supervision arrangement and refund terms before payment. Use approved Arabic and English information and practical demonstrations when needed.
2. Check the relevant activity card for age, height, weight, clothing, ability, capacity and permitted accompanying adults. Apply limits discreetly. Do not rely on appearance to judge a borderline restriction or ask staff to make medical diagnoses.
3. Use a linked child and guardian identifier for sessions involving children. Record necessary contact and collection details in the approved system. Tell the guardian whether they must remain inside or immediately available; never imply childcare without an approved service.
4. Count all people for premises occupancy, including adults and staff. Count participants separately for each activity. Effective capacity is the lowest validated premises, equipment and staffed supervision capacity. Stop sales and admission at the limit.
5. Brief guests before the activity starts. Remove loose items and require activity appropriate footwear or socks. Offer reasonable support for disability or sensory needs within safe equipment use; escalate uncertain accommodations before participation.
6. At departure verify the collection identifier and authorized adult. Resolve missing bands or disputed collection through the supervisor using independent checks. Keep the child safely supervised; do not release solely because an adult knows their name.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop entry when counting fails, guardian arrangements are unclear, limits cannot be verified, a child is distressed or a guest cannot comply with essential safety rules. Never lock an emergency escape route to contain children.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 occupancy checks, session entry and exit records, and R05 for release exceptions. Only necessary guest information is collected. No ad hoc ID photographs on personal phones.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C03$fecsop$,
  $fecsop$C03 Supervision handover and closing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C03$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain active supervision and a complete shift handover and safe closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and activity operators  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Position attendants from the approved zone plan, including blind corners, raised platforms, slide landing areas and exits. Keep a clear line of sight and move through the assigned zone. CCTV supplements physical supervision.
2. Intervene immediately in dangerous behavior, overcrowding, equipment changes or blocked routes. Explain the rule, stop the specific unsafe action and remove the guest from the activity when needed. Do not allow revenue targets to influence safety decisions.
3. Record a supervisor check each hour and after a group arrival, spill, fault or significant weather change. Confirm headcounts, staff coverage, hygiene, queue position and defect barriers. An hourly check does not replace continuous supervision.
4. Before breaks or shift changes, the replacement receives the guest count, current restrictions, incidents, equipment state and pending tasks face to face. The departing operator remains until the replacement accepts the post.
5. Before closing, stop sales in time to deliver paid sessions. Check all play levels, toilets if within the site, party spaces and quiet corners without unsafe entry. Account for every child and guardian. Complete the final ride or session and unload safely.
6. Shut equipment down in the OEM sequence. Clean and isolate defects; secure chemicals, batteries, cash and lost property. Keep required refrigeration, alarms and security systems running. Sign R02 and give the next shift unresolved actions and owners.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Pause the affected activity when visibility, lighting, noise or staffing prevents effective supervision. No operator may run a ride while handling cash or responding to unrelated messages.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R02 handover and closing, R04 faults and the hourly log. Supervisor reconciles remaining guests before locking public access; emergency egress follows the property plan.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C04$fecsop$,
  $fecsop$C04 Injury medical emergency and evidence$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C04$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Coordinate prompt emergency assistance, protect guests and preserve incident evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop the immediate source of harm. Secure the area without causing a second incident. Call the trained first aid responder and supervisor; do not move a casualty unless necessary to escape immediate danger or directed by emergency responders.
2. For a serious injury, breathing difficulty, unconsciousness, suspected severe allergic reaction or other urgent medical concern, call 999 immediately. Give the site name, mall or park, floor, closest access point, patient details and hazards; follow the dispatcher’s instructions [S18].
3. Send a named staff member to guide responders from the agreed entrance. Notify mall or park security. Keep a clear access route and arrange continued supervision or safe evacuation of other guests.
4. Contact the guardian promptly. Provide first aid only within current training and the emergency dispatcher’s instructions. Do not administer routine medicines, diagnose the injury or pressure the guest to resume play.
5. Preserve the scene and equipment state where safe. Record factual observations, times and witness contacts. Ask IT or security to preserve relevant original footage and record who accessed it. Do not film the injured person for staff chat groups.
6. Inform Head of Operations immediately for serious events. Complete R05 before the end of shift. The designated compliance lead assesses authority, property and insurer notifications without delaying any statutory deadline. Investigate causes and check equivalent assets across sites.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Equipment involved remains isolated until the technical cause and safe return conditions are established. Severe or unexplained incidents require competent technical review. A customer declining treatment does not clear the equipment.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 incident report, preservation log, technical findings and corrective actions. Reopening requires written technical clearance where relevant and Operations authorization. Respond with care and facts; do not speculate about blame or liability.
Reference basis: HMC emergency access guidance [S18] and E3 incident procedure$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C05$fecsop$,
  $fecsop$C05 Missing child and safeguarding$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C05$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Locate missing children promptly and protect children from harm.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Treat a missing child report as urgent. Obtain the child’s description, name, last known location and time, guardian contact and any relevant support needs. Notify property security and the supervisor immediately; assign one incident coordinator.
2. Stop new admissions if they distract from the response. Staff monitor normal entry and exit points while maintaining free emergency escape. Allocate named search zones and report cleared zones to the coordinator. Do not abandon other children.
3. Ask authorized security personnel to review relevant CCTV. Share the minimum description needed over the agreed radio channel; do not broadcast sensitive family information or circulate a child’s photo in public chat groups.
4. If abduction is suspected, the child is in immediate danger or security cannot resolve the situation promptly, contact police through 999. Do not wait for a preset search period or a manager’s permission in a credible emergency.
5. For a found child, use a visible safe location with two staff where practicable. Verify the collecting adult against the entry record and independent identifying information. Escalate discrepancies to security; never resolve a custody dispute yourself.
6. For safeguarding concerns, listen without leading questions, record the child’s words accurately and refer immediately to the safeguarding lead and appropriate emergency or protection authority. Never promise secrecy or investigate an allegation against yourself.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No isolated one to one contact, unauthorized photography, corporal punishment or unnecessary touching. Seek guardian consent for routine assistance. Necessary immediate action to prevent serious harm must not be delayed for consent; document it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 records search timeline, staff zones, security reference, guardian checks and outcome. Keep safeguarding information restricted. Release staff accused of harm from child contact pending a fair review, without presenting allegations as proven.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C06$fecsop$,
  $fecsop$C06 Fire evacuation and utility failure$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C06$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Evacuate safely and control the effects of fire and essential utility failure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor under property emergency command  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. On an alarm, smoke, fire or instruction to evacuate, raise the alert and call emergency services when required. Follow the approved property evacuation plan. Stop admissions and activities; do not delay for cash, shoes or personal belongings.
2. Operators stop rides and release guests by the trained method. Clear inflatable users promptly while safe inflation is maintained if possible; do not turn off blowers as a routine evacuation step while users remain unless electrical or fire danger requires it.
3. Direct people by the safe approved route. Use the planned assistance arrangements for children and people with reduced mobility. Do not use ordinary lifts in a fire. Staff must not enter smoke, climb structures or improvise rescues.
4. Sweep only assigned areas that remain safe, report unchecked areas and proceed to the assembly point. Reconcile staff, groups and child records as far as practicable; give missing person details and last known locations to responders. Never reenter to search.
5. For a power failure without fire, stop affected admissions, maintain emergency lighting and arrange safe equipment unloading or inflatable evacuation. An emergency stop reset does not prove the installation is safe. Protect refrigerated food using F02.
6. For loss of water, drainage, ventilation or essential lighting, stop the affected food or guest activity. Isolate contamination and inform the property. Resume only after the responsible technical or food lead verifies restoration and the supervisor records authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No trade during a fire alarm or unsafe evacuation condition. Only the property or emergency authority can clear reentry after their incident; Operations then separately checks attraction readiness. Never silence or bypass alarms to continue service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 event record and R08 emergency plan. Drills follow property and authority requirements; E3 proposes a quarterly staff scenario exercise and at least a six monthly coordinated evacuation exercise, subject to property agreement. Record learning and retrain failed roles.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C07$fecsop$,
  $fecsop$C07 Maintenance isolation and change control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C07$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C07  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent access to defective equipment and authorize return to service using evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Maintenance lead and supervisor  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop use, remove guests and secure the defect area. Identify the asset and write the fault and time on R04. For a critical defect, physically prevent access; a sign alone is insufficient.
2. A competent authorized technician isolates every relevant energy source, including electrical, mechanical, stored pressure and battery power. Apply the documented lockout method and verify isolation before work. Operators do not open energized cabinets or bridge safety devices.
3. Maintenance raises the repair request and purchase requisition with defect evidence and urgency. Route commercial approval through the authorized matrix. Isolation happens immediately and is not conditional on purchase approval.
4. Use qualified contractors with property permits, task risk assessment and controlled work area. Confirm parts are suitable and traceable. Record repair details and required inspections; do not accept temporary tape or improvised fasteners as structural repair.
5. After repair, the technician records measurements and OEM test results. A competent independent examiner reviews safety critical repairs or modifications where required. Restore guards, remove tools, account for workers and complete empty tests before any guest trial.
6. Technical signoff confirms equipment condition; Operations authorizes reopening and updates the activity card, training and asset history. For new games, changed locations, cut frames, added food equipment or changed software safety settings, complete change review before installation or use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not reopen after a failed safety device, unknown fault, structural damage or unexplained repeated stop until the cause is resolved. Customer testing is never a commissioning method. No verbal repair closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R04 defect and release record; asset register, parts and inspection certificates. Critical faults are escalated immediately; major issues receive same shift management review. E3 planning targets do not authorize unsafe continued operation.
Reference basis: E3 maintenance workflow; supplementary lifecycle guidance in HSG175 [S17]$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C08$fecsop$,
  $fecsop$C08 Cleaning chemicals and infection control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C08$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C08  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control hygiene hazards, chemicals and contamination in public and activity areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and cleaning lead  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Use an approved cleaning schedule identifying the surface, product, dilution, contact time, method, frequency and responsible person. Check compatibility with inflatable fabrics, pads, screens and food contact equipment. Keep chemical safety information available.
2. Before opening, remove debris, clean high contact areas and confirm floors and equipment are dry and safe. Clean shared accessories between users where required by the activity assessment. Inspect public contact surfaces hourly and clean whenever soiled.
3. For vomit, blood, faeces or other body fluid, close the contaminated area immediately and protect neighboring play or food. A trained cleaner uses the assessed PPE and appropriate disinfectant. Do not dry brush or spray contamination toward guests.
4. Remove visible contamination, clean, apply the approved disinfectant at its specified concentration and contact time, then rinse where required. Remove damaged porous material that cannot be safely decontaminated. Dispose of waste in the designated sealed route.
5. Keep cleaning tools separated between toilets, general areas and food. Label chemicals and lock them away from children and food. Never mix products or put chemicals into beverage containers. Isolate electrical equipment safely before cleaning.
6. Supervisor checks completion, dryness, chemical removal and any required ventilation before reopening. For suspected communicable illness clusters, notify the food or health lead and seek appropriate authority guidance; preserve records of affected sessions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Close affected areas when contamination cannot be contained, potable water or handwashing is unavailable, pests affect safety, or the correct cleaning method is unknown. Odor and visual appearance alone do not establish hygiene.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning record, product instructions, pest records and R05 where illness is reported. Ball pits and inaccessible enclosed areas need a documented deep cleaning method and schedule set from use, manufacturer guidance and risk, not an invented universal interval.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-C09$fecsop$,
  $fecsop$C09 Payments complaints records and continuity$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C09$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-C09  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain traceable payments, fair complaint handling and secure operating records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor cashier and IT lead  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Process each sale in the approved POS under individual credentials. Display approved prices and issue receipts showing purchased service and payment. Record authorized discounts, refunds and complimentary entries with reason and approver; never share manager credentials.
2. If POS or connectivity fails, notify IT and stop new sales unless a preapproved numbered offline ticket and payment process is available. Continue accurate capacity and child release controls. Never accept card details in messages or use personal accounts for company payments.
3. At close, reconcile cash, terminal batches, POS totals, online bookings, refunds, voids and offline tickets. Two people count where available. At a small site, use a sealed cash handover and independent Finance review. Record differences without offsetting them against unrelated transactions.
4. Acknowledge complaints, establish facts and offer a solution within authority. Escalate safety, safeguarding, discrimination, food illness and data concerns immediately. Do not tie a refund or complimentary service to removing a review or giving a positive rating.
5. Restrict guest, CCTV, HR and incident data by role. Use company systems, secure passwords and approved backups. Preserve incident footage promptly; do not copy it to personal devices. Confirm legal retention and camera alteration requirements before making changes.
6. On suspected cyber compromise, contact IT, protect affected systems through the approved response and preserve logs. IT validates recovery and reconciles transactions before reconnection. AI kiosks cannot override admission limits, access children’s records freely or initiate equipment movement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop transactions when traceability, payment security or safe capacity control is lost. A camera fault affecting an approved safeguarding control requires a supervisor risk decision and compensating staff coverage or closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R06 reconciliation and complaint records, IT tickets and access log. Apply the approved retention schedule in DC02; incident and child records require specific access, preservation and retention decisions. Legal hold overrides deletion. CCTV retention is separately verified, not set by this manual.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-C09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-A04$fecsop$,
  $fecsop$A04 Carousel loading and ride operation$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A04$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-A04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-A04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control ride inspection, loading, operation, unloading and emergency recovery.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-A04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Authorized ride operator  |  Applies to: CAR-AP$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-A04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Confirm inspection validity and the ride’s operating manual. Check gates, barriers, seats, poles, restraints where fitted, platforms, guarding, foundation indications, lighting and electrical protection. Complete the specified empty cycle and safety device tests.
2. Record weather and surface conditions against the approved ride limits. Assign a dedicated operator at the controls and a loading attendant where the risk assessment requires one. Arrange ticket checks so the operator is not distracted.
3. Bring the ride to its complete loading stop, control propulsion and open the designated gate. Check rider eligibility, approved seat allocation, total loading and distribution. Assist only within training and the guardian arrangement.
4. Check every required restraint and position. Secure loose clothing and objects. Close the gate, confirm all attendants and bystanders clear and obtain the agreed ready signal before starting. Do not allow late boarding.
5. Observe the entire operating area through the cycle. Stop for unsafe behavior, open gates, unusual vibration, sound, smell or a passenger in distress. Keep the controls attended. Do not reach into moving equipment or use emergency stops as routine cycle controls.
6. Unload only after a complete stop and operator instruction. For a power failure, apply the documented immobilization and passenger recovery method. Never force the mechanism or release a brake without trained technical control. Close down and secure in the OEM sequence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-A04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No operation without known weather and loading limits, effective gates and stopping, required sightlines or a trained operator. After any emergency stop, establish and correct its cause before restart. A reset alone is not clearance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-A04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 ride card, R01 empty test and weather log, R04 inspection and restart. Head of Operations validates the ride inspection basis with the competent examiner; HSG175 is supplementary guidance [S17].
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-A04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-F01$fecsop$,
  $fecsop$F01 Food scope suppliers and personal hygiene$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F01$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-F01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control food scope, supplier acceptance, staff hygiene and cross-contamination.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to cafés kitchens parties edible art and cookery$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$Use a separate food release for each site. Classify the offer as sealed packaged resale, open ready to eat preparation, cooking or reheating, or children’s cookery. A license for one scope does not establish permission for another. The complete current MoPH food code and permit conditions must be checked by the food lead before operational approval [S08].
1. Appoint a trained PIC whenever food is handled. Confirm staff fitness and required local food handler documentation. Staff report vomiting, diarrhoea, infected wounds or relevant illness before starting; the PIC excludes or restricts duties and obtains appropriate clearance.
2. Provide a dedicated accessible handwash point with potable water, soap and hygienic drying. Wash before food handling and after toilets, cleaning, cash, raw food and contamination. Gloves do not replace handwashing; change them between incompatible tasks.
3. Use approved suppliers and keep delivery, batch, expiry and traceability records. Inspect transport hygiene, packaging, pests, damage and temperatures before accepting food. Reject untraceable, expired, damaged or out of limit deliveries; log the reason.
4. Keep raw foods separate from ready to eat products, with raw items below them in storage. Separate allergens and chemicals. Label opened containers and prepared items with identity, preparation or opening time, use by decision and responsible person. Use earliest expiry first.
5. Use standardized recipes and approved substitutions only. Retain ingredient labels for allergen checks. Do not assume a halal claim or imported product approval from a brand name; obtain relevant supplier and regulatory evidence.
6. Restrict children and unauthorized staff from production areas. Store knives and hot equipment safely. Agree catering delivery access and waste removal with the property; protect guest routes and maintain cold or hot chain during transfer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No open food handling without handwashing, safe water, traceability and a competent PIC. Use R07 and R09. A mall food court, external caterer or birthday cake supplier does not remove E3’s checks at receipt and service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$Approved food scope, supplier register, staff fitness records, R07 cleaning, R09 batches and R10 hazard-control plan. Food PIC reviews evidence before release. Reference basis: MoPH food-service code [S08 S19].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-F02$fecsop$,
  $fecsop$F02 Food temperature control and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F02$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-F02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain validated food temperatures and documented corrective action throughout the process.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Qatar code benchmarks and proposed E3 monitoring$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$The October 2020 MoPH code copy [S19] informs these benchmarks. Confirm the current official edition and validate each menu before release. Monitoring frequencies are E3 controls unless specified otherwise. Use a calibrated clean food probe and record actual product readings, not just equipment displays.
Stage
E3 operating limit and monitoring
If the check fails
Chilled food
Receive and display below 4°C; E3 storage target 0 to 3°C unless the product requires colder. Check deliveries, opening, every 2 hours and close; displays after 30 minutes and hourly.
Reject delivery. Isolate stock; assess documented time and temperature. Unknown history means discard.
Frozen food
Receive and hold below minus 18°C; E3 target minus 20°C unless the product requires colder. Check deliveries and storage as above.
Reject thawed or abused stock. Transfer only under PIC control; do not refreeze without an approved process.
Cooking and reheating
E3 default core temperature at least 75°C for 30 seconds; use a validated recipe and check each batch at the coldest point. Reheat only once.
Continue heating if safe and recheck. Never serve an unverified batch; discard if safe recovery is not established.
Hot holding
Above 64°C; E3 target at least 65°C. Check at setup, after 30 minutes and hourly. Measure the coldest food, not only unit air.
Remove from service. Discard if below 64°C for over 2 hours or history is unknown; PIC controls any earlier recovery. Do not top up.
Cooling if authorized
Cool to 5°C or below within 2 hours; record start, interim and final core readings. Then maintain the approved chilled storage target.
Do not cool at sites without validated equipment. Discard failed or unrecorded batches unless a qualified lead approves a validated corrective process.
Cold chain failure: keep doors closed, record discovery time and temperatures, transfer to verified storage where possible and label HOLD. The PIC decides disposition from evidence. A normal fridge reading after power returns does not prove the food remained safe.
Probe verification: check against an appropriate reference such as a correctly prepared ice slurry; the food lead sets the instrument tolerance and calibration interval. Take the instrument out of use if outside its validated tolerance. Record calibration and any affected food decisions.
The October 2020 code has ambiguous cooling subparagraphs; this manual adopts its stricter 2 hour endpoint pending PIC confirmation. Do not substitute a foreign 6 hour rule. Validate capacity, portion size and cooling equipment. R09 records each batch and decision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$The PIC applies the stage-specific action above, records the affected batch and decision in R09, and escalates repeated failures to the food lead.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 temperature and disposition records; R10 validated process plan; probe verification and equipment service records. Reference basis: MoPH code copy [S19], subject to current-edition verification.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-F03$fecsop$,
  $fecsop$F03 Allergens service and suspected food illness$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F03$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-F03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent allergen exposure and respond to suspected food illness or allergic reactions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to: CAR-AP; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Maintain an ingredient and allergen matrix for every recipe, bought in item, sauce, garnish and activity ingredient. Check manufacturer labels on each change or delivery substitution. Include allergens beyond any standard list when a guest identifies them.
2. Ask about allergies at booking and confirm at service. Pass the request to the PIC, who checks the written recipe and cross contact controls. Never guess, remove a visible ingredient as a cure, or promise “allergen free” without a validated basis.
3. Use clean dedicated equipment and protected ingredients for an approved allergy order. Prevent shared scoops, oil, cloths, gloves or work surfaces from transferring allergens. Identify the order and hand it directly to the correct guest or guardian.
4. If the kitchen cannot control the identified risk, explain that clearly before accepting the order or cookery participant. Offer only a genuinely suitable alternative confirmed from its ingredients and handling. Do not rely on a waiver to permit an unsafe food exposure.
5. Serve within the approved temperature and time controls. Protect displays and use utensils rather than bare hands for ready to eat food. Reject unapproved home prepared food for shared service; any approved outside cake needs traceability, ingredients and storage instructions.
6. For suspected serious allergic reaction call 999 and follow trained first aid and dispatcher instructions. For suspected food illness, stop the implicated product, preserve batch and supplier records and quarantine relevant food safely. Notify Operations and the food compliance lead for authority action and traceability investigation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop serving when ingredients are unknown, an allergy order is mixed up, food is contaminated or a temperature history is missing. Do not quietly replace the dish without recording the incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 allergen and batch records, R05 illness or reaction report, supplier traceability and product withdrawal record. Record affected sites and customers where lawful. Do not dispose of potential evidence until the food lead determines safe preservation and any authority needs.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-F04$fecsop$,
  $fecsop$F04 Children cookery class operation$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F04$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-F04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Conduct approved children’s cookery sessions with safe food, tools and supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Cookery lead and food PIC  |  Applies to: CAR-AP; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Approve the recipe, age range, ingredient list, allergen matrix, equipment and lesson plan before advertising. Define a cold assembly or decorating class separately from a hot cooking class. No cooking activity is assumed to exist at a location simply because it serves food.
2. Before accepting participants, obtain guardian consent, contact and relevant allergy information. Set the class size from safe workstations, instructor sightlines, task hazards and escape space. Assign an instructor and a separate safety or entry support role where simultaneous tasks require it.
3. Clean and release the work area. Provide handwashing, child suitable utensils, stable work surfaces and protected ingredients. Keep craft paints, dough and cleaning products separate. Secure hair and loose clothing; supervise handwashing before food contact.
4. Demonstrate each task before issuing tools. Start with low risk preparation. E3 default: children do not handle raw meat, hot oil, boiling liquids, powered blades, gas controls or ovens. Any higher risk teaching requires a specific assessed and authorized program.
5. Adults control hot trays and cooking. Keep a physical hot zone outside child reach and routes. Check food temperatures and cool products to a safe handling temperature before returning them to children. Do not allow tasting of raw batter or uncooked flour mixtures.
6. Count tools back and verify all participants before collection. Label take home food with ingredients and allergens, preparation date and the validated storage and use instructions. Discard food handled unsafely and reset the workstation between classes.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Cancel or pause the class for an uncontrolled allergy, missing guardian arrangement, unsuitable staffing, lost tool, failed handwashing or inability to separate hot work. A small kiosk may offer only the low risk food scope that its facilities can safely support.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 cookery card, participant consent, R09 recipe and allergen release, temperature checks and R07 cleaning. A parent’s presence does not replace the instructor’s safety duty.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-F05$fecsop$,
  $fecsop$F05 Kitchen equipment cleaning and shutdown$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F05$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CAR-AP-F05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate and clean kitchen equipment safely and complete a controlled shutdown.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC and maintenance lead  |  Applies to: CAR-AP; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before use inspect guards, power leads, switches, hot surfaces, drainage and required extraction. Check refrigerators, ice machines and beverage equipment for cleanliness and correct condition. Do not use equipment with a safety fault.
2. Operate cooking appliances only with the approved ventilation and fire protection arrangements. No LPG cylinders, portable burners or new heat producing equipment without the necessary property and authority approval. Never bypass a guard or use water on an electrical or cooking oil fire.
3. For slush, ice, coffee and similar machines, use potable water and approved ingredients. Record batch and expiry, follow manufacturer cleaning and disassembly intervals, and keep nozzles and food contact parts protected. Do not continually top up old product.
4. Separate cash handling and food handling. Use a controlled cleaning sequence: remove debris, wash, rinse where needed, sanitize using the approved product, contact time and concentration, then air dry. Follow a dishwasher’s validated temperature or chemical cycle where fitted.
5. For maintenance, stop food production in the affected zone, protect or remove food and apply C07. The food PIC checks for metal, glass, chemicals, pests and residue before food service restarts. Obtain specialist support for kitchen equipment where internal competence is absent.
6. At close, dispose of expired or unsafe food, label retained stock, record temperatures, clean surfaces and drains, remove waste and complete pest checks. Shut down heat and nonessential equipment through its procedure while preserving refrigeration and required safety systems.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop cooking for failed extraction, uncontrolled grease, fire protection impairment, unsafe gas or electricity, sewage backup or pest contamination. Only trained authorized staff use the correct firefighting equipment when safe; evacuation takes priority.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning and pest log, R09 food records, R04 maintenance and food restart authorization. Agree specialist service scope, preventive maintenance and contractor access in writing; Operations does not substitute informal cash payment for maintenance approvals.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-F05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R01$fecsop$,
  $fecsop$R01 Daily opening and hourly record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R01$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R01  |  Copy for each site and operating day
Site CAR-AP ____  Date __________  Supervisor __________  Shift __________
First aid responder __________  Entrance controller __________  Relief __________
Preopening check
Pass Fail NA
Defect or evidence reference
Permissions inspection dates and previous handover reviewed
Post coverage and relief confirmed
Exits routes lights and communication ready
First aid and emergency information ready
Equipment checks and empty tests completed
Limits signs barriers and gates correct
Cleaning and dry safe surfaces confirmed
Food PIC release completed or food absent
POS receipts float and counting method ready
Defective areas isolated and removed from sale
Decision: OPEN / PART OPEN / CLOSED    Excluded areas __________________
Supervisor signature __________  Time __________  Defect record numbers __________
Time
Premises count / limit
Activity count / limit
Posts safe
Action and initials
Repeat hourly and after changes. Record actual inflatable pressure or weather values on the asset sheet when applicable. A failed critical check cannot be marked N/A. Attach operator sheets for every ride, vehicle, inflatable and game requiring preuse tests.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R02$fecsop$,
  $fecsop$R02 Closing and shift handover$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R02$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R02  |  Copy for each shift
Site CAR-AP ____  Date __________  Outgoing __________  Incoming __________
Closing check
Result
Exception and action
All guests cleared and children collected
Play levels rooms and quiet areas checked
Equipment stopped and secured in OEM sequence
Food temperatures stock and disposal recorded
Cleaning waste and pest check complete
Faults tagged and inaccessible
Cash POS card and tickets reconciled
Lost property logged and secured
Doors cameras alarms and required utilities checked$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Handover notes$fecsop$, $fecsop$Topic
Outstanding item and owner
Incidents and safeguarding
Bookings groups and allergies
Equipment and contractor visits
Staffing and relief
Stock and food
IT cash and other actions
Keys and controlled items transferred __________________________________
Final guest count ______  Closure time ______  Next shift restrictions __________
Outgoing signature __________  Incoming acceptance __________  Time __________
If there is no incoming shift, submit the record to the supervisor’s designated manager and secure the approved master copy. Do not close a defect because the venue is closed for the night.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R03$fecsop$,
  $fecsop$R03 Activity operating card and risk review$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R03$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R03  |  One approved card for every activity or distinct zone
Site CAR-AP ____  Activity __________  Asset and serial __________  Revision __________
Field
Validated entry and source document
OEM manual and inspection expiry
Approved age height weight and ability restrictions
Equipment participants and premises occupancy limits
Operating settings pressure speed or weather limits
Staff posts and minimum coverage including relief
PPE clothing footwear and loose item controls
Preuse inspection and empty test sequence
Loading briefing session and unloading sequence
Emergency stop isolation and rescue method
Cleaning inspection and maintenance intervals
Technical reviewer and Operations approval
Attach a marked plan showing gates, sightlines, escape, emergency controls and the guest flow. No universal staffing ratio is established by this form.
Hazard and persons exposed
Existing control
Further action and owner
Residual risk
Suggested assessment: likelihood 1 to 5 × severity 1 to 5. E3 management reviews 10 to 25 before release; 15 to 25 remains closed pending risk reduction. Any missing critical safeguard overrides the score. Risk scores do not prove engineering compliance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R04$fecsop$,
  $fecsop$R04 Defect isolation and return to service$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R04$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R04  |  One record per defect
Site CAR-AP ____  Asset __________  Serial __________  Record number __________
Detected by __________  Date and time __________  Severity __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Fault and immediate control$fecsop$, $fecsop$Describe what was observed and operating conditions __________________________
___________________________________________________________________
Guest exposure or incident link __________  Photo or log reference __________
Activity stopped at __________  Barrier and tag __________  Sales blocked __________
Energy isolation by __________  Lock or permit reference __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Repair and verification$fecsop$, $fecsop$Maintenance owner __________  PR or work order __________  Due date __________
Repair and parts fitted __________________________________________________
___________________________________________________________________
Cause identified __________  Similar assets checked __________
Required test
Acceptance criterion
Actual result
Tester$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Reopening decision$fecsop$, $fecsop$Specialist inspection needed? YES / NO    Basis ______________________________
Technical clearance by __________  Date __________  Certificate __________
Guards tools work area and staff briefing checked by __________________________
Operations release by __________  Time __________  Restrictions _______________
Result: CLOSED / RELEASED WITH VALIDATED RESTRICTIONS / RELEASED
A signature without test evidence is not technical clearance. A restricted release cannot bypass a failed safety device or keep an unresolved critical hazard accessible.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R05$fecsop$,
  $fecsop$R05 Incident missing child and safeguarding record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R05$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R05  |  Restricted access
Site CAR-AP ____  Record number __________  Date and time __________
Type: INJURY / NEAR MISS / FOOD / MISSING CHILD / SAFEGUARDING / OTHER
Reporter __________  Supervisor __________  Activity or food batch __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Facts and immediate response$fecsop$, $fecsop$What happened and where ______________________________________________
___________________________________________________________________
Observed condition or exact words ________________________________________
___________________________________________________________________
First aid responder __________  Action within training _________________________
999 called at __________  Property security at __________  Guardian at __________
Emergency service reference __________  Guest or guardian contact ______________
Time
Action or search zone
Person
Outcome$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Evidence and safe collection$fecsop$, $fecsop$Witness details held at __________  CCTV time range __________  Preservation by __________
Equipment isolation reference __________  Photos or batch evidence __________
Child release verification and authorized adult _______________________________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Followup and closure$fecsop$, $fecsop$Operations notified __________  Compliance notification decision __________
Authority or insurer reference __________  Action owner and deadline __________
Root cause and prevention ______________________________________________
Closure reviewer __________  Date __________  Reopening record __________
Record observations separately from opinions. Do not copy medical or safeguarding detail into ordinary group chats. For an unresolved emergency, continue response rather than completing paperwork.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R06$fecsop$,
  $fecsop$R06 Cash reconciliation and service recovery$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R06$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R06  |  Cashier and supervisor record
Site CAR-AP ____  Date __________  Cashier __________  POS shift __________
Reconciliation item
QAR or count
Evidence reference
Opening cash float
Cash sales and other authorized cash movements
Cash refunds and documented cash drops
Expected closing cash
Actual closing cash
Variance actual minus expected
Card POS total versus terminal settlement
Online sales and admissions matched
Offline tickets issued used void and returned
Discounts refunds and complimentary admissions
Expected cash = float + cash receipts - cash refunds - recorded cash removals. Explain every other authorized movement. Do not include card receipts in expected physical cash.
Variance explanation __________  Finance escalation __________  Seal number __________
Cashier signature __________  Independent review __________  Time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Complaint or service recovery$fecsop$, $fecsop$Reference __________  Guest contact if needed __________  Date __________
Issue and facts ________________________________________________________
Resolution offered __________  Refund or concession __________
Authority and approval reference __________  Followup owner __________
Guest informed at __________  Root cause action __________  Closed by __________
Safety or safeguarding complaint linked to R05 __________. Do not offer a concession in exchange for a rating or review removal.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R07$fecsop$,
  $fecsop$R07 Cleaning inspection and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R07$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R07  |  Working hygiene and safety record
Site CAR-AP ____  Date __________  Supervisor or PIC __________
Area or item
Product method and contact time
Due / done
Checked by
Product dilution or concentration verified __________  Test method __________
Contamination isolation reference __________  Reopened by and time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Weekly safety and pest walk$fecsop$, $fecsop$Check
Finding and owner
Due date
Closed evidence
Structure barriers pads and floors
Exits signs fire access and first aid
Electrical guards charging and lighting
Hygiene water drains and pest signs
Food permits allergens and temperatures
Training staffing and overdue defects
Pest contractor reference __________  Chemical treatment restrictions __________
No spraying during occupied food or play sessions. Follow the authorized reentry and food protection instructions.
Inspector __________  Signature __________  Management review date __________
Critical finding: stop now, record R04 or R05 and escalate immediately. Assign every corrective action an owner and evidence requirement. A due date cannot justify continued unsafe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R08$fecsop$,
  $fecsop$R08 Site validation and emergency information$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R08$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R08  |  Site authorization for CAR-AP
Site CAR-AP ____  Legal name __________  Address unit floor __________
Release evidence
Document reference
Verified by and date
Trading food and premises permissions where applicable
Approved occupancy plan and escape arrangements
Asset inventory manuals and specialist inspections
R03 cards and critical limit validation
Staffing sightlines relief and first aid coverage
Food scope and menu controls or recorded N/A
Fire maintenance property interfaces and insurance
CCTV privacy access and retention basis
Emergency and rescue demonstrations completed
Current site photographs and measured plan$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Emergency information to post at the site$fecsop$, $fecsop$Emergency services 999 [S18]    Property security __________    Duty supervisor __________
Site access and responder meeting point ___________________________________
Primary exit __________  Alternative exit __________  Assembly location __________
Assistance and refuge arrangement __________  First aid location __________
Electrical isolation __________  Fire controls held by __________  Backup contact __________
Attach the approved marked plan. Do not create an escape route from a photograph.
Activities excluded from release __________________________________________
Technical signoff __________  Food signoff __________  Operations __________
GM authorization __________  Effective date __________  Review date __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R09$fecsop$,
  $fecsop$R09 Food batch allergen and cookery record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R09$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R09  |  Copy sheets as needed
Site CAR-AP ____  Date __________  PIC __________  Menu or class __________
Food or ingredient
Supplier batch expiry
Receipt temperature
Accept reject
Batch and step
Start time and temp
Check time and temp
Action and initials
Steps include cooking, reheating, cooling and holding. Copy for each batch and required check. Fridge or freezer unit __________  Opening ______  2 hourly ______  Close ______
Recipe or menu item
All ingredients and allergens
Cross contact controls
PIC release$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Cookery or edible activity session$fecsop$, $fecsop$Recipe revision __________  Age group __________  Approved capacity __________
Instructor __________  Entry and safety support __________  Actual participants __________
Guardian consent and allergy check reference __________  Tool count out / in __________
Handwash and station release __________  Hot work adult __________
Take home label and use instructions __________  Children collected __________
Unsafe food or allergen incident reference __________  Disposition approved by __________
Record probe verification, recipe validation and any supplier substitution on attached sheets. Keep participant medical and contact details in the restricted register, not on a public counter.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CAR-AP-R10$fecsop$,
  $fecsop$R10 Food hazard analysis and control plan$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R10$fecsop$,
  $fecsop$site-manuals/CAR-AP/E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CAR-AP$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R10  |  Complete for each approved menu or cookery process
Site CAR-AP ____  Menu or recipe __________  Revision ______  Food PIC __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Process and intended use$fecsop$, $fecsop$Product and ingredients __________  Intended consumers __________  Allergens __________Process flow reference __________  Flow verified on site by __________  Date __________Storage and shelf life basis __________  Take-home instructions __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Hazard assessment$fecsop$, $fecsop$PROCESS STEP
HAZARD AND CAUSE
CONTROL MEASURE
CCP DECISION AND BASIS
Assess biological, chemical, physical and allergen hazards. The qualified food lead determines whether each control is managed through prerequisite hygiene procedures or as a critical control point. Do not classify every temperature check automatically as a CCP.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Control and verification$fecsop$, $fecsop$CONTROL ELEMENT
APPROVED PLAN
Critical limit and validation source
Monitoring what how when and responsible person
Immediate correction and affected product disposition
Root cause and preventive action
Verification method frequency and reviewer
Required monitoring and deviation records
Approved by Food Lead __________  Signature __________  Date __________Operator briefing completed __________  Review due __________
Revalidate following a menu, supplier, allergen, equipment, process, capacity or regulatory change. Link actual batch monitoring to R09. This worksheet supports a site-specific HACCP plan; it does not constitute approval of an unassessed process. Reference basis: MoPH HACCP approach [S08] and Codex hygiene framework [S13].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CAR-AP-R10$fecsop$;

INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, $fecsop$Imported from E3_CAR-AP_Site_SOP_Manual_V1.0.docx$fecsop$
FROM public.sop_documents d
WHERE d.code LIKE $fecsop$CAR-AP-%$fecsop$
  AND NOT EXISTS (
    SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id AND v.version = 1
  );

DELETE FROM public.sop_sections s USING public.sop_documents d WHERE s.document_id = d.id AND d.code LIKE $fecsop$CB-VM-%$fecsop$;
INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-MANUAL$fecsop$,
  $fecsop$Site SOP manual$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$MANUAL$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, $fecsop$Contents and navigation$fecsop$, $fecsop$DOCUMENT GUIDE
SECTION
PAGE
Site profile and local operating procedures
3–4
Document control and Qatar framework
5–8
Common operating procedures C01 to C09
9–17
Activity procedures A06
18
Conditional food and cookery procedures F01 to F05
19–23
Qatar and international requirements
24–25
Site records and forms R01 to R10
26–35
Training and management review
36
References and document framework
37–39$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$How to use the manual$fecsop$, $fecsop$This document is the standalone site manual for Crayons and Bricks at Place Vendome. Read the site instructions, then apply C01 to C09 and the activity procedures included here. The food and cookery section is conditional: use only procedures within the site’s approved scope and mark non-applicable activities in R08.
Complete R08 before site release and R03 for each activity. Use R01 and R02 daily. Record exceptions on R04 to R09; use R10 to document the approved food hazard-control plan.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Crayons and Bricks$fecsop$, $fecsop$LOCATION 06  /  PLACE VENDOME  /  CB-VM
SITE CONTROL
REQUIREMENT
Operating scope
Creative play and approved edible activities
Responsible owner
Site Supervisor; accountable to Head of Operations
Required procedures
C01 to C09; A06. F01 to F05 only for approved food or cookery activities.
Staff deployment
Creative activity lead; entrance coverage and relief; food PIC where applicable.
Crayons and Bricks | Operator-published reference image [S01]. Verify current layout through R08.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Operational priorities$fecsop$, $fecsop$Gate control, small parts, materials safety and separation of food from crafts.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$Daily supervisor checklist$fecsop$, $fecsop$Before opening: complete R01, confirm staffing and relief, inspect exits and release each activity. During operation: control admission, maintain sightlines and record required checks. At close: account for every child, isolate defects, reconcile sales and complete R02.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$Site operating procedures$fecsop$, $fecsop$CB-VM  /  SOP 06  /  PLACE VENDOME
1. Confirm trading status, permitted footprint and current activity inventory before setting up. Verify that entrance control, CCTV, router, access control and POS are present and functioning. Reconcile transferred assets with the current site register.
2. Inspect the gate, display stability, tables and small parts. Assign a creative lead and entrance coverage appropriate to the actual sightlines. Do not leave the gate unattended to perform face painting or an edible activity.
3. Release each offered activity through A06. If edible art is offered, confirm the PIC, ingredients, allergy checks, handwashing and food storage. Use cold assembly only where hot work is not specifically approved.
4. For closure, dismantling or relocation, stop sales, account for all children, isolate equipment and inventory serial numbered assets. Obtain written origin and destination handover, remove access credentials securely and obtain property work permits before dismantling.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 7, $fecsop$Local stop conditions$fecsop$, $fecsop$Suspend the affected activity for unsafe gate access, uncontrolled small parts, unknown materials, missing child supervision or failed food hygiene controls. Maintain entrance coverage during breaks, cleaning and sales interruptions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 8, $fecsop$Records and authorization$fecsop$, $fecsop$Complete R08 for this site: measured footprint, occupancy, guardian policy, staffing demonstration, activity and materials register, digital privacy settings, emergency route, food permission if applicable and current photographs. This site’s small size justifies reduced safety checks.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 9, $fecsop$Closing and handover$fecsop$, $fecsop$Confirm that all children have been collected by authorized guardians. Count tools and controlled materials, secure chemicals and digital equipment, reconcile transactions and record faults, stock needs and outstanding actions in R02. Obtain supervisor sign-off.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 10, $fecsop$Document control and authorization$fecsop$, $fecsop$CONTROL 02
Role
Accountability
GM or authorized executive
Approve policy, resources and delegated financial limits; no commercial waiver of safety restrictions.
Head of Operations
Own the manual, approve site deployment and capacity reductions, review incidents and authorize site release after technical evidence.
Site supervisor
Complete opening decision, assign posts and relief, check controls during trade, stop unsafe activity and sign handover.
Maintenance lead and inspector
Validate equipment records, technical limits, inspection scope and repairs; issue written technical release.
Food PIC
Approve recipes, suppliers, allergen controls, food monitoring and disposition; stop unsafe food service.
HR and training lead
Verify role competency, induction, working arrangements and training records.
IT and privacy lead
Protect POS, CCTV and guest records; approve access and technical recovery.
Every employee
Intervene early, stop danger, summon help and record facts honestly.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 11, $fecsop$Release sequence$fecsop$, $fecsop$Inspect the site and complete R08. Confirm licenses, emergency plan, equipment inspection certificates, operating cards, food permissions and staffing. Demonstrate opening, evacuation and relevant equipment rescue. Close critical findings. Obtain the approvals below and issue a controlled copy to the site. Release can exclude a clearly separated activity.
Approval
Name and signature
Date
Technical validation
Food validation if applicable
Head of Operations
GM or authorized executive
Review annually and after an incident, equipment change, menu change, layout change or regulatory change. The document owner records revisions, withdraws superseded copies and arranges staff retraining. This revision takes effect at each site only after the required approvals are completed.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 12, $fecsop$Approval and document control$fecsop$, $fecsop$DC01  |  Applies to all procedures in the CB-VM site manual
CONTROL FIELD
CONTROLLED VALUE
Manual ID and revision
E3-CB-VM-MAN-001 / Revision 1.0
Document date
21 September 2026
Effective date
To be entered after approval: __________________
Scheduled review
12 months from effective date, or earlier following change or incident
Status
For approval; no signature or authority approval is implied
Owner and master copy
Head of Operations FEC and IT / designated controlled document repository
Superseded revision
First standalone site issue; derived from corporate manual revision 4.0.
Procedure identification
E3-CB-VM-C01 to C09; applicable A modules; F01 to F05; R01 to R10.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 13, $fecsop$Preparation review and approval$fecsop$, $fecsop$ROLE
NAME
SIGNATURE
DATE
Prepared by Operations
Technical review Maintenance or Inspector
Food safety review Food Lead
Qatar compliance review Designated Lead
Approved by GM or Authorized Executive
Each reviewer confirms only the scope within their competence. The approved manual is released with completed site verification R08 and activity cards R03. A management signature does not replace a statutory permit or equipment inspection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 14, $fecsop$Language and communication$fecsop$, $fecsop$Maintain this English master and controlled translations where required by the relevant authority or staff comprehension needs. E3 requires Arabic and English guest safety notices and receipts. Staff must demonstrate understanding of their assigned procedures; record the briefing language and assessment result.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 15, $fecsop$Revision distribution and records$fecsop$, $fecsop$DC02  |  Document lifecycle and traceability
REV
CHANGE
RELEASE
1.0
First standalone manual for CB-VM. Contains local instructions, full applicable SOPs and site records. Based on corporate revision 4.0.
Pending site approval$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 16, $fecsop$Controlled distribution$fecsop$, $fecsop$COPY OR ACCESS ID
LOCATION OR HOLDER
ISSUED BY AND DATE
OLD COPY WITHDRAWN
The document controller records approval and effective date, grants access to the approved master, distributes site copies and removes superseded copies. Printed copies are uncontrolled unless registered. Amendments require impact review, approval and briefing before use. Site supervisors must not edit safety limits locally without authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 17, $fecsop$Records management$fecsop$, $fecsop$RECORD FAMILY
CUSTODIAN AND CONTROL
R01 R02 R07 daily operations
Site Supervisor; complete during the shift and review exceptions before handover.
R03 R04 equipment and defects
Maintenance Lead with Operations; link to asset serial, inspection evidence and return-to-service authorization.
R05 incidents and safeguarding
Authorized Operations and safeguarding personnel; restricted access and preservation of evidence.
R06 finance and complaints
Finance and Site Supervisor; reconcile transactions and retain approval references.
R08 site authorization
Head of Operations; link current licenses, plans, training and permissions.
R09 R10 food and cookery
Food PIC; retain supplier, batch, monitoring, deviation and verification evidence.
The compliance lead approves a retention schedule using applicable law, permit conditions, insurer requirements and legal holds. Record retention period, disposal authority and storage location for each record class. Do not apply a generic operating-log period to CCTV, child, medical or financial records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 18, $fecsop$Qatar compliance and procedure framework$fecsop$, $fecsop$DC03  |  Requirements mapping and site release
This is the E3 controlled-document format. Applicable Qatar laws, permit conditions, approved property plans and manufacturer instructions govern its implementation. ISO 10013 provides guidance on organisation-specific documented information [S20]; it is not a Qatar government template or evidence of certification.
REQUIREMENT AREA
REQUIRED SITE EVIDENCE
MANUAL LINK
Commercial activities
Licensed entity, trading name, commercial registration and permitted activities for each location.
R08; LOC01–07
Food service and cookery
Applicable permissions; current MoPH code; named food PIC; approved menu, process flow, hazard analysis and monitoring records.
F01–F05; R09 R10
Fire and life safety
Current Civil Defence and property approvals as applicable; occupancy, exits, assembly and emergency access arrangements.
C01 C06; R08
Outdoor work and heat
Applicable Ministerial Decision 17 of 2021; work scheduling, heat risk assessment, WBGT checks and welfare arrangements.
CAR-AP; R03 R08
Consumer information
Current applicable consumer-protection requirements; displayed prices, accurate service information, receipts and complaint route [S21].
C02 C09; R06
CCTV and personal information
Applicable law and permissions; approved camera plan, access and retention controls.
C09; R08
Equipment integrity
Asset-specific manuals, inspection scope and certificates, validated limits, competent operators and rescue arrangements.
A01–A06; R03 R04$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 19, $fecsop$Standard procedure structure$fecsop$, $fecsop$Each operating SOP identifies its purpose, scope, responsible roles, operating steps, corrective action, required records and reference basis. Revision, approval and effective-date controls in DC01 apply to the complete manual. Local work instructions must identify the related SOP and asset or activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 20, $fecsop$Release rule$fecsop$, $fecsop$The compliance lead records the applicable authority, document title, revision or issue date, relevant requirement and supporting evidence. Resolve discrepancies before site release. If authority requirements or manufacturer instructions conflict, stop the affected activity and obtain a documented technical or regulatory resolution. Smaller sites may simplify administration but must retain the necessary safety coverage.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 21, $fecsop$Qatar requirements and verification register$fecsop$, $fecsop$REQUIREMENTS 01
The compliance lead must maintain current authority requirements and supporting documents for each licensed entity and site. Complete all verification items before authorization. This register supports compliance management and does not replace statutory approvals.
Area
Required operating evidence
Verification required
Business and premises
Correct CR and commercial activity, premises permission, landlord agreement and conditions for each attraction or food activity. Track expiry and owner.
Site documents required; verify permit scope.
Fire and life safety
Current applicable Civil Defence approval, approved occupancy and drawings, alarm and firefighting maintenance, exit plan and property emergency interface.
Retain current Civil Defence approvals, plans and inspection schedules.
Food services
Applicable MoPH and municipal approvals, food handler fitness and training evidence, PIC, approved food safety plan and current MoPH food service code.
MoPH purpose verified [S08]; October 2020 copy reviewed [S19]. Current edition to confirm.
Outdoor and heat exposed work
Implement Ministerial Decision 17 of 2021: work schedule, risk assessment, monitoring, water, rest and training.
Official decision translation hosted by ILO reviewed [S09].
CCTV and privacy
Confirm applicability of Law 9 of 2011 and personal data requirements; retain approved camera plan, retention basis and access rules.
Law title found; full current legal requirements not verified [S16].
Guest information
Compliance lead validates Arabic consumer information, receipts, price displays, terms and complaint process. E3 requires bilingual safety notices and receipts.
E3 policy; local legal wording to verify.
Employment and contractors
HR verifies work authorization, lawful schedules, breaks, competent staff, contractor permissions and insurance conditions.
Site HR and contract evidence required.
Heat rule: covered work is prohibited from 10:00 to 15:30, 1 June to 15 September. Stop exposed work when WBGT exceeds 32.1°C. E3 uses 32.1°C or above as its conservative stop trigger. WBGT is not ordinary air temperature. Training, risk assessment and health surveillance requirements remain relevant beyond opening hours [S09].
Missing or expired permission: stop the affected activity and obtain written clearance. A renewal application, supplier assurance or mall verbal agreement is not itself permission to operate.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 22, $fecsop$International standards and inspection approach$fecsop$, $fecsop$REQUIREMENTS 02
Use these references to specify and verify the safety system. They are not automatically Qatar law. The competent inspector must confirm the edition, scope, installation date, amendments and local acceptance for each asset. Full paid standards were not reviewed clause by clause.
Reference
Application
Evidence to obtain
ISO 45001 2018 with applicable amendment [S10]
Worker safety management framework.
Risk register, worker participation, training, investigations and audit trail.
ISO 9001 2015 with applicable amendment [S11]
Documented service and quality controls.
Controlled procedures, supplier checks, complaint closure and change records.
ISO 22000 2018 and Codex CXC 1 1969 revised 2022 [S12 S13]
Food safety management and HACCP framework.
Validated menu based hazards, monitoring, corrective action and verification.
EN 14960 family and HSE inflatable guidance [S14]
Appropriate inflatable play devices.
Applicable standard and OEM limits, initial and periodic inspection, pressure and evacuation evidence.
EN 1176 family including enclosed play and inspection parts; EN 1177
Soft play and impact attenuating surfacing where within scope.
Inspector to select current applicable editions and confirm design, entrapment, access and surface tests.
ASTM F2970 25 [S15]
Trampoline courts within its scope.
Current catalogue identified; obtain full standard and applicable installation review.
EN 13814 family or appropriate ASTM F24 standards
Carousel and other amusement devices where applicable.
Inspector to establish accepted design, operation and inspection basis; do not mix design codes.
HSE HSG175 third edition [S17]
Supplementary amusement operation guidance.
Competent inspections, operating manual, maintenance, modification and operator training.
E3 baseline: preopening checks every operating day; active observation throughout use; formal supervisor checks hourly; detailed weekly walk; monthly management audit. Commission specialist inspections at the OEM, authority or inspector interval, with annual independent review as the proposed company baseline for rides and applicable inflatables. Shorter requirements prevail.
A daily checklist does not replace engineering inspection. Certificates must identify the actual serial number, scope, test results, defects and next due date. Do not describe E3 as ISO certified unless a valid certificate covers the relevant entity and activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 23, $fecsop$Implementation training and management review$fecsop$, $fecsop$IMPLEMENTATION 01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 24, $fecsop$Before frontline release$fecsop$, $fecsop$Head of Operations assigns an owner to every R08 gap. Verify legal permissions and all critical equipment, food and emergency controls first. Keep unresolved activities closed. Obtain missing technical manuals and full applicable standards through the responsible competent professionals. Approve a site specific effective date only when the release conditions are met.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 25, $fecsop$Practical competency$fecsop$, $fecsop$Role
Must demonstrate before independent work
Every employee
Stop authority, emergency communication, child safeguarding and defect reporting.
Entrance and cashier
Correct ticket, capacity count, guardian matching, refund control and outage process.
Activity operator
Preuse check, restrictions, safe dispatch, intervention, shutdown and equipment emergency response.
Supervisor
Post coverage and relief, opening decision, evacuation coordination and incident evidence.
Food staff and PIC
Handwashing, separation, probe use, allergy order, batch disposition and cleaning.
Cookery instructor
Age appropriate task briefing, child count, tool control, allergy controls and hot zone separation.
Training record: employee ______ role ______ SOP codes ______ trainer ______ date ______ practical scenario ______ result ______ retraining ______ authorization ______. Reading or signing the manual alone is insufficient. Repeat assessment after a relevant incident, change or failed observation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 26, $fecsop$First month after release$fecsop$, $fecsop$Week 1: supervise opening and closing every day and resolve unclear instructions. Week 2: observe peak capacity and relief arrangements. Week 3: run a relevant scenario such as lost child, deflation, ride stoppage or food withdrawal. Week 4: audit records and adjust deployment from actual evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 27, $fecsop$Monthly review$fecsop$, $fecsop$Review incidents and near misses per guest visits, critical defects, overdue inspections, staffing gaps, food control failures, complaints, cash variances, training competence and action closure. Do not reward low incident counts in a way that discourages reporting. Record management decisions, budgets, owners and due dates.
No site is released by this document alone. The completed evidence and demonstrated behavior are the basis for safe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 28, $fecsop$Reference register$fecsop$, $fecsop$SOURCES 01
Reference review date 21 September 2026. Maintain current editions of applicable standards, authority requirements and manufacturer instructions. Photograph captions identify their sources; publicity images do not replace current site inspection records.
S01 E3 attraction directory and source photographs
Reference photographs identify InflataPark, Urban Arena, Kidz Driving School and Crayons and Bricks Place Vendôme. Directory location and time fields conflict with other listings; not used as verified addresses or hours.
S02 City Center Doha Inflata Park
Mall source establishing the venue at City Center.
S03 City Center Doha Kids City Driving School
Mall source supporting the correction of the KDS activity identity.
S04 BookingQube InflataPark
Ticketing reference. Equipment limits must follow validated manufacturer instructions.
S05 BookingQube Kids City Driving School
Describes driving and soft play. Product offer is not an asset inventory.
S06 BookingQube Urban Arena
Identifies Doha Mall and advertised driving, arena, console and soft play categories.
S07 BookingQube Crayons and Bricks Vendome
Creative activity description. Current trading status and facilities need confirmation.
S08 MoPH Food Safety Code of Practice for Food Services
Ministry text reproduced by Lexis. Purpose and HACCP approach accessible; current official edition not retrieved. Historical operational text reviewed separately [S19].
S09 Qatar Ministerial Decision 17 of 2021 on heat stress
ILO hosts the decision translation. Articles 2 to 4 establish covered hours and mitigation duties; original Arabic and later applicable requirements must be checked for legal use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 29, $fecsop$Standards references and verification requirements$fecsop$, $fecsop$SOURCES 02
S10 ISO 45001 2018
Occupational health and safety management catalogue; includes amendment information.
S11 ISO 9001 2015
Quality management catalogue. Confirm applicable amendments and transition at adoption.
S12 ISO 22000 2018
Food safety management catalogue; includes HACCP and prerequisite program context.
S13 Codex codes of practice
Lists General Principles of Food Hygiene CXC 1 1969, revised 2022.
S14 HSE inflatable safety advice
Public practical guidance. UK legal and scheme references are not presented as Qatar obligations.
S15 ASTM F2970 25
Current edition identified through ASTM catalogue. Full paid clauses not reviewed.
S16 Qatar CCTV Law 9 of 2011
Title identified in Qatar legal portal search. Confirm current legal text before setting retention periods or approving camera alterations.
S17 HSE HSG175 third edition
Supplementary amusement management and inspection guidance. Not an assertion that UK law applies in Qatar.
S18 Hamad Medical Corporation Ambulance Service
Supports immediate 999 contact, accurate location and following dispatcher instructions.
S19 MoPH food code October 2020 copy
Third party hosted ministry document, revision 0. Sections 6.8.2, 7.2, 7.3, 7.5 and 7.6 reviewed for food limits; confirm authenticity and current official revision before release.
Outstanding site records: attach current photographs, measured plans, approvals and asset records for CB-VM. Confirm any approved food or cookery scope, menus and facilities. Complete R08 and the relevant activity cards before authorizing operations.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 30, $fecsop$Document format and Qatar references$fecsop$, $fecsop$SOURCES 03  |  Format review dated 21 September 2026$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 31, $fecsop$S20 ISO 10013 2021$fecsop$, $fecsop$Quality management systems — Guidance for documented information. The published scope supports development and maintenance of documentation tailored to an organisation. The E3 layout, numbering, A4 paper, approval blocks and registers are company document controls; they are not prescribed Qatar typography or a claim of ISO certification.
https://www.iso.org/standard/75736.html$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 32, $fecsop$S21 Qatar Ministry of Commerce and Industry$fecsop$, $fecsop$Consumer Services identifies Law No. 8 of 2008 and official consumer-rights guidance. Maintain accurate information, pricing and the appropriate complaint route; confirm applicable legal and permit details before adopting site-specific terms.
https://www.moci.gov.qa/en/consumer$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 33, $fecsop$Application of Qatar requirements$fecsop$, $fecsop$Maintain current official requirements in the compliance register. The MoPH food-service code uses a HACCP-based approach [S08]. Outdoor work is assessed against Ministerial Decision 17 of 2021 [S09]. Fire, occupancy and emergency arrangements must follow the applicable site approvals. Government forms required for licenses or inspections remain separate from this internal SOP manual.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 34, $fecsop$Controlled format specification$fecsop$, $fecsop$ELEMENT
E3 DOCUMENT RULE
Page and typography
A4 portrait; clear heading hierarchy; readable body text; repeating document identification and page count.
Identification
Manual and procedure IDs; revision; effective date; owner; controlled approval and distribution.
Procedure content
Purpose; scope and responsibility; operating steps; corrective action; records and reference basis.
Site application
Location title and code; applicable modules; staffing coverage; inspection and release evidence.
Change control
Recorded revision, reviewer approvals, withdrawal of old copies and staff briefing.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-MANUAL$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C01$fecsop$,
  $fecsop$C01 Opening and staffing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C01$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Ensure the site opens only with safe facilities, competent staff and released activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Site supervisor  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Read the last handover and defect register before admitting anyone. Confirm the site and every proposed activity have current release status; remove closed activities from ticket sales.
2. Record who is actually present and competent. Name the duty supervisor, first aid responder, entrance controller, activity attendants and relief staff. Conduct a short briefing on defects, expected groups, emergency roles and guest needs.
3. Walk the guest route and every activity. Check exits, evacuation gates, floor condition, barriers, lighting, accessible routes, first aid supplies and communication. Verify property systems through the agreed interface; do not trigger fire alarms without coordination.
4. Operators complete the equipment specific preuse checks and empty test cycles required on R03. Confirm safety signage, limits, emergency controls and inspection validity. Check that isolated equipment cannot be accessed.
5. Food PIC releases food service separately. Cashier checks approved prices, bilingual receipt output, float and payment terminal. Confirm clocks, wristbands or ticket numbers and the guest count method.
6. Supervisor checks the results, records OPEN, PART OPEN or CLOSED and signs R01. Photograph significant defects without capturing identifiable guests unnecessarily. Admit only to released areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not open with a blocked exit, missing safety critical operator, unknown capacity, failed safety device, unsafe food service or an overdue required equipment examination. A small site may share administrative roles, but cannot leave its entrance or activity unsupervised to serve a customer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 opening record, staff post plan and asset check sheets. Head of Operations reviews failed openings and recurring staffing gaps. Provide planned relief; if relief fails, pause admissions and clear or close the affected activity safely.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C02$fecsop$,
  $fecsop$C02 Admission capacity and guest release$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C02$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control admission, capacity, participation and authorized child collection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Entrance controller and supervisor  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Explain the purchased activity, time, price, restrictions, supervision arrangement and refund terms before payment. Use approved Arabic and English information and practical demonstrations when needed.
2. Check the relevant activity card for age, height, weight, clothing, ability, capacity and permitted accompanying adults. Apply limits discreetly. Do not rely on appearance to judge a borderline restriction or ask staff to make medical diagnoses.
3. Use a linked child and guardian identifier for sessions involving children. Record necessary contact and collection details in the approved system. Tell the guardian whether they must remain inside or immediately available; never imply childcare without an approved service.
4. Count all people for premises occupancy, including adults and staff. Count participants separately for each activity. Effective capacity is the lowest validated premises, equipment and staffed supervision capacity. Stop sales and admission at the limit.
5. Brief guests before the activity starts. Remove loose items and require activity appropriate footwear or socks. Offer reasonable support for disability or sensory needs within safe equipment use; escalate uncertain accommodations before participation.
6. At departure verify the collection identifier and authorized adult. Resolve missing bands or disputed collection through the supervisor using independent checks. Keep the child safely supervised; do not release solely because an adult knows their name.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop entry when counting fails, guardian arrangements are unclear, limits cannot be verified, a child is distressed or a guest cannot comply with essential safety rules. Never lock an emergency escape route to contain children.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 occupancy checks, session entry and exit records, and R05 for release exceptions. Only necessary guest information is collected. No ad hoc ID photographs on personal phones.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C03$fecsop$,
  $fecsop$C03 Supervision handover and closing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C03$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain active supervision and a complete shift handover and safe closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and activity operators  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Position attendants from the approved zone plan, including blind corners, raised platforms, slide landing areas and exits. Keep a clear line of sight and move through the assigned zone. CCTV supplements physical supervision.
2. Intervene immediately in dangerous behavior, overcrowding, equipment changes or blocked routes. Explain the rule, stop the specific unsafe action and remove the guest from the activity when needed. Do not allow revenue targets to influence safety decisions.
3. Record a supervisor check each hour and after a group arrival, spill, fault or significant weather change. Confirm headcounts, staff coverage, hygiene, queue position and defect barriers. An hourly check does not replace continuous supervision.
4. Before breaks or shift changes, the replacement receives the guest count, current restrictions, incidents, equipment state and pending tasks face to face. The departing operator remains until the replacement accepts the post.
5. Before closing, stop sales in time to deliver paid sessions. Check all play levels, toilets if within the site, party spaces and quiet corners without unsafe entry. Account for every child and guardian. Complete the final ride or session and unload safely.
6. Shut equipment down in the OEM sequence. Clean and isolate defects; secure chemicals, batteries, cash and lost property. Keep required refrigeration, alarms and security systems running. Sign R02 and give the next shift unresolved actions and owners.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Pause the affected activity when visibility, lighting, noise or staffing prevents effective supervision. No operator may run a ride while handling cash or responding to unrelated messages.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R02 handover and closing, R04 faults and the hourly log. Supervisor reconciles remaining guests before locking public access; emergency egress follows the property plan.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C04$fecsop$,
  $fecsop$C04 Injury medical emergency and evidence$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C04$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Coordinate prompt emergency assistance, protect guests and preserve incident evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop the immediate source of harm. Secure the area without causing a second incident. Call the trained first aid responder and supervisor; do not move a casualty unless necessary to escape immediate danger or directed by emergency responders.
2. For a serious injury, breathing difficulty, unconsciousness, suspected severe allergic reaction or other urgent medical concern, call 999 immediately. Give the site name, mall or park, floor, closest access point, patient details and hazards; follow the dispatcher’s instructions [S18].
3. Send a named staff member to guide responders from the agreed entrance. Notify mall or park security. Keep a clear access route and arrange continued supervision or safe evacuation of other guests.
4. Contact the guardian promptly. Provide first aid only within current training and the emergency dispatcher’s instructions. Do not administer routine medicines, diagnose the injury or pressure the guest to resume play.
5. Preserve the scene and equipment state where safe. Record factual observations, times and witness contacts. Ask IT or security to preserve relevant original footage and record who accessed it. Do not film the injured person for staff chat groups.
6. Inform Head of Operations immediately for serious events. Complete R05 before the end of shift. The designated compliance lead assesses authority, property and insurer notifications without delaying any statutory deadline. Investigate causes and check equivalent assets across sites.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Equipment involved remains isolated until the technical cause and safe return conditions are established. Severe or unexplained incidents require competent technical review. A customer declining treatment does not clear the equipment.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 incident report, preservation log, technical findings and corrective actions. Reopening requires written technical clearance where relevant and Operations authorization. Respond with care and facts; do not speculate about blame or liability.
Reference basis: HMC emergency access guidance [S18] and E3 incident procedure$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C05$fecsop$,
  $fecsop$C05 Missing child and safeguarding$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C05$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Locate missing children promptly and protect children from harm.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Treat a missing child report as urgent. Obtain the child’s description, name, last known location and time, guardian contact and any relevant support needs. Notify property security and the supervisor immediately; assign one incident coordinator.
2. Stop new admissions if they distract from the response. Staff monitor normal entry and exit points while maintaining free emergency escape. Allocate named search zones and report cleared zones to the coordinator. Do not abandon other children.
3. Ask authorized security personnel to review relevant CCTV. Share the minimum description needed over the agreed radio channel; do not broadcast sensitive family information or circulate a child’s photo in public chat groups.
4. If abduction is suspected, the child is in immediate danger or security cannot resolve the situation promptly, contact police through 999. Do not wait for a preset search period or a manager’s permission in a credible emergency.
5. For a found child, use a visible safe location with two staff where practicable. Verify the collecting adult against the entry record and independent identifying information. Escalate discrepancies to security; never resolve a custody dispute yourself.
6. For safeguarding concerns, listen without leading questions, record the child’s words accurately and refer immediately to the safeguarding lead and appropriate emergency or protection authority. Never promise secrecy or investigate an allegation against yourself.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No isolated one to one contact, unauthorized photography, corporal punishment or unnecessary touching. Seek guardian consent for routine assistance. Necessary immediate action to prevent serious harm must not be delayed for consent; document it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 records search timeline, staff zones, security reference, guardian checks and outcome. Keep safeguarding information restricted. Release staff accused of harm from child contact pending a fair review, without presenting allegations as proven.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C06$fecsop$,
  $fecsop$C06 Fire evacuation and utility failure$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C06$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Evacuate safely and control the effects of fire and essential utility failure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor under property emergency command  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. On an alarm, smoke, fire or instruction to evacuate, raise the alert and call emergency services when required. Follow the approved property evacuation plan. Stop admissions and activities; do not delay for cash, shoes or personal belongings.
2. Operators stop rides and release guests by the trained method. Clear inflatable users promptly while safe inflation is maintained if possible; do not turn off blowers as a routine evacuation step while users remain unless electrical or fire danger requires it.
3. Direct people by the safe approved route. Use the planned assistance arrangements for children and people with reduced mobility. Do not use ordinary lifts in a fire. Staff must not enter smoke, climb structures or improvise rescues.
4. Sweep only assigned areas that remain safe, report unchecked areas and proceed to the assembly point. Reconcile staff, groups and child records as far as practicable; give missing person details and last known locations to responders. Never reenter to search.
5. For a power failure without fire, stop affected admissions, maintain emergency lighting and arrange safe equipment unloading or inflatable evacuation. An emergency stop reset does not prove the installation is safe. Protect refrigerated food using F02.
6. For loss of water, drainage, ventilation or essential lighting, stop the affected food or guest activity. Isolate contamination and inform the property. Resume only after the responsible technical or food lead verifies restoration and the supervisor records authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No trade during a fire alarm or unsafe evacuation condition. Only the property or emergency authority can clear reentry after their incident; Operations then separately checks attraction readiness. Never silence or bypass alarms to continue service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 event record and R08 emergency plan. Drills follow property and authority requirements; E3 proposes a quarterly staff scenario exercise and at least a six monthly coordinated evacuation exercise, subject to property agreement. Record learning and retrain failed roles.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C07$fecsop$,
  $fecsop$C07 Maintenance isolation and change control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C07$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C07  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent access to defective equipment and authorize return to service using evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Maintenance lead and supervisor  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop use, remove guests and secure the defect area. Identify the asset and write the fault and time on R04. For a critical defect, physically prevent access; a sign alone is insufficient.
2. A competent authorized technician isolates every relevant energy source, including electrical, mechanical, stored pressure and battery power. Apply the documented lockout method and verify isolation before work. Operators do not open energized cabinets or bridge safety devices.
3. Maintenance raises the repair request and purchase requisition with defect evidence and urgency. Route commercial approval through the authorized matrix. Isolation happens immediately and is not conditional on purchase approval.
4. Use qualified contractors with property permits, task risk assessment and controlled work area. Confirm parts are suitable and traceable. Record repair details and required inspections; do not accept temporary tape or improvised fasteners as structural repair.
5. After repair, the technician records measurements and OEM test results. A competent independent examiner reviews safety critical repairs or modifications where required. Restore guards, remove tools, account for workers and complete empty tests before any guest trial.
6. Technical signoff confirms equipment condition; Operations authorizes reopening and updates the activity card, training and asset history. For new games, changed locations, cut frames, added food equipment or changed software safety settings, complete change review before installation or use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not reopen after a failed safety device, unknown fault, structural damage or unexplained repeated stop until the cause is resolved. Customer testing is never a commissioning method. No verbal repair closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R04 defect and release record; asset register, parts and inspection certificates. Critical faults are escalated immediately; major issues receive same shift management review. E3 planning targets do not authorize unsafe continued operation.
Reference basis: E3 maintenance workflow; supplementary lifecycle guidance in HSG175 [S17]$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C08$fecsop$,
  $fecsop$C08 Cleaning chemicals and infection control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C08$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C08  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control hygiene hazards, chemicals and contamination in public and activity areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and cleaning lead  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Use an approved cleaning schedule identifying the surface, product, dilution, contact time, method, frequency and responsible person. Check compatibility with inflatable fabrics, pads, screens and food contact equipment. Keep chemical safety information available.
2. Before opening, remove debris, clean high contact areas and confirm floors and equipment are dry and safe. Clean shared accessories between users where required by the activity assessment. Inspect public contact surfaces hourly and clean whenever soiled.
3. For vomit, blood, faeces or other body fluid, close the contaminated area immediately and protect neighboring play or food. A trained cleaner uses the assessed PPE and appropriate disinfectant. Do not dry brush or spray contamination toward guests.
4. Remove visible contamination, clean, apply the approved disinfectant at its specified concentration and contact time, then rinse where required. Remove damaged porous material that cannot be safely decontaminated. Dispose of waste in the designated sealed route.
5. Keep cleaning tools separated between toilets, general areas and food. Label chemicals and lock them away from children and food. Never mix products or put chemicals into beverage containers. Isolate electrical equipment safely before cleaning.
6. Supervisor checks completion, dryness, chemical removal and any required ventilation before reopening. For suspected communicable illness clusters, notify the food or health lead and seek appropriate authority guidance; preserve records of affected sessions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Close affected areas when contamination cannot be contained, potable water or handwashing is unavailable, pests affect safety, or the correct cleaning method is unknown. Odor and visual appearance alone do not establish hygiene.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning record, product instructions, pest records and R05 where illness is reported. Ball pits and inaccessible enclosed areas need a documented deep cleaning method and schedule set from use, manufacturer guidance and risk, not an invented universal interval.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-C09$fecsop$,
  $fecsop$C09 Payments complaints records and continuity$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C09$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-C09  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain traceable payments, fair complaint handling and secure operating records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor cashier and IT lead  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Process each sale in the approved POS under individual credentials. Display approved prices and issue receipts showing purchased service and payment. Record authorized discounts, refunds and complimentary entries with reason and approver; never share manager credentials.
2. If POS or connectivity fails, notify IT and stop new sales unless a preapproved numbered offline ticket and payment process is available. Continue accurate capacity and child release controls. Never accept card details in messages or use personal accounts for company payments.
3. At close, reconcile cash, terminal batches, POS totals, online bookings, refunds, voids and offline tickets. Two people count where available. At a small site, use a sealed cash handover and independent Finance review. Record differences without offsetting them against unrelated transactions.
4. Acknowledge complaints, establish facts and offer a solution within authority. Escalate safety, safeguarding, discrimination, food illness and data concerns immediately. Do not tie a refund or complimentary service to removing a review or giving a positive rating.
5. Restrict guest, CCTV, HR and incident data by role. Use company systems, secure passwords and approved backups. Preserve incident footage promptly; do not copy it to personal devices. Confirm legal retention and camera alteration requirements before making changes.
6. On suspected cyber compromise, contact IT, protect affected systems through the approved response and preserve logs. IT validates recovery and reconciles transactions before reconnection. AI kiosks cannot override admission limits, access children’s records freely or initiate equipment movement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop transactions when traceability, payment security or safe capacity control is lost. A camera fault affecting an approved safeguarding control requires a supervisor risk decision and compensating staff coverage or closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R06 reconciliation and complaint records, IT tickets and access log. Apply the approved retention schedule in DC02; incident and child records require specific access, preservation and retention decisions. Legal hold overrides deletion. CCTV retention is separately verified, not set by this manual.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-C09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-A06$fecsop$,
  $fecsop$A06 Creative play face painting and small parts$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A06$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-A06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control creative materials, small parts, face painting and edible activity hazards.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Creative activity lead  |  Applies to: CB-VM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Select materials for the approved age range. Retain supplier identity, product instructions, batch and expiry where relevant. Separate small building parts, beads, magnets and button battery products from children who may mouth them; prohibit accessible loose magnets or batteries.
2. Inspect furniture, display fixing, gate latches and floor edges. Allocate one visible entrance and maintain staff sightlines. Set up seated activity zones so glue, paint, dough and blocks do not migrate into food or exit routes.
3. Give out a controlled quantity of tools and materials. Use child appropriate scissors and assessed water based products. Count tools back, remove broken pieces immediately and check the floor between sessions. Do not describe ordinary craft materials as edible.
4. For face painting, obtain guardian consent and use cosmetic products specifically intended for skin, with ingredient and expiry information. Ask about known sensitivity. Avoid broken or irritated skin and eye or mouth contact as directed by the product. Use hygienic applicators and fresh water between customers.
5. For digital art tables, secure cables, protect electrical connections from liquids and clean using the approved method. No child account creation, unrestricted browsing or automatic public posting of children’s images.
6. Treat edible art as food preparation under F01 to F05, even if no oven is used. Separate edible and nonedible equipment, confirm allergen controls and stop the edible activity if handwashing or safe ingredient storage is unavailable. Count children and verify guardian collection before ending the session.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop for unknown material composition, missing allergen information, uncontrolled small parts, unsafe gate access or inadequate staff coverage. Do not allow hot glue guns, blades, ovens or hot surfaces in a child’s reach without a separately assessed and approved activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 activity scope, materials inventory, cleaning log, consent and food records where applicable. The public CB offer includes blocks, dough, digital art and face painting; confirm which are actually present at each location [S07].
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-A06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-F01$fecsop$,
  $fecsop$F01 Food scope suppliers and personal hygiene$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F01$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-F01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control food scope, supplier acceptance, staff hygiene and cross-contamination.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to cafés kitchens parties edible art and cookery$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$Use a separate food release for each site. Classify the offer as sealed packaged resale, open ready to eat preparation, cooking or reheating, or children’s cookery. A license for one scope does not establish permission for another. The complete current MoPH food code and permit conditions must be checked by the food lead before operational approval [S08].
1. Appoint a trained PIC whenever food is handled. Confirm staff fitness and required local food handler documentation. Staff report vomiting, diarrhoea, infected wounds or relevant illness before starting; the PIC excludes or restricts duties and obtains appropriate clearance.
2. Provide a dedicated accessible handwash point with potable water, soap and hygienic drying. Wash before food handling and after toilets, cleaning, cash, raw food and contamination. Gloves do not replace handwashing; change them between incompatible tasks.
3. Use approved suppliers and keep delivery, batch, expiry and traceability records. Inspect transport hygiene, packaging, pests, damage and temperatures before accepting food. Reject untraceable, expired, damaged or out of limit deliveries; log the reason.
4. Keep raw foods separate from ready to eat products, with raw items below them in storage. Separate allergens and chemicals. Label opened containers and prepared items with identity, preparation or opening time, use by decision and responsible person. Use earliest expiry first.
5. Use standardized recipes and approved substitutions only. Retain ingredient labels for allergen checks. Do not assume a halal claim or imported product approval from a brand name; obtain relevant supplier and regulatory evidence.
6. Restrict children and unauthorized staff from production areas. Store knives and hot equipment safely. Agree catering delivery access and waste removal with the property; protect guest routes and maintain cold or hot chain during transfer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No open food handling without handwashing, safe water, traceability and a competent PIC. Use R07 and R09. A mall food court, external caterer or birthday cake supplier does not remove E3’s checks at receipt and service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$Approved food scope, supplier register, staff fitness records, R07 cleaning, R09 batches and R10 hazard-control plan. Food PIC reviews evidence before release. Reference basis: MoPH food-service code [S08 S19].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-F02$fecsop$,
  $fecsop$F02 Food temperature control and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F02$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-F02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain validated food temperatures and documented corrective action throughout the process.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Qatar code benchmarks and proposed E3 monitoring$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$The October 2020 MoPH code copy [S19] informs these benchmarks. Confirm the current official edition and validate each menu before release. Monitoring frequencies are E3 controls unless specified otherwise. Use a calibrated clean food probe and record actual product readings, not just equipment displays.
Stage
E3 operating limit and monitoring
If the check fails
Chilled food
Receive and display below 4°C; E3 storage target 0 to 3°C unless the product requires colder. Check deliveries, opening, every 2 hours and close; displays after 30 minutes and hourly.
Reject delivery. Isolate stock; assess documented time and temperature. Unknown history means discard.
Frozen food
Receive and hold below minus 18°C; E3 target minus 20°C unless the product requires colder. Check deliveries and storage as above.
Reject thawed or abused stock. Transfer only under PIC control; do not refreeze without an approved process.
Cooking and reheating
E3 default core temperature at least 75°C for 30 seconds; use a validated recipe and check each batch at the coldest point. Reheat only once.
Continue heating if safe and recheck. Never serve an unverified batch; discard if safe recovery is not established.
Hot holding
Above 64°C; E3 target at least 65°C. Check at setup, after 30 minutes and hourly. Measure the coldest food, not only unit air.
Remove from service. Discard if below 64°C for over 2 hours or history is unknown; PIC controls any earlier recovery. Do not top up.
Cooling if authorized
Cool to 5°C or below within 2 hours; record start, interim and final core readings. Then maintain the approved chilled storage target.
Do not cool at sites without validated equipment. Discard failed or unrecorded batches unless a qualified lead approves a validated corrective process.
Cold chain failure: keep doors closed, record discovery time and temperatures, transfer to verified storage where possible and label HOLD. The PIC decides disposition from evidence. A normal fridge reading after power returns does not prove the food remained safe.
Probe verification: check against an appropriate reference such as a correctly prepared ice slurry; the food lead sets the instrument tolerance and calibration interval. Take the instrument out of use if outside its validated tolerance. Record calibration and any affected food decisions.
The October 2020 code has ambiguous cooling subparagraphs; this manual adopts its stricter 2 hour endpoint pending PIC confirmation. Do not substitute a foreign 6 hour rule. Validate capacity, portion size and cooling equipment. R09 records each batch and decision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$The PIC applies the stage-specific action above, records the affected batch and decision in R09, and escalates repeated failures to the food lead.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 temperature and disposition records; R10 validated process plan; probe verification and equipment service records. Reference basis: MoPH code copy [S19], subject to current-edition verification.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-F03$fecsop$,
  $fecsop$F03 Allergens service and suspected food illness$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F03$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-F03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent allergen exposure and respond to suspected food illness or allergic reactions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to: CB-VM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Maintain an ingredient and allergen matrix for every recipe, bought in item, sauce, garnish and activity ingredient. Check manufacturer labels on each change or delivery substitution. Include allergens beyond any standard list when a guest identifies them.
2. Ask about allergies at booking and confirm at service. Pass the request to the PIC, who checks the written recipe and cross contact controls. Never guess, remove a visible ingredient as a cure, or promise “allergen free” without a validated basis.
3. Use clean dedicated equipment and protected ingredients for an approved allergy order. Prevent shared scoops, oil, cloths, gloves or work surfaces from transferring allergens. Identify the order and hand it directly to the correct guest or guardian.
4. If the kitchen cannot control the identified risk, explain that clearly before accepting the order or cookery participant. Offer only a genuinely suitable alternative confirmed from its ingredients and handling. Do not rely on a waiver to permit an unsafe food exposure.
5. Serve within the approved temperature and time controls. Protect displays and use utensils rather than bare hands for ready to eat food. Reject unapproved home prepared food for shared service; any approved outside cake needs traceability, ingredients and storage instructions.
6. For suspected serious allergic reaction call 999 and follow trained first aid and dispatcher instructions. For suspected food illness, stop the implicated product, preserve batch and supplier records and quarantine relevant food safely. Notify Operations and the food compliance lead for authority action and traceability investigation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop serving when ingredients are unknown, an allergy order is mixed up, food is contaminated or a temperature history is missing. Do not quietly replace the dish without recording the incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 allergen and batch records, R05 illness or reaction report, supplier traceability and product withdrawal record. Record affected sites and customers where lawful. Do not dispose of potential evidence until the food lead determines safe preservation and any authority needs.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-F04$fecsop$,
  $fecsop$F04 Children cookery class operation$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F04$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-F04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Conduct approved children’s cookery sessions with safe food, tools and supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Cookery lead and food PIC  |  Applies to: CB-VM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Approve the recipe, age range, ingredient list, allergen matrix, equipment and lesson plan before advertising. Define a cold assembly or decorating class separately from a hot cooking class. No cooking activity is assumed to exist at a location simply because it serves food.
2. Before accepting participants, obtain guardian consent, contact and relevant allergy information. Set the class size from safe workstations, instructor sightlines, task hazards and escape space. Assign an instructor and a separate safety or entry support role where simultaneous tasks require it.
3. Clean and release the work area. Provide handwashing, child suitable utensils, stable work surfaces and protected ingredients. Keep craft paints, dough and cleaning products separate. Secure hair and loose clothing; supervise handwashing before food contact.
4. Demonstrate each task before issuing tools. Start with low risk preparation. E3 default: children do not handle raw meat, hot oil, boiling liquids, powered blades, gas controls or ovens. Any higher risk teaching requires a specific assessed and authorized program.
5. Adults control hot trays and cooking. Keep a physical hot zone outside child reach and routes. Check food temperatures and cool products to a safe handling temperature before returning them to children. Do not allow tasting of raw batter or uncooked flour mixtures.
6. Count tools back and verify all participants before collection. Label take home food with ingredients and allergens, preparation date and the validated storage and use instructions. Discard food handled unsafely and reset the workstation between classes.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Cancel or pause the class for an uncontrolled allergy, missing guardian arrangement, unsuitable staffing, lost tool, failed handwashing or inability to separate hot work. A small kiosk may offer only the low risk food scope that its facilities can safely support.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 cookery card, participant consent, R09 recipe and allergen release, temperature checks and R07 cleaning. A parent’s presence does not replace the instructor’s safety duty.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-F05$fecsop$,
  $fecsop$F05 Kitchen equipment cleaning and shutdown$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F05$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-VM-F05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate and clean kitchen equipment safely and complete a controlled shutdown.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC and maintenance lead  |  Applies to: CB-VM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before use inspect guards, power leads, switches, hot surfaces, drainage and required extraction. Check refrigerators, ice machines and beverage equipment for cleanliness and correct condition. Do not use equipment with a safety fault.
2. Operate cooking appliances only with the approved ventilation and fire protection arrangements. No LPG cylinders, portable burners or new heat producing equipment without the necessary property and authority approval. Never bypass a guard or use water on an electrical or cooking oil fire.
3. For slush, ice, coffee and similar machines, use potable water and approved ingredients. Record batch and expiry, follow manufacturer cleaning and disassembly intervals, and keep nozzles and food contact parts protected. Do not continually top up old product.
4. Separate cash handling and food handling. Use a controlled cleaning sequence: remove debris, wash, rinse where needed, sanitize using the approved product, contact time and concentration, then air dry. Follow a dishwasher’s validated temperature or chemical cycle where fitted.
5. For maintenance, stop food production in the affected zone, protect or remove food and apply C07. The food PIC checks for metal, glass, chemicals, pests and residue before food service restarts. Obtain specialist support for kitchen equipment where internal competence is absent.
6. At close, dispose of expired or unsafe food, label retained stock, record temperatures, clean surfaces and drains, remove waste and complete pest checks. Shut down heat and nonessential equipment through its procedure while preserving refrigeration and required safety systems.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop cooking for failed extraction, uncontrolled grease, fire protection impairment, unsafe gas or electricity, sewage backup or pest contamination. Only trained authorized staff use the correct firefighting equipment when safe; evacuation takes priority.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning and pest log, R09 food records, R04 maintenance and food restart authorization. Agree specialist service scope, preventive maintenance and contractor access in writing; Operations does not substitute informal cash payment for maintenance approvals.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-F05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R01$fecsop$,
  $fecsop$R01 Daily opening and hourly record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R01$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R01  |  Copy for each site and operating day
Site CB-VM ____  Date __________  Supervisor __________  Shift __________
First aid responder __________  Entrance controller __________  Relief __________
Preopening check
Pass Fail NA
Defect or evidence reference
Permissions inspection dates and previous handover reviewed
Post coverage and relief confirmed
Exits routes lights and communication ready
First aid and emergency information ready
Equipment checks and empty tests completed
Limits signs barriers and gates correct
Cleaning and dry safe surfaces confirmed
Food PIC release completed or food absent
POS receipts float and counting method ready
Defective areas isolated and removed from sale
Decision: OPEN / PART OPEN / CLOSED    Excluded areas __________________
Supervisor signature __________  Time __________  Defect record numbers __________
Time
Premises count / limit
Activity count / limit
Posts safe
Action and initials
Repeat hourly and after changes. Record actual inflatable pressure or weather values on the asset sheet when applicable. A failed critical check cannot be marked N/A. Attach operator sheets for every ride, vehicle, inflatable and game requiring preuse tests.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R02$fecsop$,
  $fecsop$R02 Closing and shift handover$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R02$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R02  |  Copy for each shift
Site CB-VM ____  Date __________  Outgoing __________  Incoming __________
Closing check
Result
Exception and action
All guests cleared and children collected
Play levels rooms and quiet areas checked
Equipment stopped and secured in OEM sequence
Food temperatures stock and disposal recorded
Cleaning waste and pest check complete
Faults tagged and inaccessible
Cash POS card and tickets reconciled
Lost property logged and secured
Doors cameras alarms and required utilities checked$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Handover notes$fecsop$, $fecsop$Topic
Outstanding item and owner
Incidents and safeguarding
Bookings groups and allergies
Equipment and contractor visits
Staffing and relief
Stock and food
IT cash and other actions
Keys and controlled items transferred __________________________________
Final guest count ______  Closure time ______  Next shift restrictions __________
Outgoing signature __________  Incoming acceptance __________  Time __________
If there is no incoming shift, submit the record to the supervisor’s designated manager and secure the approved master copy. Do not close a defect because the venue is closed for the night.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R03$fecsop$,
  $fecsop$R03 Activity operating card and risk review$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R03$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R03  |  One approved card for every activity or distinct zone
Site CB-VM ____  Activity __________  Asset and serial __________  Revision __________
Field
Validated entry and source document
OEM manual and inspection expiry
Approved age height weight and ability restrictions
Equipment participants and premises occupancy limits
Operating settings pressure speed or weather limits
Staff posts and minimum coverage including relief
PPE clothing footwear and loose item controls
Preuse inspection and empty test sequence
Loading briefing session and unloading sequence
Emergency stop isolation and rescue method
Cleaning inspection and maintenance intervals
Technical reviewer and Operations approval
Attach a marked plan showing gates, sightlines, escape, emergency controls and the guest flow. No universal staffing ratio is established by this form.
Hazard and persons exposed
Existing control
Further action and owner
Residual risk
Suggested assessment: likelihood 1 to 5 × severity 1 to 5. E3 management reviews 10 to 25 before release; 15 to 25 remains closed pending risk reduction. Any missing critical safeguard overrides the score. Risk scores do not prove engineering compliance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R04$fecsop$,
  $fecsop$R04 Defect isolation and return to service$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R04$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R04  |  One record per defect
Site CB-VM ____  Asset __________  Serial __________  Record number __________
Detected by __________  Date and time __________  Severity __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Fault and immediate control$fecsop$, $fecsop$Describe what was observed and operating conditions __________________________
___________________________________________________________________
Guest exposure or incident link __________  Photo or log reference __________
Activity stopped at __________  Barrier and tag __________  Sales blocked __________
Energy isolation by __________  Lock or permit reference __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Repair and verification$fecsop$, $fecsop$Maintenance owner __________  PR or work order __________  Due date __________
Repair and parts fitted __________________________________________________
___________________________________________________________________
Cause identified __________  Similar assets checked __________
Required test
Acceptance criterion
Actual result
Tester$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Reopening decision$fecsop$, $fecsop$Specialist inspection needed? YES / NO    Basis ______________________________
Technical clearance by __________  Date __________  Certificate __________
Guards tools work area and staff briefing checked by __________________________
Operations release by __________  Time __________  Restrictions _______________
Result: CLOSED / RELEASED WITH VALIDATED RESTRICTIONS / RELEASED
A signature without test evidence is not technical clearance. A restricted release cannot bypass a failed safety device or keep an unresolved critical hazard accessible.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R05$fecsop$,
  $fecsop$R05 Incident missing child and safeguarding record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R05$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R05  |  Restricted access
Site CB-VM ____  Record number __________  Date and time __________
Type: INJURY / NEAR MISS / FOOD / MISSING CHILD / SAFEGUARDING / OTHER
Reporter __________  Supervisor __________  Activity or food batch __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Facts and immediate response$fecsop$, $fecsop$What happened and where ______________________________________________
___________________________________________________________________
Observed condition or exact words ________________________________________
___________________________________________________________________
First aid responder __________  Action within training _________________________
999 called at __________  Property security at __________  Guardian at __________
Emergency service reference __________  Guest or guardian contact ______________
Time
Action or search zone
Person
Outcome$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Evidence and safe collection$fecsop$, $fecsop$Witness details held at __________  CCTV time range __________  Preservation by __________
Equipment isolation reference __________  Photos or batch evidence __________
Child release verification and authorized adult _______________________________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Followup and closure$fecsop$, $fecsop$Operations notified __________  Compliance notification decision __________
Authority or insurer reference __________  Action owner and deadline __________
Root cause and prevention ______________________________________________
Closure reviewer __________  Date __________  Reopening record __________
Record observations separately from opinions. Do not copy medical or safeguarding detail into ordinary group chats. For an unresolved emergency, continue response rather than completing paperwork.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R06$fecsop$,
  $fecsop$R06 Cash reconciliation and service recovery$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R06$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R06  |  Cashier and supervisor record
Site CB-VM ____  Date __________  Cashier __________  POS shift __________
Reconciliation item
QAR or count
Evidence reference
Opening cash float
Cash sales and other authorized cash movements
Cash refunds and documented cash drops
Expected closing cash
Actual closing cash
Variance actual minus expected
Card POS total versus terminal settlement
Online sales and admissions matched
Offline tickets issued used void and returned
Discounts refunds and complimentary admissions
Expected cash = float + cash receipts - cash refunds - recorded cash removals. Explain every other authorized movement. Do not include card receipts in expected physical cash.
Variance explanation __________  Finance escalation __________  Seal number __________
Cashier signature __________  Independent review __________  Time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Complaint or service recovery$fecsop$, $fecsop$Reference __________  Guest contact if needed __________  Date __________
Issue and facts ________________________________________________________
Resolution offered __________  Refund or concession __________
Authority and approval reference __________  Followup owner __________
Guest informed at __________  Root cause action __________  Closed by __________
Safety or safeguarding complaint linked to R05 __________. Do not offer a concession in exchange for a rating or review removal.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R07$fecsop$,
  $fecsop$R07 Cleaning inspection and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R07$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R07  |  Working hygiene and safety record
Site CB-VM ____  Date __________  Supervisor or PIC __________
Area or item
Product method and contact time
Due / done
Checked by
Product dilution or concentration verified __________  Test method __________
Contamination isolation reference __________  Reopened by and time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Weekly safety and pest walk$fecsop$, $fecsop$Check
Finding and owner
Due date
Closed evidence
Structure barriers pads and floors
Exits signs fire access and first aid
Electrical guards charging and lighting
Hygiene water drains and pest signs
Food permits allergens and temperatures
Training staffing and overdue defects
Pest contractor reference __________  Chemical treatment restrictions __________
No spraying during occupied food or play sessions. Follow the authorized reentry and food protection instructions.
Inspector __________  Signature __________  Management review date __________
Critical finding: stop now, record R04 or R05 and escalate immediately. Assign every corrective action an owner and evidence requirement. A due date cannot justify continued unsafe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R08$fecsop$,
  $fecsop$R08 Site validation and emergency information$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R08$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R08  |  Site authorization for CB-VM
Site CB-VM ____  Legal name __________  Address unit floor __________
Release evidence
Document reference
Verified by and date
Trading food and premises permissions where applicable
Approved occupancy plan and escape arrangements
Asset inventory manuals and specialist inspections
R03 cards and critical limit validation
Staffing sightlines relief and first aid coverage
Food scope and menu controls or recorded N/A
Fire maintenance property interfaces and insurance
CCTV privacy access and retention basis
Emergency and rescue demonstrations completed
Current site photographs and measured plan$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Emergency information to post at the site$fecsop$, $fecsop$Emergency services 999 [S18]    Property security __________    Duty supervisor __________
Site access and responder meeting point ___________________________________
Primary exit __________  Alternative exit __________  Assembly location __________
Assistance and refuge arrangement __________  First aid location __________
Electrical isolation __________  Fire controls held by __________  Backup contact __________
Attach the approved marked plan. Do not create an escape route from a photograph.
Activities excluded from release __________________________________________
Technical signoff __________  Food signoff __________  Operations __________
GM authorization __________  Effective date __________  Review date __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R09$fecsop$,
  $fecsop$R09 Food batch allergen and cookery record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R09$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R09  |  Copy sheets as needed
Site CB-VM ____  Date __________  PIC __________  Menu or class __________
Food or ingredient
Supplier batch expiry
Receipt temperature
Accept reject
Batch and step
Start time and temp
Check time and temp
Action and initials
Steps include cooking, reheating, cooling and holding. Copy for each batch and required check. Fridge or freezer unit __________  Opening ______  2 hourly ______  Close ______
Recipe or menu item
All ingredients and allergens
Cross contact controls
PIC release$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Cookery or edible activity session$fecsop$, $fecsop$Recipe revision __________  Age group __________  Approved capacity __________
Instructor __________  Entry and safety support __________  Actual participants __________
Guardian consent and allergy check reference __________  Tool count out / in __________
Handwash and station release __________  Hot work adult __________
Take home label and use instructions __________  Children collected __________
Unsafe food or allergen incident reference __________  Disposition approved by __________
Record probe verification, recipe validation and any supplier substitution on attached sheets. Keep participant medical and contact details in the restricted register, not on a public counter.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-VM-R10$fecsop$,
  $fecsop$R10 Food hazard analysis and control plan$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R10$fecsop$,
  $fecsop$site-manuals/CB-VM/E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-VM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R10  |  Complete for each approved menu or cookery process
Site CB-VM ____  Menu or recipe __________  Revision ______  Food PIC __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Process and intended use$fecsop$, $fecsop$Product and ingredients __________  Intended consumers __________  Allergens __________Process flow reference __________  Flow verified on site by __________  Date __________Storage and shelf life basis __________  Take-home instructions __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Hazard assessment$fecsop$, $fecsop$PROCESS STEP
HAZARD AND CAUSE
CONTROL MEASURE
CCP DECISION AND BASIS
Assess biological, chemical, physical and allergen hazards. The qualified food lead determines whether each control is managed through prerequisite hygiene procedures or as a critical control point. Do not classify every temperature check automatically as a CCP.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Control and verification$fecsop$, $fecsop$CONTROL ELEMENT
APPROVED PLAN
Critical limit and validation source
Monitoring what how when and responsible person
Immediate correction and affected product disposition
Root cause and preventive action
Verification method frequency and reviewer
Required monitoring and deviation records
Approved by Food Lead __________  Signature __________  Date __________Operator briefing completed __________  Review due __________
Revalidate following a menu, supplier, allergen, equipment, process, capacity or regulatory change. Link actual batch monitoring to R09. This worksheet supports a site-specific HACCP plan; it does not constitute approval of an unassessed process. Reference basis: MoPH HACCP approach [S08] and Codex hygiene framework [S13].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-VM-R10$fecsop$;

INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, $fecsop$Imported from E3_CB-VM_Site_SOP_Manual_V1.0.docx$fecsop$
FROM public.sop_documents d
WHERE d.code LIKE $fecsop$CB-VM-%$fecsop$
  AND NOT EXISTS (
    SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id AND v.version = 1
  );

DELETE FROM public.sop_sections s USING public.sop_documents d WHERE s.document_id = d.id AND d.code LIKE $fecsop$CB-DSM-%$fecsop$;
INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-MANUAL$fecsop$,
  $fecsop$Site SOP manual$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$MANUAL$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, $fecsop$Contents and navigation$fecsop$, $fecsop$DOCUMENT GUIDE
SECTION
PAGE
Site profile and local operating procedures
3–4
Document control and Qatar framework
5–8
Common operating procedures C01 to C09
9–17
Activity procedures A06
18
Conditional food and cookery procedures F01 to F05
19–23
Qatar and international requirements
24–25
Site records and forms R01 to R10
26–35
Training and management review
36
References and document framework
37–39$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$How to use the manual$fecsop$, $fecsop$This document is the standalone site manual for Crayons and Bricks at Dar Al Salam Mall. Read the site instructions, then apply C01 to C09 and the activity procedures included here. The food and cookery section is conditional: use only procedures within the site’s approved scope and mark non-applicable activities in R08.
Complete R08 before site release and R03 for each activity. Use R01 and R02 daily. Record exceptions on R04 to R09; use R10 to document the approved food hazard-control plan.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Crayons and Bricks$fecsop$, $fecsop$LOCATION 07  /  DAR AL SALAM MALL  /  CB-DSM
SITE CONTROL
REQUIREMENT
Operating scope
Creative play area
Responsible owner
Site Supervisor; accountable to Head of Operations
Required procedures
C01 to C09; A06. F01 to F05 only for approved food or cookery activities.
Staff deployment
Creative activity lead; entrance coverage and relief; food PIC where applicable.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Site records$fecsop$, $fecsop$Attach the current approved floor plan, site photographs, asset register and emergency access plan to the controlled site copy. Confirm the operating footprint and all installed activities before release.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$Operational priorities$fecsop$, $fecsop$Child release, clean workstations, tool counts and clear mall frontage.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$Daily supervisor checklist$fecsop$, $fecsop$Before opening: complete R01, confirm staffing and relief, inspect exits and release each activity. During operation: control admission, maintain sightlines and record required checks. At close: account for every child, isolate defects, reconcile sales and complete R02.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 7, $fecsop$Site operating procedures$fecsop$, $fecsop$CB-DSM  /  SOP 07  /  DAR AL SALAM MALL
Confirm the current floor area, activity inventory and site photographs through R08. Apply C01 to C09 and A06 to the creative activities installed at this location. Authorize each service separately against the site’s facilities and permissions.
1. Inspect the complete perimeter and mall interface before admission. Confirm what physically exists and mark absent activities N/A with a reason. Keep public seating, trolleys and stock clear of the entrance and exits.
2. Set up distinct clean activity stations and a secure small parts store. Keep food separate and closed unless the location has an approved food scope and the facilities required by F01.
3. Record issued, used, damaged and closing stock for craft materials; count hazardous tools each session. Maintain individual child entry and release checks even during quiet periods.
4. Use planned relief for sales, breaks and cleaning. At close account for children and tools, secure chemicals and digital devices, reconcile POS and give the next shift all defects and replenishment needs.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 8, $fecsop$Local stop conditions$fecsop$, $fecsop$Suspend the affected activity for unsafe gate access, uncontrolled small parts, unknown materials, missing child supervision or failed food hygiene controls. Maintain entrance coverage during breaks, cleaning and sales interruptions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 9, $fecsop$Records and authorization$fecsop$, $fecsop$Complete R08 for this site: measured footprint, occupancy, guardian policy, staffing demonstration, activity and materials register, digital privacy settings, emergency route, food permission if applicable and current photographs. This site’s small size justifies reduced safety checks.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 10, $fecsop$Closing and handover$fecsop$, $fecsop$Confirm that all children have been collected by authorized guardians. Count tools and controlled materials, secure chemicals and digital equipment, reconcile transactions and record faults, stock needs and outstanding actions in R02. Obtain supervisor sign-off.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 11, $fecsop$Document control and authorization$fecsop$, $fecsop$CONTROL 02
Role
Accountability
GM or authorized executive
Approve policy, resources and delegated financial limits; no commercial waiver of safety restrictions.
Head of Operations
Own the manual, approve site deployment and capacity reductions, review incidents and authorize site release after technical evidence.
Site supervisor
Complete opening decision, assign posts and relief, check controls during trade, stop unsafe activity and sign handover.
Maintenance lead and inspector
Validate equipment records, technical limits, inspection scope and repairs; issue written technical release.
Food PIC
Approve recipes, suppliers, allergen controls, food monitoring and disposition; stop unsafe food service.
HR and training lead
Verify role competency, induction, working arrangements and training records.
IT and privacy lead
Protect POS, CCTV and guest records; approve access and technical recovery.
Every employee
Intervene early, stop danger, summon help and record facts honestly.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 12, $fecsop$Release sequence$fecsop$, $fecsop$Inspect the site and complete R08. Confirm licenses, emergency plan, equipment inspection certificates, operating cards, food permissions and staffing. Demonstrate opening, evacuation and relevant equipment rescue. Close critical findings. Obtain the approvals below and issue a controlled copy to the site. Release can exclude a clearly separated activity.
Approval
Name and signature
Date
Technical validation
Food validation if applicable
Head of Operations
GM or authorized executive
Review annually and after an incident, equipment change, menu change, layout change or regulatory change. The document owner records revisions, withdraws superseded copies and arranges staff retraining. This revision takes effect at each site only after the required approvals are completed.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 13, $fecsop$Approval and document control$fecsop$, $fecsop$DC01  |  Applies to all procedures in the CB-DSM site manual
CONTROL FIELD
CONTROLLED VALUE
Manual ID and revision
E3-CB-DSM-MAN-001 / Revision 1.0
Document date
21 September 2026
Effective date
To be entered after approval: __________________
Scheduled review
12 months from effective date, or earlier following change or incident
Status
For approval; no signature or authority approval is implied
Owner and master copy
Head of Operations FEC and IT / designated controlled document repository
Superseded revision
First standalone site issue; derived from corporate manual revision 4.0.
Procedure identification
E3-CB-DSM-C01 to C09; applicable A modules; F01 to F05; R01 to R10.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 14, $fecsop$Preparation review and approval$fecsop$, $fecsop$ROLE
NAME
SIGNATURE
DATE
Prepared by Operations
Technical review Maintenance or Inspector
Food safety review Food Lead
Qatar compliance review Designated Lead
Approved by GM or Authorized Executive
Each reviewer confirms only the scope within their competence. The approved manual is released with completed site verification R08 and activity cards R03. A management signature does not replace a statutory permit or equipment inspection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 15, $fecsop$Language and communication$fecsop$, $fecsop$Maintain this English master and controlled translations where required by the relevant authority or staff comprehension needs. E3 requires Arabic and English guest safety notices and receipts. Staff must demonstrate understanding of their assigned procedures; record the briefing language and assessment result.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 16, $fecsop$Revision distribution and records$fecsop$, $fecsop$DC02  |  Document lifecycle and traceability
REV
CHANGE
RELEASE
1.0
First standalone manual for CB-DSM. Contains local instructions, full applicable SOPs and site records. Based on corporate revision 4.0.
Pending site approval$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 17, $fecsop$Controlled distribution$fecsop$, $fecsop$COPY OR ACCESS ID
LOCATION OR HOLDER
ISSUED BY AND DATE
OLD COPY WITHDRAWN
The document controller records approval and effective date, grants access to the approved master, distributes site copies and removes superseded copies. Printed copies are uncontrolled unless registered. Amendments require impact review, approval and briefing before use. Site supervisors must not edit safety limits locally without authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 18, $fecsop$Records management$fecsop$, $fecsop$RECORD FAMILY
CUSTODIAN AND CONTROL
R01 R02 R07 daily operations
Site Supervisor; complete during the shift and review exceptions before handover.
R03 R04 equipment and defects
Maintenance Lead with Operations; link to asset serial, inspection evidence and return-to-service authorization.
R05 incidents and safeguarding
Authorized Operations and safeguarding personnel; restricted access and preservation of evidence.
R06 finance and complaints
Finance and Site Supervisor; reconcile transactions and retain approval references.
R08 site authorization
Head of Operations; link current licenses, plans, training and permissions.
R09 R10 food and cookery
Food PIC; retain supplier, batch, monitoring, deviation and verification evidence.
The compliance lead approves a retention schedule using applicable law, permit conditions, insurer requirements and legal holds. Record retention period, disposal authority and storage location for each record class. Do not apply a generic operating-log period to CCTV, child, medical or financial records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 19, $fecsop$Qatar compliance and procedure framework$fecsop$, $fecsop$DC03  |  Requirements mapping and site release
This is the E3 controlled-document format. Applicable Qatar laws, permit conditions, approved property plans and manufacturer instructions govern its implementation. ISO 10013 provides guidance on organisation-specific documented information [S20]; it is not a Qatar government template or evidence of certification.
REQUIREMENT AREA
REQUIRED SITE EVIDENCE
MANUAL LINK
Commercial activities
Licensed entity, trading name, commercial registration and permitted activities for each location.
R08; LOC01–07
Food service and cookery
Applicable permissions; current MoPH code; named food PIC; approved menu, process flow, hazard analysis and monitoring records.
F01–F05; R09 R10
Fire and life safety
Current Civil Defence and property approvals as applicable; occupancy, exits, assembly and emergency access arrangements.
C01 C06; R08
Outdoor work and heat
Applicable Ministerial Decision 17 of 2021; work scheduling, heat risk assessment, WBGT checks and welfare arrangements.
CAR-AP; R03 R08
Consumer information
Current applicable consumer-protection requirements; displayed prices, accurate service information, receipts and complaint route [S21].
C02 C09; R06
CCTV and personal information
Applicable law and permissions; approved camera plan, access and retention controls.
C09; R08
Equipment integrity
Asset-specific manuals, inspection scope and certificates, validated limits, competent operators and rescue arrangements.
A01–A06; R03 R04$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 20, $fecsop$Standard procedure structure$fecsop$, $fecsop$Each operating SOP identifies its purpose, scope, responsible roles, operating steps, corrective action, required records and reference basis. Revision, approval and effective-date controls in DC01 apply to the complete manual. Local work instructions must identify the related SOP and asset or activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 21, $fecsop$Release rule$fecsop$, $fecsop$The compliance lead records the applicable authority, document title, revision or issue date, relevant requirement and supporting evidence. Resolve discrepancies before site release. If authority requirements or manufacturer instructions conflict, stop the affected activity and obtain a documented technical or regulatory resolution. Smaller sites may simplify administration but must retain the necessary safety coverage.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 22, $fecsop$Qatar requirements and verification register$fecsop$, $fecsop$REQUIREMENTS 01
The compliance lead must maintain current authority requirements and supporting documents for each licensed entity and site. Complete all verification items before authorization. This register supports compliance management and does not replace statutory approvals.
Area
Required operating evidence
Verification required
Business and premises
Correct CR and commercial activity, premises permission, landlord agreement and conditions for each attraction or food activity. Track expiry and owner.
Site documents required; verify permit scope.
Fire and life safety
Current applicable Civil Defence approval, approved occupancy and drawings, alarm and firefighting maintenance, exit plan and property emergency interface.
Retain current Civil Defence approvals, plans and inspection schedules.
Food services
Applicable MoPH and municipal approvals, food handler fitness and training evidence, PIC, approved food safety plan and current MoPH food service code.
MoPH purpose verified [S08]; October 2020 copy reviewed [S19]. Current edition to confirm.
Outdoor and heat exposed work
Implement Ministerial Decision 17 of 2021: work schedule, risk assessment, monitoring, water, rest and training.
Official decision translation hosted by ILO reviewed [S09].
CCTV and privacy
Confirm applicability of Law 9 of 2011 and personal data requirements; retain approved camera plan, retention basis and access rules.
Law title found; full current legal requirements not verified [S16].
Guest information
Compliance lead validates Arabic consumer information, receipts, price displays, terms and complaint process. E3 requires bilingual safety notices and receipts.
E3 policy; local legal wording to verify.
Employment and contractors
HR verifies work authorization, lawful schedules, breaks, competent staff, contractor permissions and insurance conditions.
Site HR and contract evidence required.
Heat rule: covered work is prohibited from 10:00 to 15:30, 1 June to 15 September. Stop exposed work when WBGT exceeds 32.1°C. E3 uses 32.1°C or above as its conservative stop trigger. WBGT is not ordinary air temperature. Training, risk assessment and health surveillance requirements remain relevant beyond opening hours [S09].
Missing or expired permission: stop the affected activity and obtain written clearance. A renewal application, supplier assurance or mall verbal agreement is not itself permission to operate.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 23, $fecsop$International standards and inspection approach$fecsop$, $fecsop$REQUIREMENTS 02
Use these references to specify and verify the safety system. They are not automatically Qatar law. The competent inspector must confirm the edition, scope, installation date, amendments and local acceptance for each asset. Full paid standards were not reviewed clause by clause.
Reference
Application
Evidence to obtain
ISO 45001 2018 with applicable amendment [S10]
Worker safety management framework.
Risk register, worker participation, training, investigations and audit trail.
ISO 9001 2015 with applicable amendment [S11]
Documented service and quality controls.
Controlled procedures, supplier checks, complaint closure and change records.
ISO 22000 2018 and Codex CXC 1 1969 revised 2022 [S12 S13]
Food safety management and HACCP framework.
Validated menu based hazards, monitoring, corrective action and verification.
EN 14960 family and HSE inflatable guidance [S14]
Appropriate inflatable play devices.
Applicable standard and OEM limits, initial and periodic inspection, pressure and evacuation evidence.
EN 1176 family including enclosed play and inspection parts; EN 1177
Soft play and impact attenuating surfacing where within scope.
Inspector to select current applicable editions and confirm design, entrapment, access and surface tests.
ASTM F2970 25 [S15]
Trampoline courts within its scope.
Current catalogue identified; obtain full standard and applicable installation review.
EN 13814 family or appropriate ASTM F24 standards
Carousel and other amusement devices where applicable.
Inspector to establish accepted design, operation and inspection basis; do not mix design codes.
HSE HSG175 third edition [S17]
Supplementary amusement operation guidance.
Competent inspections, operating manual, maintenance, modification and operator training.
E3 baseline: preopening checks every operating day; active observation throughout use; formal supervisor checks hourly; detailed weekly walk; monthly management audit. Commission specialist inspections at the OEM, authority or inspector interval, with annual independent review as the proposed company baseline for rides and applicable inflatables. Shorter requirements prevail.
A daily checklist does not replace engineering inspection. Certificates must identify the actual serial number, scope, test results, defects and next due date. Do not describe E3 as ISO certified unless a valid certificate covers the relevant entity and activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 24, $fecsop$Implementation training and management review$fecsop$, $fecsop$IMPLEMENTATION 01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 25, $fecsop$Before frontline release$fecsop$, $fecsop$Head of Operations assigns an owner to every R08 gap. Verify legal permissions and all critical equipment, food and emergency controls first. Keep unresolved activities closed. Obtain missing technical manuals and full applicable standards through the responsible competent professionals. Approve a site specific effective date only when the release conditions are met.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 26, $fecsop$Practical competency$fecsop$, $fecsop$Role
Must demonstrate before independent work
Every employee
Stop authority, emergency communication, child safeguarding and defect reporting.
Entrance and cashier
Correct ticket, capacity count, guardian matching, refund control and outage process.
Activity operator
Preuse check, restrictions, safe dispatch, intervention, shutdown and equipment emergency response.
Supervisor
Post coverage and relief, opening decision, evacuation coordination and incident evidence.
Food staff and PIC
Handwashing, separation, probe use, allergy order, batch disposition and cleaning.
Cookery instructor
Age appropriate task briefing, child count, tool control, allergy controls and hot zone separation.
Training record: employee ______ role ______ SOP codes ______ trainer ______ date ______ practical scenario ______ result ______ retraining ______ authorization ______. Reading or signing the manual alone is insufficient. Repeat assessment after a relevant incident, change or failed observation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 27, $fecsop$First month after release$fecsop$, $fecsop$Week 1: supervise opening and closing every day and resolve unclear instructions. Week 2: observe peak capacity and relief arrangements. Week 3: run a relevant scenario such as lost child, deflation, ride stoppage or food withdrawal. Week 4: audit records and adjust deployment from actual evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 28, $fecsop$Monthly review$fecsop$, $fecsop$Review incidents and near misses per guest visits, critical defects, overdue inspections, staffing gaps, food control failures, complaints, cash variances, training competence and action closure. Do not reward low incident counts in a way that discourages reporting. Record management decisions, budgets, owners and due dates.
No site is released by this document alone. The completed evidence and demonstrated behavior are the basis for safe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 29, $fecsop$Reference register$fecsop$, $fecsop$SOURCES 01
Reference review date 21 September 2026. Maintain current editions of applicable standards, authority requirements and manufacturer instructions. Photograph captions identify their sources; publicity images do not replace current site inspection records.
S01 E3 attraction directory and source photographs
Reference photographs identify InflataPark, Urban Arena, Kidz Driving School and Crayons and Bricks Place Vendôme. Directory location and time fields conflict with other listings; not used as verified addresses or hours.
S02 City Center Doha Inflata Park
Mall source establishing the venue at City Center.
S03 City Center Doha Kids City Driving School
Mall source supporting the correction of the KDS activity identity.
S04 BookingQube InflataPark
Ticketing reference. Equipment limits must follow validated manufacturer instructions.
S05 BookingQube Kids City Driving School
Describes driving and soft play. Product offer is not an asset inventory.
S06 BookingQube Urban Arena
Identifies Doha Mall and advertised driving, arena, console and soft play categories.
S07 BookingQube Crayons and Bricks Vendome
Creative activity description. Current trading status and facilities need confirmation.
S08 MoPH Food Safety Code of Practice for Food Services
Ministry text reproduced by Lexis. Purpose and HACCP approach accessible; current official edition not retrieved. Historical operational text reviewed separately [S19].
S09 Qatar Ministerial Decision 17 of 2021 on heat stress
ILO hosts the decision translation. Articles 2 to 4 establish covered hours and mitigation duties; original Arabic and later applicable requirements must be checked for legal use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 30, $fecsop$Standards references and verification requirements$fecsop$, $fecsop$SOURCES 02
S10 ISO 45001 2018
Occupational health and safety management catalogue; includes amendment information.
S11 ISO 9001 2015
Quality management catalogue. Confirm applicable amendments and transition at adoption.
S12 ISO 22000 2018
Food safety management catalogue; includes HACCP and prerequisite program context.
S13 Codex codes of practice
Lists General Principles of Food Hygiene CXC 1 1969, revised 2022.
S14 HSE inflatable safety advice
Public practical guidance. UK legal and scheme references are not presented as Qatar obligations.
S15 ASTM F2970 25
Current edition identified through ASTM catalogue. Full paid clauses not reviewed.
S16 Qatar CCTV Law 9 of 2011
Title identified in Qatar legal portal search. Confirm current legal text before setting retention periods or approving camera alterations.
S17 HSE HSG175 third edition
Supplementary amusement management and inspection guidance. Not an assertion that UK law applies in Qatar.
S18 Hamad Medical Corporation Ambulance Service
Supports immediate 999 contact, accurate location and following dispatcher instructions.
S19 MoPH food code October 2020 copy
Third party hosted ministry document, revision 0. Sections 6.8.2, 7.2, 7.3, 7.5 and 7.6 reviewed for food limits; confirm authenticity and current official revision before release.
Outstanding site records: attach current photographs, measured plans, approvals and asset records for CB-DSM. Confirm any approved food or cookery scope, menus and facilities. Complete R08 and the relevant activity cards before authorizing operations.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 31, $fecsop$Document format and Qatar references$fecsop$, $fecsop$SOURCES 03  |  Format review dated 21 September 2026$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 32, $fecsop$S20 ISO 10013 2021$fecsop$, $fecsop$Quality management systems — Guidance for documented information. The published scope supports development and maintenance of documentation tailored to an organisation. The E3 layout, numbering, A4 paper, approval blocks and registers are company document controls; they are not prescribed Qatar typography or a claim of ISO certification.
https://www.iso.org/standard/75736.html$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 33, $fecsop$S21 Qatar Ministry of Commerce and Industry$fecsop$, $fecsop$Consumer Services identifies Law No. 8 of 2008 and official consumer-rights guidance. Maintain accurate information, pricing and the appropriate complaint route; confirm applicable legal and permit details before adopting site-specific terms.
https://www.moci.gov.qa/en/consumer$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 34, $fecsop$Application of Qatar requirements$fecsop$, $fecsop$Maintain current official requirements in the compliance register. The MoPH food-service code uses a HACCP-based approach [S08]. Outdoor work is assessed against Ministerial Decision 17 of 2021 [S09]. Fire, occupancy and emergency arrangements must follow the applicable site approvals. Government forms required for licenses or inspections remain separate from this internal SOP manual.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 35, $fecsop$Controlled format specification$fecsop$, $fecsop$ELEMENT
E3 DOCUMENT RULE
Page and typography
A4 portrait; clear heading hierarchy; readable body text; repeating document identification and page count.
Identification
Manual and procedure IDs; revision; effective date; owner; controlled approval and distribution.
Procedure content
Purpose; scope and responsibility; operating steps; corrective action; records and reference basis.
Site application
Location title and code; applicable modules; staffing coverage; inspection and release evidence.
Change control
Recorded revision, reviewer approvals, withdrawal of old copies and staff briefing.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-MANUAL$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C01$fecsop$,
  $fecsop$C01 Opening and staffing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C01$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Ensure the site opens only with safe facilities, competent staff and released activities.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Site supervisor  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Read the last handover and defect register before admitting anyone. Confirm the site and every proposed activity have current release status; remove closed activities from ticket sales.
2. Record who is actually present and competent. Name the duty supervisor, first aid responder, entrance controller, activity attendants and relief staff. Conduct a short briefing on defects, expected groups, emergency roles and guest needs.
3. Walk the guest route and every activity. Check exits, evacuation gates, floor condition, barriers, lighting, accessible routes, first aid supplies and communication. Verify property systems through the agreed interface; do not trigger fire alarms without coordination.
4. Operators complete the equipment specific preuse checks and empty test cycles required on R03. Confirm safety signage, limits, emergency controls and inspection validity. Check that isolated equipment cannot be accessed.
5. Food PIC releases food service separately. Cashier checks approved prices, bilingual receipt output, float and payment terminal. Confirm clocks, wristbands or ticket numbers and the guest count method.
6. Supervisor checks the results, records OPEN, PART OPEN or CLOSED and signs R01. Photograph significant defects without capturing identifiable guests unnecessarily. Admit only to released areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not open with a blocked exit, missing safety critical operator, unknown capacity, failed safety device, unsafe food service or an overdue required equipment examination. A small site may share administrative roles, but cannot leave its entrance or activity unsupervised to serve a customer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 opening record, staff post plan and asset check sheets. Head of Operations reviews failed openings and recurring staffing gaps. Provide planned relief; if relief fails, pause admissions and clear or close the affected activity safely.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C02$fecsop$,
  $fecsop$C02 Admission capacity and guest release$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C02$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control admission, capacity, participation and authorized child collection.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Entrance controller and supervisor  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Explain the purchased activity, time, price, restrictions, supervision arrangement and refund terms before payment. Use approved Arabic and English information and practical demonstrations when needed.
2. Check the relevant activity card for age, height, weight, clothing, ability, capacity and permitted accompanying adults. Apply limits discreetly. Do not rely on appearance to judge a borderline restriction or ask staff to make medical diagnoses.
3. Use a linked child and guardian identifier for sessions involving children. Record necessary contact and collection details in the approved system. Tell the guardian whether they must remain inside or immediately available; never imply childcare without an approved service.
4. Count all people for premises occupancy, including adults and staff. Count participants separately for each activity. Effective capacity is the lowest validated premises, equipment and staffed supervision capacity. Stop sales and admission at the limit.
5. Brief guests before the activity starts. Remove loose items and require activity appropriate footwear or socks. Offer reasonable support for disability or sensory needs within safe equipment use; escalate uncertain accommodations before participation.
6. At departure verify the collection identifier and authorized adult. Resolve missing bands or disputed collection through the supervisor using independent checks. Keep the child safely supervised; do not release solely because an adult knows their name.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop entry when counting fails, guardian arrangements are unclear, limits cannot be verified, a child is distressed or a guest cannot comply with essential safety rules. Never lock an emergency escape route to contain children.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R01 occupancy checks, session entry and exit records, and R05 for release exceptions. Only necessary guest information is collected. No ad hoc ID photographs on personal phones.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C03$fecsop$,
  $fecsop$C03 Supervision handover and closing$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C03$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain active supervision and a complete shift handover and safe closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and activity operators  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Position attendants from the approved zone plan, including blind corners, raised platforms, slide landing areas and exits. Keep a clear line of sight and move through the assigned zone. CCTV supplements physical supervision.
2. Intervene immediately in dangerous behavior, overcrowding, equipment changes or blocked routes. Explain the rule, stop the specific unsafe action and remove the guest from the activity when needed. Do not allow revenue targets to influence safety decisions.
3. Record a supervisor check each hour and after a group arrival, spill, fault or significant weather change. Confirm headcounts, staff coverage, hygiene, queue position and defect barriers. An hourly check does not replace continuous supervision.
4. Before breaks or shift changes, the replacement receives the guest count, current restrictions, incidents, equipment state and pending tasks face to face. The departing operator remains until the replacement accepts the post.
5. Before closing, stop sales in time to deliver paid sessions. Check all play levels, toilets if within the site, party spaces and quiet corners without unsafe entry. Account for every child and guardian. Complete the final ride or session and unload safely.
6. Shut equipment down in the OEM sequence. Clean and isolate defects; secure chemicals, batteries, cash and lost property. Keep required refrigeration, alarms and security systems running. Sign R02 and give the next shift unresolved actions and owners.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Pause the affected activity when visibility, lighting, noise or staffing prevents effective supervision. No operator may run a ride while handling cash or responding to unrelated messages.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R02 handover and closing, R04 faults and the hourly log. Supervisor reconciles remaining guests before locking public access; emergency egress follows the property plan.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C04$fecsop$,
  $fecsop$C04 Injury medical emergency and evidence$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C04$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Coordinate prompt emergency assistance, protect guests and preserve incident evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop the immediate source of harm. Secure the area without causing a second incident. Call the trained first aid responder and supervisor; do not move a casualty unless necessary to escape immediate danger or directed by emergency responders.
2. For a serious injury, breathing difficulty, unconsciousness, suspected severe allergic reaction or other urgent medical concern, call 999 immediately. Give the site name, mall or park, floor, closest access point, patient details and hazards; follow the dispatcher’s instructions [S18].
3. Send a named staff member to guide responders from the agreed entrance. Notify mall or park security. Keep a clear access route and arrange continued supervision or safe evacuation of other guests.
4. Contact the guardian promptly. Provide first aid only within current training and the emergency dispatcher’s instructions. Do not administer routine medicines, diagnose the injury or pressure the guest to resume play.
5. Preserve the scene and equipment state where safe. Record factual observations, times and witness contacts. Ask IT or security to preserve relevant original footage and record who accessed it. Do not film the injured person for staff chat groups.
6. Inform Head of Operations immediately for serious events. Complete R05 before the end of shift. The designated compliance lead assesses authority, property and insurer notifications without delaying any statutory deadline. Investigate causes and check equivalent assets across sites.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Equipment involved remains isolated until the technical cause and safe return conditions are established. Severe or unexplained incidents require competent technical review. A customer declining treatment does not clear the equipment.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 incident report, preservation log, technical findings and corrective actions. Reopening requires written technical clearance where relevant and Operations authorization. Respond with care and facts; do not speculate about blame or liability.
Reference basis: HMC emergency access guidance [S18] and E3 incident procedure$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C05$fecsop$,
  $fecsop$C05 Missing child and safeguarding$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C05$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Locate missing children promptly and protect children from harm.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Duty supervisor  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Treat a missing child report as urgent. Obtain the child’s description, name, last known location and time, guardian contact and any relevant support needs. Notify property security and the supervisor immediately; assign one incident coordinator.
2. Stop new admissions if they distract from the response. Staff monitor normal entry and exit points while maintaining free emergency escape. Allocate named search zones and report cleared zones to the coordinator. Do not abandon other children.
3. Ask authorized security personnel to review relevant CCTV. Share the minimum description needed over the agreed radio channel; do not broadcast sensitive family information or circulate a child’s photo in public chat groups.
4. If abduction is suspected, the child is in immediate danger or security cannot resolve the situation promptly, contact police through 999. Do not wait for a preset search period or a manager’s permission in a credible emergency.
5. For a found child, use a visible safe location with two staff where practicable. Verify the collecting adult against the entry record and independent identifying information. Escalate discrepancies to security; never resolve a custody dispute yourself.
6. For safeguarding concerns, listen without leading questions, record the child’s words accurately and refer immediately to the safeguarding lead and appropriate emergency or protection authority. Never promise secrecy or investigate an allegation against yourself.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No isolated one to one contact, unauthorized photography, corporal punishment or unnecessary touching. Seek guardian consent for routine assistance. Necessary immediate action to prevent serious harm must not be delayed for consent; document it.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 records search timeline, staff zones, security reference, guardian checks and outcome. Keep safeguarding information restricted. Release staff accused of harm from child contact pending a fair review, without presenting allegations as proven.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C06$fecsop$,
  $fecsop$C06 Fire evacuation and utility failure$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C06$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Evacuate safely and control the effects of fire and essential utility failure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor under property emergency command  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. On an alarm, smoke, fire or instruction to evacuate, raise the alert and call emergency services when required. Follow the approved property evacuation plan. Stop admissions and activities; do not delay for cash, shoes or personal belongings.
2. Operators stop rides and release guests by the trained method. Clear inflatable users promptly while safe inflation is maintained if possible; do not turn off blowers as a routine evacuation step while users remain unless electrical or fire danger requires it.
3. Direct people by the safe approved route. Use the planned assistance arrangements for children and people with reduced mobility. Do not use ordinary lifts in a fire. Staff must not enter smoke, climb structures or improvise rescues.
4. Sweep only assigned areas that remain safe, report unchecked areas and proceed to the assembly point. Reconcile staff, groups and child records as far as practicable; give missing person details and last known locations to responders. Never reenter to search.
5. For a power failure without fire, stop affected admissions, maintain emergency lighting and arrange safe equipment unloading or inflatable evacuation. An emergency stop reset does not prove the installation is safe. Protect refrigerated food using F02.
6. For loss of water, drainage, ventilation or essential lighting, stop the affected food or guest activity. Isolate contamination and inform the property. Resume only after the responsible technical or food lead verifies restoration and the supervisor records authorization.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No trade during a fire alarm or unsafe evacuation condition. Only the property or emergency authority can clear reentry after their incident; Operations then separately checks attraction readiness. Never silence or bypass alarms to continue service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R05 event record and R08 emergency plan. Drills follow property and authority requirements; E3 proposes a quarterly staff scenario exercise and at least a six monthly coordinated evacuation exercise, subject to property agreement. Record learning and retrain failed roles.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C07$fecsop$,
  $fecsop$C07 Maintenance isolation and change control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C07$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C07  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent access to defective equipment and authorize return to service using evidence.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Maintenance lead and supervisor  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Stop use, remove guests and secure the defect area. Identify the asset and write the fault and time on R04. For a critical defect, physically prevent access; a sign alone is insufficient.
2. A competent authorized technician isolates every relevant energy source, including electrical, mechanical, stored pressure and battery power. Apply the documented lockout method and verify isolation before work. Operators do not open energized cabinets or bridge safety devices.
3. Maintenance raises the repair request and purchase requisition with defect evidence and urgency. Route commercial approval through the authorized matrix. Isolation happens immediately and is not conditional on purchase approval.
4. Use qualified contractors with property permits, task risk assessment and controlled work area. Confirm parts are suitable and traceable. Record repair details and required inspections; do not accept temporary tape or improvised fasteners as structural repair.
5. After repair, the technician records measurements and OEM test results. A competent independent examiner reviews safety critical repairs or modifications where required. Restore guards, remove tools, account for workers and complete empty tests before any guest trial.
6. Technical signoff confirms equipment condition; Operations authorizes reopening and updates the activity card, training and asset history. For new games, changed locations, cut frames, added food equipment or changed software safety settings, complete change review before installation or use.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Do not reopen after a failed safety device, unknown fault, structural damage or unexplained repeated stop until the cause is resolved. Customer testing is never a commissioning method. No verbal repair closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R04 defect and release record; asset register, parts and inspection certificates. Critical faults are escalated immediately; major issues receive same shift management review. E3 planning targets do not authorize unsafe continued operation.
Reference basis: E3 maintenance workflow; supplementary lifecycle guidance in HSG175 [S17]$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C08$fecsop$,
  $fecsop$C08 Cleaning chemicals and infection control$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C08$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C08  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control hygiene hazards, chemicals and contamination in public and activity areas.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor and cleaning lead  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Use an approved cleaning schedule identifying the surface, product, dilution, contact time, method, frequency and responsible person. Check compatibility with inflatable fabrics, pads, screens and food contact equipment. Keep chemical safety information available.
2. Before opening, remove debris, clean high contact areas and confirm floors and equipment are dry and safe. Clean shared accessories between users where required by the activity assessment. Inspect public contact surfaces hourly and clean whenever soiled.
3. For vomit, blood, faeces or other body fluid, close the contaminated area immediately and protect neighboring play or food. A trained cleaner uses the assessed PPE and appropriate disinfectant. Do not dry brush or spray contamination toward guests.
4. Remove visible contamination, clean, apply the approved disinfectant at its specified concentration and contact time, then rinse where required. Remove damaged porous material that cannot be safely decontaminated. Dispose of waste in the designated sealed route.
5. Keep cleaning tools separated between toilets, general areas and food. Label chemicals and lock them away from children and food. Never mix products or put chemicals into beverage containers. Isolate electrical equipment safely before cleaning.
6. Supervisor checks completion, dryness, chemical removal and any required ventilation before reopening. For suspected communicable illness clusters, notify the food or health lead and seek appropriate authority guidance; preserve records of affected sessions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Close affected areas when contamination cannot be contained, potable water or handwashing is unavailable, pests affect safety, or the correct cleaning method is unknown. Odor and visual appearance alone do not establish hygiene.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning record, product instructions, pest records and R05 where illness is reported. Ball pits and inaccessible enclosed areas need a documented deep cleaning method and schedule set from use, manufacturer guidance and risk, not an invented universal interval.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-C09$fecsop$,
  $fecsop$C09 Payments complaints records and continuity$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$C09$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-C09  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain traceable payments, fair complaint handling and secure operating records.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Supervisor cashier and IT lead  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Process each sale in the approved POS under individual credentials. Display approved prices and issue receipts showing purchased service and payment. Record authorized discounts, refunds and complimentary entries with reason and approver; never share manager credentials.
2. If POS or connectivity fails, notify IT and stop new sales unless a preapproved numbered offline ticket and payment process is available. Continue accurate capacity and child release controls. Never accept card details in messages or use personal accounts for company payments.
3. At close, reconcile cash, terminal batches, POS totals, online bookings, refunds, voids and offline tickets. Two people count where available. At a small site, use a sealed cash handover and independent Finance review. Record differences without offsetting them against unrelated transactions.
4. Acknowledge complaints, establish facts and offer a solution within authority. Escalate safety, safeguarding, discrimination, food illness and data concerns immediately. Do not tie a refund or complimentary service to removing a review or giving a positive rating.
5. Restrict guest, CCTV, HR and incident data by role. Use company systems, secure passwords and approved backups. Preserve incident footage promptly; do not copy it to personal devices. Confirm legal retention and camera alteration requirements before making changes.
6. On suspected cyber compromise, contact IT, protect affected systems through the approved response and preserve logs. IT validates recovery and reconciles transactions before reconnection. AI kiosks cannot override admission limits, access children’s records freely or initiate equipment movement.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop transactions when traceability, payment security or safe capacity control is lost. A camera fault affecting an approved safeguarding control requires a supervisor risk decision and compensating staff coverage or closure.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R06 reconciliation and complaint records, IT tickets and access log. Apply the approved retention schedule in DC02; incident and child records require specific access, preservation and retention decisions. Legal hold overrides deletion. CCTV retention is separately verified, not set by this manual.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-C09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-A06$fecsop$,
  $fecsop$A06 Creative play face painting and small parts$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$A06$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-A06  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control creative materials, small parts, face painting and edible activity hazards.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Creative activity lead  |  Applies to: CB-DSM$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Select materials for the approved age range. Retain supplier identity, product instructions, batch and expiry where relevant. Separate small building parts, beads, magnets and button battery products from children who may mouth them; prohibit accessible loose magnets or batteries.
2. Inspect furniture, display fixing, gate latches and floor edges. Allocate one visible entrance and maintain staff sightlines. Set up seated activity zones so glue, paint, dough and blocks do not migrate into food or exit routes.
3. Give out a controlled quantity of tools and materials. Use child appropriate scissors and assessed water based products. Count tools back, remove broken pieces immediately and check the floor between sessions. Do not describe ordinary craft materials as edible.
4. For face painting, obtain guardian consent and use cosmetic products specifically intended for skin, with ingredient and expiry information. Ask about known sensitivity. Avoid broken or irritated skin and eye or mouth contact as directed by the product. Use hygienic applicators and fresh water between customers.
5. For digital art tables, secure cables, protect electrical connections from liquids and clean using the approved method. No child account creation, unrestricted browsing or automatic public posting of children’s images.
6. Treat edible art as food preparation under F01 to F05, even if no oven is used. Separate edible and nonedible equipment, confirm allergen controls and stop the edible activity if handwashing or safe ingredient storage is unavailable. Count children and verify guardian collection before ending the session.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop for unknown material composition, missing allergen information, uncontrolled small parts, unsafe gate access or inadequate staff coverage. Do not allow hot glue guns, blades, ovens or hot surfaces in a child’s reach without a separately assessed and approved activity.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-A06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 activity scope, materials inventory, cleaning log, consent and food records where applicable. The public CB offer includes blocks, dough, digital art and face painting; confirm which are actually present at each location [S07].
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-A06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-F01$fecsop$,
  $fecsop$F01 Food scope suppliers and personal hygiene$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F01$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-F01  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Control food scope, supplier acceptance, staff hygiene and cross-contamination.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to cafés kitchens parties edible art and cookery$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$Use a separate food release for each site. Classify the offer as sealed packaged resale, open ready to eat preparation, cooking or reheating, or children’s cookery. A license for one scope does not establish permission for another. The complete current MoPH food code and permit conditions must be checked by the food lead before operational approval [S08].
1. Appoint a trained PIC whenever food is handled. Confirm staff fitness and required local food handler documentation. Staff report vomiting, diarrhoea, infected wounds or relevant illness before starting; the PIC excludes or restricts duties and obtains appropriate clearance.
2. Provide a dedicated accessible handwash point with potable water, soap and hygienic drying. Wash before food handling and after toilets, cleaning, cash, raw food and contamination. Gloves do not replace handwashing; change them between incompatible tasks.
3. Use approved suppliers and keep delivery, batch, expiry and traceability records. Inspect transport hygiene, packaging, pests, damage and temperatures before accepting food. Reject untraceable, expired, damaged or out of limit deliveries; log the reason.
4. Keep raw foods separate from ready to eat products, with raw items below them in storage. Separate allergens and chemicals. Label opened containers and prepared items with identity, preparation or opening time, use by decision and responsible person. Use earliest expiry first.
5. Use standardized recipes and approved substitutions only. Retain ingredient labels for allergen checks. Do not assume a halal claim or imported product approval from a brand name; obtain relevant supplier and regulatory evidence.
6. Restrict children and unauthorized staff from production areas. Store knives and hot equipment safely. Agree catering delivery access and waste removal with the property; protect guest routes and maintain cold or hot chain during transfer.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$No open food handling without handwashing, safe water, traceability and a competent PIC. Use R07 and R09. A mall food court, external caterer or birthday cake supplier does not remove E3’s checks at receipt and service.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F01$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$Approved food scope, supplier register, staff fitness records, R07 cleaning, R09 batches and R10 hazard-control plan. Food PIC reviews evidence before release. Reference basis: MoPH food-service code [S08 S19].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-F02$fecsop$,
  $fecsop$F02 Food temperature control and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F02$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-F02  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Maintain validated food temperatures and documented corrective action throughout the process.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Qatar code benchmarks and proposed E3 monitoring$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$The October 2020 MoPH code copy [S19] informs these benchmarks. Confirm the current official edition and validate each menu before release. Monitoring frequencies are E3 controls unless specified otherwise. Use a calibrated clean food probe and record actual product readings, not just equipment displays.
Stage
E3 operating limit and monitoring
If the check fails
Chilled food
Receive and display below 4°C; E3 storage target 0 to 3°C unless the product requires colder. Check deliveries, opening, every 2 hours and close; displays after 30 minutes and hourly.
Reject delivery. Isolate stock; assess documented time and temperature. Unknown history means discard.
Frozen food
Receive and hold below minus 18°C; E3 target minus 20°C unless the product requires colder. Check deliveries and storage as above.
Reject thawed or abused stock. Transfer only under PIC control; do not refreeze without an approved process.
Cooking and reheating
E3 default core temperature at least 75°C for 30 seconds; use a validated recipe and check each batch at the coldest point. Reheat only once.
Continue heating if safe and recheck. Never serve an unverified batch; discard if safe recovery is not established.
Hot holding
Above 64°C; E3 target at least 65°C. Check at setup, after 30 minutes and hourly. Measure the coldest food, not only unit air.
Remove from service. Discard if below 64°C for over 2 hours or history is unknown; PIC controls any earlier recovery. Do not top up.
Cooling if authorized
Cool to 5°C or below within 2 hours; record start, interim and final core readings. Then maintain the approved chilled storage target.
Do not cool at sites without validated equipment. Discard failed or unrecorded batches unless a qualified lead approves a validated corrective process.
Cold chain failure: keep doors closed, record discovery time and temperatures, transfer to verified storage where possible and label HOLD. The PIC decides disposition from evidence. A normal fridge reading after power returns does not prove the food remained safe.
Probe verification: check against an appropriate reference such as a correctly prepared ice slurry; the food lead sets the instrument tolerance and calibration interval. Take the instrument out of use if outside its validated tolerance. Record calibration and any affected food decisions.
The October 2020 code has ambiguous cooling subparagraphs; this manual adopts its stricter 2 hour endpoint pending PIC confirmation. Do not substitute a foreign 6 hour rule. Validate capacity, portion size and cooling equipment. R09 records each batch and decision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$The PIC applies the stage-specific action above, records the affected batch and decision in R09, and escalates repeated failures to the food lead.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 temperature and disposition records; R10 validated process plan; probe verification and equipment service records. Reference basis: MoPH code copy [S19], subject to current-edition verification.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-F03$fecsop$,
  $fecsop$F03 Allergens service and suspected food illness$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F03$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-F03  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Prevent allergen exposure and respond to suspected food illness or allergic reactions.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC  |  Applies to: CB-DSM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Maintain an ingredient and allergen matrix for every recipe, bought in item, sauce, garnish and activity ingredient. Check manufacturer labels on each change or delivery substitution. Include allergens beyond any standard list when a guest identifies them.
2. Ask about allergies at booking and confirm at service. Pass the request to the PIC, who checks the written recipe and cross contact controls. Never guess, remove a visible ingredient as a cure, or promise “allergen free” without a validated basis.
3. Use clean dedicated equipment and protected ingredients for an approved allergy order. Prevent shared scoops, oil, cloths, gloves or work surfaces from transferring allergens. Identify the order and hand it directly to the correct guest or guardian.
4. If the kitchen cannot control the identified risk, explain that clearly before accepting the order or cookery participant. Offer only a genuinely suitable alternative confirmed from its ingredients and handling. Do not rely on a waiver to permit an unsafe food exposure.
5. Serve within the approved temperature and time controls. Protect displays and use utensils rather than bare hands for ready to eat food. Reject unapproved home prepared food for shared service; any approved outside cake needs traceability, ingredients and storage instructions.
6. For suspected serious allergic reaction call 999 and follow trained first aid and dispatcher instructions. For suspected food illness, stop the implicated product, preserve batch and supplier records and quarantine relevant food safely. Notify Operations and the food compliance lead for authority action and traceability investigation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop serving when ingredients are unknown, an allergy order is mixed up, food is contaminated or a temperature history is missing. Do not quietly replace the dish without recording the incident.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F03$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R09 allergen and batch records, R05 illness or reaction report, supplier traceability and product withdrawal record. Record affected sites and customers where lawful. Do not dispose of potential evidence until the food lead determines safe preservation and any authority needs.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-F04$fecsop$,
  $fecsop$F04 Children cookery class operation$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F04$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-F04  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Conduct approved children’s cookery sessions with safe food, tools and supervision.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Cookery lead and food PIC  |  Applies to: CB-DSM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Approve the recipe, age range, ingredient list, allergen matrix, equipment and lesson plan before advertising. Define a cold assembly or decorating class separately from a hot cooking class. No cooking activity is assumed to exist at a location simply because it serves food.
2. Before accepting participants, obtain guardian consent, contact and relevant allergy information. Set the class size from safe workstations, instructor sightlines, task hazards and escape space. Assign an instructor and a separate safety or entry support role where simultaneous tasks require it.
3. Clean and release the work area. Provide handwashing, child suitable utensils, stable work surfaces and protected ingredients. Keep craft paints, dough and cleaning products separate. Secure hair and loose clothing; supervise handwashing before food contact.
4. Demonstrate each task before issuing tools. Start with low risk preparation. E3 default: children do not handle raw meat, hot oil, boiling liquids, powered blades, gas controls or ovens. Any higher risk teaching requires a specific assessed and authorized program.
5. Adults control hot trays and cooking. Keep a physical hot zone outside child reach and routes. Check food temperatures and cool products to a safe handling temperature before returning them to children. Do not allow tasting of raw batter or uncooked flour mixtures.
6. Count tools back and verify all participants before collection. Label take home food with ingredients and allergens, preparation date and the validated storage and use instructions. Discard food handled unsafely and reset the workstation between classes.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Cancel or pause the class for an uncontrolled allergy, missing guardian arrangement, unsuitable staffing, lost tool, failed handwashing or inability to separate hot work. A small kiosk may offer only the low risk food scope that its facilities can safely support.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R03 cookery card, participant consent, R09 recipe and allergen release, temperature checks and R07 cleaning. A parent’s presence does not replace the instructor’s safety duty.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-F05$fecsop$,
  $fecsop$F05 Kitchen equipment cleaning and shutdown$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$F05$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$E3-CB-DSM-F05  |  Revision 1.0  |  Effective date per DC01$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Purpose$fecsop$, $fecsop$Operate and clean kitchen equipment safely and complete a controlled shutdown.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Scope and responsibilities$fecsop$, $fecsop$Owner: Food PIC and maintenance lead  |  Applies to: CB-DSM; approved food activities only$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Operating procedure$fecsop$, $fecsop$1. Before use inspect guards, power leads, switches, hot surfaces, drainage and required extraction. Check refrigerators, ice machines and beverage equipment for cleanliness and correct condition. Do not use equipment with a safety fault.
2. Operate cooking appliances only with the approved ventilation and fire protection arrangements. No LPG cylinders, portable burners or new heat producing equipment without the necessary property and authority approval. Never bypass a guard or use water on an electrical or cooking oil fire.
3. For slush, ice, coffee and similar machines, use potable water and approved ingredients. Record batch and expiry, follow manufacturer cleaning and disassembly intervals, and keep nozzles and food contact parts protected. Do not continually top up old product.
4. Separate cash handling and food handling. Use a controlled cleaning sequence: remove debris, wash, rinse where needed, sanitize using the approved product, contact time and concentration, then air dry. Follow a dishwasher’s validated temperature or chemical cycle where fitted.
5. For maintenance, stop food production in the affected zone, protect or remove food and apply C07. The food PIC checks for metal, glass, chemicals, pests and residue before food service restarts. Obtain specialist support for kitchen equipment where internal competence is absent.
6. At close, dispose of expired or unsafe food, label retained stock, record temperatures, clean surfaces and drains, remove waste and complete pest checks. Shut down heat and nonessential equipment through its procedure while preserving refrigeration and required safety systems.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 5, $fecsop$4 Corrective action and escalation$fecsop$, $fecsop$Stop cooking for failed extraction, uncontrolled grease, fire protection impairment, unsafe gas or electricity, sewage backup or pest contamination. Only trained authorized staff use the correct firefighting equipment when safe; evacuation takes priority.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 6, $fecsop$5 Records and verification$fecsop$, $fecsop$R07 cleaning and pest log, R09 food records, R04 maintenance and food restart authorization. Agree specialist service scope, preventive maintenance and contractor access in writing; Operations does not substitute informal cash payment for maintenance approvals.
Reference basis: E3 proposed operating control$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-F05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R01$fecsop$,
  $fecsop$R01 Daily opening and hourly record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R01$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R01  |  Copy for each site and operating day
Site CB-DSM ____  Date __________  Supervisor __________  Shift __________
First aid responder __________  Entrance controller __________  Relief __________
Preopening check
Pass Fail NA
Defect or evidence reference
Permissions inspection dates and previous handover reviewed
Post coverage and relief confirmed
Exits routes lights and communication ready
First aid and emergency information ready
Equipment checks and empty tests completed
Limits signs barriers and gates correct
Cleaning and dry safe surfaces confirmed
Food PIC release completed or food absent
POS receipts float and counting method ready
Defective areas isolated and removed from sale
Decision: OPEN / PART OPEN / CLOSED    Excluded areas __________________
Supervisor signature __________  Time __________  Defect record numbers __________
Time
Premises count / limit
Activity count / limit
Posts safe
Action and initials
Repeat hourly and after changes. Record actual inflatable pressure or weather values on the asset sheet when applicable. A failed critical check cannot be marked N/A. Attach operator sheets for every ride, vehicle, inflatable and game requiring preuse tests.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R01$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R02$fecsop$,
  $fecsop$R02 Closing and shift handover$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R02$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R02  |  Copy for each shift
Site CB-DSM ____  Date __________  Outgoing __________  Incoming __________
Closing check
Result
Exception and action
All guests cleared and children collected
Play levels rooms and quiet areas checked
Equipment stopped and secured in OEM sequence
Food temperatures stock and disposal recorded
Cleaning waste and pest check complete
Faults tagged and inaccessible
Cash POS card and tickets reconciled
Lost property logged and secured
Doors cameras alarms and required utilities checked$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R02$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Handover notes$fecsop$, $fecsop$Topic
Outstanding item and owner
Incidents and safeguarding
Bookings groups and allergies
Equipment and contractor visits
Staffing and relief
Stock and food
IT cash and other actions
Keys and controlled items transferred __________________________________
Final guest count ______  Closure time ______  Next shift restrictions __________
Outgoing signature __________  Incoming acceptance __________  Time __________
If there is no incoming shift, submit the record to the supervisor’s designated manager and secure the approved master copy. Do not close a defect because the venue is closed for the night.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R02$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R03$fecsop$,
  $fecsop$R03 Activity operating card and risk review$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R03$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R03  |  One approved card for every activity or distinct zone
Site CB-DSM ____  Activity __________  Asset and serial __________  Revision __________
Field
Validated entry and source document
OEM manual and inspection expiry
Approved age height weight and ability restrictions
Equipment participants and premises occupancy limits
Operating settings pressure speed or weather limits
Staff posts and minimum coverage including relief
PPE clothing footwear and loose item controls
Preuse inspection and empty test sequence
Loading briefing session and unloading sequence
Emergency stop isolation and rescue method
Cleaning inspection and maintenance intervals
Technical reviewer and Operations approval
Attach a marked plan showing gates, sightlines, escape, emergency controls and the guest flow. No universal staffing ratio is established by this form.
Hazard and persons exposed
Existing control
Further action and owner
Residual risk
Suggested assessment: likelihood 1 to 5 × severity 1 to 5. E3 management reviews 10 to 25 before release; 15 to 25 remains closed pending risk reduction. Any missing critical safeguard overrides the score. Risk scores do not prove engineering compliance.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R03$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R04$fecsop$,
  $fecsop$R04 Defect isolation and return to service$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R04$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R04  |  One record per defect
Site CB-DSM ____  Asset __________  Serial __________  Record number __________
Detected by __________  Date and time __________  Severity __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Fault and immediate control$fecsop$, $fecsop$Describe what was observed and operating conditions __________________________
___________________________________________________________________
Guest exposure or incident link __________  Photo or log reference __________
Activity stopped at __________  Barrier and tag __________  Sales blocked __________
Energy isolation by __________  Lock or permit reference __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Repair and verification$fecsop$, $fecsop$Maintenance owner __________  PR or work order __________  Due date __________
Repair and parts fitted __________________________________________________
___________________________________________________________________
Cause identified __________  Similar assets checked __________
Required test
Acceptance criterion
Actual result
Tester$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R04$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Reopening decision$fecsop$, $fecsop$Specialist inspection needed? YES / NO    Basis ______________________________
Technical clearance by __________  Date __________  Certificate __________
Guards tools work area and staff briefing checked by __________________________
Operations release by __________  Time __________  Restrictions _______________
Result: CLOSED / RELEASED WITH VALIDATED RESTRICTIONS / RELEASED
A signature without test evidence is not technical clearance. A restricted release cannot bypass a failed safety device or keep an unresolved critical hazard accessible.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R04$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R05$fecsop$,
  $fecsop$R05 Incident missing child and safeguarding record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R05$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R05  |  Restricted access
Site CB-DSM ____  Record number __________  Date and time __________
Type: INJURY / NEAR MISS / FOOD / MISSING CHILD / SAFEGUARDING / OTHER
Reporter __________  Supervisor __________  Activity or food batch __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Facts and immediate response$fecsop$, $fecsop$What happened and where ______________________________________________
___________________________________________________________________
Observed condition or exact words ________________________________________
___________________________________________________________________
First aid responder __________  Action within training _________________________
999 called at __________  Property security at __________  Guardian at __________
Emergency service reference __________  Guest or guardian contact ______________
Time
Action or search zone
Person
Outcome$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$Evidence and safe collection$fecsop$, $fecsop$Witness details held at __________  CCTV time range __________  Preservation by __________
Equipment isolation reference __________  Photos or batch evidence __________
Child release verification and authorized adult _______________________________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R05$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$Followup and closure$fecsop$, $fecsop$Operations notified __________  Compliance notification decision __________
Authority or insurer reference __________  Action owner and deadline __________
Root cause and prevention ______________________________________________
Closure reviewer __________  Date __________  Reopening record __________
Record observations separately from opinions. Do not copy medical or safeguarding detail into ordinary group chats. For an unresolved emergency, continue response rather than completing paperwork.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R05$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R06$fecsop$,
  $fecsop$R06 Cash reconciliation and service recovery$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R06$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R06  |  Cashier and supervisor record
Site CB-DSM ____  Date __________  Cashier __________  POS shift __________
Reconciliation item
QAR or count
Evidence reference
Opening cash float
Cash sales and other authorized cash movements
Cash refunds and documented cash drops
Expected closing cash
Actual closing cash
Variance actual minus expected
Card POS total versus terminal settlement
Online sales and admissions matched
Offline tickets issued used void and returned
Discounts refunds and complimentary admissions
Expected cash = float + cash receipts - cash refunds - recorded cash removals. Explain every other authorized movement. Do not include card receipts in expected physical cash.
Variance explanation __________  Finance escalation __________  Seal number __________
Cashier signature __________  Independent review __________  Time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R06$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Complaint or service recovery$fecsop$, $fecsop$Reference __________  Guest contact if needed __________  Date __________
Issue and facts ________________________________________________________
Resolution offered __________  Refund or concession __________
Authority and approval reference __________  Followup owner __________
Guest informed at __________  Root cause action __________  Closed by __________
Safety or safeguarding complaint linked to R05 __________. Do not offer a concession in exchange for a rating or review removal.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R06$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R07$fecsop$,
  $fecsop$R07 Cleaning inspection and corrective action$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R07$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R07  |  Working hygiene and safety record
Site CB-DSM ____  Date __________  Supervisor or PIC __________
Area or item
Product method and contact time
Due / done
Checked by
Product dilution or concentration verified __________  Test method __________
Contamination isolation reference __________  Reopened by and time __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R07$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Weekly safety and pest walk$fecsop$, $fecsop$Check
Finding and owner
Due date
Closed evidence
Structure barriers pads and floors
Exits signs fire access and first aid
Electrical guards charging and lighting
Hygiene water drains and pest signs
Food permits allergens and temperatures
Training staffing and overdue defects
Pest contractor reference __________  Chemical treatment restrictions __________
No spraying during occupied food or play sessions. Follow the authorized reentry and food protection instructions.
Inspector __________  Signature __________  Management review date __________
Critical finding: stop now, record R04 or R05 and escalate immediately. Assign every corrective action an owner and evidence requirement. A due date cannot justify continued unsafe operation.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R07$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R08$fecsop$,
  $fecsop$R08 Site validation and emergency information$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R08$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R08  |  Site authorization for CB-DSM
Site CB-DSM ____  Legal name __________  Address unit floor __________
Release evidence
Document reference
Verified by and date
Trading food and premises permissions where applicable
Approved occupancy plan and escape arrangements
Asset inventory manuals and specialist inspections
R03 cards and critical limit validation
Staffing sightlines relief and first aid coverage
Food scope and menu controls or recorded N/A
Fire maintenance property interfaces and insurance
CCTV privacy access and retention basis
Emergency and rescue demonstrations completed
Current site photographs and measured plan$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R08$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Emergency information to post at the site$fecsop$, $fecsop$Emergency services 999 [S18]    Property security __________    Duty supervisor __________
Site access and responder meeting point ___________________________________
Primary exit __________  Alternative exit __________  Assembly location __________
Assistance and refuge arrangement __________  First aid location __________
Electrical isolation __________  Fire controls held by __________  Backup contact __________
Attach the approved marked plan. Do not create an escape route from a photograph.
Activities excluded from release __________________________________________
Technical signoff __________  Food signoff __________  Operations __________
GM authorization __________  Effective date __________  Review date __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R08$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R09$fecsop$,
  $fecsop$R09 Food batch allergen and cookery record$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R09$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R09  |  Copy sheets as needed
Site CB-DSM ____  Date __________  PIC __________  Menu or class __________
Food or ingredient
Supplier batch expiry
Receipt temperature
Accept reject
Batch and step
Start time and temp
Check time and temp
Action and initials
Steps include cooking, reheating, cooling and holding. Copy for each batch and required check. Fridge or freezer unit __________  Opening ______  2 hourly ______  Close ______
Recipe or menu item
All ingredients and allergens
Cross contact controls
PIC release$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R09$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$Cookery or edible activity session$fecsop$, $fecsop$Recipe revision __________  Age group __________  Approved capacity __________
Instructor __________  Entry and safety support __________  Actual participants __________
Guardian consent and allergy check reference __________  Tool count out / in __________
Handwash and station release __________  Hot work adult __________
Take home label and use instructions __________  Children collected __________
Unsafe food or allergen incident reference __________  Disposition approved by __________
Record probe verification, recipe validation and any supplier substitution on attached sheets. Keep participant medical and contact details in the restricted register, not on a public counter.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R09$fecsop$;

INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  $fecsop$CB-DSM-R10$fecsop$,
  $fecsop$R10 Food hazard analysis and control plan$fecsop$,
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  $fecsop$R10$fecsop$,
  $fecsop$site-manuals/CB-DSM/E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$,
  $fecsop$application/vnd.openxmlformats-officedocument.wordprocessingml.document$fecsop$,
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = $fecsop$CB-DSM$fecsop$
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  department = EXCLUDED.department,
  scope = EXCLUDED.scope,
  status = EXCLUDED.status,
  mandatory_ack = EXCLUDED.mandatory_ack,
  effective_date = EXCLUDED.effective_date,
  current_version = EXCLUDED.current_version,
  kra_template_id = EXCLUDED.kra_template_id,
  sop_code = EXCLUDED.sop_code,
  file_path = EXCLUDED.file_path,
  file_name = EXCLUDED.file_name,
  file_mime = EXCLUDED.file_mime,
  location_id = EXCLUDED.location_id;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 1, NULL, $fecsop$R10  |  Complete for each approved menu or cookery process
Site CB-DSM ____  Menu or recipe __________  Revision ______  Food PIC __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 2, $fecsop$1 Process and intended use$fecsop$, $fecsop$Product and ingredients __________  Intended consumers __________  Allergens __________Process flow reference __________  Flow verified on site by __________  Date __________Storage and shelf life basis __________  Take-home instructions __________$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 3, $fecsop$2 Hazard assessment$fecsop$, $fecsop$PROCESS STEP
HAZARD AND CAUSE
CONTROL MEASURE
CCP DECISION AND BASIS
Assess biological, chemical, physical and allergen hazards. The qualified food lead determines whether each control is managed through prerequisite hygiene procedures or as a critical control point. Do not classify every temperature check automatically as a CCP.$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R10$fecsop$;

INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, 4, $fecsop$3 Control and verification$fecsop$, $fecsop$CONTROL ELEMENT
APPROVED PLAN
Critical limit and validation source
Monitoring what how when and responsible person
Immediate correction and affected product disposition
Root cause and preventive action
Verification method frequency and reviewer
Required monitoring and deviation records
Approved by Food Lead __________  Signature __________  Date __________Operator briefing completed __________  Review due __________
Revalidate following a menu, supplier, allergen, equipment, process, capacity or regulatory change. Link actual batch monitoring to R09. This worksheet supports a site-specific HACCP plan; it does not constitute approval of an unassessed process. Reference basis: MoPH HACCP approach [S08] and Codex hygiene framework [S13].$fecsop$
FROM public.sop_documents d
WHERE d.code = $fecsop$CB-DSM-R10$fecsop$;

INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, $fecsop$Imported from E3_CB-DSM_Site_SOP_Manual_V1.0.docx$fecsop$
FROM public.sop_documents d
WHERE d.code LIKE $fecsop$CB-DSM-%$fecsop$
  AND NOT EXISTS (
    SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id AND v.version = 1
  );
