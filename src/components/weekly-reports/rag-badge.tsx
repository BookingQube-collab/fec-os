import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RagStatus } from "@/lib/weekly-reports/executive-report-types";

const RAG_LABEL: Record<RagStatus, string> = {
  green: "G",
  amber: "A",
  red: "R",
};

const RAG_CLASS: Record<RagStatus, string> = {
  green: "bg-rag-green rag-green border-emerald-500/30",
  amber: "bg-rag-amber rag-amber border-amber-500/30",
  red: "bg-rag-red rag-red border-red-500/30",
};

export function RagBadge({ rag, className }: { rag: RagStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px] uppercase", RAG_CLASS[rag], className)}>
      {RAG_LABEL[rag]}
    </Badge>
  );
}

export function RagDot({ rag }: { rag: RagStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        rag === "green" && "bg-emerald-500",
        rag === "amber" && "bg-amber-500",
        rag === "red" && "bg-red-500",
      )}
      title={rag}
    />
  );
}
