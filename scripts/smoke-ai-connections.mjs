/**
 * Local connectivity check. Reads keys from env only. Never prints secrets.
 * Usage: node --env-file=.env.local scripts/smoke-ai-connections.mjs
 */
const GEMINI = process.env.GEMINI_API_KEY;
const GROQ = process.env.GROQ_API_KEY;
const OPENROUTER = process.env.OPENROUTER_API_KEY;
const REFERER = process.env.AI_HTTP_REFERER || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function summarize(name, res, body) {
  const snippet = String(body ?? "")
    .replace(GEMINI ?? "", "[redacted]")
    .replace(GROQ ?? "", "[redacted]")
    .replace(OPENROUTER ?? "", "[redacted]")
    .slice(0, 160);
  console.log(`${name}: ${res.ok ? "ok" : "fail"} ${res.status}${res.ok ? "" : ` ${snippet}`}`);
}

async function tryCall(name, fn) {
  try {
    const res = await fn();
    summarize(name, res, await res.text());
    return res.ok;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "network error";
    console.log(`${name}: fail ${msg}`);
    return false;
  }
}

if (GEMINI) {
  const listed = await tryCall("gemini list", () =>
    fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "X-goog-api-key": GEMINI },
    }),
  );
  if (!listed) {
    await tryCall("gemini ping", () =>
      fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": GEMINI },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with OK" }] }] }),
      }),
    );
  }
} else console.log("gemini: skipped (no env)");

if (GROQ) {
  await tryCall("groq list", () =>
    fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${GROQ}` },
    }),
  );
} else console.log("groq: skipped (no env)");

if (OPENROUTER) {
  await tryCall("openrouter list", () =>
    fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${OPENROUTER}`,
        "HTTP-Referer": REFERER,
        "X-Title": "FEC-OS",
      },
    }),
  );
} else console.log("openrouter: skipped (no env)");
