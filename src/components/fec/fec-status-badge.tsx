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

/** Maps common status strings → Badge success/warning/info/muted/destructive. */
export function FecStatusBadge({ status, tone, className, children, ...props }: FecStatusBadgeProps) {
  const key = status.trim().toLowerCase().replace(/\s+/g, "_");
  const variant = tone ?? STATUS_TONE[key] ?? STATUS_TONE[status.trim().toLowerCase()] ?? "outline";
  return (
    <Badge variant={variant} className={cn("uppercase tracking-wide", className)} {...props}>
      {children ?? status}
    </Badge>
  );
}
