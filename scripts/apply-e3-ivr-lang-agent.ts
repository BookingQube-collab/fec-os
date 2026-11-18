/**
 * Apply the E3 Main IVR template (incl. Language digit 0 → Connect with agent)
 * to the live call_center_ivr_menus row used by +18704772102, and ensure at least
 * one identifiable ops agent is a member of E3 General Support so press-0 can ring.
 *
 * Usage:
 *   npx --yes tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local \
 *     scripts/apply-e3-ivr-lang-agent.ts
 *
 * Does not print secrets. Does not commit.
 */
import {
  upsertQueue,
  listQueues,
  saveIvrFlow,
  listIvrMenus,
  listDids,
  listQueueMembers,
  upsertQueueMember,
  listAgentStatuses,
  loadSettingsRow,
  saveSettingsRow,
} from "../src/lib/call-center/db";
import { buildFecVenuesTemplate, followDigitEdge, type IvrFlowJson } from "../src/lib/call-center/ivr-flow";
import { isIvrOssMediaPath } from "../src/lib/call-center/ivr-oss-prompts";
import {
  CALL_CENTER_DEFAULT_IVR_MENU_ID,
  CALL_CENTER_VENUE_QUEUE_IDS,
} from "../src/lib/call-center/types";

/** Strip Piper /ivr/ Play URLs so TeXML/Call Control use TTS (never silent Play). */
function stripOssPlayUrls(flow: IvrFlowJson): { flow: IvrFlowJson; clearedNodes: number } {
  let clearedNodes = 0;
  const nodes = flow.nodes.map((n) => {
    const d = n.data;
    const keys = ["audioUrl", "audioUrlEn", "audioUrlAr"] as const;
    let changed = false;
    const next = { ...d };
    for (const k of keys) {
      const v = typeof next[k] === "string" ? next[k]!.trim() : "";
      if (v && isIvrOssMediaPath(v)) {
        next[k] = undefined;
        changed = true;
      }
    }
    if (changed) clearedNodes += 1;
    return changed ? { ...n, data: next } : n;
  });
  return { flow: { ...flow, nodes }, clearedNodes };
}

const DID = process.env.CALL_CENTER_SETUP_DID?.trim() || "+18704772102";
/** Prefer joining this agent to E3 General Support when identifiable. */
const PREFERRED_AGENT_NAME = process.env.CALL_CENTER_OPS_AGENT_NAME?.trim() || "Rajan Pathak";

const VENUE_QUEUE_DEFS = [
  { id: CALL_CENTER_VENUE_QUEUE_IDS.inflatapark, name: "InflataPark", sortOrder: 10 },
  { id: CALL_CENTER_VENUE_QUEUE_IDS.urbanArena, name: "Urban Arena", sortOrder: 11 },
  { id: CALL_CENTER_VENUE_QUEUE_IDS.kidsDriving, name: "Kids Driving School", sortOrder: 12 },
  { id: CALL_CENTER_VENUE_QUEUE_IDS.birthday, name: "Birthday enquiry", sortOrder: 13 },
  { id: CALL_CENTER_VENUE_QUEUE_IDS.general, name: "E3 General Support", sortOrder: 14 },
] as const;

function nameMatchesPreferred(displayName: string, preferred: string): boolean {
  const a = displayName.trim().toLowerCase();
  const b = preferred.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const parts = b.split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((p) => a.includes(p));
}

