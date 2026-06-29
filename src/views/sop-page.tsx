"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { listSopDocuments, getSopComplianceSummary } from "@/lib/sop.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function SopPage() {
  const docsQ = useQuery({ queryKey: ["sop", "documents"], queryFn: () => listSopDocuments({}) });
  const summaryQ = useQuery({ queryKey: ["sop", "summary"], queryFn: () => getSopComplianceSummary() });

  const categories = [...new Set((docsQ.data ?? []).map((d) => d.category))].sort();

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">SOP Library</h1>
          <p className="text-xs text-muted-foreground">Standard operating procedures, acknowledgments, and compliance tracking.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Published SOPs</div>
          <div className="mt-1 text-2xl font-semibold">{docsQ.data?.length ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Acknowledged</div>
          <div className="mt-1 text-2xl font-semibold rag-green">{summaryQ.data?.acknowledged ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="mt-1 text-2xl font-semibold rag-amber">{summaryQ.data?.pending ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Overdue</div>
          <div className="mt-1 text-2xl font-semibold rag-red">{summaryQ.data?.overdue ?? "—"}</div>
        </div>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">{cat}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Review date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(docsQ.data ?? [])
                .filter((d) => d.category === cat)
                .map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.code}</TableCell>
                    <TableCell>{d.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.status}</Badge>
                    </TableCell>
                    <TableCell>v{d.current_version}</TableCell>
                    <TableCell>{d.review_date ?? "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/sop/${d.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

export default SopPage;
