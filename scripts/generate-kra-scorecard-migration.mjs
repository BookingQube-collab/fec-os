import fs from "node:fs";
import XLSX from "xlsx";

const wb = XLSX.readFile("A:/FEC/KRA/FEC_Master_KRA_Scorecard.xlsx");

function cell(ws, row, col) {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const value = ws[addr]?.v;
  return value == null ? "" : String(value);
}

function q(value) {
  const text = String(value ?? "");
  if (text.includes("$kraq$")) throw new Error("delimiter collision");
  return `$kraq$${text}$kraq$`;
}

const sites = ["INF-CC", "KDS-CC", "UA-DM", "KDS-MINI-DM", "CAR-AP", "CB-VM", "CB-DSM"];
const lines = [];

lines.push("-- KRA scorecards from FEC_Master_KRA_Scorecard.xlsx (E3 site assessment v2, 28 Sep 2026).");
lines.push("-- Site tabs are the live master. Framework rows keep the historical cashier/attendant standard.");
lines.push("-- sop_reference stores workbook SOP codes only. Location SOP documents are not imported here.");
lines.push("");
lines.push(`CREATE TABLE IF NOT EXISTS public.kra_scorecard_templates (
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
);`);
lines.push(`CREATE TABLE IF NOT EXISTS public.kra_scorecard_items (
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
);`);
lines.push(`CREATE TABLE IF NOT EXISTS public.kra_scorecard_framework_items (
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
);`);
lines.push(`CREATE TABLE IF NOT EXISTS public.kra_scorecard_reviews (
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
);`);
lines.push(`CREATE TABLE IF NOT EXISTS public.kra_scorecard_lines (
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
);`);
lines.push(`CREATE INDEX IF NOT EXISTS idx_kra_scorecard_items_template ON public.kra_scorecard_items (template_id, item_no);
CREATE INDEX IF NOT EXISTS idx_kra_scorecard_reviews_staff ON public.kra_scorecard_reviews (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kra_scorecard_lines_review ON public.kra_scorecard_lines (review_id);

DROP TRIGGER IF EXISTS trg_kra_scorecard_templates_updated ON public.kra_scorecard_templates;
CREATE TRIGGER trg_kra_scorecard_templates_updated BEFORE UPDATE ON public.kra_scorecard_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_kra_scorecard_items_updated ON public.kra_scorecard_items;
CREATE TRIGGER trg_kra_scorecard_items_updated BEFORE UPDATE ON public.kra_scorecard_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_kra_scorecard_reviews_updated ON public.kra_scorecard_reviews;
CREATE TRIGGER trg_kra_scorecard_reviews_updated BEFORE UPDATE ON public.kra_scorecard_reviews FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_kra_scorecard_lines_updated ON public.kra_scorecard_lines;
CREATE TRIGGER trg_kra_scorecard_lines_updated BEFORE UPDATE ON public.kra_scorecard_lines FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();`);

const fw = wb.Sheets["KRA Framework"];
function insertFramework(role, sort, title, standard, mapping, points, how, evidence) {
  lines.push(`INSERT INTO public.kra_scorecard_framework_items (role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep)
VALUES (${[q(role), String(sort), q(title), q(standard), q(mapping), String(points || 0), q(how), q(evidence)].join(", ")})
ON CONFLICT (role_category, sort_order) DO UPDATE SET
  title = EXCLUDED.title,
  expected_standard = EXCLUDED.expected_standard,
  master_sheet_mapping = EXCLUDED.master_sheet_mapping,
  points = EXCLUDED.points,
  how_to_rate = EXCLUDED.how_to_rate,
  evidence_to_keep = EXCLUDED.evidence_to_keep;`);
}
for (let i = 0; i < 7; i += 1) {
  const row = 7 + i;
  insertFramework(
    "cashier",
    i + 1,
    cell(fw, row, 1),
    cell(fw, row, 2),
    cell(fw, row, 3),
    cell(fw, row, 4),
    cell(fw, row, 5),
    cell(fw, row, 6),
  );
}
for (let i = 0; i < 7; i += 1) {
  const row = 17 + i;
  insertFramework(
    "attendant",
    i + 1,
    cell(fw, row, 1),
    cell(fw, row, 2),
    cell(fw, row, 3),
    cell(fw, row, 4),
    cell(fw, row, 5),
    cell(fw, row, 6),
  );
}
insertFramework("dual_role", 1, "Dual-role rule", cell(fw, 26, 1), "", 0, "", "");

for (const [index, code] of sites.entries()) {
  const ws = wb.Sheets[code];
  const title = cell(ws, 1, 1);
  const parts = title.split("|").map((part) => part.trim());
  const brand = parts[1] || code;
  const place = parts[2] || "";
  const sop = (cell(ws, 2, 1).split("|")[1] || "SOP V1.1").trim();
  const usage = cell(ws, 32, 4) || cell(ws, 32, 1);
  lines.push(`INSERT INTO public.kra_scorecard_templates (code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order)
VALUES (${[q(code), q(brand), q(place), q(title), q(sop), q(cell(ws, 9, 1)), q(usage), String(index + 1)].join(", ")})
ON CONFLICT (code) DO UPDATE SET
  brand = EXCLUDED.brand,
  place_name = EXCLUDED.place_name,
  sheet_title = EXCLUDED.sheet_title,
  sop_label = EXCLUDED.sop_label,
  baseline_note = EXCLUDED.baseline_note,
  usage_note = EXCLUDED.usage_note,
  sort_order = EXCLUDED.sort_order;`);
  for (let row = 12; row <= 24; row += 1) {
    lines.push(`INSERT INTO public.kra_scorecard_items (template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor)
SELECT t.id, ${[
      Number(cell(ws, row, 1)),
      q(cell(ws, row, 2)),
      q(cell(ws, row, 3)),
      q(cell(ws, row, 4)),
      cell(ws, row, 5) || "0",
      cell(ws, row, 6) || "0",
      cell(ws, row, 7) || "0",
    ].join(", ")}
FROM public.kra_scorecard_templates t WHERE t.code = ${q(code)}
ON CONFLICT (template_id, item_no) DO UPDATE SET
  title = EXCLUDED.title,
  sop_reference = EXCLUDED.sop_reference,
  target_standard = EXCLUDED.target_standard,
  weight_cashier = EXCLUDED.weight_cashier,
  weight_attendant = EXCLUDED.weight_attendant,
  weight_supervisor = EXCLUDED.weight_supervisor;`);
  }
}

lines.push(`UPDATE public.kra_scorecard_templates t
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
`);

const out = `${lines.join("\n")}\n`;
const path = "A:/Live Projects/FEC/supabase/migrations/20260928140000_kra_scorecards.sql";
fs.writeFileSync(path, out);
console.log("wrote", path, "bytes", out.length);
