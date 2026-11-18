/**
 * Simulate TeXML gather responses for language menu + digit 2 (Arabic centers).
 * Usage:
 *   npx --yes tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local \
 *     scripts/probe-texml-digit2.ts
 */
import { loadSettingsRow, listIvrMenus, listDids } from "../src/lib/call-center/db";
import {
  E3_LANG_GREETING_AR,
  E3_LANG_GREETING_EN,
  refreshStaleE3EnglishPrompt,
} from "../src/lib/call-center/e3-ivr-prompt";
import {
  followDigitEdge,
  findEntryInteractiveNode,
  nodeSpokenText,
} from "../src/lib/call-center/ivr-flow";
import { texmlGatherMenu } from "../src/lib/call-center/texml";
import { DEFAULT_TTS_VOICE } from "../src/lib/call-center/ivr-tts-voice";

const DID = process.env.CALL_CENTER_SETUP_DID?.trim() || "+18704772102";

async function main() {
  const settings = await loadSettingsRow();
  const menus = await listIvrMenus();
  const dids = await listDids();
  const did = dids.find((d) => d.e164 === DID);
  const menu =
    (did?.ivrMenuId ? menus.find((m) => m.id === did.ivrMenuId) : null) ||
    menus.find((m) => /e3\s*main/i.test(m.name));
  if (!menu?.flowJson) throw new Error("No E3 menu");
  const flow = menu.flowJson;
  const entry = findEntryInteractiveNode(flow);
  if (!entry) throw new Error("No entry");

  const voice = settings?.tts_voice?.trim() || DEFAULT_TTS_VOICE;
  const voiceAr = settings?.tts_voice_ar?.trim() || "";
  const en = refreshStaleE3EnglishPrompt(nodeSpokenText(entry, "en"));
  const ar = nodeSpokenText(entry, "ar");

  const langXml = await texmlGatherMenu({
    actionUrl: "https://e3fec.vercel.app/api/public/call-center/texml/gather",
    timeoutRedirectUrl: "https://e3fec.vercel.app/api/public/call-center/texml",
    prompt: en || E3_LANG_GREETING_EN,
    promptAr: ar || E3_LANG_GREETING_AR,
    voice,
    voiceAr,
  });

  const centers = followDigitEdge(flow, entry.id, "2");
  if (!centers) throw new Error("No digit 2 edge");
  const centersAr = nodeSpokenText(centers, "ar");
  const digit2Xml = await texmlGatherMenu({
    actionUrl: "https://e3fec.vercel.app/api/public/call-center/texml/gather",
    timeoutRedirectUrl: "https://e3fec.vercel.app/api/public/call-center/texml",
    prompt: centersAr,
    voice,
    voiceAr,
    preferLang: "ar",
  });

  console.log(
    JSON.stringify(
      {
        inbound_mode: settings?.inbound_mode,
        tts_voice: voice,
        tts_voice_ar: voiceAr,
        langEn: en.slice(0, 100),
        langAr: ar.slice(0, 80),
        centersNode: centers.id,
        centersArLen: centersAr.length,
        langHasTwoSays: (langXml.match(/<Gather[^>]*>([\s\S]*)<\/Gather>/)?.[1].match(/<Say /g) || [])
          .length,
        langXmlSnippet: langXml.slice(0, 500),
        digit2Voice: digit2Xml.match(/voice="([^"]+)"/)?.[1],
        digit2HasArabic: /[\u0600-\u06FF]/.test(digit2Xml),
        digit2HasFatima: digit2Xml.includes("Fatima"),
        digit2HasHala: digit2Xml.includes("Hala"),
        digit2Snippet: digit2Xml.slice(0, 500),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
