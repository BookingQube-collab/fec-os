"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

const EMBED_MODEL = "openai/text-embedding-3-small";
const CHAT_MODEL = "google/gemini-3-flash-preview";
const EMBED_DIMS = 1536;

async function embed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing.");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS }),
  });
  if (!resp.ok) {
    if (resp.status === 402) throw new Error("AI credits exhausted — add credits in workspace billing.");
    if (resp.status === 429) throw new Error("Rate limit hit, please wait and try again.");
    throw new Error(`Embedding error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  const j = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  return j.data.map((d) => d.embedding);
}

function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + size, clean.length);
    let cut = end;
    if (end < clean.length) {
      const nl = clean.lastIndexOf("\n", end);
      const sp = clean.lastIndexOf(" ", end);
      cut = Math.max(nl, sp);
      if (cut <= i + size / 2) cut = end;
    }
    chunks.push(clean.slice(i, cut).trim());
    if (cut >= clean.length) break;
    i = Math.max(cut - overlap, i + 1);
  }
  return chunks.filter((c) => c.length > 20);
}

export interface RagSource {
  document_id: string;
  title: string;
  source: string | null;
  chunk_index: number;
  similarity: number;
  excerpt: string;
}

export const listKbDocuments = createAuthenticatedActionNoInput(async (context) => {
  const { data: docs, error } = await context.supabase
    .from("kb_documents")
    .select("id, title, source, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const withCounts = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { count } = await context.supabase
        .from("kb_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", d.id);
      return { ...d, chunk_count: count ?? 0 };
    }),
  );
  return withCounts;
}, { auth: { capability: "compliance.view" } });

export const ingestKbDocument = createAuthenticatedAction(
  z.object({
    title: z.string().min(2).max(200),
    source: z.string().max(500).optional(),
    content: z.string().min(30).max(500_000),
  }),
  async (data, context) => {
    const chunks = chunkText(data.content);
    if (chunks.length === 0) throw new Error("No embeddable text after chunking.");

    const { data: doc, error: docErr } = await context.supabase
      .from("kb_documents")
      .insert({
        title: data.title,
        source: data.source ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (docErr) throw docErr;

    const vectors = await embed(chunks);
    const rows = chunks.map((content, idx) => ({
      document_id: doc.id,
      chunk_index: idx,
      content,
      embedding: vectors[idx] as unknown as string,
    }));

    const { error: chunkErr } = await context.supabase.from("kb_chunks").insert(rows);
    if (chunkErr) throw chunkErr;

    return { id: doc.id, chunks: chunks.length };
  },
  { auth: { capability: "admin.manage_users" } },
);

export const deleteKbDocument = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.from("kb_documents").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "admin.manage_users" } },
);

export const askKnowledgeRag = createAuthenticatedAction(
  z.object({ question: z.string().min(3).max(2000) }),
  async (data, context) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing.");

    const [queryVec] = await embed([data.question]);
    const { data: matches, error } = await context.supabase.rpc("match_kb_chunks", {
      query_embedding: queryVec as unknown as string,
      match_count: 6,
    });
    if (error) throw error;

    const rows = (matches ?? []) as Array<{
      id: string;
      document_id: string;
      chunk_index: number;
      content: string;
      title: string;
      source: string | null;
      similarity: number;
    }>;

    if (rows.length === 0) {
      const answer =
        "The knowledge base has no relevant documents for this question. Add documents in the Knowledge Base section and try again.";
      await context.supabase.from("ai_artifacts").insert({
        kind: "rag_answer",
        title: data.question.slice(0, 120),
        content: { question: data.question, answer, sources: [] },
        model: CHAT_MODEL,
        created_by: context.userId,
      });
      return { answer, sources: [] as RagSource[] };
    }

    const context_blocks = rows
      .map((r, i) => `[#${i + 1} | ${r.title}${r.source ? ` — ${r.source}` : ""}]\n${r.content}`)
      .join("\n\n---\n\n");

    const prompt = `You are the FEC-OS knowledge assistant. Answer the user's question using ONLY the retrieved knowledge-base excerpts below. Cite sources inline as [#1], [#2], etc. matching the excerpts. If the excerpts do not contain the answer, say so explicitly. Keep responses under 280 words.\n\nQUESTION:\n${data.question}\n\nRETRIEVED EXCERPTS:\n${context_blocks}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({ model: CHAT_MODEL, messages: [{ role: "user", content: prompt }] }),
    });
    if (!resp.ok) {
      if (resp.status === 402) throw new Error("AI credits exhausted — add credits in workspace billing.");
      if (resp.status === 429) throw new Error("Rate limit hit, please wait and try again.");
      throw new Error(`AI gateway error ${resp.status}`);
    }
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = j.choices?.[0]?.message?.content?.trim() ?? "";

    const sources: RagSource[] = rows.map((r) => ({
      document_id: r.document_id,
      title: r.title,
      source: r.source,
      chunk_index: r.chunk_index,
      similarity: r.similarity,
      excerpt: r.content.slice(0, 240),
    }));

    await context.supabase.from("ai_artifacts").insert({
      kind: "rag_answer",
      title: data.question.slice(0, 120),
      content: JSON.parse(JSON.stringify({ question: data.question, answer, sources })),
      model: CHAT_MODEL,
      created_by: context.userId,
    });

    return { answer, sources };
  },
  { auth: { capability: "compliance.view" } },
);
