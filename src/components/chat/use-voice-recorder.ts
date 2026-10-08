"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  chatAttachmentFits,
  chatPreparedAttachment,
  chatVoiceNoteMessageType,
  chatVoiceNoteShouldStop,
  chatVoiceRecorderChoice,
  CHAT_VOICE_NOTE_MAX_MS,
} from "@/lib/chat/attachment-rules";

export type VoiceRecorderIssue = "unsupported" | "permission" | "failed" | "large" | "empty" | "magic";

export type VoicePreview = {
  file: File;
  objectUrl: string;
  clientAttachmentId: string;
  clientMessageId: string;
  mimeType: string;
  filename: string;
  byteSize: number;
};

type RecorderChoice = NonNullable<ReturnType<typeof chatVoiceRecorderChoice>>;
type Phase = "idle" | "recording" | "paused" | "preview";

function stopTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

export function formatChatVoiceClock(ms: number): string {
  const capped = Math.min(CHAT_VOICE_NOTE_MAX_MS, Math.max(0, ms));
  const total = Math.floor(capped / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Microphone capture for one voice note.
 * getUserMedia and MediaRecorder run only from start(), after the user presses Record.
 */
export function useVoiceRecorder(conversationId: string) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [issue, setIssue] = useState<VoiceRecorderIssue | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const segmentStartRef = useRef(0);
  const epochRef = useRef(0);
  const mountedRef = useRef(true);
  const previewUrlRef = useRef<string | null>(null);
  const choiceRef = useRef<RecorderChoice | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const stopForPreviewRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseHardware = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
    choiceRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          stopTracks(stream);
        }
      }
    }
    stopTracks(stream);
  }, [clearTimer]);

  const revokePreview = useCallback(() => {
    if (!previewUrlRef.current) return;
    URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const goIdle = useCallback(() => {
    stoppingRef.current = false;
    startingRef.current = false;
    elapsedRef.current = 0;
    segmentStartRef.current = 0;
    phaseRef.current = "idle";
    if (!mountedRef.current) return;
    setPreview(null);
    setPhase("idle");
    setElapsedMs(0);
  }, []);

  const cancel = useCallback(() => {
    epochRef.current += 1;
    releaseHardware();
    revokePreview();
    goIdle();
  }, [goIdle, releaseHardware, revokePreview]);

  const armTimer = useCallback(() => {
    clearTimer();
    segmentStartRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = elapsedRef.current + (Date.now() - segmentStartRef.current);
      if (!mountedRef.current) return;
      setElapsedMs(elapsed);
      if (chatVoiceNoteShouldStop(elapsed)) stopForPreviewRef.current();
    }, 200);
  }, [clearTimer]);

  const stopForPreview = useCallback(() => {
    if (stoppingRef.current) return;
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    const choice = choiceRef.current;
    if (!recorder || !choice || (phaseRef.current !== "recording" && phaseRef.current !== "paused")) return;
    stoppingRef.current = true;
    clearTimer();
    if (segmentStartRef.current) {
      elapsedRef.current += Date.now() - segmentStartRef.current;
      segmentStartRef.current = 0;
    }
    const epoch = epochRef.current;
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: choice.mimeType });
      chunksRef.current = [];
      recorderRef.current = null;
      streamRef.current = null;
      choiceRef.current = null;
      stopTracks(stream);
      stoppingRef.current = false;
      if (!mountedRef.current || epoch !== epochRef.current) return;
      void acceptBlob(blob, choice, epoch);
    };
    try {
      if (recorder.state !== "inactive") recorder.stop();
      else recorder.onstop?.(new Event("stop"));
    } catch {
      stopTracks(stream);
      recorderRef.current = null;
      streamRef.current = null;
      stoppingRef.current = false;
      if (mountedRef.current) setIssue("failed");
      goIdle();
    }
  }, [clearTimer, goIdle]);

  stopForPreviewRef.current = stopForPreview;

  async function acceptBlob(blob: Blob, choice: RecorderChoice, epoch: number) {
    const fail = (next: VoiceRecorderIssue) => {
      if (!mountedRef.current || epoch !== epochRef.current) return;
      setIssue(next);
      goIdle();
    };
    if (blob.size === 0) {
      fail("empty");
      return;
    }
    if (!chatAttachmentFits(choice.mimeType, blob.size)) {
      fail("large");
      return;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!mountedRef.current || epoch !== epochRef.current) return;
    const prepared = chatPreparedAttachment({
      fileType: choice.mimeType,
      bytes,
      filename: choice.filename,
    });
    if (!prepared.ok || chatVoiceNoteMessageType([prepared.mimeType]) !== "VOICE_NOTE") {
      fail(prepared.ok ? "failed" : prepared.issue === "large" ? "large" : prepared.issue === "empty" ? "empty" : prepared.issue === "magic" ? "magic" : "failed");
      return;
    }
    const file = new File([blob], prepared.filename, { type: prepared.mimeType });
    const objectUrl = URL.createObjectURL(file);
    if (!mountedRef.current || epoch !== epochRef.current) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
    revokePreview();
    previewUrlRef.current = objectUrl;
    phaseRef.current = "preview";
    setPreview({
      file,
      objectUrl,
      clientAttachmentId: crypto.randomUUID(),
      clientMessageId: crypto.randomUUID(),
      mimeType: prepared.mimeType,
      filename: prepared.filename,
      byteSize: file.size,
    });
    setIssue(null);
    setPhase("preview");
    setElapsedMs(elapsedRef.current);
  }

  const start = useCallback(async () => {
    if (startingRef.current || phaseRef.current !== "idle") return;
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setIssue("unsupported");
      return;
    }
    const choice = chatVoiceRecorderChoice((mime) => MediaRecorder.isTypeSupported(mime));
    if (!choice) {
      setIssue("unsupported");
      return;
    }
    startingRef.current = true;
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    setIssue(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || epoch !== epochRef.current) {
        stopTracks(stream);
        return;
      }
      choiceRef.current = choice;
      chunksRef.current = [];
      elapsedRef.current = 0;
      segmentStartRef.current = 0;
      const recorder = new MediaRecorder(stream, { mimeType: choice.mediaType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (epoch !== epochRef.current) return;
        releaseHardware();
        if (mountedRef.current) setIssue("failed");
        goIdle();
      };
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start();
      if (recorder.state !== "recording" || epoch !== epochRef.current) {
        releaseHardware();
        if (mountedRef.current && epoch === epochRef.current) setIssue("failed");
        goIdle();
        return;
      }
      phaseRef.current = "recording";
      setElapsedMs(0);
      setPhase("recording");
      armTimer();
    } catch (error) {
      releaseHardware();
      stopTracks(stream);
      if (mountedRef.current && epoch === epochRef.current) {
        const name = error instanceof DOMException ? error.name : "";
        const denied = name === "NotAllowedError" || name === "NotFoundError" || name === "SecurityError";
        setIssue(denied ? "permission" : name === "NotSupportedError" ? "unsupported" : "failed");
      }
      goIdle();
    } finally {
      startingRef.current = false;
    }
  }, [armTimer, goIdle, releaseHardware]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording" || phaseRef.current !== "recording") return;
    elapsedRef.current += Date.now() - segmentStartRef.current;
    segmentStartRef.current = 0;
    clearTimer();
    recorder.pause();
    phaseRef.current = "paused";
    setPhase("paused");
    setElapsedMs(elapsedRef.current);
  }, [clearTimer]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused" || phaseRef.current !== "paused") return;
    recorder.resume();
    phaseRef.current = "recording";
    setPhase("recording");
    armTimer();
  }, [armTimer]);

  const consumePreview = useCallback((): VoicePreview | null => {
    if (phaseRef.current !== "preview" || !preview) return null;
    previewUrlRef.current = null;
    phaseRef.current = "idle";
    setPreview(null);
    setPhase("idle");
    elapsedRef.current = 0;
    setElapsedMs(0);
    return preview;
  }, [preview]);

  useEffect(() => {
    mountedRef.current = true;
    phaseRef.current = "idle";
    elapsedRef.current = 0;
    setPhase("idle");
    setPreview(null);
    setElapsedMs(0);
    setIssue(null);
    return () => {
      mountedRef.current = false;
      epochRef.current += 1;
      clearTimer();
      const recorder = recorderRef.current;
      const stream = streamRef.current;
      recorderRef.current = null;
      streamRef.current = null;
      chunksRef.current = [];
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            stopTracks(stream);
          }
        }
      }
      stopTracks(stream);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [clearTimer, conversationId]);

  return {
    phase,
    elapsedMs,
    preview,
    issue,
    start,
    pause,
    resume,
    cancel,
    stopForPreview,
    consumePreview,
  };
}
