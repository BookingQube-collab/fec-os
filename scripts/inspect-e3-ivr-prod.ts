/**
 * Inspect prod E3 IVR settings + language menu digit 2 path.
 * Usage:
 *   npx --yes tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local \
 *     scripts/inspect-e3-ivr-prod.ts
 */
import {
  loadSettingsRow,
  listIvrMenus,
  listDids,
} from "../src/lib/call-center/db";
import {
  followDigitEdge,
  findEntryInteractiveNode,
  findStartNode,
  nodeSpokenText,
  type IvrFlowJson,
} from "../src/lib/call-center/ivr-flow";
import { pickSpeakVoice } from "../src/lib/call-center/ivr-tts-voice";

const DID = process.env.CALL_CENTER_SETUP_DID?.trim() || "+18704772102";

async function main() {
  const settings = await loadSettingsRow();
  const dids = await listDids();
  const menus = await listIvrMenus();
  const did = dids.find((d) => d.e164 === DID || d.e164.replace(/\s/g, "") === DID);

  const summary = {
    inbound_mode: settings?.inbound_mode ?? null,
    tts_enabled: settings?.tts_enabled ?? null,
    tts_voice: settings?.tts_voice ?? null,
    tts_voice_ar: settings?.tts_voice_ar ?? null,
    elevenlabs_ref: settings?.telnyx_elevenlabs_api_key_ref ? "[set]" : "",
    ivr_enabled: settings?.ivr_enabled ?? null,
    bridge_en: settings?.bridge_prompt_audio_url_en || "",
    bridge_ar: settings?.bridge_prompt_audio_url_ar || "",
    did: did
      ? { e164: did.e164, ivrMenuId: did.ivrMenuId, isActive: did.isActive }
      : null,
  };
  console.log("SETTINGS", JSON.stringify(summary, null, 2));

  const menu =
    (did?.ivrMenuId ? menus.find((m) => m.id === did.ivrMenuId) : null) ||
    menus.find((m) => /e3\s*main/i.test(m.name)) ||
    menus[0];
  if (!menu) {
    console.log("NO_MENU");
    return;
  }
  const flow = menu.flowJson as IvrFlowJson | null;
  if (!flow) {
    console.log("NO_FLOW", menu.id, menu.name);
    return;
  }

  const entry = findEntryInteractiveNode(flow);
  const start = findStartNode(flow);
  const lang =
    flow.nodes.find((n) => n.id === "node-menu-lang") ||
    flow.nodes.find((n) => n.type === "menu" && /lang/i.test(n.data?.label || "")) ||
    entry;

  console.log(
    "MENU",
    JSON.stringify(
      {
        id: menu.id,
        name: menu.name,
        active: menu.isActive,
        entryId: entry?.id,
        startId: start?.id,
        langId: lang?.id,
        nodeCount: flow.nodes.length,
        edgeCount: flow.edges.length,
      },
      null,
      2,
    ),
  );

  if (lang) {
    const en = nodeSpokenText(lang, "en");
    const ar = nodeSpokenText(lang, "ar");
    console.log(
      "LANG_NODE",
      JSON.stringify(
        {
          id: lang.id,
          label: lang.data.label,
          digits: lang.data.digits,
          greetingText: lang.data.greetingText?.slice(0, 160),
          greetingEn: lang.data.greetingEn?.slice(0, 160),
          greetingAr: lang.data.greetingAr?.slice(0, 160),
          spokenEn: en.slice(0, 200),
          spokenAr: ar.slice(0, 200),
          audioUrl: lang.data.audioUrl,
          audioUrlEn: lang.data.audioUrlEn,
          audioUrlAr: lang.data.audioUrlAr,
          pickEn: pickSpeakVoice(en, settings?.tts_voice, settings?.tts_voice_ar),
          pickAr: pickSpeakVoice(ar, settings?.tts_voice, settings?.tts_voice_ar, {
            preferLang: "ar",
          }),
          pickMixedAsNow: pickSpeakVoice(en, settings?.tts_voice, settings?.tts_voice_ar),
        },
        null,
        2,
      ),
    );

    for (const dig of ["1", "2", "0"] as const) {
      const next = followDigitEdge(flow, lang.id, dig);
      if (!next) {
        console.log(`DIGIT_${dig}`, null);
        continue;
      }
      const spokenEn = nodeSpokenText(next, "en");
      const spokenAr = nodeSpokenText(next, "ar");
      console.log(
        `DIGIT_${dig}`,
        JSON.stringify(
          {
            id: next.id,
            type: next.type,
            label: next.data.label,
            greetingTextLen: (next.data.greetingText || "").length,
            greetingEnLen: (next.data.greetingEn || "").length,
            greetingArLen: (next.data.greetingAr || "").length,
            greetingAr: (next.data.greetingAr || "").slice(0, 180),
            spokenEn: spokenEn.slice(0, 180),
            spokenAr: spokenAr.slice(0, 180),
            audioUrlAr: next.data.audioUrlAr || next.data.audioUrl || "",
            pickAfterDigit2: pickSpeakVoice(spokenAr, settings?.tts_voice, settings?.tts_voice_ar, {
              preferLang: dig === "2" ? "ar" : "en",
            }),
          },
          null,
          2,
        ),
      );
    }
  }

  const edgesFromLang = flow.edges.filter((e) => e.source === lang?.id);
  console.log(
    "EDGES_FROM_LANG",
    JSON.stringify(
      edgesFromLang.map((e) => ({
        handle: e.sourceHandle,
        label: e.label,
        target: e.target,
      })),
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
