"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

const DecisionStatusEnum = z.enum([
  "proposed",
  "reviewing",
  "approved",
  "rejected",
  "implemented",
  "cancelled",
]);
const DecisionPriorityEnum = z.enum(["low", "medium", "high", "critical"]);
const VoteEnum = z.enum(["approve", "reject", "abstain", "request_info"]);

export const listDecisions = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("decisions")
    .select(
      "id, title, description, priority, status, estimated_impact_aed, due_date, proposed_by, created_at, profiles:proposed_by(display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}, { auth: { capability: "decision.view" } });

export const createDecision = createAuthenticatedAction(
  z.object({
    title: z.string().min(3).max(200),
    description: z.string().max(8000).optional(),
    priority: DecisionPriorityEnum.default("medium"),
    estimated_impact_aed: z.number().default(0),
    due_date: z.string().optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("decisions")
      .insert({
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        estimated_impact_aed: data.estimated_impact_aed,
        due_date: data.due_date || null,
        proposed_by: context.userId,
        status: "proposed",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  },
  { auth: { capability: "decision.manage" } },
);

export const getDecision = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: decision, error } = await context.supabase
      .from("decisions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const [{ data: votes }, { data: summary }] = await Promise.all([
      context.supabase
        .from("decision_votes")
        .select("id, voter_id, vote, note, created_at, profiles:voter_id(display_name)")
        .eq("decision_id", data.id)
        .order("created_at"),
      context.supabase.rpc("decision_vote_summary", { _decision_id: data.id }),
    ]);

    type VoteSummary = { approve: number; reject: number; abstain: number; request_info: number; total: number };
    const rawSummary = summary as VoteSummary | null;
    return {
      decision,
      votes: votes ?? [],
      summary: rawSummary ?? { approve: 0, reject: 0, abstain: 0, request_info: 0, total: 0 },
    };
  },
  { auth: { capability: "decision.view" } },
);

export const castVote = createAuthenticatedAction(
  z.object({
    decision_id: z.string().uuid(),
    vote: VoteEnum,
    note: z.string().max(2000).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.from("decision_votes").upsert(
      {
        decision_id: data.decision_id,
        voter_id: context.userId,
        vote: data.vote,
        note: data.note ?? null,
      },
      { onConflict: "decision_id,voter_id" },
    );
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "decision.vote" } },
);

export const updateDecisionStatus = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), status: DecisionStatusEnum }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("decisions")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "decision.manage" } },
);

export const generateDecisionSummary = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: d, error: dErr } = await context.supabase
      .from("decisions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (dErr) throw dErr;
    const { data: votes } = await context.supabase
      .from("decision_votes")
      .select("vote, note, profiles:voter_id(display_name)")
      .eq("decision_id", data.id);
    const { data: summary } = await context.supabase.rpc("decision_vote_summary", {
      _decision_id: data.id,
    });

    const apiKey = process.env.LOVABLE_API_KEY;
    let aiSummary = "AI summary unavailable (no LOVABLE_API_KEY).";
    if (apiKey) {
      const prompt = `Summarise this executive decision for the board pack in 120 words. Include vote tally and recommendation.\n\nDecision: ${JSON.stringify(d, null, 2)}\nVotes: ${JSON.stringify(votes ?? [], null, 2)}\nTally: ${JSON.stringify(summary)}`;
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (resp.ok) {
          const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          aiSummary = json.choices?.[0]?.message?.content?.trim() ?? aiSummary;
        }
      } catch (e) {
        aiSummary = `AI call failed: ${(e as Error).message}`;
      }
    }

    await context.supabase.from("decisions").update({ ai_summary: aiSummary }).eq("id", data.id);
    return { aiSummary };
  },
  { auth: { capability: "decision.view" } },
);
