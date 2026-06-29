"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, FileText, Loader2, Trash2, Upload, BookOpen } from "lucide-react";
import { toast } from "sonner";

import { getBoardPackData } from "@/lib/reports.functions";
import { getBranchLeague } from "@/lib/branches.functions";
import { listPurchaseOrders } from "@/lib/pos.functions";
import { listLeakageCases } from "@/lib/revenue.functions";
import { askKnowledgeRag, deleteKbDocument, ingestKbDocument, listKbDocuments, type RagSource } from "@/lib/kb.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { jsPDF } from "jspdf";
import { fmtQar } from "@/lib/currency";

async function loadPdfTools() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable: autoTableModule.default };
}

function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

function Page() {
  const [busy, setBusy] = useState<string | null>(null);

  const downloadBoardPack = async () => {
    setBusy("board");
    try {
      const data = await getBoardPackData();
      const { buildBoardPackPdf } = await import("@/lib/pdf/board-pack");
      const pdf = await buildBoardPackPdf(data);
      downloadPdf(pdf, `fec-os-board-pack-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const downloadBranchPdf = async () => {
    setBusy("branches");
    try {
      const rows = await getBranchLeague();
      const { jsPDF, autoTable } = await loadPdfTools();
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      doc.setFontSize(18); doc.text("Branch league (30d)", 40, 56);
      autoTable(doc, {
        startY: 80,
        head: [["Branch", "City", "Revenue", "EBITDA", "Margin %", "Open", "Urgent", "Score"]],
        body: rows.map((r) => [`${r.name} (${r.code})`, r.city, fmtQar(r.revenue_30d), fmtQar(r.ebitda_30d), r.margin_pct.toFixed(1), r.open_tickets, r.urgent_tickets, r.score]),
        styles: { fontSize: 9 }, headStyles: { fillColor: [10, 18, 40] },
      });
      downloadPdf(doc, "fec-os-branch-league.pdf");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const downloadPoPdf = async () => {
    setBusy("pos");
    try {
      const rows = await listPurchaseOrders({});
      const { jsPDF, autoTable } = await loadPdfTools();
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      doc.setFontSize(18); doc.text("Purchase orders", 40, 56);
      autoTable(doc, {
        startY: 80,
        head: [["PO #", "Vendor", "Category", "Amount", "Status", "Created"]],
        body: rows.map((r) => [r.po_number, r.vendor_name, r.category ?? "—", fmtQar(r.amount), r.status, r.created_at.slice(0, 10)]),
        styles: { fontSize: 9 }, headStyles: { fillColor: [10, 18, 40] },
      });
      downloadPdf(doc, "fec-os-pos.pdf");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const downloadLeakagePdf = async () => {
    setBusy("leakage");
    try {
      const rows = await listLeakageCases({ locationId: null });
      const { jsPDF, autoTable } = await loadPdfTools();
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      doc.setFontSize(18); doc.text("Leakage cases", 40, 56);
      autoTable(doc, {
        startY: 80,
        head: [["Detected", "Category", "Status", "Estimated loss", "Hypothesis"]],
        body: rows.map((r) => [r.detected_on, r.category, r.status, r.estimated_loss ? fmtQar(Number(r.estimated_loss)) : "—", (r.hypothesis ?? "—").slice(0, 60)]),
        styles: { fontSize: 9 }, headStyles: { fillColor: [10, 18, 40] },
      });
      downloadPdf(doc, "fec-os-leakage.pdf");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">Download branded PDF reports and ask the FEC-OS co-pilot.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ReportCard title="Board Pack" desc="Estate KPIs, branch league, AI brief, leakage, incidents, complaints, POs." busy={busy === "board"} onClick={downloadBoardPack} highlight />
        <ReportCard title="Branch League" desc="30-day league table with revenue, margin, tickets, and score." busy={busy === "branches"} onClick={downloadBranchPdf} />
        <ReportCard title="Purchase Orders" desc="All POs with vendor, amount, and status." busy={busy === "pos"} onClick={downloadPoPdf} />
        <ReportCard title="Leakage Cases" desc="Revenue assurance cases and recovery hypotheses." busy={busy === "leakage"} onClick={downloadLeakagePdf} />
      </div>

      <KnowledgeBase />
      <AskCopilot />
    </div>
  );
}

function ReportCard({ title, desc, busy, onClick, highlight }: { title: string; desc: string; busy: boolean; onClick: () => void; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-5 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{desc}</p>
      <Button className="mt-4 w-full" onClick={onClick} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Download PDF
      </Button>
    </div>
  );
}

function KnowledgeBase() {
  const qc = useQueryClient();
      
  const { data: docs } = useQuery({ queryKey: ["kb_documents"], queryFn: () => listKbDocuments() });

  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [content, setContent] = useState("");

  const ingest = useMutation({
    mutationFn: () => ingestKbDocument({ title, source, content }),
    onSuccess: (r) => {
      toast.success(`Ingested — ${r.chunks} chunks embedded`);
      setTitle(""); setSource(""); setContent("");
      qc.invalidateQueries({ queryKey: ["kb_documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteKbDocument({ id }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["kb_documents"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const onFile = async (f: File) => {
    if (f.size > 500_000) { toast.error("File too large (max 500KB)"); return; }
    const text = await f.text();
    setContent(text);
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
    if (!source) setSource(f.name);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Knowledge Base (vector RAG)</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ingest SOPs, policies, contracts, or guides. Text is chunked, embedded with text-embedding-3-small (1536-dim), and stored in pgvector. The co-pilot retrieves the top matching chunks for each question.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title (e.g. Refund Policy v3)" maxLength={200} />
        <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source / reference (optional)" maxLength={500} />
      </div>
      <Textarea className="mt-3 min-h-[140px]" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste document text here, or upload a .txt / .md file below." />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted">
          <Upload className="h-3.5 w-3.5" /> Upload .txt / .md
          <input
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
          />
        </label>
        <Button onClick={() => ingest.mutate()} disabled={ingest.isPending || !title.trim() || content.length < 30}>
          {ingest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Ingest & embed
        </Button>
        <span className="text-xs text-muted-foreground">{content.length.toLocaleString()} chars</span>
      </div>

      <div className="mt-5 space-y-2">
        <div className="text-xs font-medium text-foreground">Documents ({docs?.length ?? 0})</div>
        {(docs ?? []).length === 0 && (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">No documents yet.</div>
        )}
        {(docs ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{d.title}</div>
              <div className="truncate text-xs text-muted-foreground">{d.source ?? "—"} · {d.chunk_count} chunks · {new Date(d.created_at).toLocaleDateString()}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => del.mutate(d.id)} disabled={del.isPending}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AskCopilot() {
    const [q, setQ] = useState("");
  const [history, setHistory] = useState<Array<{ q: string; a: string; sources: RagSource[] }>>([]);
  const ask = useMutation({
    mutationFn: (question: string) => askKnowledgeRag({ question }),
    onSuccess: (r, q) => {
      setHistory((h) => [...h, { q, a: r.answer, sources: r.sources }]);
      setQ("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Ask FEC-OS Co-pilot (RAG)</h2>
      <p className="mt-1 text-xs text-muted-foreground">Retrieves the most relevant chunks from your knowledge base via vector similarity, then answers with citations.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask.mutate(q.trim()); }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What's our refund policy for unused tokens?" />
        <Button type="submit" disabled={ask.isPending || !q.trim()}>
          {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
        </Button>
      </form>
      <div className="mt-4 space-y-3">
        {history.map((h, i) => (
          <div key={i} className="rounded-md border border-border/60 p-3">
            <div className="text-xs font-medium text-foreground">Q: {h.q}</div>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{h.a}</div>
            {h.sources.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sources</div>
                {h.sources.map((s, idx) => (
                  <div key={s.document_id + s.chunk_index} className="rounded border border-border/40 bg-muted/30 p-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">[#{idx + 1}] {s.title}</span>
                      <span className="text-muted-foreground">sim {(s.similarity * 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-muted-foreground">{s.excerpt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {history.length === 0 && (
          <div className="text-xs text-muted-foreground">Ingest some documents above, then ask a question grounded in their content.</div>
        )}
      </div>
    </div>
  );
}

export default Page;
