import { CallCenterAudioGate } from "@/components/call-center/call-center-audio-gate";
import { CallCenterSoftphoneProvider } from "@/components/call-center/softphone-provider";

export default function CallCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <CallCenterAudioGate>
      <CallCenterSoftphoneProvider>{children}</CallCenterSoftphoneProvider>
    </CallCenterAudioGate>
  );
}
