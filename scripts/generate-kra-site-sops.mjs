/**
 * Reads A:\FEC\SOP site manuals and writes a migration that stores the real
 * procedure text on sop_documents / sop_sections, linked to KRA site templates.
 * The Word files themselves are uploaded separately to the sop-documents bucket.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = "A:\\FEC\\SOP";
const outFile = path.join(root, "supabase", "migrations", "20260928180000_kra_site_sops.sql");
const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const tag = "$fecsop$";

const manuals = [
  ["INF-CC", "E3_INF-CC_Site_SOP_Manual_V1.0.docx"],
  ["KDS-CC", "E3_KDS-CC_Site_SOP_Manual_V1.0.docx"],
  ["UA-DM", "E3_UA-DM_Site_SOP_Manual_V1.0.docx"],
  ["KDS-MINI-DM", "E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx"],
  ["CAR-AP", "E3_CAR-AP_Site_SOP_Manual_V1.0.docx"],
  ["CB-VM", "E3_CB-VM_Site_SOP_Manual_V1.0.docx"],
  ["CB-DSM", "E3_CB-DSM_Site_SOP_Manual_V1.0.docx"],
];

function paragraphs(docx) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fec-sop-"));
  execSync(`tar -xf "${docx}" -C "${tmp}"`, { stdio: "pipe" });
  const xml = fs.readFileSync(path.join(tmp, "word", "document.xml"), "utf8");
  fs.rmSync(tmp, { recursive: true, force: true });
  const rows = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let match;
  while ((match = re.exec(xml))) {
    const style = match[0].match(/<w:pStyle w:val="([^"]+)"/);
    const texts = [...match[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((part) => part[1]);
    const line = texts
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\u0000/g, "")
      .trim();
    if (line) rows.push({ style: style?.[1] ?? "", line });
  }
  return rows;
}

function quote(value) {
  if (value.includes(tag)) {
    throw new Error("SOP text contains the SQL dollar-quote tag");
  }
  return `${tag}${value}${tag}`;
}

function procedureCode(block) {
  const head = block.lines.slice(0, 4).map((row) => row.line).join("\n");
  const numbered = head.match(/E3-[A-Z0-9-]+-((?:C|A|F|R)\d{2})\b/);
  if (numbered) return numbered[1];
  const form = block.lines[0]?.line.match(/^((?:C|A|F|R)\d{2})\s*\|/);
  return form?.[1] ?? null;
}

function sectionsFrom(block) {
  const sections = [];
  let heading = null;
  let parts = [];
  function flush() {
    const content = parts.join("\n").trim();
    if (content) sections.push({ heading, content });
    heading = null;
    parts = [];
  }
  for (const row of block.lines) {
    if (row.style === "Heading2") {
      flush();
      heading = row.line;
    } else {
      parts.push(row.line);
    }
  }
  flush();
  return sections;
}

function extractManual(file) {
  const paras = paragraphs(file);
  const blocks = [];
  let current = null;
  for (const row of paras) {
    if (row.style === "Heading1") {
      if (current) blocks.push(current);
      current = { title: row.line, lines: [] };
    } else if (current) {
      current.lines.push(row);
    }
  }
  if (current) blocks.push(current);

  const front = [];
  const procedures = [];
  for (const block of blocks) {
    const code = procedureCode(block);
    const sections = sectionsFrom(block);
    if (!code) {
      if (sections.length) front.push({ title: block.title, sections });
      continue;
    }
    procedures.push({ code, title: block.title, sections });
  }
  return { front, procedures };
}

function sqlHeader() {
  return `-- Location SOP manuals from A:\\FEC\\SOP (E3 site manuals V1.0, issued 21 Sep 2026).
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
`;
}

function documentSql(site, sopCode, title, fileName) {
  const filePath = `site-manuals/${site}/${fileName}`;
  const docCode = `${site}-${sopCode}`;
  return `INSERT INTO public.sop_documents (
  code, title, category, department, scope, status, mandatory_ack, effective_date, current_version,
  kra_template_id, sop_code, file_path, file_name, file_mime, location_id
)
SELECT
  ${quote(docCode)},
  ${quote(title)},
  t.code,
  t.brand,
  t.code,
  'published',
  false,
  DATE '2026-09-21',
  1,
  t.id,
  ${quote(sopCode)},
  ${quote(filePath)},
  ${quote(fileName)},
  ${quote(mime)},
  t.location_id
FROM public.kra_scorecard_templates t
WHERE t.code = ${quote(site)}
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
`;
}

function sectionSql(site, sopCode, sortOrder, heading, content) {
  const docCode = `${site}-${sopCode}`;
  const headingSql = heading ? quote(heading) : "NULL";
  return `INSERT INTO public.sop_sections (document_id, version, sort_order, heading, content)
SELECT d.id, 1, ${sortOrder}, ${headingSql}, ${quote(content)}
FROM public.sop_documents d
WHERE d.code = ${quote(docCode)};
`;
}

const lines = [sqlHeader()];
const summary = [];

for (const [site, fileName] of manuals) {
  const full = path.join(sourceDir, fileName);
  if (!fs.existsSync(full)) throw new Error(`Missing SOP file ${full}`);
  const extracted = extractManual(full);
  const docs = [
    {
      code: "MANUAL",
      title: "Site SOP manual",
      sections: extracted.front.flatMap((block) =>
        block.sections.map((section) => ({
          heading: section.heading ?? block.title,
          content: section.content,
        })),
      ),
    },
    ...extracted.procedures.map((procedure) => ({
      code: procedure.code,
      title: `${procedure.code} ${procedure.title}`,
      sections: procedure.sections,
    })),
  ];
  lines.push(`DELETE FROM public.sop_sections s USING public.sop_documents d WHERE s.document_id = d.id AND d.code LIKE ${quote(`${site}-%`)};`);
  for (const doc of docs) {
    if (!doc.sections.length) continue;
    lines.push(documentSql(site, doc.code, doc.title, fileName));
    doc.sections.forEach((section, index) => {
      lines.push(sectionSql(site, doc.code, index + 1, section.heading, section.content));
    });
  }
  lines.push(`INSERT INTO public.sop_versions (document_id, version, change_summary)
SELECT d.id, 1, ${quote(`Imported from ${fileName}`)}
FROM public.sop_documents d
WHERE d.code LIKE ${quote(`${site}-%`)}
  AND NOT EXISTS (
    SELECT 1 FROM public.sop_versions v WHERE v.document_id = d.id AND v.version = 1
  );
`);
  summary.push({
    site,
    fileName,
    codes: docs.filter((doc) => doc.sections.length).map((doc) => doc.code),
  });
}

fs.writeFileSync(outFile, lines.join("\n"), "utf8");

const kraSql = fs.readFileSync(path.join(root, "supabase", "migrations", "20260928140000_kra_scorecards.sql"), "utf8");
const refs = [...kraSql.matchAll(/item_no, title, sop_reference[\s\S]*?\$kraq\$(\d+)\$kraq\$, \$kraq\$([^$]+)\$kraq\$, \$kraq\$([^$]+)\$kraq\$/g)];
const bySite = new Map();
const itemRe = /SELECT t\.id, (\d+), \$kraq\$[^$]*\$kraq\$, \$kraq\$([^$]+)\$kraq\$[\s\S]*?WHERE t\.code = \$kraq\$([^$]+)\$kraq\$/g;
let item;
const missing = [];
while ((item = itemRe.exec(kraSql))) {
  const reference = item[2];
  const site = item[3];
  const codes = new Set();
  for (const part of reference.split(/[;,]/)) {
    const trimmed = part.trim();
    const range = trimmed.match(/^([A-Z]+)(\d+)\s*[-–]\s*(?:[A-Z]+)?(\d+)$/);
    if (range) {
      const start = Number(range[2]);
      const end = Number(range[3]);
      const width = Math.max(range[2].length, range[3].length);
      for (let n = Math.min(start, end); n <= Math.max(start, end); n += 1) {
        codes.add(range[1] + String(n).padStart(width, "0"));
      }
    } else {
      for (const code of trimmed.matchAll(/\b([A-Z]{1,4}\d{2})\b/g)) codes.add(code[1]);
    }
  }
  const have = new Set(summary.find((row) => row.site === site)?.codes ?? []);
  for (const code of codes) {
    if (!have.has(code)) missing.push(`${site} ${code} (${reference})`);
  }
  bySite.set(site, (bySite.get(site) ?? 0) + 1);
}

console.log(`Wrote ${outFile} (${fs.statSync(outFile).size} bytes)`);
for (const row of summary) {
  console.log(row.site, row.codes.join(", "));
}
console.log("KRA refs with no procedure in the site manual:");
console.log([...new Set(missing)].join("\n") || "(none)");
console.log("unused ref matcher", refs.length);
