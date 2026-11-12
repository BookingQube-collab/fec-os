"use client";

import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import {
  ArrowRightLeft,
  Circle,
  Grid3X3,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ensureRemoteAudioPlays,
  stopSoftphoneRingtone,
  unlockSoftphoneAudio,
} from "@/lib/call-center/softphone-audio";
import type { CallCenterTransferTarget } from "@/lib/call-center/types";
import { cn } from "@/lib/utils";

function isLiveKitAccessToken(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

function formatElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function CallCenterSoftphoneRoom({
  token,
  serverUrl,
  held,
  answeredAt,
  callerLabel,
  transferTargets = [],
  compact = false,
  micMuted = false,
  onMicMutedChange,
  onHangup,
  onHoldToggle,
  onDtmf,
  onTransfer,
}: {
  token: string;
  serverUrl: string;
  held: boolean;
  answeredAt?: string | null;
  callerLabel?: string | null;
  transferTargets?: CallCenterTransferTarget[];
  compact?: boolean;
  micMuted?: boolean;
  onMicMutedChange?: (muted: boolean) => void;
  onHangup: () => void;
  onHoldToggle: () => void;
  onDtmf: (digit: string) => void;
  onTransfer?: (type: "cold" | "warm", target: string) => void;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [failed, setFailed] = useState(false);
  const [micOn, setMicOn] = useState(!micMuted);
  const [showPad, setShowPad] = useState(!compact);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setMicOn(!micMuted);
  }, [micMuted]);

  useEffect(() => {
    stopSoftphoneRingtone();
    void unlockSoftphoneAudio();
  }, []);

  useEffect(() => {
    const start = answeredAt ? new Date(answeredAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [answeredAt]);

  useEffect(() => {
    if (!isLiveKitAccessToken(token) || !serverUrl.startsWith("wss://")) return;
    const room = new Room({
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    });
    roomRef.current = room;
    const attached = new Set<HTMLMediaElement>();
    let cancelled = false;

    const mountRemoteAudio = (track: Track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.className = "sr-only";
      attached.add(element);
      audioRef.current?.appendChild(element);
      void ensureRemoteAudioPlays(element);
    };

    const attachExistingRemotes = () => {
      room.remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((publication) => {
          if (publication.track) mountRemoteAudio(publication.track);
        });
      });
    };

    const refresh = () => setConnection(room.state);

    room.on(RoomEvent.ConnectionStateChanged, refresh);
    room.on(RoomEvent.TrackSubscribed, (track) => mountRemoteAudio(track));
    room.on(RoomEvent.Disconnected, refresh);

    void (async () => {
      try {
        await unlockSoftphoneAudio();
        await room.connect(serverUrl, token);
        if (cancelled) return;
        attachExistingRemotes();
        await room.localParticipant.setMicrophoneEnabled(true);
        if (!cancelled) refresh();
      } catch {
        if (!cancelled) {
          setFailed(true);
          setConnection(ConnectionState.Disconnected);
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const element of attached) {
        element.pause();
        element.remove();
      }
      attached.clear();
      room.localParticipant.trackPublications.forEach((publication) => {
        publication.track?.stop();
      });
      void room.disconnect(true);
      roomRef.current = null;
    };
  }, [serverUrl, token]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    void room.localParticipant.setMicrophoneEnabled(!held && micOn);
  }, [held, micOn]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room || held) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
    onMicMutedChange?.(!next);
  }

  const connected = connection === ConnectionState.Connected;
  const mediaReady = isLiveKitAccessToken(token) && serverUrl.startsWith("wss://");

  return (
    <section
      role="region"
      aria-label={t("callCenter.inCall")}
      className={cn(
        "border border-border/50 bg-card shadow-elevated-xs",
        compact ? "rounded-2xl p-3" : "rounded-[1.75rem] p-5 sm:p-6",
      )}
    >
      <div ref={audioRef} className="sr-only" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("callCenter.inCall")}
          </p>
          <p className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {callerLabel || t("callCenter.unknownCaller")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {!mediaReady
              ? t("callCenter.mediaNotConfigured")
              : failed
                ? t("callCenter.mediaFailed")
                : held
                  ? t("callCenter.onHold")
                  : connected
                    ? t("callCenter.connected")
                    : t("callCenter.connecting")}
          </p>
        </div>
        <p className="font-mono text-3xl tabular-nums tracking-wide text-foreground sm:text-4xl">
          {formatElapsed(elapsed)}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-12 gap-2 rounded-xl px-3"
          disabled={!mediaReady || held}
          onClick={() => void toggleMic()}
          aria-label={micOn ? t("callCenter.mute") : t("callCenter.unmute")}
        >
          {micOn && !held ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4" aria-hidden />}
          <span className="hidden sm:inline">{micOn && !held ? t("callCenter.mute") : t("callCenter.unmute")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 gap-2 rounded-xl px-3"
          onClick={onHoldToggle}
          aria-label={held ? t("callCenter.resume") : t("callCenter.hold")}
        >
          {held ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          <span className="hidden sm:inline">{held ? t("callCenter.resume") : t("callCenter.hold")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 gap-2 rounded-xl px-3"
          onClick={() => setShowPad((v) => !v)}
          aria-label={t("callCenter.keypad")}
        >
          <Grid3X3 className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t("callCenter.keypad")}</span>
        </Button>
        {onTransfer ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-12 gap-2 rounded-xl px-3"
            onClick={() => setShowTransfer((v) => !v)}
          >
            <ArrowRightLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t("callCenter.divert")}</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="min-h-12 gap-2 rounded-xl px-3"
          onClick={() => toast.message(t("callCenter.conferenceSoon"))}
        >
          <Users className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t("callCenter.conference")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 gap-2 rounded-xl px-3"
          onClick={() => toast.message(t("callCenter.recordSoon"))}
        >
          <Circle className="h-3.5 w-3.5 fill-current text-destructive" aria-hidden />
          <span className="hidden sm:inline">{t("callCenter.record")}</span>
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="min-h-12 min-w-[7.5rem] gap-2 rounded-full px-4"
          onClick={onHangup}
        >
          <PhoneOff className="h-4 w-4" aria-hidden />
          {t("callCenter.hangup")}
        </Button>
      </div>

      {showPad ? (
        <div className="mx-auto mt-5 grid max-w-[18rem] grid-cols-3 gap-2.5">
          {KEYPAD.map((digit) => (
            <Button
              key={digit}
              type="button"
              variant="secondary"
              className="min-h-14 rounded-2xl text-xl font-semibold"
              onClick={() => onDtmf(digit)}
            >
              {digit}
            </Button>
          ))}
        </div>
      ) : null}

      {showTransfer && onTransfer ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <p className="text-sm font-semibold text-foreground">{t("callCenter.divertTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("callCenter.transferHint")}</p>
          {transferTargets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {transferTargets.map((agent) => (
                <Button
                  key={agent.userId}
                  type="button"
                  size="sm"
                  variant={transferTarget === agent.userId ? "default" : "secondary"}
                  onClick={() => setTransferTarget(agent.userId)}
                >
                  {agent.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("callCenter.noAvailableAgents")}</p>
          )}
          <Input
            value={transferTarget}
            onChange={(e) => setTransferTarget(e.target.value)}
            placeholder={t("callCenter.transferTarget")}
            className="min-h-11"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!transferTarget.trim()}
              onClick={() => onTransfer("warm", transferTarget.trim())}
            >
              {t("callCenter.warmTransfer")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!transferTarget.trim()}
              onClick={() => onTransfer("cold", transferTarget.trim())}
            >
              {t("callCenter.coldTransfer")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
