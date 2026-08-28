/** Lightweight WebAuthn capability checks — no @simplewebauthn/browser. */
export function isSecureWebAuthnContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

export function isWebAuthnAvailable(): boolean {
  return (
    isSecureWebAuthnContext() &&
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function"
  );
}
