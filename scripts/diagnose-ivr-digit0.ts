/**
 * Diagnose Language digit 0 → agent path for DID +18704772102.
 * Usage:
 *   npx --yes tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local \
 *     scripts/diagnose-ivr-digit0.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  listIvrMenus,
  listDids,
  listQueues,
  listQueueMembers,
} from "../src/lib/call-center/db";
import {
  followDigitEdge,
  findEntryInteractiveNode,
  findStartNode,
} from "../src/lib/call-center/ivr-flow";

const DID = process.env.CALL_CENTER_SETUP_DID?.trim() || "+18704772102";
const FROM = process.env.DIAG_FROM_E164?.trim() || "+97431117772";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase URL / service role key");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const menus = await listIvrMenus();
  const dids = await listDids();
  const did = dids.find((d) => d.e164 === DID || d.e164.replace(/\s/g, "") === DID);
  const menu =
    (did?.ivrMenuId ? menus.find((m) => m.id === did.ivrMenuId) : null) ||
    menus.find((m) => /e3\s*main/i.test(m.name)) ||
    menus[0];
  const flow = menu?.flowJson ?? null;
  const lang =
    flow?.nodes.find((n) => n.id === "node-menu-lang") ||
    flow?.nodes.find((n) => n.type === "menu" && /lang/i.test(n.data?.label || ""));
  const edgesFromLang = flow?.edges.filter((e) => e.source === lang?.id) ?? [];
  const digit0 = lang && flow ? followDigitEdge(flow, lang.id, "0") : null;

  console.log(
    JSON.stringify(
      {
        did: did?.e164 ?? null,
        didIvrMenuId: did?.ivrMenuId ?? null,
        menuId: menu?.id ?? null,
        menuName: menu?.name ?? null,
        langNodeId: lang?.id ?? null,
        langDigits: lang?.data?.digits ?? [],
        edgesFromLang: edgesFromLang.map((e) => ({
          id: e.id,
          handle: e.sourceHandle,
          label: e.label,
          target: e.target,
        })),
        digit0Target: digit0
          ? {
              id: digit0.id,
              type: digit0.type,
              queueId: digit0.data?.queueId ?? null,
              agentUserId: digit0.data?.agentUserId ?? null,
              label: digit0.data?.label ?? null,
            }
          : null,
        entry: flow ? findEntryInteractiveNode(flow)?.id : null,
        start: flow ? findStartNode(flow)?.id : null,
      },
      null,
      2,
    ),
  );

  const { data: calls, error } = await sb
    .from("call_center_calls")
    .select(
      "id, status, from_e164, to_e164, ivr_digit, ivr_menu_id, queue_id, agent_user_id, offered_at, metadata, created_at, ended_at, hangup_reason, provider_call_id, provider",
    )
    .or(`from_e164.eq.${FROM},and(to_e164.eq.${DID},created_at.gte.${new Date(Date.now() - 6 * 3600e3).toISOString()})`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("calls query error:", error.message);
  } else {
    console.log("RECENT_CALLS", JSON.stringify(calls, null, 2));
  }

  const focus = calls?.find((c) => c.from_e164 === FROM) ?? calls?.[0];
  if (focus?.id) {
    const { data: events, error: evErr } = await sb
      .from("call_center_call_events")
      .select("id, event_type, payload, created_at")
      .eq("call_id", focus.id)
      .order("created_at", { ascending: true })
      .limit(50);
    if (evErr) {
      // table may differ — try telnyx webhook log shape
      console.error("events query error:", evErr.message);
      const { data: alt } = await sb
        .from("call_center_events")
        .select("*")
        .eq("call_id", focus.id)
        .order("created_at", { ascending: true })
        .limit(50);
      console.log("ALT_EVENTS", JSON.stringify(alt, null, 2));
    } else {
      console.log("EVENTS_FOR", focus.id, JSON.stringify(events, null, 2));
    }
  }

  const queues = await listQueues();
  const interesting = queues.filter((q) => /e3|general|support/i.test(q.name));
  for (const q of interesting) {
    const members = await listQueueMembers(q.id);
    console.log(
      "QUEUE",
      JSON.stringify(
        {
          id: q.id,
          name: q.name,
          active: q.isActive,
          members: members.map((m) => ({
            userId: m.userId,
            active: m.isActive,
            priority: m.priority,
          })),
        },
        null,
        2,
      ),
    );
  }

  // Probe offer-like tables for the digit-0 routed call
  const offerCallId = "1eda5b04-f4f5-4d33-953e-0ee4dea2a765";
  for (const table of [
    "call_center_offers",
    "call_center_call_offers",
    "call_center_agent_offers",
  ]) {
    const { data, error } = await sb.from(table).select("*").eq("call_id", offerCallId).limit(20);
    console.log("OFFER_TABLE", table, error ? `err:${error.message}` : JSON.stringify(data));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