async function ensureGeneralQueueMembership(generalQueueId: string) {
  const [members, agents] = await Promise.all([listQueueMembers(generalQueueId), listAgentStatuses()]);
  const activeMemberIds = new Set(members.filter((m) => m.isActive).map((m) => m.userId));

  const preferred =
    agents.find((a) => nameMatchesPreferred(a.displayName, PREFERRED_AGENT_NAME)) ??
    agents.find((a) => nameMatchesPreferred(a.displayNameOverride, PREFERRED_AGENT_NAME)) ??
    null;

  const candidates = preferred
    ? [preferred]
    : agents.filter((a) => a.isActive !== false).slice(0, 3);

  const joined: Array<{ userId: string; displayName: string; already: boolean }> = [];

  for (const agent of candidates) {
    const already = activeMemberIds.has(agent.userId);
    if (!already) {
      await upsertQueueMember({
        queueId: generalQueueId,
        userId: agent.userId,
        priority: preferred && agent.userId === preferred.userId ? 1 : 10,
        isActive: true,
        skills: agent.skills ?? [],
      });
    }
    joined.push({
      userId: agent.userId,
      displayName: agent.displayName || agent.displayNameOverride || agent.userId.slice(0, 8),
      already,
    });
  }

  return {
    preferredName: PREFERRED_AGENT_NAME,
    preferredFound: Boolean(preferred),
    joined,
    activeMemberCount: activeMemberIds.size + joined.filter((j) => !j.already).length,
  };
}

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

  const generalQueueId = resolved[CALL_CENTER_VENUE_QUEUE_IDS.general]!;
  const built = buildFecVenuesTemplate({
    inflatapark: resolved[CALL_CENTER_VENUE_QUEUE_IDS.inflatapark]!,
    urbanArena: resolved[CALL_CENTER_VENUE_QUEUE_IDS.urbanArena]!,
    kidsDriving: resolved[CALL_CENTER_VENUE_QUEUE_IDS.kidsDriving]!,
    birthday: resolved[CALL_CENTER_VENUE_QUEUE_IDS.birthday]!,
    general: generalQueueId,
  });
  const { flow, clearedNodes } = stripOssPlayUrls(built);

  // Clear bridge Piper defaults so disclosure uses TTS until OSS Play is re-enabled.
  const settings = await loadSettingsRow();
  let bridgeCleared = false;
  if (settings) {
    const en = settings.bridge_prompt_audio_url_en?.trim() ?? "";
    const ar = settings.bridge_prompt_audio_url_ar?.trim() ?? "";
    if (isIvrOssMediaPath(en) || isIvrOssMediaPath(ar)) {
      await saveSettingsRow(
        {
          ...settings,
          bridge_prompt_audio_url_en: isIvrOssMediaPath(en) ? "" : en,
          bridge_prompt_audio_url_ar: isIvrOssMediaPath(ar) ? "" : ar,
        },
        "apply-e3-ivr-lang-agent",
      );
      bridgeCleared = true;
    }
  }

  const lang = flow.nodes.find((n) => n.id === "node-menu-lang");
  const agent = flow.nodes.find((n) => n.id === "node-agent-lang");
  const langAgentEdge = flow.edges.find(
    (e) => e.id === "e-lang-agent" || (e.source === "node-menu-lang" && e.sourceHandle === "0"),
  );
  const followed = lang ? followDigitEdge(flow, lang.id, "0") : null;

  if (
    !lang?.data.digits?.some((d) => d.digit === "0") ||
    agent?.type !== "agent" ||
    !langAgentEdge ||
    followed?.id !== agent.id
  ) {
    console.error("Template missing Language digit 0 → Connect with agent edge.");
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
    fallbackQueueId: generalQueueId,
    isActive: true,
    timeoutSeconds: 10,
    maxRetries: 2,
    flow,
  });

  // Re-read persisted graph: digit 0 must still resolve to the agent node.
  const persisted = saved.menu.flowJson;
  const persistedTarget =
    persisted && followDigitEdge(persisted, "node-menu-lang", "0");
  if (!persistedTarget || persistedTarget.id !== "node-agent-lang") {
    console.error("Persist check failed: Language digit 0 edge missing after save.");
    process.exit(1);
  }

  const membership = await ensureGeneralQueueMembership(generalQueueId);

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
          targetNodeId: o.targetNodeId,
        })),
        langDigit0Edge: {
          edgeId: langAgentEdge.id,
          target: persistedTarget.id,
          queueId: agent.data.queueId,
        },
        agentNodeQueueId: agent.data.queueId,
        optionCount: saved.options.length,
        generalQueueMembership: membership,
        ossPlayUrlsClearedFromNodes: clearedNodes,
        bridgeOssUrlsCleared: bridgeCleared,
        audioMode: "tts",
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
