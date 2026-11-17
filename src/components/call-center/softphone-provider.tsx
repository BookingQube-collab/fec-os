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
  completeCallCenterPstnBridge,
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
  refreshCallCenterMedia,
  retrieveCallCenterParkedCall,
  saveCallCenterAgentNotes,
  saveCallCenterCallTags,
  saveCallCenterSpeedDial,
  sendCallCenterDtmf,
  setCallCenterAgentStatus,
  testCallCenterRing,
  transferCallCenterCall,
  startCallCenterConference,
} from "@/lib/call-center/call-center.functions";
import { collectOwnedE164s, remotePartyE164 } from "@/lib/call-center/call-party";
import {
  canShowIncomingOffer,
  pickActiveIncomingOffer,
} from "@/lib/call-center/incoming-offer";
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
const RINGING_KEY = ["call-center", "ringing"] as const;
const SPEAKER_MUTE_KEY = "cc-speaker-muted:v1";

type SoftphoneContextValue = {
  canUse: boolean;
  pending: boolean;
  workspaceLoading: boolean;
  workspaceError: boolean;
  workspaceStatus: CallCenterAgentStatusValue;
  autoAnswer: boolean;
  awayReason: string;
  outboundCallerId: string;
  setOutboundCallerId: (value: string) => void;
  callerIdOptions: string[];
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
  tagsDraft: string[];
  setTagsDraft: (value: string[] | ((prev: string[]) => string[])) => void;
  onSaveTags: () => Promise<void>;
  changeStatus: (
    status: CallCenterAgentStatusValue,
    extras?: { awayReason?: string; autoAnswer?: boolean },
  ) => Promise<void>;
  setAutoAnswer: (enabled: boolean) => Promise<void>;
  onTestRing: () => Promise<void>;
  onDial: (toE164?: string) => Promise<void>;
  onCallback: (call: CallCenterCall) => void;
  /** Take a live inbound still on IVR / queued / ringing (same bridge as Accept). */
  onConnectDirectly: (call: CallCenterCall) => Promise<void>;
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
  onConference: (targetUserId?: string) => Promise<void>;
  /** SoftphoneRoom calls this after connect + mic publish so Telnyx can transfer into LiveKit. */
  onRoomReady: () => void;
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

function ownedNumbersFromWorkspace(
  settings: {
    outboundCallerIdE164?: string;
    qatarDidE164?: string;
  } | null | undefined,
  didE164s: string[] = [],
): string[] {
  return collectOwnedE164s({
    outboundCallerIdE164: settings?.outboundCallerIdE164,
    qatarDidE164: settings?.qatarDidE164,
    didE164s,
  });
}

function callbackNumber(call: CallCenterCall, ownedE164s: string[] = []): string {
  return remotePartyE164(call, ownedE164s);
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
  const [outboundCallerId, setOutboundCallerId] = useState("");
  const [awayReasonDraft, setAwayReasonDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesCallId, setNotesCallId] = useState<string | null>(null);
  const [tagsDraft, setTagsDraft] = useState<string[]>([]);
  const [acwRemaining, setAcwRemaining] = useState<number | null>(null);
  const [lastEndedCallId, setLastEndedCallId] = useState<string | null>(null);
  const missedAlertedRef = useRef<Set<string>>(new Set());
  const acwTimerRef = useRef<number | null>(null);
  const wrapUpRef = useRef(30);
  /** Call id waiting for softphone onReady → completeCallCenterPstnBridge. */
  const needsPstnBridgeRef = useRef<string | null>(null);
  const pstnBridgeInFlightRef = useRef(false);

  const workspace = useQuery({
    queryKey: WORKSPACE_KEY,
    enabled: canUse,
    // Faster while callers are live on IVR / queue so Recent shows Connect promptly.
    refetchInterval: (query) => {
      if (activeCall) return 3_000;
      const recent = query.state.data?.recentCalls ?? [];
      const hasLiveWaiting = recent.some((c) =>
        ["ivr", "queued", "ringing", "offered"].includes(c.status),
      );
      return hasLiveWaiting ? 2_500 : 8_000;
    },
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

  const allowIncoming = canShowIncomingOffer({
    workspaceStatus: workspace.data?.status.status,
    activeCall: Boolean(activeCall),
    acwRemaining,
  });

  const ringingQuery = useQuery({
    queryKey: RINGING_KEY,
    enabled: canUse && allowIncoming,
    refetchInterval: 2_000,
    queryFn: async () => {
      const result = await pollCallCenterIncoming({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  // Disabled queries keep stale data — never surface Incoming during ACW/busy from cache.
  const incoming = allowIncoming
    ? pickActiveIncomingOffer(
        ringingQuery.data ?? workspace.data?.ringing,
        workspace.data?.recentCalls ?? [],
      )
    : null;
  wrapUpRef.current = workspace.data?.wrapUpSeconds ?? 30;
  const autoAnswerEnabled = Boolean(workspace.data?.status.autoAnswer);
  const defaultCallerId = workspace.data?.settings.outboundCallerIdE164?.trim() || "";
  const callerIdOptions = useMemo(() => {
    const dids = (workspace.data?.dids ?? []).map((d) => d.e164).filter(Boolean);
    const opts = [defaultCallerId, ...dids].filter(Boolean);
    return [...new Set(opts)];
  }, [workspace.data?.dids, defaultCallerId]);

  useEffect(() => {
    if (!outboundCallerId && defaultCallerId) setOutboundCallerId(defaultCallerId);
    else if (!outboundCallerId && callerIdOptions[0]) setOutboundCallerId(callerIdOptions[0]);
  }, [defaultCallerId, callerIdOptions, outboundCallerId]);

  useEffect(() => {
    const reason = workspace.data?.status.awayReason ?? "";
    if (reason) setAwayReasonDraft(reason);
  }, [workspace.data?.status.awayReason]);

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
      setTagsDraft(activeCall.tags ?? []);
    }
  }, [activeCall?.id]);

  const clearIncomingCache = useCallback(() => {
    queryClient.setQueryData(RINGING_KEY, []);
    void queryClient.cancelQueries({ queryKey: RINGING_KEY });
    queryClient.setQueryData(
      WORKSPACE_KEY,
      (prev: { ringing?: CallCenterCall[] } | undefined) =>
        prev ? { ...prev, ringing: [] } : prev,
    );
  }, [queryClient]);

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
      clearIncomingCache();
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
    [clearAcwTimer, clearIncomingCache, queryClient, t],
  );

  useEffect(() => () => clearAcwTimer(), [clearAcwTimer]);

  // Carrier events (caller hung up, PSTN dial failed, …) close the CDR server-side: mirror that here.
  useEffect(() => {
    if (!activeCall) return;
    const latest = workspace.data?.recentCalls.find((c) => c.id === activeCall.id);
    if (!latest || !["ended", "missed", "failed", "declined"].includes(latest.status)) return;
    if (latest.status === "failed") {
      toast.error(latest.hangupReason || t("callCenter.callFailedRemote"));
    } else {
      toast.message(t("callCenter.callEndedRemote"));
    }
    setLastEndedCallId(latest.id);
    setActiveCall(null);
    setMedia(null);
    setHeld(false);
    setMicMuted(false);
    startAcwTimer(wrapUpRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to server CDR updates only
  }, [workspace.data?.recentCalls, activeCall?.id]);

  // PSTN cancel while ringing: drop stale Incoming as soon as Recent shows missed/declined.
  useEffect(() => {
    if (!incoming) return;
    const latest = workspace.data?.recentCalls.find((c) => c.id === incoming.id);
    if (!latest || !["ended", "missed", "failed", "declined"].includes(latest.status)) return;
    clearIncomingCache();
    stopSoftphoneRingtone();
  }, [workspace.data?.recentCalls, incoming?.id, clearIncomingCache]);

  const transferTargets = useMemo((): CallCenterTransferTarget[] => {
    const agents = wallboard.data?.agents ?? workspace.data?.agents ?? [];
    return agents
      .filter((a) => a.userId !== user?.id && a.status === "available")
      .map((a) => ({
        userId: a.userId,
        status: a.status,
        label: a.displayName,
      }));
  }, [wallboard.data?.agents, workspace.data?.agents, user?.id]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
  }, [queryClient]);

  async function changeStatus(
    status: CallCenterAgentStatusValue,
    extras?: { awayReason?: string; autoAnswer?: boolean },
  ) {
    if (status !== "acw") clearAcwTimer();

    const awayReason =
      extras?.awayReason ?? (status === "away" ? awayReasonDraft : undefined);
    const previous = queryClient.getQueryData<NonNullable<typeof workspace.data>>(WORKSPACE_KEY);

    // Optimistic UI: highlight the new status immediately; sync server in the background.
    if (previous) {
      const nextAway =
        status === "away" ? (awayReason ?? previous.status.awayReason ?? "") : "";
      const nextAutoAnswer = extras?.autoAnswer ?? previous.status.autoAnswer;
      const nextStatus: CallCenterAgentStatus = {
        ...previous.status,
        status,
        statusSince: new Date().toISOString(),
        awayReason: nextAway,
        autoAnswer: nextAutoAnswer,
      };
      const agents = previous.agents.map((a) =>
        a.userId === previous.status.userId ? { ...a, ...nextStatus } : a,
      );
      queryClient.setQueryData(WORKSPACE_KEY, {
        ...previous,
        status: nextStatus,
        agents,
        availableAgents: agents.filter((a) => a.status === "available"),
      });
      if (status === "away" && nextAway) setAwayReasonDraft(nextAway);
    }

    void unlockSoftphoneAudio();

    const result = await setCallCenterAgentStatus({
      status,
      awayReason,
      autoAnswer: extras?.autoAnswer,
    });
    if (!result.ok) {
      if (previous) queryClient.setQueryData(WORKSPACE_KEY, previous);
      toast.error(result.error);
      return;
    }

    // Prefer server row when available; keep optimistic UI and refresh quietly.
    if (result.data) {
      const current =
        queryClient.getQueryData<NonNullable<typeof workspace.data>>(WORKSPACE_KEY) ?? previous;
      if (current) {
        const saved = result.data;
        const agents = current.agents.map((a) =>
          a.userId === saved.userId ? { ...a, ...saved } : a,
        );
        queryClient.setQueryData(WORKSPACE_KEY, {
          ...current,
          status: saved,
          agents,
          availableAgents: agents.filter((a) => a.status === "available"),
        });
      }
    }

    toast.success(t("callCenter.statusUpdated"));
    void queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
  }

  async function setAutoAnswer(enabled: boolean) {
    const status = workspace.data?.status.status ?? "available";
    await changeStatus(status, { autoAnswer: enabled });
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
      fromE164: outboundCallerId || workspace.data?.settings.outboundCallerIdE164 || undefined,
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
    const owned = ownedNumbersFromWorkspace(workspace.data?.settings);
    const number = callbackNumber(call, owned);
    if (!number) {
      toast.error(t("callCenter.callbackMissing"));
      return;
    }
    setDialDigits(number);
    void onDial(number);
  }

  const onRoomReady = useCallback(() => {
    const callId = needsPstnBridgeRef.current;
    if (!callId || pstnBridgeInFlightRef.current) return;
    pstnBridgeInFlightRef.current = true;
    void (async () => {
      try {
        const result = await completeCallCenterPstnBridge({ callId });
        if (!result.ok) {
          needsPstnBridgeRef.current = null;
          setActiveCall(null);
          setMedia(null);
          toast.error(result.error || t("callCenter.answerFailed"));
          void refresh();
          return;
        }
        needsPstnBridgeRef.current = null;
        setActiveCall(result.data);
        void refresh();
      } catch (e) {
        needsPstnBridgeRef.current = null;
        setActiveCall(null);
        setMedia(null);
        toast.error(e instanceof Error ? e.message : t("callCenter.answerFailed"));
        void refresh();
      } finally {
        pstnBridgeInFlightRef.current = false;
      }
    })();
  }, [refresh, t]);

  async function bridgeAnsweredCall(callId: string, opts?: { successKey?: string }) {
    stopSoftphoneRingtone();
    void unlockSoftphoneAudio();
    clearAcwTimer();
    clearIncomingCache();

    // Optimistic: leave Incoming modal immediately and show Connecting… while agent joins room.
    const seed =
      (incoming?.id === callId ? incoming : null) ??
      workspace.data?.recentCalls.find((c) => c.id === callId) ??
      null;
    if (seed) {
      setActiveCall({
        ...seed,
        status: "answered",
        answeredAt: new Date().toISOString(),
        agentUserId: user?.id ?? seed.agentUserId,
        recordingEnabled:
          workspace.data?.settings.recordAllCalls !== false ? true : seed.recordingEnabled,
      });
      setMedia(null);
      setHeld(false);
      setMicMuted(false);
    }

    setPending(true);
    try {
      const result = await answerCallCenterCall({ callId });
      if (!result.ok) {
        needsPstnBridgeRef.current = null;
        setActiveCall(null);
        setMedia(null);
        toast.error(result.error || t("callCenter.answerFailed"));
        void refresh();
        return;
      }
      // Set bridge intent BEFORE media so SoftphoneRoom onReady can transfer immediately.
      needsPstnBridgeRef.current = result.data.needsPstnBridge ? result.data.call.id : null;
      pstnBridgeInFlightRef.current = false;
      setActiveCall(result.data.call);
      setMedia(result.data.media);
      setHeld(false);
      setMicMuted(false);
      if (!result.data.media.token || !result.data.media.serverUrl.startsWith("wss://")) {
        toast.error(t("callCenter.mediaNotConfigured"));
      } else if (opts?.successKey) {
        toast.success(t(opts.successKey));
      }
      void refresh();
    } catch (e) {
      needsPstnBridgeRef.current = null;
      setActiveCall(null);
      setMedia(null);
      toast.error(e instanceof Error ? e.message : t("callCenter.answerFailed"));
      void refresh();
    } finally {
      setPending(false);
    }
  }

  async function onConnectDirectly(call: CallCenterCall) {
    if (activeCall || pending) return;
    if (!["queued", "ringing", "offered"].includes(call.status)) {
      toast.error(
        call.status === "ivr"
          ? t("callCenter.connectDirectIvrBlocked")
          : t("callCenter.connectDirectUnavailable"),
      );
      return;
    }
    await bridgeAnsweredCall(call.id, { successKey: "callCenter.connectDirectSuccess" });
  }

  async function onAnswer() {
    if (!incoming) return;
    await bridgeAnsweredCall(incoming.id);
  }

  // Maqsam-style auto-answer when agent profile enables it.
  const autoAnsweredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoAnswerEnabled || !incoming || activeCall || pending) return;
    if (autoAnsweredRef.current === incoming.id) return;
    autoAnsweredRef.current = incoming.id;
    void onAnswer();
  }, [autoAnswerEnabled, incoming?.id, activeCall, pending]);

  async function onDecline() {
    if (!incoming) return;
    stopSoftphoneRingtone();
    clearIncomingCache();
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
    if (tagsDraft.length > 0 && notesCallId === activeCall.id) {
      await saveCallCenterCallTags({ callId: activeCall.id, tags: tagsDraft }).catch(() => undefined);
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
    if (!result.ok) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    setActiveCall(result.data);
    setHeld(false);
    const mediaResult = await refreshCallCenterMedia({ callId: result.data.id });
    setPending(false);
    if (mediaResult.ok) {
      setMedia(mediaResult.data.media);
      if (!mediaResult.data.media.token || !mediaResult.data.media.serverUrl.startsWith("wss://")) {
        toast.message(t("callCenter.mediaNotConfigured"));
      }
    }
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

  async function onSaveTags() {
    if (!notesCallId) {
      toast.error(t("callCenter.notesNoCall"));
      return;
    }
    setPending(true);
    const result = await saveCallCenterCallTags({ callId: notesCallId, tags: tagsDraft });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (activeCall?.id === notesCallId) {
      setActiveCall(result.data);
    }
    toast.success(t("callCenter.tagsSaved"));
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

  async function onConference(targetUserId?: string) {
    if (!activeCall) return;
    const target = targetUserId || transferTargets[0]?.userId;
    if (!target) {
      toast.message(t("callCenter.conferencePickAgent"));
      return;
    }
    setPending(true);
    const result = await startCallCenterConference({
      callId: activeCall.id,
      targetUserId: target,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(result.data.call);
    toast.success(t("callCenter.conferenceStarted"));
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
    if (!canUse || pathname !== "/call-center") return;
    const dial = new URLSearchParams(window.location.search).get("dial");
    if (dial?.trim()) setDialDigits(dial.trim());
  }, [canUse, pathname]);

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
    autoAnswer: autoAnswerEnabled,
    awayReason: workspace.data?.status.awayReason ?? awayReasonDraft,
    outboundCallerId: outboundCallerId || defaultCallerId,
    setOutboundCallerId,
    callerIdOptions,
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
    incoming,
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
    tagsDraft,
    setTagsDraft,
    onSaveTags,
    changeStatus,
    setAutoAnswer,
    onTestRing,
    onDial,
    onCallback,
    onConnectDirectly,
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
    onConference,
    onRoomReady,
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
              activeCall
                ? remotePartyE164(
                    activeCall,
                    ownedNumbersFromWorkspace(workspace.data?.settings),
                  ) || t("callCenter.unknownCaller")
                : t("callCenter.unknownCaller")
            }
            transferTargets={transferTargets}
            micMuted={micMuted}
            speakerMuted={speakerMuted}
            onMicMutedChange={setMicMuted}
            compact
            onHangup={() => void onHangup()}
            onHoldToggle={() => void onHoldToggle()}
            onDtmf={(digit) => void onDtmf(digit)}
            onTransfer={(type, target) => void onTransfer(type, target)}
            onConference={() => void onConference()}
            onReady={onRoomReady}
          />
        </div>
      ) : null}
    </SoftphoneContext.Provider>
  );
}
