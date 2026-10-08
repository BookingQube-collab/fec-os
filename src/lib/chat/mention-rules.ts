/**
 * Composer @mention selection. Postgres still stores chat_mentions and the
 * server drops anyone who is not an active member. This module only decides
 * which ids the composer is allowed to send.
 */
export const CHAT_COMPOSER_MENTION_CAP = 10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ComposerMention = {
  userId: string;
  label: string;
};

export type ChatMentionCandidate = {
  userId: string;
  label: string;
  employeeCode: string | null;
};

export type MentionSendDecision = { ok: true; ids: string[] } | { ok: false; reason: "limit" };

type MentionMember = {
  userId: string;
  fullName: string | null;
  employeeCode: string | null;
};

/** Active members other than the sender, with a plain display label. */
export function chatMentionCandidates(members: readonly MentionMember[], senderId: string | null): ChatMentionCandidate[] {
  const sender = senderId?.toLowerCase() ?? "";
  const seen = new Set<string>();
  const out: ChatMentionCandidate[] = [];
  for (const member of members) {
    if (!UUID_RE.test(member.userId)) continue;
    const key = member.userId.toLowerCase();
    if (key === sender || seen.has(key)) continue;
    const label = mentionLabel(member.fullName, member.employeeCode);
    if (!label) continue;
    seen.add(key);
    out.push({
      userId: member.userId,
      label,
      employeeCode: member.employeeCode?.trim() || null,
    });
  }
  return out;
}

function mentionLabel(fullName: string | null, employeeCode: string | null): string | null {
  const name = fullName?.trim() || employeeCode?.trim() || "";
  if (!name || /[\r\n@]/.test(name)) return null;
  return name;
}

/** The @query touching the caret. Null when the caret is not in a fresh @token. */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const bounded = Math.max(0, Math.min(Number.isFinite(caret) ? caret : 0, text.length));
  const before = text.slice(0, bounded);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (!match) return null;
  const query = match[1] ?? "";
  const start = bounded - query.length - 1;
  if (start < 0 || before[start] !== "@") return null;
  return { start, query };
}

export function filterMentionCandidates<T extends { label: string; employeeCode?: string | null }>(
  candidates: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...candidates];
  return candidates.filter((item) => {
    if (item.label.toLocaleLowerCase().includes(needle)) return true;
    return (item.employeeCode ?? "").toLocaleLowerCase().includes(needle);
  });
}

export function applyMentionChoice(input: {
  text: string;
  caret: number;
  label: string;
  userId: string;
  mentions: readonly ComposerMention[];
}): { ok: true; text: string; caret: number; mentions: ComposerMention[] } | { ok: false; reason: "limit" | "closed" } {
  const active = activeMentionQuery(input.text, input.caret);
  const label = input.label.trim();
  if (!active || !UUID_RE.test(input.userId) || !label || /[\r\n@]/.test(label)) {
    return { ok: false, reason: "closed" };
  }
  const live = pruneComposerMentions(input.text, input.mentions);
  const key = input.userId.toLowerCase();
  const already = live.some((mention) => mention.userId.toLowerCase() === key);
  if (!already && live.length >= CHAT_COMPOSER_MENTION_CAP) return { ok: false, reason: "limit" };
  const insertion = `@${label} `;
  const text = input.text.slice(0, active.start) + insertion + input.text.slice(input.caret);
  const caret = active.start + insertion.length;
  const mentions = pruneComposerMentions(text, [
    ...live.filter((mention) => mention.userId.toLowerCase() !== key),
    { userId: input.userId, label },
  ]);
  return { ok: true, text, caret, mentions };
}

/** Drops a picked member once `@Label` is no longer a whole token in the draft. */
export function pruneComposerMentions(text: string, mentions: readonly ComposerMention[]): ComposerMention[] {
  const seen = new Set<string>();
  const out: ComposerMention[] = [];
  for (const mention of mentions) {
    if (!UUID_RE.test(mention.userId)) continue;
    const label = mention.label.trim();
    if (!label || !mentionTokenPresent(text, label)) continue;
    const key = mention.userId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ userId: mention.userId, label });
  }
  return out;
}

/**
 * Ids for this send. Requested ids that were not picked are ignored.
 * More than the composer cap is rejected instead of truncated.
 */
export function mentionIdsForSend(input: {
  text: string;
  mentions: readonly ComposerMention[];
  requested: readonly string[];
}): MentionSendDecision {
  const picked = pruneComposerMentions(input.text, input.mentions);
  if (picked.length > CHAT_COMPOSER_MENTION_CAP) return { ok: false, reason: "limit" };
  const allowed = new Map(picked.map((mention) => [mention.userId.toLowerCase(), mention.userId]));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of input.requested) {
    if (!UUID_RE.test(id)) continue;
    const key = id.toLowerCase();
    const stored = allowed.get(key);
    if (!stored || seen.has(key)) continue;
    seen.add(key);
    ids.push(stored);
  }
  return { ok: true, ids };
}

/** Session draft and outbox values. More than the cap is dropped entirely. */
export function composerMentionIdsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !UUID_RE.test(item)) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(item);
    if (ids.length > CHAT_COMPOSER_MENTION_CAP) return [];
  }
  return ids;
}

export function composerMentionsFromUnknown(value: unknown): ComposerMention[] {
  if (!Array.isArray(value)) return [];
  const out: ComposerMention[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { userId?: unknown; label?: unknown };
    if (typeof row.userId !== "string" || typeof row.label !== "string") continue;
    const label = row.label.trim();
    if (!UUID_RE.test(row.userId) || !label || /[\r\n@]/.test(label)) continue;
    const key = row.userId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ userId: row.userId, label });
    if (out.length > CHAT_COMPOSER_MENTION_CAP) return [];
  }
  return out;
}

function mentionTokenPresent(text: string, label: string): boolean {
  const token = `@${label}`;
  let from = 0;
  while (from <= text.length - token.length) {
    const index = text.indexOf(token, from);
    if (index < 0) return false;
    const before = index === 0 ? "" : text[index - 1];
    const after = text[index + token.length];
    if ((index === 0 || /\s/.test(before ?? "")) && (after == null || /[\s.,!?;:)]/.test(after))) return true;
    from = index + 1;
  }
  return false;
}
