"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getChatAttachmentUrl } from "@/lib/chat.functions";

const SPEEDS = [1, 1.5, 2] as const;

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${remain.toString().padStart(2, "0")}`;
}

function speedLabel(speed: number): string {
  if (speed === 1.5) return "1.5x";
  return `${speed}x`;
}

function readDuration(audio: HTMLAudioElement): number | null {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration === Number.POSITIVE_INFINITY) return null;
  return audio.duration;
}

export function VoiceMessage({
  attachmentId,
  src,
  refreshable,
  mine,
  unavailable,
}: {
  attachmentId: string | null;
  src: string | null;
  refreshable: boolean;
  mine: boolean;
  unavailable?: boolean;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const refreshedRef = useRef(false);
  const fixingDurationRef = useRef(false);
  const [url, setUrl] = useState<string | null>(src);
  const [loading, setLoading] = useState(!src && refreshable && !unavailable);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const speed = SPEEDS[speedIndex] ?? 1;

  useEffect(() => {
    refreshedRef.current = false;
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setFailed(false);
    if (unavailable) {
      setUrl(null);
      setLoading(false);
      return;
    }
    if (src) {
      setUrl(src);
      setLoading(false);
      return;
    }
    if (!refreshable || !attachmentId) {
      setUrl(null);
      setLoading(false);
      setFailed(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getChatAttachmentUrl({ attachmentId })
      .then((result) => {
        if (cancelled) return;
        setLoading(false);
        if (!result.ok || !result.data.url) {
          setFailed(true);
          return;
        }
        setUrl(result.data.url);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [attachmentId, refreshable, src, unavailable]);

  function rememberDuration(audio: HTMLAudioElement) {
    const next = readDuration(audio);
    if (next == null) return false;
    setDuration(next);
    return true;
  }

  function onLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    if (rememberDuration(audio)) return;
    const onTime = () => {
      if (!readDuration(audio)) return;
      audio.removeEventListener("timeupdate", onTime);
      fixingDurationRef.current = false;
      rememberDuration(audio);
      audio.currentTime = 0;
    };
    audio.addEventListener("timeupdate", onTime);
    fixingDurationRef.current = true;
    try {
      audio.currentTime = 1e101;
    } catch {
      fixingDurationRef.current = false;
      audio.removeEventListener("timeupdate", onTime);
    }
  }

  async function refresh() {
    if (!refreshable || !attachmentId || refreshedRef.current) {
      setFailed(true);
      return;
    }
    refreshedRef.current = true;
    const result = await getChatAttachmentUrl({ attachmentId });
    if (!result.ok || !result.data.url) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setUrl(result.data.url);
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setFailed(true);
    }
  }

  function cycleSpeed() {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = SPEEDS[next] ?? 1;
  }

  if (!loading && (unavailable || failed || !url)) {
    return <p className="text-xs">{t("chat.attachmentUnavailable")}</p>;
  }

  const shownTime = Number.isFinite(time) && time >= 0 && time < 60 * 60 ? time : 0;
  const seekMax = duration > 0 ? duration : 0;

  return (
    <div data-mine={mine ? "true" : "false"} className="mt-1 flex w-full min-w-[12rem] items-center gap-2 text-foreground">
      {url ? (
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        playsInline
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={() => {
          const audio = audioRef.current;
          if (audio) rememberDuration(audio);
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio || !Number.isFinite(audio.currentTime) || audio.currentTime > 60 * 60) return;
          setTime(audio.currentTime);
        }}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
        }}
        onError={() => {
          if (fixingDurationRef.current) return;
          void refresh();
        }}
      />
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-11 w-11 shrink-0"
        disabled={loading || !url}
        aria-label={playing ? t("chat.pauseVoice") : t("chat.playVoice")}
        aria-pressed={playing}
        onClick={() => {
          void toggle();
        }}
      >
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </Button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={seekMax}
          step={0.1}
          value={Math.min(shownTime, seekMax)}
          aria-label={t("chat.seekVoice")}
          aria-valuemin={0}
          aria-valuemax={Math.round(seekMax)}
          aria-valuenow={Math.round(shownTime)}
          aria-valuetext={`${formatSeconds(shownTime)} / ${formatSeconds(duration)}`}
          disabled={seekMax <= 0}
          className="block h-11 w-full cursor-pointer accent-current disabled:cursor-default"
          onChange={(event) => {
            const audio = audioRef.current;
            const next = Number(event.target.value);
            if (!audio || !Number.isFinite(next)) return;
            audio.currentTime = next;
            setTime(next);
          }}
        />
        <p className="flex justify-between text-[11px] tabular-nums opacity-80">
          <span>{formatSeconds(shownTime)}</span>
          <span>{formatSeconds(duration)}</span>
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 shrink-0 px-2"
        aria-label={t("chat.voiceSpeed", { speed: speedLabel(speed) })}
        onClick={cycleSpeed}
      >
        {speedLabel(speed)}
      </Button>
    </div>
  );
}
