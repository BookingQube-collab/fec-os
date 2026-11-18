/**
 * Recent inbound IVR calls for DID +18704772102.
 */
import { createClient } from "@supabase/supabase-js";

const DID = process.env.CALL_CENTER_SETUP_DID?.trim() || "+18704772102";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 72 * 3600e3).toISOString();
  const { data: calls, error } = await sb
    .from("call_center_calls")
    .select(
      "id,status,from_e164,to_e164,ivr_digit,metadata,created_at,ended_at,hangup_reason,provider_call_id",
    )
    .eq("to_e164", DID)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  console.log("COUNT", calls?.length ?? 0);
  for (const c of calls || []) {
    const m = (c.metadata || {}) as Record<string, unknown>;
    console.log(
      JSON.stringify({
        id: String(c.id).slice(0, 8),
        status: c.status,
        digit: c.ivr_digit,
        from: c.from_e164,
        created: c.created_at,
        hangup: c.hangup_reason,
        ivrLanguage: m.ivrLanguage,
        ivrNodeId: m.ivrNodeId,
        ivrGreeting:
          typeof m.ivrGreeting === "string" ? String(m.ivrGreeting).slice(0, 100) : null,
        lastIvrDigitAttempt: m.lastIvrDigitAttempt,
        carrierInit: m.carrierInitActions,
        carrierAnswerFailed: m.carrierAnswerFailed,
        texml: m.texml,
        lastTexmlDigit: m.lastTexmlDigit,
      }),
    );
  }

  const focus = calls?.[0];
  if (focus?.id) {
    for (const table of ["call_center_call_events", "call_center_events"]) {
      const { data, error: evErr } = await sb
        .from(table)
        .select("*")
        .eq("call_id", focus.id)
        .order("created_at", { ascending: true })
        .limit(40);
      console.log(
        "EVENTS",
        table,
        evErr ? `err:${evErr.message}` : JSON.stringify(data, null, 2).slice(0, 4000),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
