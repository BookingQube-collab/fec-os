import { PrModuleShell } from "@/components/procurement/pr-module-shell";

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  return <PrModuleShell>{children}</PrModuleShell>;
}
