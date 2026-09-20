/**
 * Applicant Tracking System rules (Phase 10). Pure — no Supabase.
 * Scoring explains match; AI/score must never auto-reject (AT#13 / AT#14).
 */

export const HR_APPLICATION_STAGES = [
  "new",
  "cv_screened",
  "shortlisted",
  "hr_interview",
  "technical_interview",
  "final_interview",
  "selected",
  "offer_pending",
  "offer_issued",
  "offer_accepted",
  "offer_declined",
  "documentation_pending",
  "ready_to_join",
  "joined",
  "on_hold",
  "rejected",
  "talent_pool",
] as const;
export type HrApplicationStage = (typeof HR_APPLICATION_STAGES)[number];

/** Occupies a quota seat until joined (Phase 9 selectedNotJoinedCount). */
export const HR_SELECTED_NOT_JOINED_STAGES: readonly HrApplicationStage[] = [
  "selected",
  "offer_pending",
  "offer_issued",
  "offer_accepted",
  "documentation_pending",
  "ready_to_join",
] as const;

export const HR_OFFER_STATUSES = [
  "draft",
  "issued",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
] as const;
export type HrOfferStatus = (typeof HR_OFFER_STATUSES)[number];

export const HR_CANDIDATE_SOURCES = [
  "manual",
  "cv_upload",
  "bulk_upload",
  "referral",
  "other",
] as const;
export type HrCandidateSource = (typeof HR_CANDIDATE_SOURCES)[number];

export type MatchWeightKey = "skills" | "experience" | "education" | "location" | "visa_qid";

export type MatchWeights = Record<MatchWeightKey, number>;

/** Default recruiter filter weights (sum 100). Override via vacancy.match_weights or policy. */
export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  skills: 40,
  experience: 25,
  education: 15,
  location: 10,
  visa_qid: 10,
};

export function mergeMatchWeights(
  override?: Partial<MatchWeights> | null,
  policy?: Partial<MatchWeights> | null,
): MatchWeights {
  const merged: MatchWeights = {
    ...DEFAULT_MATCH_WEIGHTS,
    ...(policy ?? {}),
    ...(override ?? {}),
  };
  const sum = Object.values(merged).reduce((a, b) => a + Math.max(0, Number(b) || 0), 0);
  if (sum <= 0) return { ...DEFAULT_MATCH_WEIGHTS };
  if (Math.abs(sum - 100) < 0.01) return merged;
  // Normalize to 100 so vacancy tweaks stay proportional.
  const scale = 100 / sum;
  return {
    skills: round2(merged.skills * scale),
    experience: round2(merged.experience * scale),
    education: round2(merged.education * scale),
    location: round2(merged.location * scale),
    visa_qid: round2(merged.visa_qid * scale),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tokenizeSkills(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;|/\\\n]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length >= 2),
    ),
  ];
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function educationMatches(required: string | null | undefined, candidate: string | null | undefined): boolean {
  const r = norm(required);
  const c = norm(candidate);
  if (!r) return true;
  if (!c) return false;
  if (c.includes(r) || r.includes(c)) return true;
  // Same-tier aliases (bachelor ≈ bsc ≈ ba).
  const tiers: Array<{ rank: number; keys: string[] }> = [
    { rank: 1, keys: ["phd", "doctorate"] },
    { rank: 2, keys: ["master", "mba", "msc", "ma"] },
    { rank: 3, keys: ["bachelor", "bachelors", "bsc", "ba", "beng", "undergraduate"] },
    { rank: 4, keys: ["diploma", "associate"] },
    { rank: 5, keys: ["high school", "secondary", "school"] },
  ];
  const rankOf = (t: string) => {
    for (const tier of tiers) {
      if (tier.keys.some((k) => t.includes(k))) return tier.rank;
    }
    return 99;
  };
  return rankOf(c) <= rankOf(r);
}

export type VacancyMatchInput = {
  skills?: string | null;
  experienceYears?: number | null;
  education?: string | null;
  requiredLocation?: string | null;
  requiresQid?: boolean;
  requiresVisa?: boolean;
  jobDescription?: string | null;
};

