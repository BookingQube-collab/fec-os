"use client";

import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import { Ear, PhoneOff, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  ensureRemoteAudioPlays,
  unlockSoftphoneAudio,
} from "@/lib/call-center/softphone-audio";
import type { CallCenterSupervisorMode } from "@/lib/call-center/types";

function isLiveKitAccessToken(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * Supervisor whisper/barge session.
 * Whisper: publish mic and restrict track subscription to the web agent identity when possible.
 * SIP trunk participants may still hear without LiveKit TrackPermissions server API — documented in call-center.md.
 */
export function SupervisorMonitorRoom({
  token,
  serverUrl,
  mode,
  agentUserId,
  onLeave,
}: {
  token: string;
  serverUrl: string;
  mode: CallCenterSupervisorMode;
  agentUserId: string | null;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isLiveKitAccessToken(token) || !serverUrl.startsWith("wss://")) return;
    const room = new Room();
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

    const refresh = () => setConnection(room.state);

    room.on(RoomEvent.ConnectionStateChanged, refresh);
    room.on(RoomEvent.TrackSubscribed, (track) => mountRemoteAudio(track));
    room.on(RoomEvent.Disconnected, refresh);

    void (async () => {
      try {
        await unlockSoftphoneAudio();
        await room.connect(serverUrl, token);
        if (cancelled) return;
        await room.localParticipant.setMicrophoneEnabled(true);
        if (mode === "whisper" && agentUserId) {
          const agentIdentity = `cc-agent-${agentUserId}`;
          try {
            await room.localParticipant.setTrackSubscriptionPermissions(false, [
              { participantIdentity: agentIdentity, allowAll: true },
            ]);
          } catch {
            // Older LiveKit clients / rooms may ignore; barge still works.
          }
        }
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
  }, [token, serverUrl, mode, agentUserId]);

  const mediaReady = isLiveKitAccessToken(token) && serverUrl.startsWith("wss://");
  const connected = connection === ConnectionState.Connected;

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3">
      <div ref={audioRef} className="sr-only" />
      <p className="flex items-center gap-2 text-sm font-medium">
        {mode === "whisper" ? <Ear className="h-4 w-4" aria-hidden /> : <Users className="h-4 w-4" aria-hidden />}
        {mode === "whisper" ? t("callCenter.whisperActive") : t("callCenter.bargeActive")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {!mediaReady
          ? t("callCenter.mediaNotConfigured")
          : failed
            ? t("callCenter.mediaFailed")
            : connected
              ? t("callCenter.connected")
              : t("callCenter.connecting")}
      </p>
      {mode === "whisper" ? (
        <p className="mt-1 text-xs text-muted-foreground">{t("callCenter.whisperSipNote")}</p>
      ) : null}
      <Button type="button" variant="outline" className="mt-3 min-h-10" onClick={onLeave}>
        <PhoneOff className="me-1.5 h-4 w-4" aria-hidden />
        {t("callCenter.leaveMonitor")}
      </Button>
    </div>
  );
}
