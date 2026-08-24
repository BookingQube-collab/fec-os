"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventWbsNode } from "@/lib/events/types";
import { canIndent, canOutdent } from "@/lib/events/wbs";

type StaffOpt = { id: string; full_name: string };

export function EventWbsTree({
  nodes,
  staff,
  canEdit,
  busy,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onSaveDetails,
}: {
  nodes: EventWbsNode[];
  staff: StaffOpt[];
  canEdit: boolean;
  busy?: boolean;
  onCreate: (input: { parent_id: string | null; title: string }) => void;
  onRename: (id: string, title: string) => void;
  onMove: (id: string, direction: "up" | "down" | "indent" | "outdent") => void;
  onDelete: (id: string) => void;
  onSaveDetails: (node: EventWbsNode, patch: Partial<EventWbsNode> & { documentTitle?: string; documentUrl?: string }) => void;
}) {
  const { t } = useTranslation();
  const [phaseTitle, setPhaseTitle] = useState("");
  const [childTitle, setChildTitle] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("events.plan.wbs")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.plan.wbsHelp")}</p>
        </div>
      </div>
      <ul className="space-y-1">
        {nodes.map((node) => {
          const slim = nodes.map((n) => ({ id: n.id, parent_id: n.parent_id, sort_order: n.sort_order }));
          return (
            <li key={node.id} className="rounded-xl border border-transparent hover:border-border/40">
              <div className="flex flex-wrap items-center gap-1 py-1" style={{ paddingInlineStart: node.depth * 18 }}>
                <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                  {t(`events.wbsType.${node.node_type}`)}
                </Badge>
                {editing === node.id ? (
                  <Input
                    className="h-8 w-56"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      if (draft.trim() && draft.trim() !== node.title) onRename(node.id, draft.trim());
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="truncate text-start text-sm font-medium"
                    onClick={() => {
                      setEditing(node.id);
                      setDraft(node.title);
                    }}
                    disabled={!canEdit}
                  >
                    {node.code ? `${node.code} ` : ""}
                    {node.title}
                  </button>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {node.rolled_progress}% · {t("events.plan.budget")} {node.budget_amount}
                </span>
                {canEdit ? (
                  <div className="ms-auto flex flex-wrap gap-0.5">
                    <Button size="sm" variant="ghost" disabled={busy || !canIndent(slim, node.id)} onClick={() => onMove(node.id, "indent")}>
                      {t("events.plan.indent")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy || !canOutdent(nodes, node.id)} onClick={() => onMove(node.id, "outdent")}>
                      {t("events.plan.outdent")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onMove(node.id, "up")}>
                      {t("events.plan.moveUp")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onMove(node.id, "down")}>
                      {t("events.plan.moveDown")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === node.id ? null : node.id)}>
                      {t("events.plan.editNode")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(node.id)}>
                      {t("common.delete")}
                    </Button>
                  </div>
                ) : null}
              </div>
              {openId === node.id ? (
                <div className="mb-2 ms-6 grid gap-2 rounded-xl bg-muted/30 p-3 md:grid-cols-4">
                  <label className="space-y-1 text-xs">
                    <Label>{t("events.plan.owner")}</Label>
                    <Select
                      value={node.owner_staff_id ?? "none"}
                      onValueChange={(v) => onSaveDetails(node, { owner_staff_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <Label>{t("events.plan.budget")}</Label>
                    <Input type="number" className="h-8" defaultValue={node.budget_amount} onBlur={(e) => onSaveDetails(node, { budget_amount: Number(e.target.value || 0) })} />
                  </label>
                  <label className="space-y-1 text-xs">
                    <Label>{t("events.plan.cost")}</Label>
                    <Input type="number" className="h-8" defaultValue={node.actual_cost} onBlur={(e) => onSaveDetails(node, { actual_cost: Number(e.target.value || 0) })} />
                  </label>
                  <label className="space-y-1 text-xs">
                    <Label>{t("events.plan.progress")}</Label>
                    <Input type="number" className="h-8" defaultValue={node.percent_complete} onBlur={(e) => onSaveDetails(node, { percent_complete: Number(e.target.value || 0) })} />
                  </label>
                  <label className="space-y-1 text-xs">
                    <Label>{t("events.plan.start")}</Label>
                    <Input type="date" className="h-8" defaultValue={node.start_date ?? ""} onBlur={(e) => onSaveDetails(node, { start_date: e.target.value || null })} />
                  </label>
                  <label className="space-y-1 text-xs">
                    <Label>{t("events.plan.due")}</Label>
                    <Input type="date" className="h-8" defaultValue={node.due_date ?? ""} onBlur={(e) => onSaveDetails(node, { due_date: e.target.value || null })} />
                  </label>
                  <div className="space-y-1 text-xs md:col-span-2">
                    <Label>{t("events.plan.document")}</Label>
                    <div className="flex gap-2">
                      <Input className="h-8" placeholder={t("events.plan.docTitle")} id={`doc-t-${node.id}`} />
                      <Input className="h-8" placeholder={t("events.plan.docUrl")} id={`doc-u-${node.id}`} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const title = (document.getElementById(`doc-t-${node.id}`) as HTMLInputElement | null)?.value ?? "";
                          const url = (document.getElementById(`doc-u-${node.id}`) as HTMLInputElement | null)?.value ?? "";
                          if (!url) return;
                          onSaveDetails(node, { documents: [...node.documents, { title: title || url, url }] });
                        }}
                      >
                        {t("events.plan.addDoc")}
                      </Button>
                    </div>
                    {node.documents.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {node.documents.map((doc, i) => (
                          <li key={`${doc.url}-${i}`}>
                            <a href={doc.url} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                              {doc.title || doc.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {node.depth < 3 && canEdit ? (
                    <div className="flex items-end gap-2 md:col-span-4">
                      <Input
                        className="h-8 w-64"
                        placeholder={t("events.plan.childTitle")}
                        value={childTitle[node.id] ?? ""}
                        onChange={(e) => setChildTitle((s) => ({ ...s, [node.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        disabled={!childTitle[node.id]?.trim() || busy}
                        onClick={() => {
                          onCreate({ parent_id: node.id, title: childTitle[node.id].trim() });
                          setChildTitle((s) => ({ ...s, [node.id]: "" }));
                        }}
                      >
                        {t("events.plan.addChild")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="mt-3 flex gap-2">
          <Input className="w-64" value={phaseTitle} onChange={(e) => setPhaseTitle(e.target.value)} placeholder={t("events.plan.wbsTitle")} />
          <Button
            size="sm"
            disabled={!phaseTitle.trim() || busy}
            onClick={() => {
              onCreate({ parent_id: null, title: phaseTitle.trim() });
              setPhaseTitle("");
            }}
          >
            {t("events.plan.addPhase")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
