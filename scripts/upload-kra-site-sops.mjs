/**
 * Uploads the seven E3 site SOP manuals into the sop-documents bucket.
 * Paths match supabase/migrations/20260928180000_kra_site_sops.sql.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const sourceDir = "A:\\FEC\\SOP";
const manuals = [
  ["INF-CC", "E3_INF-CC_Site_SOP_Manual_V1.0.docx"],
  ["KDS-CC", "E3_KDS-CC_Site_SOP_Manual_V1.0.docx"],
  ["UA-DM", "E3_UA-DM_Site_SOP_Manual_V1.0.docx"],
  ["KDS-MINI-DM", "E3_KDS-MINI-DM_Site_SOP_Manual_V1.0.docx"],
  ["CAR-AP", "E3_CAR-AP_Site_SOP_Manual_V1.0.docx"],
  ["CB-VM", "E3_CB-VM_Site_SOP_Manual_V1.0.docx"],
  ["CB-DSM", "E3_CB-DSM_Site_SOP_Manual_V1.0.docx"],
];
const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

for (const [site, fileName] of manuals) {
  const full = path.join(sourceDir, fileName);
  const bytes = fs.readFileSync(full);
  const storagePath = `site-manuals/${site}/${fileName}`;
  const { error } = await admin.storage.from("sop-documents").upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) {
    console.error(storagePath, error.message);
    process.exit(1);
  }
  console.log("uploaded", storagePath, bytes.length);
}
