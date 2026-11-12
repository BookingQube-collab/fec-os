import { CallCenterAudioGate } from "@/components/call-center/call-center-audio-gate";

export default function CallCenterLayout({ children }: { children: React.ReactNode }) {
  return <CallCenterAudioGate>{children}</CallCenterAudioGate>;
}
