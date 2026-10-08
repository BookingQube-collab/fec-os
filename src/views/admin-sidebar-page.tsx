"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, GripVertical, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ItemDragBucket, ItemDragRow, ItemDragScope, NavDragRow } from "@/components/layout/nav-drag-row";
import { FecButton as Button, FecLoader, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useSidebarNavOrder } from "@/hooks/use-sidebar-nav-order";
import { clusterItemsBySection, NAV_DEPARTMENTS, type NavDepartment } from "@/lib/nav-config";
import {
  applySidebarItemOrder,
  canReorderSidebarNav,
  moveNavDepartment,
  moveNavItem,
  normalizeItemOrders,
  normalizeNavDepartmentOrder,
  orderDepartments,
} from "@/lib/nav-order";
import { reorderSidebarNavWithInstruction } from "@/lib/nav-order.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function linkCount(dept: NavDepartment) {
  return dept.items.length + (dept.groups ?? []).reduce((sum, group) => sum + group.items.length, 0);
}

function OrderLinkList({
  items,
  t,
}: {
  items: ReadonlyArray<{ labelKey: string; href: string; sectionKey?: string }>;
  t: (key: string) => string;
}) {
  const blocks = clusterItemsBySection(items);
  return (
    <>
      {blocks.map((block, index) => {
        const list = (
          <ul className="space-y-0.5">
            {block.items.map((item) => (
              <li key={`${item.labelKey}:${item.href}`}>
                <ItemDragRow item={item}>
                  <div className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-foreground">
                    {t(item.labelKey)}
                  </div>
                </ItemDragRow>
              </li>
            ))}
          </ul>
        );
        if (!block.sectionKey) {
          return <div key={`plain:${block.items[0]?.href ?? index}`}>{list}</div>;
        }
        return (
          <NavSectionBlock key={`${block.sectionKey}:${index}`} label={t(block.sectionKey)} count={block.items.length}>
            {list}
          </NavSectionBlock>
        );
      })}
    </>
  );
}

function NavSectionBlock({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pt-1">
      <button
        type="button"
        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-start touch-manipulation"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </button>
      {open ? <div className="ms-3 border-s border-border/70 ps-2">{children}</div> : null}
    </div>
  );
}

function AdminSidebarPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const canEdit = canReorderSidebarNav(roles);
  const { order, itemOrders, ready, save, saveItems } = useSidebarNavOrder();
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");
  const [applying, setApplying] = useState(false);
  const [openId, setOpenId] = useState<string | null>("people");
  const departments = applySidebarItemOrder(orderDepartments(NAV_DEPARTMENTS, order), itemOrders);

  useEffect(() => {
    if (!canEdit || !ready) return;
    if (window.location.hash !== "#arrange-automatically") return;
    document.getElementById("arrange-automatically")?.scrollIntoView({ block: "center" });
    const field = document.getElementById("sidebar-order-instruction");
    if (field instanceof HTMLInputElement) field.focus();
  }, [canEdit, ready]);

  async function move(activeId: string, overId: string) {
    if (activeId.startsWith("nav-item:")) return;
    const next = moveNavDepartment(order, activeId, overId);
    try {
      await save(next);
      toast.success(t("sidebarOrder.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sidebarOrder.forbidden"));
    }
  }

  async function moveItem(bucket: string, activeKey: string, overKey: string) {
    const next = moveNavItem(itemOrders, bucket, activeKey, overKey);
    try {
      await saveItems(next);
      toast.success(t("sidebarOrder.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sidebarOrder.forbidden"));
    }
  }

  async function applyInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = instruction.trim();
    if (text.length < 2 || applying) return;
    setApplying(true);
    const result = await reorderSidebarNavWithInstruction({ instruction: text });
    setApplying(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    queryClient.setQueryData(queryKeys.nav.departmentOrder(), {
      departmentIds: normalizeNavDepartmentOrder(result.data.departmentIds),
      itemOrders: normalizeItemOrders(result.data.itemOrders),
    });
    setInstruction("");
    toast.success(
      result.data.source === "ai" ? t("sidebarOrder.appliedAi") : t("sidebarOrder.appliedRules"),
    );
  }

  return (
    <div className="space-y-5">
      <FecPageHeader
        icon={GripVertical}
        kicker={t("sidebarOrder.kicker")}
        title={t("sidebarOrder.title")}
        subtitle={t("sidebarOrder.subtitle")}
      />
      {!canEdit ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("sidebarOrder.forbidden")}
        </p>
      ) : !ready ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <ItemDragScope enabled label={t("sidebarOrder.dragItem")} onMove={(bucket, activeKey, overKey) => void moveItem(bucket, activeKey, overKey)}>
          <div className="max-w-3xl space-y-4">
            <form
              id="arrange-automatically"
              className="scroll-mt-6 space-y-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-elevated-xs"
              onSubmit={(event) => {
                void applyInstruction(event);
              }}
            >
              <div className="flex items-start gap-3">
                <span className="icon-well">
                  <Sparkles className="h-4 w-4 stroke-[1.5]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{t("sidebarOrder.arrangeAuto")}</p>
                  <p className="text-xs text-muted-foreground">{t("sidebarOrder.arrangeAutoHint")}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sidebar-order-instruction">{t("sidebarOrder.instruction")}</Label>
                <Input
                  id="sidebar-order-instruction"
                  name="instruction"
                  value={instruction}
                  placeholder={t("sidebarOrder.placeholder")}
                  maxLength={400}
                  autoComplete="off"
                  onChange={(event) => setInstruction(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={applying || instruction.trim().length < 2}>
                {applying ? t("sidebarOrder.applying") : t("sidebarOrder.arrangeAuto")}
              </Button>
            </form>
            <ol className="space-y-2">
              {departments.map((dept) => {
                const Icon = dept.icon;
                const open = openId === dept.id;
                const count = linkCount(dept);
                return (
                  <li key={dept.id} className="rounded-2xl border border-border/50 bg-card shadow-elevated-xs">
                    <NavDragRow
                      id={dept.id}
                      enabled
                      label={t("sidebarOrder.drag")}
                      onMove={(activeId, overId) => {
                        void move(activeId, overId);
                      }}
                    >
                      <div className="min-w-0 py-1 pe-2">
                        <button
                          type="button"
                          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-start touch-manipulation"
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : dept.id)}
                        >
                          <span className="icon-well">
                            <Icon className="h-4 w-4 stroke-[1.5]" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground">{t(dept.labelKey)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t("sidebarOrder.linkCount", { count })}
                            </span>
                          </span>
                          <ChevronDown
                            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                            aria-hidden
                          />
                        </button>
                        {open ? (
                          <div className="space-y-1 pb-2">
                            <ItemDragBucket bucket={dept.id}>
                              <OrderLinkList items={dept.items} t={t} />
                            </ItemDragBucket>
                            {(dept.groups ?? []).map((group) => {
                              const sectioned = group.items.some((item) => item.sectionKey);
                              const list = <OrderLinkList items={group.items} t={t} />;
                              return (
                                <ItemDragBucket key={group.id} bucket={`${dept.id}:${group.id}`}>
                                  {sectioned ? (
                                    list
                                  ) : (
                                    <NavSectionBlock label={t(group.labelKey)} count={group.items.length}>
                                      {list}
                                    </NavSectionBlock>
                                  )}
                                </ItemDragBucket>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </NavDragRow>
                  </li>
                );
              })}
            </ol>
          </div>
        </ItemDragScope>
      )}
    </div>
  );
}

export default AdminSidebarPage;