export type CandidateMatchInput = {
  skills?: string | null;
  experienceYears?: number | null;
  education?: string | null;
  location?: string | null;
  qid?: string | null;
  visaStatus?: string | null;
  cvText?: string | null;
};

export type MatchExplanation = {
  matchedSkills: string[];
  missingSkills: string[];
  experience: {
    required: number | null;
    candidate: number | null;
    ok: boolean;
    points: number;
    maxPoints: number;
  };
  education: {
    required: string | null;
    candidate: string | null;
    ok: boolean;
    points: number;
    maxPoints: number;
  };
  location: {
    required: string | null;
    candidate: string | null;
    ok: boolean;
    points: number;
    maxPoints: number;
  };
  visaQid: {
    requiresQid: boolean;
    requiresVisa: boolean;
    hasQid: boolean;
    hasVisa: boolean;
    ok: boolean;
    points: number;
    maxPoints: number;
  };
  skillsPoints: number;
  skillsMaxPoints: number;
  weights: MatchWeights;
  score: number;
  summary: string;
};

/**
 * AT#13 — transparent match_score + match_explanation (matched/missing skills,
 * experience, education, location, visa/QID) using recruiter-adjustable weights.
 */
export function scoreCandidateMatch(
  vacancy: VacancyMatchInput,
  candidate: CandidateMatchInput,
  weightsInput?: Partial<MatchWeights> | null,
): MatchExplanation {
  const weights = mergeMatchWeights(weightsInput);
  const requiredSkills = tokenizeSkills(vacancy.skills);
  // Also pull skill-like tokens from JD when skills field empty.
  const jdSkills =
    requiredSkills.length === 0 && vacancy.jobDescription
      ? tokenizeSkills(
          (vacancy.jobDescription.match(/\b[A-Za-z][A-Za-z0-9.+#-]{2,}\b/g) ?? [])
            .slice(0, 40)
            .join(","),
        )
      : [];
  const needed = requiredSkills.length ? requiredSkills : jdSkills.slice(0, 12);

  const candSkills = new Set([
    ...tokenizeSkills(candidate.skills),
    ...tokenizeSkills(candidate.cvText),
  ]);

  const matchedSkills = needed.filter((s) =>
    [...candSkills].some((c) => c === s || c.includes(s) || s.includes(c)),
  );
  const missingSkills = needed.filter((s) => !matchedSkills.includes(s));
  const skillRatio = needed.length === 0 ? 1 : matchedSkills.length / needed.length;
  const skillsPoints = round2(weights.skills * skillRatio);

  const reqExp = vacancy.experienceYears != null ? Number(vacancy.experienceYears) : null;
  const candExp = candidate.experienceYears != null ? Number(candidate.experienceYears) : null;
  const expOk =
    reqExp == null || reqExp <= 0 ? true : candExp != null && candExp + 1e-6 >= reqExp;
  const expRatio =
    reqExp == null || reqExp <= 0
      ? 1
      : candExp == null
        ? 0
        : Math.min(1, candExp / reqExp);
  const experiencePoints = round2(weights.experience * expRatio);

  const eduOk = educationMatches(vacancy.education, candidate.education);
  const educationPoints = round2(weights.education * (eduOk ? 1 : 0));

  const reqLoc = vacancy.requiredLocation?.trim() || null;
  const candLoc = candidate.location?.trim() || null;
  const locOk =
    !reqLoc ||
    Boolean(candLoc && (norm(candLoc).includes(norm(reqLoc)) || norm(reqLoc).includes(norm(candLoc))));
  const locationPoints = round2(weights.location * (locOk ? 1 : 0));

  const requiresQid = Boolean(vacancy.requiresQid);
  const requiresVisa = Boolean(vacancy.requiresVisa);
  const hasQid = Boolean(candidate.qid?.trim());
  const hasVisa = Boolean(candidate.visaStatus?.trim()) && !/^none|no|n\/a$/i.test(candidate.visaStatus!.trim());
  let visaOk = true;
  if (requiresQid && !hasQid) visaOk = false;
  if (requiresVisa && !hasVisa) visaOk = false;
  if (!requiresQid && !requiresVisa) visaOk = true;
  const visaQidPoints = round2(weights.visa_qid * (visaOk ? 1 : 0));

  const score = round2(
    skillsPoints + experiencePoints + educationPoints + locationPoints + visaQidPoints,
  );

  const parts: string[] = [];
  if (needed.length) {
    parts.push(
      `Skills ${matchedSkills.length}/${needed.length}` +
        (missingSkills.length ? ` (missing: ${missingSkills.slice(0, 5).join(", ")})` : ""),
    );
  }
  if (reqExp != null && reqExp > 0) {
    parts.push(
      expOk
        ? `Experience OK (${candExp ?? "?"}≥${reqExp}y)`
        : `Experience short (${candExp ?? "n/a"} < ${reqExp}y)`,
    );
  }
  if (vacancy.education?.trim()) {
    parts.push(eduOk ? "Education OK" : `Education gap (need ${vacancy.education})`);
  }
  if (reqLoc) {
    parts.push(locOk ? "Location OK" : `Location mismatch (need ${reqLoc})`);
  }
  if (requiresQid || requiresVisa) {
    parts.push(visaOk ? "Visa/QID OK" : "Visa/QID incomplete");
  }

  return {
    matchedSkills,
    missingSkills,
    experience: {
      required: reqExp,
      candidate: candExp,
      ok: expOk,
      points: experiencePoints,
      maxPoints: weights.experience,
    },
    education: {
      required: vacancy.education?.trim() || null,
      candidate: candidate.education?.trim() || null,
      ok: eduOk,
      points: educationPoints,
      maxPoints: weights.education,
    },
    location: {
      required: reqLoc,
      candidate: candLoc,
      ok: locOk,
      points: locationPoints,
      maxPoints: weights.location,
    },
    visaQid: {
      requiresQid,
      requiresVisa,
      hasQid,
      hasVisa,
      ok: visaOk,
      points: visaQidPoints,
      maxPoints: weights.visa_qid,
    },
    skillsPoints,
    skillsMaxPoints: weights.skills,
    weights,
    score,
    summary: parts.length ? parts.join("; ") : "No vacancy filters set — baseline score 100.",
  };
}

/**
 * AT#14 — refuse rejection driven only by AI/match score.
 * Human reason required; basedOnScoreAlone / autoReject flags always blocked.
 */
export function assertStageChangeAllowed(input: {
  toStage: HrApplicationStage | string;
  reason?: string | null;
  /** Explicit auto path from score/AI — always refused for rejected. */
  basedOnScoreAlone?: boolean;
  autoReject?: boolean;
  matchScore?: number | null;
  aiScore?: number | null;
}): void {
  if (!HR_APPLICATION_STAGES.includes(input.toStage as HrApplicationStage)) {
    throw new Error(`Invalid application stage: ${input.toStage}`);
  }
  if (input.toStage !== "rejected") return;

  if (input.basedOnScoreAlone || input.autoReject) {
    throw new Error(
      "Cannot auto-reject based on AI/match score alone (AT#14). A recruiter must set stage=rejected with an explicit reason.",
    );
  }

  const reason = input.reason?.trim() ?? "";
  if (!reason) {
    throw new Error(
      "Rejection requires an explicit human reason; AI/score cannot auto-reject (AT#14).",
    );
  }

  // Block thin "score-only" reasons that try to smuggle auto-reject through the API.
  if (/^(low\s*)?(ai|match)?\s*score(\s*(too\s*)?low)?$/i.test(reason) || /^auto[-_]?reject$/i.test(reason)) {
    throw new Error(
      "Cannot reject from score alone (AT#14). Provide a substantive human reason.",
    );
  }
}

export type DuplicateCandidateHit = {
  id: string;
  fullName: string;
  matchOn: Array<"email" | "phone" | "qid" | "cv_similarity">;
  similarity?: number;
};

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function normalizeEmail(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function normalizeQid(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toLowerCase();
}

/** Simple token Jaccard for optional CV similarity (0–1). */
export function cvTextSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const tok = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3),
    );
  const A = tok(a ?? "");
  const B = tok(b ?? "");
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export function findDuplicateCandidates(input: {
  email?: string | null;
  phone?: string | null;
  qid?: string | null;
  cvText?: string | null;
  existing: Array<{
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    qid?: string | null;
    cvText?: string | null;
  }>;
  cvSimilarityThreshold?: number;
}): DuplicateCandidateHit[] {
  const email = normalizeEmail(input.email);
  const phone = digitsOnly(input.phone);
  const qid = normalizeQid(input.qid);
  const threshold = input.cvSimilarityThreshold ?? 0.85;
  const hits: DuplicateCandidateHit[] = [];

  for (const row of input.existing) {
    const matchOn: DuplicateCandidateHit["matchOn"] = [];
    if (email && normalizeEmail(row.email) === email) matchOn.push("email");
    if (phone.length >= 8 && digitsOnly(row.phone) === phone) matchOn.push("phone");
    if (qid && normalizeQid(row.qid) === qid) matchOn.push("qid");
    let similarity: number | undefined;
    if (input.cvText && row.cvText) {
      similarity = cvTextSimilarity(input.cvText, row.cvText);
      if (similarity >= threshold) matchOn.push("cv_similarity");
    }
    if (matchOn.length) {
      hits.push({ id: row.id, fullName: row.fullName, matchOn, similarity });
    }
  }
  return hits;
}

/**
 * Best-effort CV text parse (name / email / phone). PDF binary is not fully parsed —
 * callers pass extracted text or leave fields for manual entry.
 */
export function parseCvText(raw: string | null | undefined): {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  skillsHint: string | null;
} {
  const text = (raw ?? "").replace(/\r/g, "\n");
  if (!text.trim()) {
    return { fullName: null, email: null, phone: null, skillsHint: null };
  }

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let fullName: string | null = null;
  for (const line of lines.slice(0, 8)) {
    if (/@|http|curriculum|resume|cv\b|phone|email|address/i.test(line)) continue;
    if (/^[A-Za-z][A-Za-z .'-]{2,60}$/.test(line) && line.split(/\s+/).length <= 5) {
      fullName = line;
      break;
    }
  }

  const skillBlock = text.match(/(?:skills|competencies)\s*[:\-]?\s*([\s\S]{0,400})/i);
  const skillsHint = skillBlock
    ? skillBlock[1]!
        .split(/\n/)[0]!
        .replace(/[|;]/g, ",")
        .slice(0, 300)
        .trim() || null
    : null;

  return {
    fullName,
    email: emailMatch?.[0]?.toLowerCase() ?? null,
    phone: phoneMatch?.[0]?.replace(/\s+/g, " ").trim() ?? null,
    skillsHint,
  };
}

/** Strip expected salary unless recruiter has salary capability. */
export function maskCandidateSalary<T extends { expectedSalaryQar?: number | null }>(
  row: T,
  canViewSalary: boolean,
): T {
  if (canViewSalary) return row;
  return { ...row, expectedSalaryQar: null };
}

export function maskOfferSalary<T extends { salaryQar?: number | null }>(
  row: T,
  canViewSalary: boolean,
): T {
  if (canViewSalary) return row;
  return { ...row, salaryQar: null };
}

/** Redact PII for recruitment.request read-only trackers. */
export function redactCandidatePii<
  T extends {
    email?: string | null;
    phone?: string | null;
    qid?: string | null;
    cvPath?: string | null;
    cvText?: string | null;
    expectedSalaryQar?: number | null;
  },
>(row: T): T {
  return {
    ...row,
    email: row.email ? "[redacted]" : null,
    phone: row.phone ? "[redacted]" : null,
    qid: row.qid ? "[redacted]" : null,
    cvPath: null,
    cvText: null,
    expectedSalaryQar: null,
  };
}

export function isSelectedNotJoinedStage(stage: string): boolean {
  return (HR_SELECTED_NOT_JOINED_STAGES as readonly string[]).includes(stage);
}
