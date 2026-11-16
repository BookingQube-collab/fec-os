import { CallCenterAudioGate } from "@/components/call-center/call-center-audio-gate";
import { CallCenterSoftphoneProvider } from "@/components/call-center/softphone-provider";

/** completePstnBridge: agent publish wait + Telnyx transfer + LiveKit SIP verify (~50s). */
export const maxDuration = 120;

export default function CallCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <CallCenterAudioGate>
      <CallCenterSoftphoneProvider>{children}</CallCenterSoftphoneProvider>
    </CallCenterAudioGate>
  );
}
