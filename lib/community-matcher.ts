// Match a piece of OCR'd document text to one of an org's communities.
// Used by /api/documents/process when the client doesn't provide a
// communityId on a bulk upload — the server figures it out from the doc body.
//
// Strategy:
//   1. Heuristic — tokenize each community's legal_name (skipping stopwords)
//      and score how many distinct tokens appear in the document text,
//      weighted by token length. Decisive winner = high confidence.
//   2. Fallback — if the heuristic is ambiguous, ask Claude with the first
//      few thousand chars of text + the candidate list to pick one. Return
//      with the model's confidence.
//   3. If still nothing, return null so the caller can prompt the user.

import { generateText, Output } from "ai";
import { z } from "zod";

import { BEST_MODEL } from "@/lib/ai-models";

const STOPWORDS = new Set([
  "hoa",
  "coa",
  "condo",
  "condominium",
  "community",
  "association",
  "homeowners",
  "the",
  "of",
  "at",
  "and",
  "&",
  "llc",
  "inc",
  "incorporated",
]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function communityTokens(legalName: string): string[] {
  return normalize(legalName)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export type Confidence = "high" | "medium" | "low" | "unknown";

export type CommunityMatchInput = { id: string; legal_name: string };

export type CommunityMatchResult = {
  communityId: string | null;
  confidence: Confidence;
  source: "heuristic" | "ai" | "none";
};

const CLAUDE_MAX_TEXT_CHARS = 8_000;

const ClaudeSchema = z.object({
  community_id: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low", "unknown"]),
  reasoning: z.string().nullable(),
});

export async function matchCommunityFromText(
  text: string,
  communities: CommunityMatchInput[]
): Promise<CommunityMatchResult> {
  if (communities.length === 0) {
    return { communityId: null, confidence: "unknown", source: "none" };
  }
  if (communities.length === 1) {
    // Single-community orgs: there's only one possible answer.
    return { communityId: communities[0].id, confidence: "high", source: "heuristic" };
  }

  const haystack = normalize(text);
  if (!haystack) {
    return { communityId: null, confidence: "unknown", source: "none" };
  }

  // Heuristic pass.
  const scored = communities
    .map((c) => {
      const tokens = communityTokens(c.legal_name);
      let matched = 0;
      let score = 0;
      for (const tok of tokens) {
        if (haystack.includes(tok)) {
          matched++;
          score += tok.length;
        }
      }
      return { id: c.id, legal_name: c.legal_name, matched, score, tokenCount: tokens.length };
    })
    .filter((s) => s.matched > 0)
    .sort((a, b) => b.score - a.score || b.matched - a.matched);

  if (scored.length === 0) {
    return await callClaude(text, communities, "no heuristic match");
  }

  const best = scored[0];
  const second = scored[1];
  const isDecisive = !second || second.score < best.score * 0.6;
  const isStrong = best.matched >= 2 || best.score >= 8;

  if (isDecisive && isStrong) {
    return { communityId: best.id, confidence: "high", source: "heuristic" };
  }

  // Ambiguous — let Claude decide between the top candidates.
  const candidates =
    scored.length <= 1
      ? communities
      : communities.filter((c) => scored.slice(0, 4).some((s) => s.id === c.id));
  return await callClaude(text, candidates, "ambiguous heuristic");
}

async function callClaude(
  text: string,
  communities: CommunityMatchInput[],
  reason: string
): Promise<CommunityMatchResult> {
  try {
    const sample = text.slice(0, CLAUDE_MAX_TEXT_CHARS);
    const candidateList = communities
      .map((c) => `- id: ${c.id} | name: ${c.legal_name}`)
      .join("\n");

    const prompt = [
      `You are routing a governing/association document to the right HOA community.`,
      `Below is the document text and a list of candidate communities.`,
      ``,
      `Pick the community whose name is most clearly referenced in the document.`,
      `If the document does not mention any of these communities by name, return community_id: null.`,
      `Set confidence to "high" only when the community name appears explicitly`,
      `(or all distinctive words in its name appear together) in the document.`,
      `Use "medium" for partial / fuzzy mentions, "low" for educated guesses, "unknown" when you can't tell.`,
      ``,
      `Candidate communities:`,
      candidateList,
      ``,
      `--- Document text (truncated) ---`,
      sample,
      `--- End document ---`,
    ].join("\n");

    const { output } = await generateText({
      model: BEST_MODEL,
      output: Output.object({ schema: ClaudeSchema }),
      system:
        "You are a meticulous document router. Respond only with structured data. Never invent a community id; only return ids from the provided candidate list (or null).",
      prompt,
    });

    if (!output) {
      return { communityId: null, confidence: "unknown", source: "ai" };
    }
    const valid =
      output.community_id && communities.some((c) => c.id === output.community_id)
        ? output.community_id
        : null;
    return {
      communityId: valid,
      confidence: valid ? output.confidence : "unknown",
      source: "ai",
    };
  } catch (err) {
    console.warn(`[community-matcher] Claude fallback failed (${reason}):`, err);
    return { communityId: null, confidence: "unknown", source: "ai" };
  }
}
