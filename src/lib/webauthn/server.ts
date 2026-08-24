import "server-only";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logger } from "@/core/logger";
import { WEBAUTHN_CHALLENGE_TTL_MS, WEBAUTHN_RP_NAME } from "./constants";

export type WebAuthnCredentialRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  device_name: string | null;
  aaguid: string | null;
};

export function isMissingWebAuthnRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /webauthn_(credentials|challenges)/i.test(error.message ?? "");
}

export function webAuthnRelyingParty(request: Request): { rpName: string; rpID: string; origin: string } {
  const url = new URL(request.url);
  const originHeader = request.headers.get("origin");
  const origin =
    originHeader && originHeader !== "null" ? originHeader : `${url.protocol}//${url.host}`;
  let rpID = url.hostname;
  try {
    rpID = new URL(origin).hostname;
  } catch {
    /* keep request hostname */
  }
  return { rpName: WEBAUTHN_RP_NAME, rpID, origin };
}

async function purgeExpiredChallenges(): Promise<void> {
  await supabaseAdmin.from("webauthn_challenges").delete().lt("expires_at", new Date().toISOString());
}

async function storeChallenge(
  type: "registration" | "authentication",
  challenge: string,
  userId?: string,
): Promise<void> {
  await purgeExpiredChallenges();
  const { error } = await supabaseAdmin.from("webauthn_challenges").insert({
    challenge,
    type,
    user_id: userId ?? null,
    expires_at: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS).toISOString(),
  });
  if (error) {
    if (isMissingWebAuthnRelation(error)) {
      throw new Error("Passkeys are not enabled on this server yet.");
    }
    throw new Error(error.message);
  }
}

async function consumeChallenge(
  challenge: string,
  type: "registration" | "authentication",
): Promise<{ user_id: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("webauthn_challenges")
    .select("id, user_id, expires_at")
    .eq("challenge", challenge)
    .eq("type", type)
    .maybeSingle();

  if (error) {
    if (isMissingWebAuthnRelation(error)) {
      throw new Error("Passkeys are not enabled on this server yet.");
    }
    throw new Error(error.message);
  }
  if (!data) return null;

  await supabaseAdmin.from("webauthn_challenges").delete().eq("id", data.id);
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return null;
  return { user_id: (data.user_id as string | null) ?? null };
}

function asTransports(value: string[] | null | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!value?.length) return undefined;
  return value as AuthenticatorTransportFuture[];
}

