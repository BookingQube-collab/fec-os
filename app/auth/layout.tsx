import { AsciiPageReveal } from "@/components/loading/ascii-page-reveal";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AsciiPageReveal className="min-h-screen">{children}</AsciiPageReveal>;
}
