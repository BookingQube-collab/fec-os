import { HrAssistProvider } from "@/components/hr/hr-people-assist";

export default function SopLayout({ children }: { children: React.ReactNode }) {
  return <HrAssistProvider>{children}</HrAssistProvider>;
}