export async function listUserCredentials(userId: string): Promise<WebAuthnCredentialRow[]> {
  const { data, error } = await supabaseAdmin
    .from("webauthn_credentials")
    .select("id, user_id, credential_id, public_key, counter, transports, device_name, aaguid")
    .eq("user_id", userId);

  if (error) {
    if (isMissingWebAuthnRelation(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as WebAuthnCredentialRow[];
}

export async function findCredentialById(credentialId: string): Promise<WebAuthnCredentialRow | null> {
  const { data, error } = await supabaseAdmin
    .from("webauthn_credentials")
    .select("id, user_id, credential_id, public_key, counter, transports, device_name, aaguid")
    .eq("credential_id", credentialId)
    .maybeSingle();

  if (error) {
    if (isMissingWebAuthnRelation(error)) {
      throw new Error("Passkeys are not enabled on this server yet.");
    }
    throw new Error(error.message);
  }
  return (data as WebAuthnCredentialRow | null) ?? null;
}

export async function createRegistrationOptions(input: {
  request: Request;
  userId: string;
  email: string;
  displayName?: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const rp = webAuthnRelyingParty(input.request);
  const existing = await listUserCredentials(input.userId);
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: input.email,
    userDisplayName: input.displayName || input.email,
    userID: new TextEncoder().encode(input.userId),
    attestationType: "none",
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: asTransports(row.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });
  await storeChallenge("registration", options.challenge, input.userId);
  return options;
}

export async function verifyAndStoreRegistration(input: {
  request: Request;
  userId: string;
  email: string;
  response: RegistrationResponseJSON;
  deviceName?: string;
}): Promise<{ credential_id: string }> {
  const rp = webAuthnRelyingParty(input.request);
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: true,
    expectedChallenge: async (challenge) => {
      const row = await consumeChallenge(challenge, "registration");
      return Boolean(row && (!row.user_id || row.user_id === input.userId));
    },
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey registration could not be verified.");
  }

  const { credential, aaguid } = verification.registrationInfo;
  const { error } = await supabaseAdmin.from("webauthn_credentials").insert({
    user_id: input.userId,
    credential_id: credential.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    device_name: input.deviceName ?? null,
    aaguid: aaguid || null,
  });

  if (error) {
    if (isMissingWebAuthnRelation(error)) {
      throw new Error("Passkeys are not enabled on this server yet.");
    }
    if (error.code === "23505") {
      throw new Error("This device already has a passkey for your account.");
    }
    throw new Error(error.message);
  }

  return { credential_id: credential.id };
}

export async function createAuthenticationOptions(input: {
  request: Request;
  credentialIds?: string[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const rp = webAuthnRelyingParty(input.request);
  const allowCredentials = (input.credentialIds ?? [])
    .filter((id) => typeof id === "string" && id.length > 8 && id.length < 512)
    .map((id) => ({ id }));

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "preferred",
    allowCredentials: allowCredentials.length ? allowCredentials : undefined,
  });
  await storeChallenge("authentication", options.challenge);
  return options;
}

export async function verifyAuthenticationAndMintSession(input: {
  request: Request;
  response: AuthenticationResponseJSON;
}): Promise<{ access_token: string; refresh_token: string; user_id: string; email: string; credential_id: string }> {
  const stored = await findCredentialById(input.response.id);
  if (!stored) {
    throw new Error("No passkey on this device yet. Sign in with your password, then save one.");
  }

  const rp = webAuthnRelyingParty(input.request);
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: true,
    credential: {
      id: stored.credential_id,
      publicKey: isoBase64URL.toBuffer(stored.public_key),
      counter: Number(stored.counter),
      transports: asTransports(stored.transports),
    },
    expectedChallenge: async (challenge) => Boolean(await consumeChallenge(challenge, "authentication")),
  });

  if (!verification.verified) {
    throw new Error("Device sign-in could not be verified.");
  }

  const { error: updateError } = await supabaseAdmin
    .from("webauthn_credentials")
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", stored.id);

  if (updateError) {
    logger.warn("auth", "Failed to update WebAuthn counter", updateError);
  }

  const session = await mintSessionForUser(stored.user_id);
  return {
    ...session,
    user_id: stored.user_id,
    credential_id: stored.credential_id,
  };
}

export async function mintSessionForUser(
  userId: string,
): Promise<{ access_token: string; refresh_token: string; email: string }> {
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData.user?.email;
  if (userError || !email) {
    throw new Error("Account for this passkey is no longer available.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = data.properties?.hashed_token;
  if (error || !tokenHash) {
    logger.error("auth", "Failed to generate passkey session link", error);
    throw new Error("Could not start a session from this passkey.");
  }

  const { data: otp, error: otpError } = await supabaseAdmin.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (otpError || !otp.session?.access_token || !otp.session.refresh_token) {
    logger.error("auth", "Failed to verify passkey session token", otpError);
    throw new Error("Could not start a session from this passkey.");
  }

  return {
    access_token: otp.session.access_token,
    refresh_token: otp.session.refresh_token,
    email,
  };
}

export function deviceNameFromRequest(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  if (/iPhone|iPad|Macintosh/i.test(ua)) return "Apple device";
  if (/Windows/i.test(ua)) return "Windows Hello";
  if (/Android/i.test(ua)) return "Android device";
  return "This device";
}
