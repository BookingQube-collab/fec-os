import { HrAssistProvider } from "@/components/hr/hr-people-assist";

export default function PeopleSectionLayout({ children }: { children: React.ReactNode }) {
  return <HrAssistProvider>{children}</HrAssistProvider>;
}
