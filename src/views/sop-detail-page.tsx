"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { acknowledgeSop, getSopDocument } from "@/lib/sop.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function SopDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sop", id],
    queryFn: () => getSopDocument({ id }),
    enabled: !!id,
  });

  const ackMut = useMutation({
    mutationFn: () => acknowledgeSop({ documentId: id, version: data?.current_version ?? 1 }),
    onSuccess: () => {
      toast.success("SOP acknowledged");
      void qc.invalidateQueries({ queryKey: ["sop"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading SOP…</div>;
  }

  if (!data) {
    return <div className="text-sm text-muted-foreground">SOP not found.</div>;
  }

  const sections = (
    (data.sop_sections as Array<{ id: string; heading: string | null; content: string; sort_order: number }>) ?? []
  ).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{data.category}</Badge>
            <Badge variant="outline">v{data.current_version}</Badge>
            <Badge variant="outline">{data.status}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{data.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.department ?? "All departments"} · Effective {data.effective_date ?? "—"}
          </p>
        </div>
        {data.mandatory_ack && data.status === "published" && (
          <Button onClick={() => ackMut.mutate()} disabled={ackMut.isPending}>
            {ackMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Acknowledge SOP
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card p-5">
            {s.heading && <h2 className="mb-2 text-sm font-medium">{s.heading}</h2>}
            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">{s.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SopDetailPage;
