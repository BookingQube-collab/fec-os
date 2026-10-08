/**
 * Labels for a conversation row and the open thread.
 * A direct chat stores no title. The name is the other member.
 */

const GENERIC_DIRECT_TITLES = new Set(["direct", "direct message"]);

/** Title Case an ALL-CAPS roster name. Mixed-case names stay as stored. */
export function rosterDisplayName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "";
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (!letters) return trimmed;
  const upper = [...letters].filter((character) => character >= "A" && character <= "Z").length;
  if (upper / letters.length < 0.85) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s'-])(\S)/g, (_, separator: string, character: string) => separator + character.toUpperCase());
}

export function isGenericDirectTitle(title: string | null | undefined): boolean {
  const value = title?.trim().toLowerCase();
  return Boolean(value && GENERIC_DIRECT_TITLES.has(value));
}

export function conversationDisplayName(
  conversation: { kind: string; title: string | null; peerName?: string | null },
  label: (key: string, options?: { defaultValue?: string }) => string,
): string {
  const title = conversation.title?.trim() ?? "";
  if (conversation.kind === "DIRECT") {
    const peer = rosterDisplayName(conversation.peerName);
    if (peer) return peer;
    if (title && !isGenericDirectTitle(title)) return title;
    return label("chat.kinds.DIRECT", { defaultValue: "Direct" });
  }
  return title || label(`chat.kinds.${conversation.kind}`, { defaultValue: conversation.kind });
}

/** Same secondary line as a person row: employee code, then job title. */
export function directPeerRoleLine(
  employeeCode: string | null | undefined,
  jobTitle: string | null | undefined,
): string {
  return [employeeCode?.trim(), jobTitle?.trim()].filter((part): part is string => Boolean(part)).join(" · ");
}

type DirectLabelConversation = {
  kind: string;
  peerName?: string | null;
  peerUserId?: string | null;
  peerJobTitle?: string | null;
  peerEmployeeCode?: string | null;
};

type DirectLabelPerson = {
  userId: string | null;
  fullName: string;
  jobTitle: string | null;
  employeeCode: string | null;
};

/**
 * Fills a direct chat from the directory when the conversation payload has
 * the other login but not their name. An existing name is left as it is.
 */
export function withDirectPeerLabels<T extends DirectLabelConversation>(
  conversations: readonly T[],
  people: readonly DirectLabelPerson[],
): T[] {
  const byUser = new Map<string, DirectLabelPerson>();
  for (const person of people) {
    if (person.userId && person.fullName.trim()) byUser.set(person.userId, person);
  }
  if (byUser.size === 0) return [...conversations];
  return conversations.map((conversation) => {
    if (conversation.kind !== "DIRECT" || !conversation.peerUserId) return conversation;
    const person = byUser.get(conversation.peerUserId);
    if (!person) return conversation;
    const peerName = rosterDisplayName(conversation.peerName) || rosterDisplayName(person.fullName);
    const peerJobTitle = conversation.peerJobTitle?.trim() || person.jobTitle?.trim() || null;
    const peerEmployeeCode = conversation.peerEmployeeCode?.trim() || person.employeeCode?.trim() || null;
    if (
      peerName === (conversation.peerName ?? "") &&
      (peerJobTitle ?? null) === (conversation.peerJobTitle ?? null) &&
      (peerEmployeeCode ?? null) === (conversation.peerEmployeeCode ?? null)
    ) {
      return conversation;
    }
    return { ...conversation, peerName, peerJobTitle, peerEmployeeCode };
  });
}
