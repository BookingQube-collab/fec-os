"use client";

import { ChevronRight, Minus, Plus, Scan, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  departmentColor,
  groupOrgChart,
  layoutOrgChart,
  legendForChart,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function OrgHierarchyBoard({
  snapshot,
  saving,
  onPlace,
  onRemove,
}: {
  snapshot: OrgChartSnapshot;
  saving: boolean;
  onPlace: (staffId: string, managerStaffId: string | null) => void;
  onRemove: (staffId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const query = search.trim().toLowerCase();

  const grouped = useMemo(() => groupOrgChart(snapshot.people), [snapshot.people]);
  const layout = useMemo(() => {
    const childIds = new Map<string, string[]>();
    for (const [managerId, children] of grouped.childrenOf) {
      childIds.set(
        managerId,
        children.map((person) => person.staffId),
      );
    }
    return layoutOrgChart(
      grouped.roots.map((person) => person.staffId),
      childIds,
    );
  }, [grouped]);
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

  const childCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [managerId, children] of grouped.childrenOf) counts.set(managerId, children.length);
    return counts;
  }, [grouped.childrenOf]);

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
      <aside className="flex max-h-[40vh] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevated-xs lg:max-h-none lg:w-80">
        <div className="space-y-2 border-b border-border/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Departments</p>
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setOpenKeys(new Set(openKeys.size ? [] : groups.map((group) => group.key)))}
            >
              {openKeys.size ? "Collapse" : "Expand"}
            </button>
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
                              className="flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/40 active:cursor-grabbing"
                              style={{ marginInlineStart: 18 + group.depth * 12 }}
                            >
                              <PersonAvatar person={person} className="h-8 w-8" />
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
          Drag onto a card to set who they report to. Drag onto empty space to put them at the top.
        </p>
      </aside>

      <OrgCanvas
        layout={layout}
        peopleById={peopleById}
        legend={legend}
        childCount={childCount}
        saving={saving}
        onChart={grouped.onChart}
        onPlace={onPlace}
        onRemove={onRemove}
      />
    </div>
  );
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
      {person.hasPhoto ? <AvatarImage src={staffPhotoUrl(person.staffId, person.photoUpdatedAt)} alt="" /> : null}
      <AvatarFallback className="text-[10px] font-semibold">{personInitials(person.fullName)}</AvatarFallback>
    </Avatar>
  );
}

function OrgCanvas({
  layout,
  peopleById,
  legend,
  childCount,
  saving,
  onChart,
  onPlace,
  onRemove,
}: {
  layout: ReturnType<typeof layoutOrgChart>;
  peopleById: Map<string, OrgChartSnapshot["people"][number]>;
  legend: ReturnType<typeof legendForChart>;
  childCount: Map<string, number>;
  saving: boolean;
  onChart: Set<string>;
  onPlace: (staffId: string, managerStaffId: string | null) => void;
  onRemove: (staffId: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ x: 48, y: 40, zoom: 1 });
  const fitted = useRef(false);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  const applyView = (next: View) => {
    viewRef.current = next;
    const layer = layerRef.current;
    if (!layer) return;
    layer.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`;
  };

  const fit = () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (layout.width <= 0 || layout.height <= 0) {
      applyView({ x: 48, y: 48, zoom: 1 });
      return;
    }
    const rect = frame.getBoundingClientRect();
    const pad = 80;
    const zoom = clamp(Math.min((rect.width - pad) / layout.width, (rect.height - pad) / layout.height, 1), 0.04, 1);
    applyView({
      x: (rect.width - layout.width * zoom) / 2,
      y: Math.max(28, (rect.height - layout.height * zoom) / 2),
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
    // Fit the first tree, then leave pan and zoom alone until the chart is cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.nodes.length, layout.width, layout.height]);

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
    if (saving) return;
    if ((event.target as HTMLElement).closest("[data-org-chrome]")) return;
    const staffId = parseOrgDragToken(event.dataTransfer.getData("text/plain"));
    if (!staffId) return;
    const card = (event.target as HTMLElement).closest("[data-org-staff]");
    const managerStaffId = card?.getAttribute("data-org-staff") ?? null;
    onPlace(staffId, managerStaffId);
  };

  return (
    <div
      ref={frameRef}
      data-org-canvas
      role="application"
      aria-label="Organization chart. Drag a person onto a card to set their manager, or onto empty space to place them at the top."
      className={cn(
        "relative min-h-[28rem] flex-1 overflow-hidden rounded-2xl border border-border/60 bg-muted/30",
        panning ? "cursor-grabbing" : "cursor-grab",
        dropHover === "canvas" && "ring-2 ring-inset ring-primary/50",
      )}
      style={{
        backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.55) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if ((event.target as HTMLElement).closest("[data-org-chrome]")) {
          setDropHover((current) => (current === null ? current : null));
          return;
        }
        const card = (event.target as HTMLElement).closest("[data-org-staff]");
        const next = card?.getAttribute("data-org-staff") ?? "canvas";
        setDropHover((current) => (current === next ? current : next));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropHover(null);
      }}
      onDrop={(event) => {
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
      <div
        ref={layerRef}
        className="absolute left-0 top-0"
        style={{
          width: Math.max(layout.width, 1),
          height: Math.max(layout.height, 1),
          transformOrigin: "0 0",
          transform: `translate(${viewRef.current.x}px, ${viewRef.current.y}px) scale(${viewRef.current.zoom})`,
        }}
      >
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible text-slate-400" width={layout.width} height={layout.height}>
          {layout.connectors.map((path) => (
            <path key={path} d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
          ))}
        </svg>
        {layout.nodes.map((node) => {
          const person = peopleById.get(node.staffId);
          if (!person) return null;
          const color = departmentColor(personDepartmentKey(person));
          const reports = childCount.get(person.staffId) ?? 0;
          return (
            <article
              key={person.staffId}
              data-org-staff={person.staffId}
              draggable={!saving}
              onDragStart={(event) => {
                if (event.currentTarget.getAttribute("data-org-suppress-drag") === "1") {
                  event.currentTarget.removeAttribute("data-org-suppress-drag");
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData("text/plain", orgDragToken(person.staffId));
                event.dataTransfer.effectAllowed = "move";
              }}
              className={cn(
                "group absolute z-10 flex cursor-grab items-center gap-2.5 rounded-xl border-2 bg-card px-2.5 pe-8 shadow-elevated-xs active:cursor-grabbing",
                dropHover === person.staffId && "ring-2 ring-primary ring-offset-2",
              )}
              style={{
                width: ORG_NODE_WIDTH,
                height: ORG_NODE_HEIGHT,
                left: node.x,
                top: node.y,
                borderColor: color,
              }}
            >
              <PersonAvatar person={person} className="h-11 w-11" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{person.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">{person.jobTitle || "Staff"}</span>
              </span>
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
            <p className="text-sm font-semibold text-foreground">Drop a person here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              They become the top of the chart. Then drop other people onto their card.
            </p>
          </div>
        </div>
      ) : null}

      {legend.length > 0 ? (
        <div
          data-org-chrome
          className="absolute end-3 top-3 z-20 max-h-[min(24rem,70%)] w-56 overflow-auto rounded-xl border border-border/60 bg-card/95 p-3 shadow-elevated-sm"
        >
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
