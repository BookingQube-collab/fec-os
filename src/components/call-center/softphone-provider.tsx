"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { IncomingCallOverlay } from "@/components/call-center/incoming-call-overlay";
import { CallCenterSoftphoneRoom } from "@/components/call-center/softphone-room";
import { useAuth } from "@/hooks/use-auth";
import {
  answerCallCenterCall,
  declineCallCenterCall,
  deleteCallCenterSpeedDial,
  hangupCallCenterCall,
  saveCallCenterDisposition,
  setCallCenterRecording,
  holdCallCenterCall,
  loadCallCenterAgentWorkspace,
  loadCallCenterParkedCalls,
  loadCallCenterWallboard,
  parkCallCenterCall,
  placeCallCenterOutbound,
  pollCallCenterIncoming,
  retrieveCallCenterParkedCall,
  saveCallCenterAgentNotes,
  saveCallCenterSpeedDial,
  sendCallCenterDtmf,
  setCallCenterAgentStatus,
  testCallCenterRing,
  transferCallCenterCall,
} from "@/lib/call-center/call-center.functions";
import {
  stopSoftphoneRingtone,
  unlockSoftphoneAudio,
} from "@/lib/call-center/softphone-audio";
import type {
  CallCenterAgentStatus,
  CallCenterAgentStatusValue,
  CallCenterCall,
  CallCenterMediaSession,
  CallCenterQueue,
  CallCenterSpeedDial,
  CallCenterTransferTarget,
} from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";

const WORKSPACE_KEY = ["call-center", "workspace"] as const;
const SPEAKER_MUTE_KEY = "cc-speaker-muted:v1";

type SoftphoneContextValue = {
  canUse: boolean;
  pending: boolean;
  workspaceLoading: boolean;
  workspaceError: boolean;
  workspaceStatus: CallCenterAgentStatusValue;
  sipConfigured: boolean;
  callCenterEnabled: boolean;
  livekitReady: boolean;
  dialDigits: string;
  setDialDigits: (value: string | ((prev: string) => string)) => void;
  activeCall: CallCenterCall | null;
  media: CallCenterMediaSession | null;
  held: boolean;
  micMuted: boolean;
  setMicMuted: (muted: boolean) => void;
  speakerMuted: boolean;
  setSpeakerMuted: (muted: boolean) => void;
  incoming: CallCenterCall | null;
  recentCalls: CallCenterCall[];
  transferTargets: CallCenterTransferTarget[];
  agentUserId: string | null;
  myQueues: CallCenterQueue[];
  wrapUpSeconds: number;
  acwRemaining: number | null;
  speedDials: CallCenterSpeedDial[];
  availableAgents: CallCenterAgentStatus[];
  agents: CallCenterAgentStatus[];
  notesDraft: string;
  setNotesDraft: (value: string) => void;
  notesCallId: string | null;
  changeStatus: (status: CallCenterAgentStatusValue) => Promise<void>;
  onTestRing: () => Promise<void>;
  onDial: (toE164?: string) => Promise<void>;
  onCallback: (call: CallCenterCall) => void;
  onAnswer: () => Promise<void>;
  onDecline: () => Promise<void>;
  onHangup: () => Promise<void>;
  onHoldToggle: () => Promise<void>;
  onPark: () => Promise<void>;
  onRetrieveParked: (callId: string) => Promise<void>;
  parkedCalls: CallCenterCall[];
  onDtmf: (digit: string) => Promise<void>;
  onTransfer: (type: "cold" | "warm", target: string) => Promise<void>;
  onSaveNotes: () => Promise<void>;
  onSaveDisposition: (code: string, notes?: string) => Promise<void>;
  onToggleRecording: () => Promise<void>;
  onAddSpeedDial: (label: string, e164: string) => Promise<void>;
  onDeleteSpeedDial: (id: string) => Promise<void>;
  endAcwEarly: () => Promise<void>;
  lastEndedCallId: string | null;
  refresh: () => Promise<void>;
};

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

