"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import dynamic from "next/dynamic";

import BlurText from "@/components/react-bits/blur-text";
import { cn } from "@/lib/utils";

const FadeContent = dynamic(() => import("@/components/react-bits/fade-content"));

interface PageHeaderProps {
  icon?: LucideIcon;
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ icon: Icon, kicker, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex min-w-0 max-w-full flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon ? (
          <span className="icon-well icon-well-lg mt-0.5" aria-hidden>
            <Icon strokeWidth={1.5} />
          </span>
        ) : null}
        <div className="min-w-0">
          {kicker ? <p className="section-kicker mb-1.5">{kicker}</p> : null}
          {typeof title === "string" ? (
            <BlurText
              as="h1"
              text={title}
              animateBy="words"
              direction="bottom"
              delay={45}
              stepDuration={0.38}
              animationFrom={{ filter: "blur(8px)", opacity: 0, y: 10 }}
              animationTo={[{ filter: "blur(0px)", opacity: 1, y: 0 }]}
              className="page-title break-words"
            />
          ) : (
            <FadeContent blur duration={0.65} threshold={0.01}>
              <h1 className="page-title break-words">{title}</h1>
            </FadeContent>
          )}
          {subtitle ? <p className="page-subtitle break-words">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3 pt-0.5">{actions}</div>
      ) : null}
    </header>
  );
}
