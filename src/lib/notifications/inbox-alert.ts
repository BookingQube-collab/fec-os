/**
 * Pure helpers for inbox arrival feedback (badge ring + sound).
 * Sound plays only after a baseline is established — not for existing unread on load.
 */

export type InboxAlertState = {
  primed: boolean;
  lastUnread: number;
};

export type InboxAlertDecision = {
  next: InboxAlertState;
  /** True when unread rose after the first successful sample. */
  shouldAlert: boolean;
};

/** First successful unread sample is the baseline; later increases alert. */
export function decideInboxAlert(state: InboxAlertState, unread: number): InboxAlertDecision {
  if (!state.primed) {
    return { next: { primed: true, lastUnread: unread }, shouldAlert: false };
  }
  if (unread > state.lastUnread) {
    return { next: { primed: true, lastUnread: unread }, shouldAlert: true };
  }
  return { next: { primed: true, lastUnread: unread }, shouldAlert: false };
}

export const INBOX_SOUND_STORAGE_KEY = "fec.inbox.soundMuted";

/** Explicit mute via localStorage; default is sound on. */
export function isInboxSoundMuted(storage?: Pick<Storage, "getItem"> | null): boolean {
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    return store?.getItem(INBOX_SOUND_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Short soft chime via Web Audio (no asset file).
 * Failures are swallowed — autoplay policies must not break the UI.
 */
export function playInboxNotificationSound(): void {
  if (typeof window === "undefined") return;
  if (isInboxSoundMuted()) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    master.connect(ctx.destination);

    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.8, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    tone(880, now, 0.12);
    tone(1174.7, now + 0.1, 0.18);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 500);
  } catch {
    // ignore
  }
}
