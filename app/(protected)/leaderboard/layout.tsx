import { HrAssistProvider } from "@/components/hr/hr-people-assist";

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return <HrAssistProvider>{children}</HrAssistProvider>;
}
