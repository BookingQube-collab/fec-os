/**
 * Apply the E3 Main IVR template (incl. Language digit 0 → Connect with agent)
 * to the live call_center_ivr_menus row used by +18704772102.
 *
 * Usage:
 *   npx --yes tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local \
 *     scripts/apply-e3-ivr-lang-agent.ts
 *
 * Does not print secrets. Does not commit.
 */
import { upsertQueue, listQueues, saveIvrFlow, listIvrMenus, listDids } from "../src/lib/call-center/db";
import { buildFecVenuesTemplate } from "../src/lib/call-center/ivr-flow";
import {
  CALL_CENTER_DEFAULT_IVR_MENU_ID,
  CALL_CENTER_VENUE_QUEUE_IDS,
} from "../src/lib/call-center/types";

const DID = process.env.CALL_CENTER_SETUP_DID?.trim() || "+18704772102";

const VENUE_QUEUE_DEFS = [
  { id: CALL_CENTER_VENUE_QUEUE_IDS.inflatapark, name: "InflataPark", sortOrder: 10 },
  { id: CALL_CENTER_VENUE_QUEUE_IDS.urbanArena, name: "Urban Arena", sortOrder: 11 },
  { id: CALL_CENTER_VENUE_QUEUE_IDS.kidsDriving, name: "Kids Driving School", sortOrder: 12 },
  { id: CALL_CENTER_VENUE_QUEUE_IDS.birthday, name: "Birthday enquiry", sortOrder: 13 },
  { id: CALL_CENTER_VENUE_QUEUE_IDS.general, name: "E3 General Support", sortOrder: 14 },
] as const;

async function main() {
  const existingQueues = await listQueues();
  const byName = new Map(existingQueues.map((q) => [q.name.toLowerCase(), q]));
  const resolved: Record<string, string> = {};

  for (const def of VENUE_QUEUE_DEFS) {
    const named = byName.get(def.name.toLowerCase());
    if (named) {
      resolved[def.id] = named.id;
      continue;
    }
    const created = await upsertQueue({
      id: def.id,
      name: def.name,
      strategy: "simultaneous",
      eventId: null,
      wrapUpSeconds: 30,
      maxWaitSeconds: 120,
      isActive: true,
      sortOrder: def.sortOrder,
    });
    resolved[def.id] = created.id;
    console.log(`Created queue: ${def.name}`);
  }

  const menus = await listIvrMenus();
  const dids = await listDids();
  const did = dids.find((d) => d.e164 === DID || d.e164.replace(/\s/g, "") === DID);
  const byDid = did?.ivrMenuId ? menus.find((m) => m.id === did.ivrMenuId) : null;
  const byNameMenu =
    menus.find((m) => /e3\s*main/i.test(m.name)) ??
    menus.find((m) => /main\s*menu/i.test(m.name)) ??
    menus.find((m) => m.id === CALL_CENTER_DEFAULT_IVR_MENU_ID) ??
    menus[0];

  const menu = byDid ?? byNameMenu;
  if (!menu) {
    console.error("No IVR menu found to update.");
    process.exit(1);
  }

  const flow = buildFecVenuesTemplate({
    inflatapark: resolved[CALL_CENTER_VENUE_QUEUE_IDS.inflatapark]!,
    urbanArena: resolved[CALL_CENTER_VENUE_QUEUE_IDS.urbanArena]!,
    kidsDriving: resolved[CALL_CENTER_VENUE_QUEUE_IDS.kidsDriving]!,
    birthday: resolved[CALL_CENTER_VENUE_QUEUE_IDS.birthday]!,
    general: resolved[CALL_CENTER_VENUE_QUEUE_IDS.general]!,
  });

  const lang = flow.nodes.find((n) => n.id === "node-menu-lang");
  const agent = flow.nodes.find((n) => n.id === "node-agent-lang");
  if (!lang?.data.digits?.some((d) => d.digit === "0") || agent?.type !== "agent") {
    console.error("Template missing Language digit 0 → agent node.");
    process.exit(1);
  }

  const greeting =
    flow.nodes.find((n) => n.type === "start")?.data.greetingEn ||
    flow.nodes.find((n) => n.type === "start")?.data.greetingText ||
    "Thank you for calling E3, Events and Entertainment Enterprises.";

  const saved = await saveIvrFlow({
    menuId: menu.id,
    name: "E3 Main menu",
    greetingText: greeting,
    fallbackQueueId:
      resolved[CALL_CENTER_VENUE_QUEUE_IDS.general] ??
      resolved[CALL_CENTER_VENUE_QUEUE_IDS.inflatapark] ??
      null,
    isActive: true,
    timeoutSeconds: 10,
    maxRetries: 2,
    flow,
  });

  const langOptions = saved.options.filter((o) => ["0", "1", "2"].includes(o.digit));
  console.log(
    JSON.stringify(
      {
        ok: true,
        menuId: saved.menu.id,
        menuName: saved.menu.name,
        did: DID,
        didLinked: Boolean(did && did.ivrMenuId === saved.menu.id),
        languageDigits: langOptions.map((o) => ({
          digit: o.digit,
          label: o.label,
          action: o.action,
          queueId: o.queueId,
        })),
        agentNodeQueueId: agent.data.queueId,
        optionCount: saved.options.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
