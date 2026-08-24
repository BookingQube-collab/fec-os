import { PASSKEY_DISMISS_PREFIX, PASSKEY_HINT_KEY, PASSKEY_JUST_USED_KEY } from "./constants";

/** Device-local hint only — email and credential ids, never a password or token. */
export type PasskeyHint = {
  email: string;
  userId?: string;
  credentialIds?: string[];
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readPasskeyHint(): PasskeyHint | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PASSKEY_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PasskeyHint;
    if (!parsed || typeof parsed.email !== "string" || !parsed.email.includes("@")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePasskeyHint(hint: PasskeyHint): void {
  if (!canUseStorage()) return;
  const email = hint.email.trim().toLowerCase();
  if (!email.includes("@")) return;
  const next: PasskeyHint = {
    email,
    userId: hint.userId,
    credentialIds: hint.credentialIds?.filter(Boolean),
  };
  window.localStorage.setItem(PASSKEY_HINT_KEY, JSON.stringify(next));
}

export function rememberSignedInEmail(email: string, userId?: string): void {
  const prev = readPasskeyHint();
  writePasskeyHint({
    email,
    userId: userId ?? prev?.userId,
    credentialIds: prev?.credentialIds,
  });
}

export function rememberPasskeyCredential(email: string, userId: string, credentialId: string): void {
  const prev = readPasskeyHint();
  const ids = new Set(prev?.credentialIds ?? []);
  if (credentialId) ids.add(credentialId);
  writePasskeyHint({
    email,
    userId,
    credentialIds: [...ids],
  });
}

export function markPasskeyJustUsed(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PASSKEY_JUST_USED_KEY, "1");
  } catch {
    /* ignore quota */
  }
}

export function consumePasskeyJustUsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const used = window.sessionStorage.getItem(PASSKEY_JUST_USED_KEY) === "1";
    window.sessionStorage.removeItem(PASSKEY_JUST_USED_KEY);
    return used;
  } catch {
    return false;
  }
}

export function wasPasskeyPromptDismissed(userId: string): boolean {
  if (!canUseStorage()) return false;
  const raw = window.localStorage.getItem(`${PASSKEY_DISMISS_PREFIX}${userId}`);
  if (!raw) return false;
  const until = Number(raw);
  if (!Number.isFinite(until)) return false;
  if (Date.now() > until) {
    window.localStorage.removeItem(`${PASSKEY_DISMISS_PREFIX}${userId}`);
    return false;
  }
  return true;
}

export function dismissPasskeyPrompt(userId: string, days = 30): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    `${PASSKEY_DISMISS_PREFIX}${userId}`,
    String(Date.now() + days * 24 * 60 * 60 * 1000),
  );
}
