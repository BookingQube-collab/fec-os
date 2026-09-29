import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type IdentityProfilePatch = {
  staffId: string;
  updatedBy: string | null;
  qidExpiry?: string | null;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  visaNumber?: string | null;
  visaExpiry?: string | null;
  contractEnd?: string | null;
  /** Fill staff.qid only when the column is still empty. */
  qidIfEmpty?: string | null;
};

function present(value: string | null | undefined): value is string {
  return Boolean(value && value.trim());
}

/** Write identity numbers and expiries onto the existing staff profile extension. */
export async function syncStaffIdentityProfile(input: IdentityProfilePatch): Promise<void> {
  const patch: Record<string, string | null> = {};
  if (present(input.qidExpiry)) patch.qid_expiry = input.qidExpiry;
  if (present(input.passportNumber)) patch.passport_number = input.passportNumber.trim();
  if (present(input.passportExpiry)) patch.passport_expiry = input.passportExpiry;
  if (present(input.visaNumber)) patch.visa_number = input.visaNumber.trim();
  if (present(input.visaExpiry)) patch.visa_expiry = input.visaExpiry;
  if (present(input.contractEnd)) patch.contract_end = input.contractEnd;

  if (Object.keys(patch).length) {
    const { error } = await supabaseAdmin.from("staff_profile_ext").upsert(
      {
        staff_id: input.staffId,
        ...patch,
        updated_by: input.updatedBy,
      },
      { onConflict: "staff_id" },
    );
    if (error) throw error;
  }

  if (present(input.qidIfEmpty)) {
    await supabaseAdmin
      .from("staff")
      .update({ qid: input.qidIfEmpty.trim() })
      .eq("id", input.staffId)
      .is("qid", null);
  }
}
