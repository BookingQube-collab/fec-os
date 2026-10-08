"use client";

import { ConnectionState, Room, RoomEvent, Track, type Participant } from "livekit-client";
import { Mic, MicOff, Monitor, MonitorOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { ChatCallKind } from "@/lib/chat/call-rules";

function screenShareAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  const devices = navigator.mediaDevices;
  return typeof devices?.getDisplayMedia === "function";
}

/** A LiveKit access token is a JWT. A blank or placeholder string must not open media. */
function isLiveKitAccessToken(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function participantLabel(participant: Participant): string {
  const name = participant.name?.trim();
  return name && name.length > 0 ? name : participant.identity;
}

export function LiveKitCallRoom({
  kind,
  token,
  serverUrl,
  pending,
  onEnd,
}: {
  kind: ChatCallKind;
  token: string;
  serverUrl: string;
  pending: boolean;
  onEnd: () => void;
}) {
  const { t } = useTranslation();
  const mediaRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [failed, setFailed] = useState(false);
  const [participants, setParticipants] = useState<Array<{ id: string; label: string }>>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(kind === "VIDEO");
  const [sharing, setSharing] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(screenShareAvailable());
  }, []);

  useEffect(() => {
    if (!isLiveKitAccessToken(token) || !serverUrl.startsWith("wss://")) return;
    const room = new Room();
    roomRef.current = room;
    const attached = new Set<HTMLMediaElement>();
    let cancelled = false;

    const mountTrack = (track: Track) => {
      if (track.kind !== Track.Kind.Audio && track.kind !== Track.Kind.Video) return;
      const element = track.attach();
      attached.add(element);
      if (track.kind === Track.Kind.Audio) element.className = "sr-only";
      else element.className = "max-h-40 w-full rounded-md bg-black object-contain";
      mediaRef.current?.appendChild(element);
    };

    const refresh = () => {
      setConnection(room.state);
      const labels = [{ id: room.localParticipant.identity, label: participantLabel(room.localParticipant) }];
      room.remoteParticipants.forEach((participant) => {
        labels.push({ id: participant.identity, label: participantLabel(participant) });
      });
      setParticipants(labels);
    };

    room.on(RoomEvent.ConnectionStateChanged, refresh);
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.TrackSubscribed, (track) => {
      mountTrack(track);
    });
    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.track) mountTrack(publication.track);
      refresh();
    });
    room.on(RoomEvent.Disconnected, refresh);

    void (async () => {
      try {
        await room.connect(serverUrl, token);
        if (cancelled) return;
        await room.localParticipant.setMicrophoneEnabled(true);
        if (kind === "VIDEO") await room.localParticipant.setCameraEnabled(true);
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
  }, [kind, serverUrl, token]);

  async function toggleMic() {
    const next = !micOn;
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function toggleCamera() {
    const next = !cameraOn;
    await roomRef.current?.localParticipant.setCameraEnabled(next);
    setCameraOn(next);
  }

  async function toggleShare() {
    const next = !sharing;
    await roomRef.current?.localParticipant.setScreenShareEnabled(next);
    setSharing(next);
  }

  const connectionLabel =
    failed
      ? t("chat.callConnectFailed")
      : connection === ConnectionState.Connected
        ? t("chat.callConnected")
        : connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting
          ? t("chat.callReconnecting")
          : connection === ConnectionState.Connecting
            ? t("chat.callConnecting")
            : t("chat.callDisconnected");

  return (
    <section role="region" aria-label={t(`chat.callKind.${kind}`)} className="px-3 py-3">
      <p className="text-sm font-medium">{t(`chat.callKind.${kind}`)}</p>
      <p role="status" className="mt-1 text-xs text-muted-foreground">
        {t("chat.callConnection")}: {connectionLabel}
      </p>
      <p className="mt-2 text-xs font-medium">{t("chat.callParticipants")}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {participants.length === 0 ? (
          <li>{t("chat.callConnecting")}</li>
        ) : (
          participants.map((person) => <li key={person.id}>{person.label}</li>)
        )}
      </ul>
      <div ref={mediaRef} className="mt-3 space-y-2" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 px-2"
          aria-pressed={micOn}
          aria-label={micOn ? t("chat.callMute") : t("chat.callUnmute")}
          onClick={() => void toggleMic()}
        >
          {micOn ? <Mic aria-hidden /> : <MicOff aria-hidden />}
        </Button>
        {kind === "VIDEO" ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-11 px-2"
            aria-pressed={cameraOn}
            aria-label={cameraOn ? t("chat.callCameraOff") : t("chat.callCameraOn")}
            onClick={() => void toggleCamera()}
          >
            {cameraOn ? <Video aria-hidden /> : <VideoOff aria-hidden />}
          </Button>
        ) : null}
        {canShare ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-11 px-2"
            aria-pressed={sharing}
            aria-label={sharing ? t("chat.callStopShare") : t("chat.callShare")}
            onClick={() => void toggleShare()}
          >
            {sharing ? <MonitorOff aria-hidden /> : <Monitor aria-hidden />}
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="min-h-11 px-3" disabled={pending} onClick={onEnd}>
          <PhoneOff className="me-1 h-4 w-4" aria-hidden />
          {t("chat.callEnd")}
        </Button>
      </div>
    </section>
  );
}
