import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { toPublicCertificateVerification, type PublicCertificate } from "./engine";

export async function loadPublicCertificate(token: string): Promise<PublicCertificate | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await supabaseAdmin.rpc("training_verify_certificate", { _token: token });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return toPublicCertificateVerification({
    status: row.status,
    holder_name: row.holder_name,
    course_title: row.course_title,
    issued_at: row.issued_at,
    valid_until: row.valid_until,
  });
}
