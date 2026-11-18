import "server-only";

const TELNYX_API = "https://api.telnyx.com/v2";

/**
 * Create or replace a Telnyx Integration Secret that holds the ElevenLabs API key.
 * FEC only stores the secret *identifier* (api_key_ref), never the raw key.
 */
export async function upsertTelnyxElevenLabsIntegrationSecret(input: {
  telnyxApiKey: string;
  elevenLabsApiKey: string;
  identifier: string;
}): Promise<{ identifier: string }> {
  const identifier = input.identifier.trim();
  const elevenLabsApiKey = input.elevenLabsApiKey.trim();
  const telnyxApiKey = input.telnyxApiKey.trim();
  if (!identifier) throw new Error("ElevenLabs Telnyx secret identifier is required.");
  if (!/^[a-zA-Z0-9_-]{2,120}$/.test(identifier)) {
    throw new Error(
      "ElevenLabs secret identifier must be 2–120 chars (letters, numbers, _ or -).",
    );
  }
  if (!elevenLabsApiKey) throw new Error("ElevenLabs API key is empty.");
  if (!telnyxApiKey) throw new Error("Telnyx API key is required.");

  const headers = {
    Authorization: `Bearer ${telnyxApiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const createRes = await fetch(`${TELNYX_API}/integration_secrets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      identifier,
      value: elevenLabsApiKey,
      type: "bearer",
    }),
    cache: "no-store",
  });

  if (createRes.ok) {
    return { identifier };
  }

  const createBody = await createRes.text().catch(() => "");
  const alreadyExists =
    createRes.status === 409 ||
    createRes.status === 422 ||
    /already exists|duplicate|taken/i.test(createBody);

  if (!alreadyExists) {
    throw new Error(
      `Telnyx Integration Secret create failed (HTTP ${createRes.status}): ${createBody.slice(0, 240) || "unknown error"}`,
    );
  }

  // Identifier exists — delete and recreate so the pasted key becomes current.
  const delRes = await fetch(
    `${TELNYX_API}/integration_secrets/${encodeURIComponent(identifier)}`,
    { method: "DELETE", headers, cache: "no-store" },
  );
  if (!delRes.ok && delRes.status !== 404) {
    const delBody = await delRes.text().catch(() => "");
    throw new Error(
      `Telnyx Integration Secret "${identifier}" already exists but could not be rotated (HTTP ${delRes.status}): ${delBody.slice(0, 200)}. Update it in Mission Control or pick a new identifier.`,
    );
  }

  const recreateRes = await fetch(`${TELNYX_API}/integration_secrets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      identifier,
      value: elevenLabsApiKey,
      type: "bearer",
    }),
    cache: "no-store",
  });
  if (!recreateRes.ok) {
    const recreateBody = await recreateRes.text().catch(() => "");
    throw new Error(
      `Telnyx Integration Secret recreate failed (HTTP ${recreateRes.status}): ${recreateBody.slice(0, 240) || "unknown error"}`,
    );
  }
  return { identifier };
}
