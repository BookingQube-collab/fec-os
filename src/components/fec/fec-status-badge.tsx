import StatusMark, { type StatusMarkStatus } from "@/components/react-bits/status-mark";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = NonNullable<BadgeProps["variant"]>;

const STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  completed: "success",
  done: "success",
  approved: "success",
  operational: "success",
  online: "success",
  healthy: "success",
  pending: "warning",
  due: "warning",
  warning: "warning",
  watch: "warning",
  wip: "warning",
  in_progress: "info",
  "in-progress": "info",
  progress: "info",
  info: "info",
  draft: "muted",
  inactive: "muted",
  cancelled: "muted",
  archived: "muted",
  offline: "muted",
  critical: "destructive",
  overdue: "destructive",
  failed: "destructive",
  rejected: "destructive",
  expired: "destructive",
  error: "destructive",
};

export interface FecStatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: string;
  /** Override auto-mapped tone. */
  tone?: StatusTone;
}

function markForTone(tone: StatusTone): StatusMarkStatus {
  if (tone === "success") return "done";
  if (tone === "destructive") return "failed";
  if (tone === "warning" || tone === "info") return "running";
  if (tone === "muted") return "cancelled";
  return "pending";
}

/** Maps common status strings → Badge tone plus the React Bits Micro status mark. */
export function FecStatusBadge({ status, tone, className, children, ...props }: FecStatusBadgeProps) {
  const key = status.trim().toLowerCase().replace(/\s+/g, "_");
  const variant = tone ?? STATUS_TONE[key] ?? STATUS_TONE[status.trim().toLowerCase()] ?? "outline";
  return (
    <Badge variant={variant} className={cn("uppercase tracking-wide", className)} {...props}>
      <StatusMark status={markForTone(variant)} size={14} />
      {children ?? status}
    </Badge>
  );
}
