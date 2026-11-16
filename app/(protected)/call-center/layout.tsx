import { CallCenterAudioGate } from "@/components/call-center/call-center-audio-gate";
import { CallCenterSoftphoneProvider } from "@/components/call-center/softphone-provider";

/** completePstnBridge: agent mic wait + LiveKit outbound dial (~25s ring). */
export const maxDuration = 60;

export default function CallCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <CallCenterAudioGate>
      <CallCenterSoftphoneProvider>{children}</CallCenterSoftphoneProvider>
    </CallCenterAudioGate>
  );
}
