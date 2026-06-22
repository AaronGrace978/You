/** Lightweight semantic similarity — no embeddings API required. */

const STOP = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was",
  "one", "our", "out", "day", "get", "has", "him", "his", "how", "its", "may", "new",
  "now", "old", "see", "two", "way", "who", "boy", "did", "she", "use", "her", "that",
  "this", "with", "have", "from", "they", "been", "were", "said", "each", "what",
  "when", "your", "about", "would", "there", "their", "just", "like", "know", "think",
  "really", "want", "going", "been", "some", "them", "than", "then", "into", "over",
]);

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z0-9']{3,}\b/g) || [];
  return words.filter((w) => !STOP.has(w));
}

function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [k, v] of a) {
    normA += v * v;
    const bv = b.get(k);
    if (bv) dot += v * bv;
  }
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SearchableDoc {
  id: string;
  content: string;
  emotionalWeight?: number;
  timestamp?: number;
}

export function rankByRelevance(
  query: string,
  docs: SearchableDoc[],
  limit = 4
): { doc: SearchableDoc; score: number }[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0 || docs.length === 0) return [];

  const qVec = termFreq(qTokens);
  const qSet = new Set(qTokens);

  const scored = docs.map((doc) => {
    const dTokens = tokenize(doc.content);
    const dVec = termFreq(dTokens);
    let score = cosine(qVec, dVec);

    // Boost direct word overlap and emotionally heavy moments
    for (const t of dTokens) {
      if (qSet.has(t)) score += 0.08;
    }
    if (doc.emotionalWeight && doc.emotionalWeight >= 0.7) score += 0.05;
    if (doc.timestamp && Date.now() - doc.timestamp < 86400000 * 3) score += 0.03;

    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
