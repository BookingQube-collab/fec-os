import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { apiGet, apiPost } from "@/lib/api-client";
import { rememberPasskeyCredential } from "./hint";

export { isSecureWebAuthnContext, isWebAuthnAvailable } from "./detect";

export function isWebAuthnUserCancel(error: unknown): boolean {
  const names = new Set<string>();
  let current: unknown = error;
  for (let i = 0; i < 4 && current && typeof current === "object"; i += 1) {
    if ("name" in current) names.add(String((current as { name: unknown }).name));
    if ("code" in current) names.add(String((current as { code: unknown }).code));
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return names.has("NotAllowedError") || names.has("AbortError");
}

type RegisterOptionsResponse = { options: PublicKeyCredentialCreationOptionsJSON };
type AuthenticateOptionsResponse = { options: PublicKeyCredentialRequestOptionsJSON };
type SessionTokens = { access_token: string; refresh_token: string };
type AuthenticateVerifyResponse = SessionTokens & {
  user_id: string;
  email: string;
  credential_id: string;
};
type RegisterVerifyResponse = { credential_id: string; user_id: string; email: string };
type StatusResponse = { registered: boolean; count: number };

export async function fetchPasskeyStatus(): Promise<StatusResponse> {
  return apiGet<StatusResponse>("/api/auth/webauthn/status");
}

export async function registerDevicePasskey(): Promise<RegisterVerifyResponse> {
  const { options } = await apiPost<RegisterOptionsResponse>("/api/auth/webauthn/register/options");
  let attestation: RegistrationResponseJSON;
  try {
    attestation = await startRegistration({ optionsJSON: options });
  } catch (error) {
    const canRetryWithoutPlatform =
      options.authenticatorSelection?.authenticatorAttachment === "platform" &&
      !isWebAuthnUserCancel(error);
    if (!canRetryWithoutPlatform) throw error;
    const fallback = { ...options, authenticatorSelection: { ...options.authenticatorSelection } };
    delete fallback.authenticatorSelection.authenticatorAttachment;
    attestation = await startRegistration({ optionsJSON: fallback });
  }
  const result = await apiPost<RegisterVerifyResponse>("/api/auth/webauthn/register/verify", {
    response: attestation,
  });
  rememberPasskeyCredential(result.email, result.user_id, result.credential_id);
  return result;
}

export async function authenticateWithPasskey(credentialIds?: string[]): Promise<AuthenticateVerifyResponse> {
  const { options } = await apiPost<AuthenticateOptionsResponse>(
    "/api/auth/webauthn/authenticate/options",
    credentialIds?.length ? { credentialIds } : {},
  );
  const assertion: AuthenticationResponseJSON = await startAuthentication({ optionsJSON: options });
  return apiPost<AuthenticateVerifyResponse>("/api/auth/webauthn/authenticate/verify", {
    response: assertion,
  });
}
