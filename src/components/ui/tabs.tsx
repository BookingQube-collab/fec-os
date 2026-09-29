"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import {
  pillScrollFrameClass,
  pillScrollMaskStyle,
  pillScrollportClass,
  pillScrollTrackClass,
  splitPillFrameClass,
} from "@/components/react-bits/pill-tab-scroll";
import { PillTabScrollButtons, usePillTabScroll } from "@/components/react-bits/pill-tab-scroller";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, style, ...props }, ref) => {
  const scroll = usePillTabScroll<HTMLDivElement>(ref);
  const { frame, port } = splitPillFrameClass(className);
  return (
    <div className={cn(pillScrollFrameClass, frame)}>
      <div className={pillScrollTrackClass(port)}>
        {scroll.edges.start ? (
          <PillTabScrollButtons edges={{ start: true, end: false }} onScroll={scroll.scroll} />
        ) : null}
        <TabsPrimitive.List
          ref={scroll.ref}
          style={{ ...style, ...pillScrollMaskStyle(scroll.edges, scroll.rtl) }}
          className={cn(pillScrollportClass, "justify-start", port)}
          {...props}
        />
        {scroll.edges.end ? (
          <PillTabScrollButtons edges={{ start: false, end: true }} onScroll={scroll.scroll} />
        ) : null}
      </div>
    </div>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-full min-h-9 shrink-0 items-center justify-center gap-2 overflow-visible whitespace-nowrap rounded-full px-4 text-sm font-medium leading-5 ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-foreground data-[state=inactive]:hover:bg-card/70 data-[state=inactive]:hover:text-foreground [&_svg]:size-4",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