export function useCallCenterSoftphone() {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) throw new Error("useCallCenterSoftphone must be used within CallCenterSoftphoneProvider");
  return ctx;
}

export function useCallCenterSoftphoneOptional() {
  return useContext(SoftphoneContext);
}

function callbackNumber(call: CallCenterCall, agentUserId: string | null): string {
  if (call.direction === "outbound") {
    return call.toE164 || "";
  }
  if (call.fromE164 && call.fromE164 !== "test" && !call.fromE164.endsWith("00000000")) {
    return call.fromE164;
  }
  if (call.toE164 && call.toE164 !== "test") return call.toE164;
  return call.fromE164 || call.toE164 || "";
}

export function CallCenterSoftphoneProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const canUse = canUserDo(
    roles.map((r) => r.role),
    "call_center.view",
  );
  const [pending, setPending] = useState(false);
  const [activeCall, setActiveCall] = useState<CallCenterCall | null>(null);
  const [media, setMedia] = useState<CallCenterMediaSession | null>(null);
  const [held, setHeld] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(SPEAKER_MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [dialDigits, setDialDigits] = useState("+974");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesCallId, setNotesCallId] = useState<string | null>(null);
  const [acwRemaining, setAcwRemaining] = useState<number | null>(null);
  const [lastEndedCallId, setLastEndedCallId] = useState<string | null>(null);
  const missedAlertedRef = useRef<Set<string>>(new Set());
  const acwTimerRef = useRef<number | null>(null);
  const wrapUpRef = useRef(30);

  const workspace = useQuery({
    queryKey: WORKSPACE_KEY,
    enabled: canUse,
    refetchInterval: 8_000,
    queryFn: async () => {
      const result = await loadCallCenterAgentWorkspace({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const parkedQuery = useQuery({
    queryKey: ["call-center", "parked"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterParkedCalls({});
      if (!result.ok) throw new Error(result.error);
      return result.data.calls;
    },
    refetchInterval: canUse ? 8_000 : false,
  });

  const wallboard = useQuery({
    queryKey: ["call-center", "wallboard-lite"],
    enabled: canUse,
    refetchInterval: 10_000,
    queryFn: async () => {
      const result = await loadCallCenterWallboard({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const ringingQuery = useQuery({
    queryKey: ["call-center", "ringing"],
    enabled: canUse && workspace.data?.status.status === "available" && !activeCall,
    refetchInterval: 2_000,
    queryFn: async () => {
      const result = await pollCallCenterIncoming({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const incoming = ringingQuery.data?.[0] ?? workspace.data?.ringing[0] ?? null;
  wrapUpRef.current = workspace.data?.wrapUpSeconds ?? 30;

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    const myQueueIds = new Set((workspace.data?.myQueues ?? []).map((q) => q.id));
    const recent = workspace.data?.recentCalls ?? [];
    for (const call of recent.slice(0, 12)) {
      if (!["missed", "declined"].includes(call.status)) continue;
      if (call.direction === "outbound") continue;
      if (missedAlertedRef.current.has(call.id)) continue;
      const age = Date.now() - new Date(call.startedAt).getTime();
      if (age > 15 * 60_000) continue;
      const forMe =
        call.agentUserId === uid ||
        (!call.agentUserId && !!call.queueId && myQueueIds.has(call.queueId));
      if (!forMe) continue;
      missedAlertedRef.current.add(call.id);
      toast.message(t("callCenter.missedCallAlert", { from: call.fromE164 || call.toE164 || "—" }));
    }
  }, [workspace.data?.recentCalls, workspace.data?.myQueues, user?.id, t]);

  useEffect(() => {
    try {
      localStorage.setItem(SPEAKER_MUTE_KEY, speakerMuted ? "1" : "0");
    } catch {
      // ignore
    }
  }, [speakerMuted]);

  useEffect(() => {
    if (activeCall) {
      setNotesCallId(activeCall.id);
      setNotesDraft(activeCall.agentNotes || "");
    }
  }, [activeCall?.id]);

  const clearAcwTimer = useCallback(() => {
    if (acwTimerRef.current != null) {
      window.clearInterval(acwTimerRef.current);
      acwTimerRef.current = null;
    }
    setAcwRemaining(null);
  }, []);

  const startAcwTimer = useCallback(
    (seconds: number) => {
      clearAcwTimer();
      const total = Math.max(5, Math.min(300, seconds || 30));
      setAcwRemaining(total);
      acwTimerRef.current = window.setInterval(() => {
        setAcwRemaining((prev) => {
          if (prev == null) return null;
          if (prev <= 1) {
            if (acwTimerRef.current != null) {
              window.clearInterval(acwTimerRef.current);
              acwTimerRef.current = null;
            }
            void (async () => {
              const result = await setCallCenterAgentStatus({ status: "available" });
              if (result.ok) {
                await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
                toast.success(t("callCenter.acwDone"));
              }
            })();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearAcwTimer, queryClient, t],
  );

  useEffect(() => () => clearAcwTimer(), [clearAcwTimer]);

  const transferTargets = useMemo((): CallCenterTransferTarget[] => {
    const agents = wallboard.data?.agents ?? workspace.data?.agents ?? [];
    return agents
      .filter((a) => a.userId !== user?.id && a.status === "available")
      .map((a) => ({
        userId: a.userId,
        status: a.status,
        label: `${a.userId.slice(0, 8)}…`,
      }));
  }, [wallboard.data?.agents, workspace.data?.agents, user?.id]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
  }, [queryClient]);

  async function changeStatus(status: CallCenterAgentStatusValue) {
    await unlockSoftphoneAudio();
    if (status !== "acw") clearAcwTimer();
    setPending(true);
    const result = await setCallCenterAgentStatus({ status });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
    toast.success(t("callCenter.statusUpdated"));
  }

  async function endAcwEarly() {
    clearAcwTimer();
    await changeStatus("available");
  }

  async function onTestRing() {
    await unlockSoftphoneAudio();
    setPending(true);
    const result = await testCallCenterRing({});
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await refresh();
    toast.success(t("callCenter.testRingSent"));
  }

  async function onDial(toE164?: string) {
    const target = (toE164 ?? dialDigits).trim();
    if (!target || target.length < 4) {
      toast.error(t("callCenter.dialInvalid"));
      return;
    }
    stopSoftphoneRingtone();
    await unlockSoftphoneAudio();
    clearAcwTimer();
    setPending(true);
    const result = await placeCallCenterOutbound({
      toE164: target,
      fromE164: workspace.data?.settings.outboundCallerIdE164 || undefined,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(result.data.call);
    setMedia(result.data.media);
    setHeld(false);
    setMicMuted(false);
    if (!result.data.media.token || !result.data.media.serverUrl.startsWith("wss://")) {
      toast.message(t("callCenter.mediaNotConfigured"));
    }
    await refresh();
    toast.success(t("callCenter.outboundStarted"));
  }

  function onCallback(call: CallCenterCall) {
    const number = callbackNumber(call, user?.id ?? null);
    if (!number) {
      toast.error(t("callCenter.callbackMissing"));
      return;
    }
    setDialDigits(number);
    void onDial(number);
  }

  async function onAnswer() {
    if (!incoming) return;
    stopSoftphoneRingtone();
    await unlockSoftphoneAudio();
    clearAcwTimer();
    setPending(true);
    const result = await answerCallCenterCall({ callId: incoming.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(result.data.call);
    setMedia(result.data.media);
    setHeld(false);
    setMicMuted(false);
    if (!result.data.media.token || !result.data.media.serverUrl.startsWith("wss://")) {
      toast.error(t("callCenter.mediaNotConfigured"));
    }
    await refresh();
  }

  async function onDecline() {
    if (!incoming) return;
    stopSoftphoneRingtone();
    setPending(true);
    const result = await declineCallCenterCall({ callId: incoming.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await refresh();
  }

  async function onHangup() {
    if (!activeCall) return;
    stopSoftphoneRingtone();
    if (notesDraft.trim() && notesCallId === activeCall.id) {
      await saveCallCenterAgentNotes({ callId: activeCall.id, notes: notesDraft }).catch(() => undefined);
    }
    setPending(true);
    const result = await hangupCallCenterCall({ callId: activeCall.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLastEndedCallId(activeCall.id);
    setActiveCall(null);
    setMedia(null);
    setHeld(false);
    setMicMuted(false);
    startAcwTimer(wrapUpRef.current);
    await refresh();
  }

  async function onHoldToggle() {
    if (!activeCall) return;
    const next = !held;
    setPending(true);
    const result = await holdCallCenterCall({ callId: activeCall.id, held: next });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setHeld(next);
    setActiveCall(result.data);
  }

  async function onPark() {
    if (!activeCall) return;
    setPending(true);
    const result = await parkCallCenterCall({ callId: activeCall.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.parked", { slot: result.data.parkedSlot }));
    setActiveCall(null);
    setMedia(null);
    setHeld(false);
    setMicMuted(false);
    startAcwTimer(wrapUpRef.current);
    await queryClient.invalidateQueries({ queryKey: ["call-center", "parked"] });
    await refresh();
  }

  async function onRetrieveParked(callId: string) {
    setPending(true);
    const result = await retrieveCallCenterParkedCall({ callId });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(result.data);
    setHeld(false);
    toast.success(t("callCenter.retrieved"));
    await queryClient.invalidateQueries({ queryKey: ["call-center", "parked"] });
    await refresh();
  }

  async function onDtmf(digit: string) {
    if (!activeCall) return;
    const result = await sendCallCenterDtmf({ callId: activeCall.id, digit });
    if (!result.ok) toast.error(result.error);
  }

  async function onTransfer(type: "cold" | "warm", target: string) {
    if (!activeCall) return;
    setPending(true);
    const result = await transferCallCenterCall({ callId: activeCall.id, type, target });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.transferRecorded"));
    if (type === "cold") {
      setActiveCall(null);
      setMedia(null);
      setHeld(false);
      startAcwTimer(wrapUpRef.current);
    } else {
      setActiveCall(result.data);
      setHeld(true);
    }
    await refresh();
  }

  async function onSaveNotes() {
    if (!notesCallId) {
      toast.error(t("callCenter.notesNoCall"));
      return;
    }
    setPending(true);
    const result = await saveCallCenterAgentNotes({ callId: notesCallId, notes: notesDraft });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (activeCall?.id === notesCallId) {
      setActiveCall(result.data);
    }
    toast.success(t("callCenter.notesSaved"));
    await refresh();
  }

  async function onSaveDisposition(code: string, notes?: string) {
    const callId = lastEndedCallId || notesCallId || activeCall?.id;
    if (!callId) {
      toast.error(t("callCenter.notesNoCall"));
      return;
    }
    setPending(true);
    const result = await saveCallCenterDisposition({
      callId,
      dispositionCode: code,
      dispositionNotes: notes ?? "",
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.dispositionSaved"));
    await refresh();
  }

  async function onToggleRecording() {
    if (!activeCall) return;
    const enabled = !activeCall.recordingEnabled;
    setPending(true);
    const result = await setCallCenterRecording({ callId: activeCall.id, enabled });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(result.data);
    toast.success(enabled ? t("callCenter.recordingOn") : t("callCenter.recordingOff"));
  }

  async function onAddSpeedDial(label: string, e164: string) {
    setPending(true);
    const result = await saveCallCenterSpeedDial({ label, e164 });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.speedDialSaved"));
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
  }

  async function onDeleteSpeedDial(id: string) {
    setPending(true);
    const result = await deleteCallCenterSpeedDial({ id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.speedDialDeleted"));
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
  }

  useEffect(() => {
    if (!canUse) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (e.key === "Escape") {
        if (incoming && !activeCall) {
          e.preventDefault();
          void onDecline();
          return;
        }
        if (activeCall && !typing) {
          e.preventDefault();
          void onHangup();
        }
        return;
      }
      if (e.key === "Enter" && !typing && !activeCall && !incoming) {
        e.preventDefault();
        void onDial();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest via refs intentionally light
  }, [canUse, incoming?.id, activeCall?.id, dialDigits]);

  const value: SoftphoneContextValue = {
    canUse,
    pending,
    workspaceLoading: workspace.isLoading,
    workspaceError: workspace.isError,
    workspaceStatus: workspace.data?.status.status ?? "offline",
    sipConfigured: Boolean(workspace.data?.settings.sipConfigured),
    callCenterEnabled: Boolean(workspace.data?.settings.enabled),
    livekitReady: Boolean(workspace.data?.settings.livekitReady),
    dialDigits,
    setDialDigits,
    activeCall,
    media,
    held,
    micMuted,
    setMicMuted,
    speakerMuted,
    setSpeakerMuted: (muted: boolean) => setSpeakerMuted(muted),
    incoming: activeCall ? null : incoming,
    recentCalls: workspace.data?.recentCalls ?? [],
    transferTargets,
    agentUserId: user?.id ?? null,
    myQueues: workspace.data?.myQueues ?? [],
    wrapUpSeconds: workspace.data?.wrapUpSeconds ?? 30,
    acwRemaining,
    speedDials: workspace.data?.speedDials ?? [],
    availableAgents: workspace.data?.availableAgents ?? [],
    agents: workspace.data?.agents ?? [],
    notesDraft,
    setNotesDraft,
    notesCallId,
    changeStatus,
    onTestRing,
    onDial,
    onCallback,
    onAnswer,
    onDecline,
    onHangup,
    onHoldToggle,
    onPark,
    onRetrieveParked,
    parkedCalls: parkedQuery.data ?? [],
    onDtmf,
    onTransfer,
    onSaveNotes,
    onSaveDisposition,
    onToggleRecording,
    onAddSpeedDial,
    onDeleteSpeedDial,
    endAcwEarly,
    lastEndedCallId,
    refresh,
  };

  const onDialerHome = pathname === "/call-center";
  const showFloatingRoom = Boolean(activeCall && media && !onDialerHome);

  return (
    <SoftphoneContext.Provider value={value}>
      {children}
      {value.incoming ? (
        <IncomingCallOverlay
          call={value.incoming}
          pending={pending}
          queueName={
            workspace.data?.myQueues.find((q) => q.id === value.incoming?.queueId)?.name ??
            wallboard.data?.queues.find((q) => q.id === value.incoming?.queueId)?.name
          }
          speakerMuted={speakerMuted}
          onAnswer={() => void onAnswer()}
          onDecline={() => void onDecline()}
        />
      ) : null}
      {showFloatingRoom ? (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl sm:inset-x-auto sm:end-4 sm:bottom-4">
          <CallCenterSoftphoneRoom
            token={media!.token}
            serverUrl={media!.serverUrl}
            held={held}
            answeredAt={activeCall?.answeredAt}
            callerLabel={
              activeCall?.direction === "outbound"
                ? activeCall.toE164
                : activeCall?.fromE164 || t("callCenter.unknownCaller")
            }
            transferTargets={transferTargets}
            micMuted={micMuted}
            onMicMutedChange={setMicMuted}
            compact
            onHangup={() => void onHangup()}
            onHoldToggle={() => void onHoldToggle()}
            onDtmf={(digit) => void onDtmf(digit)}
            onTransfer={(type, target) => void onTransfer(type, target)}
          />
        </div>
      ) : null}
    </SoftphoneContext.Provider>
  );
}
