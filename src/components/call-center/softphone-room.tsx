"use client";

import { ConnectionState, Room, RoomEvent } from "livekit-client";
import { ArrowRightLeft, Grid3X3, Mic, MicOff, Pause, PhoneOff, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function isLiveKitAccessToken(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

export function CallCenterSoftphoneRoom({
  token,
  serverUrl,
  held,
  onHangup,
  onHoldToggle,
  onDtmf,
  onTransfer,
}: {
  token: string;
  serverUrl: string;
  held: boolean;
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
  const [micOn, setMicOn] = useState(true);
  const [showPad, setShowPad] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");

  useEffect(() => {
    if (!isLiveKitAccessToken(token) || !serverUrl.startsWith("wss://")) return;
    const room = new Room();
    roomRef.current = room;
    const attached = new Set<HTMLMediaElement>();
    let cancelled = false;

    const mountTrack = (track: { kind: string; attach: () => HTMLMediaElement }) => {
      if (track.kind !== "audio") return;
      const element = track.attach();
      element.className = "sr-only";
      attached.add(element);
      audioRef.current?.appendChild(element);
    };

    const refresh = () => setConnection(room.state);

    room.on(RoomEvent.ConnectionStateChanged, refresh);
    room.on(RoomEvent.TrackSubscribed, (track) => mountTrack(track));
    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.track) mountTrack(publication.track);
    });
    room.on(RoomEvent.Disconnected, refresh);

    void (async () => {
      try {
        await room.connect(serverUrl, token);
        if (cancelled) return;
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
      for (const element of attached) element.remove();
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
  }

  const connected = connection === ConnectionState.Connected;
  const mediaReady = isLiveKitAccessToken(token) && serverUrl.startsWith("wss://");

  return (
    <section
      role="region"
      aria-label={t("callCenter.inCall")}
      className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs"
    >
      <div ref={audioRef} className="sr-only" />
      <p className="text-sm font-medium">{t("callCenter.inCall")}</p>
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
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 px-2"
          disabled={!mediaReady || held}
          onClick={() => void toggleMic()}
          aria-label={micOn ? t("callCenter.mute") : t("callCenter.unmute")}
        >
          {micOn && !held ? <Mic aria-hidden /> : <MicOff aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 px-2"
          onClick={onHoldToggle}
          aria-label={held ? t("callCenter.resume") : t("callCenter.hold")}
        >
          {held ? <Play aria-hidden /> : <Pause aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 px-2"
          onClick={() => setShowPad((v) => !v)}
          aria-label={t("callCenter.keypad")}
        >
          <Grid3X3 aria-hidden />
        </Button>
        {onTransfer ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-3"
            onClick={() => setShowTransfer((v) => !v)}
          >
            <ArrowRightLeft className="me-1.5 h-4 w-4" aria-hidden />
            {t("callCenter.transfer")}
          </Button>
        ) : null}
        <Button type="button" variant="destructive" className="min-h-11 px-3" onClick={onHangup}>
          <PhoneOff className="me-1.5 h-4 w-4" aria-hidden />
          {t("callCenter.hangup")}
        </Button>
      </div>
      {showPad ? (
        <div className="mt-4 grid max-w-[14rem] grid-cols-3 gap-2">
          {KEYPAD.map((digit) => (
            <Button
              key={digit}
              type="button"
              variant="secondary"
              className="min-h-11 font-semibold"
              onClick={() => onDtmf(digit)}
            >
              {digit}
            </Button>
          ))}
        </div>
      ) : null}
      {showTransfer && onTransfer ? (
        <div className="mt-4 space-y-2 rounded-xl border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">{t("callCenter.transferHint")}</p>
          <Input
            value={transferTarget}
            onChange={(e) => setTransferTarget(e.target.value)}
            placeholder={t("callCenter.transferTarget")}
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
