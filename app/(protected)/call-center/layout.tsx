import { CallCenterAudioGate } from "@/components/call-center/call-center-audio-gate";
import { CallCenterSoftphoneProvider } from "@/components/call-center/softphone-provider";

/** Answer waits for Telnyx→LiveKit SIP join (TCP transfer + verify); allow up to 60s. */
export const maxDuration = 60;

export default function CallCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <CallCenterAudioGate>
      <CallCenterSoftphoneProvider>{children}</CallCenterSoftphoneProvider>
    </CallCenterAudioGate>
  );
}
