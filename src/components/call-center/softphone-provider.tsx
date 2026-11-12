"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  hangupCallCenterCall,
  holdCallCenterCall,
  loadCallCenterAgentWorkspace,
  loadCallCenterWallboard,
  placeCallCenterOutbound,
  pollCallCenterIncoming,
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
  CallCenterAgentStatusValue,
  CallCenterCall,
  CallCenterMediaSession,
  CallCenterTransferTarget,
} from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";

const WORKSPACE_KEY = ["call-center", "workspace"] as const;

type SoftphoneContextValue = {
  canUse: boolean;
  pending: boolean;
  workspaceLoading: boolean;
  workspaceError: boolean;
  workspaceStatus: CallCenterAgentStatusValue;
  sipConfigured: boolean;
  livekitReady: boolean;
  dialDigits: string;
  setDialDigits: (value: string | ((prev: string) => string)) => void;
  activeCall: CallCenterCall | null;
  media: CallCenterMediaSession | null;
  held: boolean;
  incoming: CallCenterCall | null;
  recentCalls: CallCenterCall[];
  transferTargets: CallCenterTransferTarget[];
  agentUserId: string | null;
  changeStatus: (status: CallCenterAgentStatusValue) => Promise<void>;
  onTestRing: () => Promise<void>;
  onDial: () => Promise<void>;
  onAnswer: () => Promise<void>;
  onDecline: () => Promise<void>;
  onHangup: () => Promise<void>;
  onHoldToggle: () => Promise<void>;
  onDtmf: (digit: string) => Promise<void>;
  onTransfer: (type: "cold" | "warm", target: string) => Promise<void>;
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
  const [dialDigits, setDialDigits] = useState("+974");

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

  const transferTargets = useMemo((): CallCenterTransferTarget[] => {
    const agents = wallboard.data?.agents ?? [];
    return agents
      .filter((a) => a.userId !== user?.id && a.status === "available")
      .map((a) => ({
        userId: a.userId,
        status: a.status,
        label: `${a.userId.slice(0, 8)}…`,
      }));
  }, [wallboard.data?.agents, user?.id]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
  }, [queryClient]);

  async function changeStatus(status: CallCenterAgentStatusValue) {
    await unlockSoftphoneAudio();
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

  async function onDial() {
    stopSoftphoneRingtone();
    await unlockSoftphoneAudio();
    setPending(true);
    const result = await placeCallCenterOutbound({
      toE164: dialDigits,
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
    if (!result.data.media.token || !result.data.media.serverUrl.startsWith("wss://")) {
      toast.message(t("callCenter.mediaNotConfigured"));
    }
    await refresh();
    toast.success(t("callCenter.outboundStarted"));
  }

  async function onAnswer() {
    if (!incoming) return;
    stopSoftphoneRingtone();
    await unlockSoftphoneAudio();
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
    setPending(true);
    const result = await hangupCallCenterCall({ callId: activeCall.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setActiveCall(null);
    setMedia(null);
    setHeld(false);
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
    } else {
      setActiveCall(result.data);
      setHeld(true);
    }
    await refresh();
  }

  const value: SoftphoneContextValue = {
    canUse,
    pending,
    workspaceLoading: workspace.isLoading,
    workspaceError: workspace.isError,
    workspaceStatus: workspace.data?.status.status ?? "offline",
    sipConfigured: Boolean(workspace.data?.settings.sipConfigured),
    livekitReady: Boolean(workspace.data?.settings.livekitReady),
    dialDigits,
    setDialDigits,
    activeCall,
    media,
    held,
    incoming: activeCall ? null : incoming,
    recentCalls: workspace.data?.recentCalls ?? [],
    transferTargets,
    agentUserId: user?.id ?? null,
    changeStatus,
    onTestRing,
    onDial,
    onAnswer,
    onDecline,
    onHangup,
    onHoldToggle,
    onDtmf,
    onTransfer,
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
            transferTargets={transferTargets}
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
