"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@/components/ui/button";
import { SearchableSelectSearchInput, collectNodeText } from "@/components/ui/searchable-select";
import { matchesSearchQuery } from "@/lib/searchable-select";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      buttonVariants({ variant: "outline" }),
      "min-h-11 w-full justify-between gap-2 px-3.5 py-2.5 font-semibold leading-5 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1 [&_svg]:size-[1.125rem]",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="shrink-0 opacity-70" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1.5", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1.5", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

function isSelectItemElement(node: React.ReactElement): boolean {
  const props = node.props as { "data-slot"?: string };
  return props["data-slot"] === "select-item";
}

function filterSelectChildren(
  children: React.ReactNode,
  query: string,
): { nodes: React.ReactNode; visible: number; total: number } {
  let visible = 0;
  let total = 0;

  const walk = (nodes: React.ReactNode): React.ReactNode => {
    return React.Children.map(nodes, (child) => {
      if (!React.isValidElement(child)) return child;
      if (isSelectItemElement(child)) {
        total += 1;
        const props = child.props as { children?: React.ReactNode; value?: string; textValue?: string; className?: string };
        const haystack = [collectNodeText(props.children), props.textValue, props.value].join(" ");
        const matches = matchesSearchQuery(query, haystack);
        if (matches) visible += 1;
        if (matches) return child;
        return React.cloneElement(child, {
          className: cn(props.className, "hidden"),
        } as Partial<unknown>);
      }
      const nested = (child.props as { children?: React.ReactNode }).children;
      if (nested == null) return child;
      return React.cloneElement(child, undefined, walk(nested));
    });
  };

  return { nodes: walk(children), visible, total };
}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { searchable?: boolean }
>(({ className, children, position = "popper", collisionPadding = 10, searchable = true, ...props }, ref) => {
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const filtered = React.useMemo(() => filterSelectChildren(children, query), [children, query]);
  const showEmpty = searchable && query.trim().length > 0 && filtered.total > 0 && filtered.visible === 0;

  React.useEffect(() => {
    if (!searchable) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [searchable]);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "z-[100] flex max-h-(--radix-select-content-available-height) min-w-[12rem] flex-col overflow-hidden rounded-[1.25rem] border border-border bg-popover text-popover-foreground shadow-elevated-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-select-content-transform-origin)",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        collisionPadding={collisionPadding}
        {...props}
      >
        {searchable ? (
          <div className="shrink-0 border-b border-border/60 bg-popover p-1.5">
            <SearchableSelectSearchInput
              inputRef={inputRef}
              value={query}
              onChange={setQuery}
              placeholder={t("common.searchHere")}
              role="searchbox"
              onKeyDown={(e) => {
                if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
                  e.stopPropagation();
                }
              }}
            />
          </div>
        ) : null}
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "min-h-0 flex-1 overflow-y-auto p-1.5",
            position === "popper" && "w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {filtered.nodes}
          {showEmpty ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">{t("common.searchNoMatches")}</div>
          ) : null}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-3 py-2 text-sm font-semibold", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    data-slot="select-item"
    className={cn(
      "relative flex min-h-9 w-full cursor-pointer select-none items-center rounded-full py-2 ps-3 pe-9 text-sm outline-none transition-colors focus:bg-secondary focus:text-foreground data-[highlighted]:bg-secondary data-[highlighted]:text-foreground data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
      className,
    )}
    {...props}
  >
    <span className="absolute end-2.5 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1.5 h-px bg-border", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
