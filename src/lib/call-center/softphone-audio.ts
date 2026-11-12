/**
 * Call Center softphone audio: ringtone + AudioContext unlock for browser autoplay.
 * Ringtone is synthesized (no asset). LiveKit remote elements use ensureRemoteAudioPlays.
 */

type SoftphoneAudioState = {
  ctx: AudioContext | null;
  unlocked: boolean;
  ringing: boolean;
  ringNodes: Array<AudioNode | OscillatorNode>;
  ringTimer: ReturnType<typeof setInterval> | null;
};

const state: SoftphoneAudioState = {
  ctx: null,
  unlocked: false,
  ringing: false,
  ringNodes: [],
  ringTimer: null,
};

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

function getCtx(): AudioContext | null {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  if (!state.ctx || state.ctx.state === "closed") {
    state.ctx = new Ctor();
  }
  return state.ctx;
}

/** Resume AudioContext after a user gesture. Safe to call often. */
export async function unlockSoftphoneAudio(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const ctx = getCtx();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    // Prime with a near-silent blip so later ringtone schedules are allowed.
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.02);
    state.unlocked = ctx.state === "running";
    return state.unlocked;
  } catch {
    return false;
  }
}

export function isSoftphoneAudioUnlocked(): boolean {
  return state.unlocked && state.ctx?.state === "running";
}

function clearRingNodes() {
  for (const node of state.ringNodes) {
    try {
      if ("stop" in node && typeof node.stop === "function") {
        (node as OscillatorNode).stop();
      }
      node.disconnect();
    } catch {
      // already stopped
    }
  }
  state.ringNodes = [];
}

function playRingBurst(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  // Classic dual-tone phone ring (~440 + 480 Hz), two bursts.
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  master.gain.setValueAtTime(0.22, now + 0.38);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  master.gain.setValueAtTime(0.0001, now + 0.55);
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.57);
  master.gain.setValueAtTime(0.22, now + 0.95);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
  master.connect(ctx.destination);
  state.ringNodes.push(master);

  for (const freq of [440, 480]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(master);
    osc.start(now);
    osc.stop(now + 1.05);
    state.ringNodes.push(osc);
  }
}

/** Start looping ringtone. No-ops if already ringing. */
export async function startSoftphoneRingtone(): Promise<void> {
  if (typeof window === "undefined") return;
  if (state.ringing) return;
  await unlockSoftphoneAudio();
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  state.ringing = true;
  clearRingNodes();
  playRingBurst(ctx);
  state.ringTimer = setInterval(() => {
    if (!state.ringing) return;
    const live = getCtx();
    if (!live || live.state !== "running") return;
    clearRingNodes();
    playRingBurst(live);
  }, 2000);

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.([200, 100, 200, 100, 200]);
    } catch {
      // ignore
    }
  }
}

/** Stop ringtone immediately (Answer / Decline / Hangup / unmount). */
export function stopSoftphoneRingtone(): void {
  state.ringing = false;
  if (state.ringTimer != null) {
    clearInterval(state.ringTimer);
    state.ringTimer = null;
  }
  clearRingNodes();
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.(0);
    } catch {
      // ignore
    }
  }
}

export function isSoftphoneRingtonePlaying(): boolean {
  return state.ringing;
}

/**
 * Ensure a LiveKit-attached &lt;audio&gt; element actually plays under autoplay rules.
 * Call after track.attach().
 */
export async function ensureRemoteAudioPlays(element: HTMLMediaElement): Promise<void> {
  try {
    element.autoplay = true;
    element.setAttribute("playsinline", "true");
    element.setAttribute("webkit-playsinline", "true");
    (element as HTMLAudioElement).volume = 1;
    element.muted = false;
    const playResult = element.play();
    if (playResult && typeof playResult.then === "function") {
      await playResult.catch(async () => {
        await unlockSoftphoneAudio();
        element.muted = false;
        await element.play().catch(() => undefined);
      });
    }
  } catch {
    // ignore — UI surfaces mediaFailed separately
  }
}
