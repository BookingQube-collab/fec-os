"use client";

import { ChevronDown, ChevronRight, Info, Minus, Plus, Scan, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  departmentColor,
  expandedChildIds,
  groupOrgChart,
  initialCollapsedIds,
  layoutOrgChart,
  legendForChart,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  orgCurvePath,
  orgDragToken,
  orgPanelGroups,
  parseOrgDragToken,
  personDepartmentKey,
  personInitials,
  type OrgChartSnapshot,
} from "@/lib/org-hierarchy";
import { staffPhotoUrl } from "@/lib/staff-photo";
import { cn } from "@/lib/utils";

type View = { x: number; y: number; zoom: number };
type NodeOffset = { x: number; y: number };

function edgeAnchor(side: "left" | "right") {
  return side === "right"
    ? { right: 0, top: "50%", transform: "translate(50%, -50%)" }
    : { left: 0, top: "50%", transform: "translate(-50%, -50%)" };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function OrgHierarchyBoard({
  snapshot,
  saving,
  onPlace,
  onRemove,
  readOnly = false,
}: {
  snapshot: OrgChartSnapshot;
  saving: boolean;
  onPlace: (staffId: string, managerStaffId: string | null) => void;
  onRemove: (staffId: string) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [departmentsOpen, setDepartmentsOpen] = useState(false);
  const query = search.trim().toLowerCase();

  const grouped = useMemo(() => groupOrgChart(snapshot.people), [snapshot.people]);
  const peopleById = useMemo(() => new Map(snapshot.people.map((person) => [person.staffId, person])), [snapshot.people]);
  const legend = useMemo(() => legendForChart(snapshot.people, grouped.onChart), [snapshot.people, grouped.onChart]);
  const groups = useMemo(() => {
    const all = orgPanelGroups(snapshot.departments, snapshot.people);
    if (!query) return all;
    return all
      .map((group) => ({
        ...group,
        people: group.people.filter(
          (person) =>
            person.fullName.toLowerCase().includes(query) ||
            (person.employeeCode ?? "").toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.people.length > 0);
  }, [snapshot.departments, snapshot.people, query]);

  const toggle = (key: string) => {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-[calc(100vh-14.5rem)] min-h-[36rem] flex-col gap-3 lg:flex-row">
      {readOnly ? null : <>
      <button
        type="button"
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-xl border border-border/60 bg-card px-3 text-sm font-semibold text-foreground shadow-elevated-xs hover:bg-muted",
          departmentsOpen && "hidden",
        )}
        aria-expanded={departmentsOpen}
        aria-controls="org-departments-panel"
        onClick={() => setDepartmentsOpen(true)}
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
        Departments
      </button>
      <aside
        id="org-departments-panel"
        className={cn(
          "flex max-h-[40vh] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevated-xs lg:max-h-none lg:w-80",
          !departmentsOpen && "hidden",
        )}
      >
        <div className="space-y-2 border-b border-border/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-sm font-semibold text-foreground"
              aria-expanded={departmentsOpen}
              aria-controls="org-departments-panel"
              onClick={() => setDepartmentsOpen(false)}
            >
              Departments
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setOpenKeys(new Set(openKeys.size ? [] : groups.map((group) => group.key)))}
              >
                {openKeys.size ? "Collapse" : "Expand"}
              </button>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close departments"
                onClick={() => setDepartmentsOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <label className="sr-only" htmlFor="org-hierarchy-search">
            Search by name
          </label>
          <Input
            id="org-hierarchy-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
            autoComplete="off"
            className="min-h-9 py-1.5 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {grouped.onChart.size} on the chart · {snapshot.people.length} active staff
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No one matches that name.</p>
          ) : (
            groups.map((group) => {
              const expanded = query.length > 0 || openKeys.has(group.key);
              const color = departmentColor(group.key === "__none__" ? null : group.key);
              return (
                <section key={group.key} className="mb-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-muted/60"
                    style={{ paddingInlineStart: 6 + group.depth * 12 }}
                    aria-expanded={expanded}
                    onClick={() => toggle(group.key)}
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{group.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{group.people.length}</span>
                  </button>
                  {expanded ? (
                    group.people.length === 0 ? (
                      <p className="px-8 py-1 text-xs text-muted-foreground">No people</p>
                    ) : (
                      <ul className="space-y-1 pb-1">
                        {group.people.map((person) => (
                          <li key={`${group.key}-${person.staffId}`}>
                            <div
                              draggable={!saving}
                              onDragStart={(event) => {
                                event.dataTransfer.setData("text/plain", orgDragToken(person.staffId));
                                event.dataTransfer.effectAllowed = "move";
                              }}
                              className="flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/40 active:cursor-grabbing [&_img]:pointer-events-none"
                              style={{ marginInlineStart: 18 + group.depth * 12 }}
                            >
                              <PersonAvatar person={person} className="h-8 w-8" />
                              {person.loginLinked === true || person.loginLinked === false ? (
                                <span
                                  className={cn(
                                    "h-2 w-2 shrink-0 rounded-full",
                                    person.loginLinked ? "bg-emerald-500" : "bg-amber-500",
                                  )}
                                  title={
                                    person.loginLinked
                                      ? (person.loginEmail ?? t("people.profile.login.exists"))
                                      : t("people.profile.login.missing")
                                  }
                                />
                              ) : null}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-foreground">{person.fullName}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {person.jobTitle || "Staff"}
                                  {grouped.onChart.has(person.staffId) ? " · On chart" : ""}
                                </span>
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </section>
              );
            })
          )}
        </div>
        <p className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
          Drag onto a card, then choose who reports to whom. Drag onto empty space to put them at the top.
        </p>
      </aside>
      </>}

      <OrgCanvas
        roots={grouped.roots}
        childrenOf={grouped.childrenOf}
        peopleById={peopleById}
        legend={legend}
        saving={saving}
        readOnly={readOnly}
        onChart={grouped.onChart}
        onPlace={onPlace}
        onRemove={onRemove}
      />
    </div>
  );
}

function branchStaffIds(rootId: string, childIdsOf: ReadonlyMap<string, readonly string[]>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    const kids = childIdsOf.get(id);
    if (!kids) continue;
    for (let index = kids.length - 1; index >= 0; index -= 1) {
      const kid = kids[index];
      if (kid) stack.push(kid);
    }
  }
  return ids;
}

function orgCardAtPoint(clientX: number, clientY: number, ignore: ReadonlySet<string> | null): string | null {
  const hidden: HTMLElement[] = [];
  if (ignore?.size) {
    for (const id of ignore) {
      const card = document.querySelector(`[data-org-staff="${CSS.escape(id)}"]`);
      if (!(card instanceof HTMLElement)) continue;
      hidden.push(card);
      card.style.pointerEvents = "none";
    }
  }
  try {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const node of stack) {
      if (!(node instanceof Element)) continue;
      const card = node.closest("[data-org-staff]");
      const id = card?.getAttribute("data-org-staff");
      if (!id || ignore?.has(id)) continue;
      return id;
    }
    return null;
  } finally {
    for (const card of hidden) card.style.pointerEvents = "";
  }
}

function PersonAvatar({
  person,
  className,
}: {
  person: OrgChartSnapshot["people"][number];
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {person.hasPhoto ? (
        <AvatarImage src={staffPhotoUrl(person.staffId, person.photoUpdatedAt)} alt={person.fullName} />
      ) : null}
      <AvatarFallback className="text-[10px] font-semibold">{personInitials(person.fullName)}</AvatarFallback>
    </Avatar>
  );
}

function OrgCanvas({
  roots,
  childrenOf,
  peopleById,
  legend,
  saving,
  readOnly,
  onChart,
  onPlace,
  onRemove,
}: {
  roots: OrgChartSnapshot["people"];
  childrenOf: Map<string, OrgChartSnapshot["people"]>;
  peopleById: Map<string, OrgChartSnapshot["people"][number]>;
  legend: ReturnType<typeof legendForChart>;
  saving: boolean;
  readOnly: boolean;
  onChart: Set<string>;
  onPlace: (staffId: string, managerStaffId: string | null) => void;
  onRemove: (staffId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === "rtl";
  const frameRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ x: 48, y: 40, zoom: 1 });
  const fitted = useRef(false);
  const dragCleanup = useRef<(() => void) | null>(null);
  const dragOriginRef = useRef<"chart" | null>(null);
  const draggedCardRef = useRef(false);
  const offsetsRef = useRef<Map<string, NodeOffset>>(new Map());
  const [offsets, setOffsets] = useState<Map<string, NodeOffset>>(offsetsRef.current);
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const [direction, setDirection] = useState(rtl ? "rtl" : "ltr");
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [dragBranch, setDragBranch] = useState<ReadonlySet<string>>(new Set());
  const [panning, setPanning] = useState(false);
  const [legendPinned, setLegendPinned] = useState(false);
  const [legendHover, setLegendHover] = useState(false);
  const [legendHoverMode, setLegendHoverMode] = useState(false);

  if ((rtl ? "rtl" : "ltr") !== direction) {
    setDirection(rtl ? "rtl" : "ltr");
    const empty = new Map<string, NodeOffset>();
    offsetsRef.current = empty;
    setOffsets(empty);
    fitted.current = false;
  }

  const tree = useMemo(() => {
    const rootIds = roots.map((person) => person.staffId);
    const childIdsOf = new Map<string, string[]>();
    for (const [managerId, children] of childrenOf) {
      childIdsOf.set(
        managerId,
        children.map((person) => person.staffId),
      );
    }
    return { rootIds, childIdsOf };
  }, [roots, childrenOf]);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const defaultCollapsed = useMemo(() => initialCollapsedIds(tree.rootIds, tree.childIdsOf), [tree]);
  const collapsedIds = collapsed ?? defaultCollapsed;
  const visibleChildren = useMemo(
    () => expandedChildIds(tree.rootIds, tree.childIdsOf, collapsedIds),
    [tree, collapsedIds],
  );
  const layout = useMemo(() => layoutOrgChart(tree.rootIds, visibleChildren), [tree, visibleChildren]);
  const rootIds = useMemo(() => new Set(tree.rootIds), [tree]);
  const placed = useMemo(
    () =>
      layout.nodes.map((node) => {
        const custom = offsets.get(node.staffId);
        if (custom) return { staffId: node.staffId, x: custom.x, y: custom.y };
        const baseX = rtl ? layout.width - node.x - ORG_NODE_WIDTH : node.x;
        return { staffId: node.staffId, x: baseX, y: node.y };
      }),
    [layout, offsets, rtl],
  );
  const edges = useMemo(() => {
    const byId = new Map(placed.map((node) => [node.staffId, node]));
    const paths: Array<{ key: string; d: string }> = [];
    for (const [parentId, kids] of visibleChildren) {
      const parent = byId.get(parentId);
      if (!parent) continue;
      for (const kid of kids) {
        const child = byId.get(kid);
        if (!child) continue;
        paths.push({ key: `${parentId}:${kid}`, d: orgCurvePath(parent, child, rtl) });
      }
    }
    return paths;
  }, [placed, visibleChildren, rtl]);
  const bounds = useMemo(() => {
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    for (const node of placed) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + ORG_NODE_WIDTH);
      maxY = Math.max(maxY, node.y + ORG_NODE_HEIGHT);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [placed]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const placedRef = useRef(placed);
  placedRef.current = placed;

  const toggleNode = (staffId: string) => {
    const currentTree = treeRef.current;
    if ((currentTree.childIdsOf.get(staffId)?.length ?? 0) === 0) return;
    setCollapsed((current) => {
      const next = new Set(current ?? initialCollapsedIds(currentTree.rootIds, currentTree.childIdsOf));
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const revealManager = (managerId: string) => {
    const currentTree = treeRef.current;
    setCollapsed((current) => {
      const next = new Set(current ?? initialCollapsedIds(currentTree.rootIds, currentTree.childIdsOf));
      next.delete(managerId);
      return next;
    });
  };

  const clearOffsets = (staffIds: Iterable<string>) => {
    const next = new Map(offsetsRef.current);
    let changed = false;
    for (const id of staffIds) {
      if (next.delete(id)) changed = true;
    }
    if (!changed) return;
    offsetsRef.current = next;
    setOffsets(next);
  };

  const onNodePointerDown = (event: ReactPointerEvent<HTMLElement>, staffId: string) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, [data-org-chrome]")) return;
    // A drag that never received pointerup must not swallow the next click.
    draggedCardRef.current = false;
    // Let the browser start the native drag. preventDefault here cancels it.
    event.stopPropagation();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (dragCleanup.current === finish) dragCleanup.current = null;
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) >= 5) moved = true;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dragged = moved || draggedCardRef.current;
      draggedCardRef.current = false;
      finish();
      if (!dragged) toggleNode(staffId);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      finish();
    };
    dragCleanup.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
    const sync = () => {
      const hoverCapable = media.matches;
      setLegendHoverMode(hoverCapable);
      if (hoverCapable) setLegendPinned(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => () => dragCleanup.current?.(), []);

  const applyView = (next: View) => {
    viewRef.current = next;
    const layer = layerRef.current;
    if (!layer) return;
    layer.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`;
  };

  const fit = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const { minX, minY, width, height } = boundsRef.current;
    if (width <= 0 || height <= 0) {
      applyView({ x: 48, y: 48, zoom: 1 });
      return;
    }
    const rect = frame.getBoundingClientRect();
    const pad = 80;
    const zoom = clamp(Math.min((rect.width - pad) / width, (rect.height - pad) / height, 1), 0.04, 1);
    applyView({
      x: (rect.width - width * zoom) / 2 - minX * zoom,
      y: Math.max(44, (rect.height - height * zoom) / 2 - minY * zoom),
      zoom,
    });
  };

  useEffect(() => {
    if (layout.nodes.length === 0) {
      fitted.current = false;
      return;
    }
    if (fitted.current) return;
    fitted.current = true;
    fit();
    // Fit the first tree, then leave pan and zoom alone until the chart is cleared or the direction flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.nodes.length, layout.width, layout.height, direction]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const prev = viewRef.current;
      const zoom = clamp(prev.zoom * (event.deltaY < 0 ? 1.08 : 0.92), 0.04, 1.75);
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      applyView({
        x: px - ((px - prev.x) * zoom) / prev.zoom,
        y: py - ((py - prev.y) * zoom) / prev.zoom,
        zoom,
      });
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const prev = viewRef.current;
    const zoom = clamp(prev.zoom * factor, 0.04, 1.75);
    const px = rect.width / 2;
    const py = rect.height / 2;
    applyView({
      x: px - ((px - prev.x) * zoom) / prev.zoom,
      y: py - ((py - prev.y) * zoom) / prev.zoom,
      zoom,
    });
  };

  const dropStaff = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly || saving) return;
    if ((event.target as HTMLElement).closest("[data-org-chrome]")) return;
    const staffId = parseOrgDragToken(event.dataTransfer.getData("text/plain"));
    if (!staffId) return;
    const fromChart = dragOriginRef.current === "chart";
    const ignore = fromChart ? new Set(branchStaffIds(staffId, treeRef.current.childIdsOf)) : null;
    const managerStaffId = orgCardAtPoint(event.clientX, event.clientY, ignore);
    if (!managerStaffId && fromChart) return;
    if (managerStaffId) revealManager(managerStaffId);
    onPlace(staffId, managerStaffId);
  };

  return (
    <div
      ref={frameRef}
      data-org-canvas
      role="application"
      aria-label={t(readOnly ? "hr.hierarchy.teamCanvasLabel" : "hr.hierarchy.canvasLabel")}
      className={cn(
        "relative min-h-[28rem] flex-1 touch-none overflow-hidden rounded-2xl border border-border/60 bg-card",
        panning ? "cursor-grabbing" : "cursor-grab",
        dropHover === "canvas" && "ring-2 ring-inset ring-primary/50",
      )}
      onDragOver={(event) => {
        if (readOnly) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if ((event.target as HTMLElement).closest("[data-org-chrome]")) {
          setDropHover((current) => (current === null ? current : null));
          return;
        }
        const cardId = orgCardAtPoint(event.clientX, event.clientY, null);
        const next = cardId ?? "canvas";
        setDropHover((current) => (current === next ? current : next));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropHover(null);
      }}
      onDrop={(event) => {
        if (readOnly) return;
        event.preventDefault();
        setDropHover(null);
        dropStaff(event);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("[data-org-staff], button, [data-org-chrome]")) return;
        const start = { id: event.pointerId, x: event.clientX, y: event.clientY, view: viewRef.current };
        setPanning(true);
        const move = (ev: PointerEvent) => {
          if (ev.pointerId !== start.id) return;
          applyView({
            x: start.view.x + (ev.clientX - start.x),
            y: start.view.y + (ev.clientY - start.y),
            zoom: start.view.zoom,
          });
        };
        const up = (ev: PointerEvent) => {
          if (ev.pointerId !== start.id) return;
          setPanning(false);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <p className="pointer-events-none absolute start-4 top-4 z-20 text-sm text-muted-foreground">
        {t(readOnly ? "hr.hierarchy.teamChartTitle" : "hr.hierarchy.chartTitle")}
      </p>
      <div
        ref={layerRef}
        className="absolute left-0 top-0"
        style={{
          width: Math.max(bounds.maxX, 1),
          height: Math.max(bounds.maxY, 1),
          transformOrigin: "0 0",
          transform: `translate(${viewRef.current.x}px, ${viewRef.current.y}px) scale(${viewRef.current.zoom})`,
        }}
      >
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible text-slate-400"
          width={Math.max(bounds.maxX, 1)}
          height={Math.max(bounds.maxY, 1)}
        >
          {edges.map((edge) => (
            <path key={edge.key} d={edge.d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          ))}
        </svg>
        {placed.map((node) => {
          const person = peopleById.get(node.staffId);
          if (!person) return null;
          const color = departmentColor(personDepartmentKey(person));
          const reports = tree.childIdsOf.get(person.staffId)?.length ?? 0;
          const isCollapsed = collapsedIds.has(person.staffId);
          const isRoot = rootIds.has(person.staffId);
          const outgoingSide = rtl ? "left" : "right";
          const incomingSide = rtl ? "right" : "left";
          const role = person.jobTitle?.trim() || "Staff";
          return (
            <article
              key={person.staffId}
              data-org-staff={person.staffId}
              aria-label={`${person.fullName}, ${role}${
                person.loginLinked === true
                  ? `, ${person.loginEmail ?? t("people.profile.login.exists")}`
                  : person.loginLinked === false
                    ? `, ${t("people.profile.login.missing")}`
                    : ""
              }`}
              draggable={!readOnly && !saving}
              onDragStart={(event) => {
                if (readOnly) {
                  event.preventDefault();
                  return;
                }
                if (event.currentTarget.getAttribute("data-org-suppress-drag") === "1") {
                  event.currentTarget.removeAttribute("data-org-suppress-drag");
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData("text/plain", orgDragToken(person.staffId));
                event.dataTransfer.effectAllowed = "move";
                dragOriginRef.current = "chart";
                draggedCardRef.current = true;
                setDragBranch(new Set(branchStaffIds(person.staffId, treeRef.current.childIdsOf)));
              }}
              onDragEnd={() => {
                dragOriginRef.current = null;
                setDragBranch(new Set());
                setDropHover(null);
              }}
              onDragOver={(event) => {
                if (readOnly) return;
                if (!event.dataTransfer.types.includes("text/plain")) return;
                event.preventDefault();
                event.stopPropagation();
                if (dragBranch.has(person.staffId)) return;
                setDropHover(person.staffId);
              }}
              onDrop={(event) => {
                if (readOnly) return;
                event.preventDefault();
                event.stopPropagation();
                const staffId = parseOrgDragToken(event.dataTransfer.getData("text/plain"));
                setDropHover(null);
                if (!staffId || saving) return;
                const branch = new Set(branchStaffIds(staffId, treeRef.current.childIdsOf));
                clearOffsets(branch);
                if (branch.has(person.staffId)) {
                  onPlace(staffId, person.staffId);
                  return;
                }
                revealManager(person.staffId);
                onPlace(staffId, person.staffId);
              }}
              onPointerDown={(event) => onNodePointerDown(event, person.staffId)}
              className={cn(
                "group absolute z-10 flex touch-none select-none items-center gap-2 rounded-lg border border-border/70 bg-card ps-2 shadow-elevated-xs [&_img]:pointer-events-none",
                readOnly ? "cursor-default pe-2" : "cursor-grab pe-7 active:cursor-grabbing",
                dragBranch.has(person.staffId) && "z-30 opacity-70",
                dropHover === person.staffId && "ring-2 ring-primary ring-offset-2",
              )}
              style={{
                width: ORG_NODE_WIDTH,
                height: ORG_NODE_HEIGHT,
                left: node.x,
                top: node.y,
              }}
            >
              <PersonAvatar person={person} className="h-8 w-8 shrink-0 border border-border" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  {person.loginLinked === true || person.loginLinked === false ? (
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        person.loginLinked ? "bg-emerald-500" : "bg-amber-500",
                      )}
                      title={
                        person.loginLinked
                          ? (person.loginEmail ?? t("people.profile.login.exists"))
                          : t("people.profile.login.missing")
                      }
                    />
                  ) : null}
                  <span className="block min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-foreground" title={person.fullName}>
                    {person.fullName}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground" title={role}>
                  {role}
                </span>
              </span>
              {reports > 0 ? (
                <button
                  type="button"
                  className="absolute z-20 flex h-5 min-w-5 items-center justify-center rounded-full border-2 bg-card px-1 text-[10px] font-semibold leading-none shadow-sm hover:bg-muted"
                  style={{ ...edgeAnchor(outgoingSide), borderColor: color, color }}
                  aria-expanded={!isCollapsed}
                  aria-label={t(isCollapsed ? "hr.hierarchy.expandReports" : "hr.hierarchy.collapseReports", {
                    name: person.fullName,
                  })}
                  title={t(isCollapsed ? "hr.hierarchy.expandReports" : "hr.hierarchy.collapseReports", {
                    name: person.fullName,
                  })}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.closest("[data-org-staff]")?.setAttribute("data-org-suppress-drag", "1");
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleNode(person.staffId);
                  }}
                >
                  {isCollapsed ? reports : <ChevronDown className="h-3 w-3" />}
                </button>
              ) : (
                <span
                  className="pointer-events-none absolute z-20 h-2.5 w-2.5 rounded-full"
                  style={{ ...edgeAnchor(isRoot ? outgoingSide : incomingSide), background: color }}
                />
              )}
              {readOnly ? null : (
              <button
                type="button"
                data-org-chrome
                className="absolute end-1.5 top-1.5 rounded-md p-0.5 text-muted-foreground opacity-40 hover:bg-muted hover:text-foreground hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
                aria-label={reports > 0 ? "Remove from chart. People under them move up one level." : "Remove from chart"}
                title={reports > 0 ? "Remove from chart. People under them move up one level." : "Remove from chart"}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.currentTarget.closest("[data-org-staff]")?.setAttribute("data-org-suppress-drag", "1");
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(person.staffId);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              )}
            </article>
          );
        })}
      </div>

      {layout.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div
            className={cn(
              "max-w-sm rounded-2xl border border-dashed px-6 py-8 text-center shadow-elevated-xs",
              dropHover === "canvas" ? "border-primary bg-primary/5" : "border-border bg-card/90",
            )}
          >
            <p className="text-sm font-semibold text-foreground">
              {readOnly ? t("hr.hierarchy.teamEmpty") : "Drop a person here"}
            </p>
            {readOnly ? null : (
            <p className="mt-1 text-xs text-muted-foreground">
              They become the top of the chart. Then drop other people onto their card.
            </p>
            )}
          </div>
        </div>
      ) : null}

      {legend.length > 0 ? (
        <div
          data-org-chrome
          className="org-legend absolute end-3 top-3 z-20"
          onPointerEnter={() => {
            if (legendHoverMode) setLegendHover(true);
          }}
          onPointerLeave={() => {
            if (legendHoverMode) setLegendHover(false);
          }}
          onFocus={(event) => {
            if (legendHoverMode && event.target instanceof Element && event.target.matches(":focus-visible")) {
              setLegendHover(true);
            }
          }}
          onBlur={(event) => {
            if (!legendHoverMode) return;
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setLegendHover(false);
          }}
        >
          <style>{`
            .org-legend-card { display: none; }
            .org-legend-card[data-open="true"] { display: block; }
            @media (hover: hover) and (pointer: fine) and (min-width: 1024px) {
              .org-legend:hover .org-legend-card,
              .org-legend:has(:focus-visible) .org-legend-card { display: block; }
            }
          `}</style>
          <button
            type="button"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-card text-foreground shadow-elevated-xs hover:bg-muted",
              (legendHoverMode ? legendHover : legendPinned) && "bg-muted",
            )}
            aria-label="Legend"
            aria-expanded={legendHoverMode ? legendHover : legendPinned}
            aria-controls="org-legend-panel"
            onClick={() => {
              if (legendHoverMode) return;
              setLegendPinned((open) => !open);
            }}
          >
            <Info className="h-4 w-4" />
          </button>
          <div
            id="org-legend-panel"
            role="region"
            aria-label="Legend"
            data-open={legendPinned ? "true" : "false"}
            className="org-legend-card absolute end-0 top-full z-20 w-56 pt-2"
          >
            <div className="max-h-[min(24rem,60vh)] overflow-auto rounded-xl border border-border/60 bg-card/95 p-3 shadow-elevated-sm">
              <p className="text-xs font-semibold text-foreground">Legend</p>
              <ul className="mt-2 space-y-1.5">
                {legend.map((item) => (
                  <li key={item.key} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: item.color }} />
                    <span className="truncate text-foreground">{item.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div data-org-chrome className="absolute bottom-3 start-3 z-20 flex overflow-hidden rounded-lg border border-border/70 bg-card shadow-elevated-xs">
        <button type="button" className="flex h-8 w-8 items-center justify-center hover:bg-muted" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" className="flex h-8 w-8 items-center justify-center border-s border-border/70 hover:bg-muted" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" className="flex h-8 w-8 items-center justify-center border-s border-border/70 hover:bg-muted" aria-label="Fit chart" onClick={fit}>
          <Scan className="h-4 w-4" />
        </button>
      </div>

      {saving ? (
        <p data-org-chrome className="absolute bottom-3 end-3 z-20 rounded-full bg-card px-3 py-1 text-xs text-muted-foreground shadow-elevated-xs">
          Saving…
        </p>
      ) : null}
      <span className="sr-only">{onChart.size} people on the chart</span>
    </div>
  );
}
