import { HrAssistProvider } from "@/components/hr/hr-people-assist";

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return <HrAssistProvider>{children}</HrAssistProvider>;
}
