"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { reportClientCrash } from "@/lib/diagnostics.functions";

const LAST_REPORT_KEY = "fec.diagnostics.lastCrash";

function shouldSkipDuplicate(message: string, route: string): boolean {
  try {
    const raw = sessionStorage.getItem(LAST_REPORT_KEY);
    if (!raw) return false;
    const last = JSON.parse(raw) as { message?: string; route?: string; at?: number };
    return (
      last.message === message &&
      last.route === route &&
      typeof last.at === "number" &&
      Date.now() - last.at < 60_000
    );
  } catch {
    return false;
  }
}

function rememberReport(message: string, route: string) {
  try {
    sessionStorage.setItem(LAST_REPORT_KEY, JSON.stringify({ message, route, at: Date.now() }));
  } catch {
    /* ignore quota */
  }
}

function reportCrash(error: Error, info: ErrorInfo, route: string) {
  const message = error.message || "Unhandled render error";
  if (shouldSkipDuplicate(message, route)) return;
  rememberReport(message, route);
  void reportClientCrash({
    message,
    stack: error.stack?.slice(0, 16000),
    route,
    severity: "critical",
    componentStack: info.componentStack?.slice(0, 16000),
    digest: (error as Error & { digest?: string }).digest,
  });
}

class CrashErrorBoundary extends Component<
  { children: ReactNode; route: string; fallback?: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportCrash(error, info, this.props.route);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return <CrashFallback error={this.state.error} onReload={() => this.setState({ error: null })} />;
  }
}

function CrashFallback({ error, onReload }: { error: Error; onReload: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-elevated-xs">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("diagnostics.crash.kicker")}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">{t("diagnostics.crash.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("diagnostics.crash.body")}</p>
      <p className="mt-3 font-mono text-xs text-rose-600">{error.message}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => window.location.reload()}>
          {t("diagnostics.crash.reload")}
        </Button>
        <Button size="sm" variant="outline" onClick={onReload}>
          {t("diagnostics.crash.retry")}
        </Button>
      </div>
    </div>
  );
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  return <CrashErrorBoundary route={pathname}>{children}</CrashErrorBoundary>;
}
