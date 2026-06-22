import type { Message } from "../store";

interface MemoryEntry {
  content: string;
  role: "user" | "assistant";
  timestamp: number;
  emotionalWeight: number;
  tags: string[];
}

interface RelationalState {
  interactions: number;
  themes: Record<string, number>;
  recentMemories: MemoryEntry[];
  firstSeen: number;
  deepInsights: string[];
}

const STORAGE_KEY = "you-relational-memory";

const EMOTIONAL_MARKERS = [
  { pattern: /\b(hurt|pain|ache|suffer|struggle|broke|broken)\b/i, weight: 0.8, tag: "pain" },
  { pattern: /\b(abuse|abused|hit|beat|burn|burned|trauma)\b/i, weight: 0.95, tag: "trauma" },
  { pattern: /\b(alone|lonely|isolated|nobody|no one)\b/i, weight: 0.7, tag: "isolation" },
  { pattern: /\b(afraid|scared|fear|terrified|anxious)\b/i, weight: 0.7, tag: "fear" },
  { pattern: /\b(angry|furious|rage|hate|hatred)\b/i, weight: 0.75, tag: "anger" },
  { pattern: /\b(sad|crying|tears|grief|loss|lost)\b/i, weight: 0.7, tag: "grief" },
  { pattern: /\b(hope|hoping|better|heal|healing|stronger)\b/i, weight: 0.6, tag: "hope" },
  { pattern: /\b(happy|joy|grateful|thankful|proud|love)\b/i, weight: 0.5, tag: "light" },
  { pattern: /\b(help|need|please|can't|cannot|don't know)\b/i, weight: 0.6, tag: "seeking" },
  { pattern: /\b(die|dying|kill|suicide|end it|give up)\b/i, weight: 1.0, tag: "crisis" },
  { pattern: /\b(family|mother|father|mom|dad|parent|sibling|brother|sister)\b/i, weight: 0.6, tag: "family" },
  { pattern: /\b(work|job|career|boss|fired|quit)\b/i, weight: 0.5, tag: "work" },
  { pattern: /\b(friend|friendship|betrayed|trust)\b/i, weight: 0.6, tag: "trust" },
  { pattern: /\b(child|childhood|kid|growing up|young)\b/i, weight: 0.7, tag: "childhood" },
];

const MAX_RECENT = 100;
const MAX_INSIGHTS = 20;

let state: RelationalState = loadState();

function loadState(): RelationalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        interactions: parsed.interactions || 0,
        themes: parsed.themes || {},
        recentMemories: parsed.recentMemories || [],
        firstSeen: parsed.firstSeen || Date.now(),
        deepInsights: parsed.deepInsights || [],
      };
    }
  } catch {}
  return {
    interactions: 0,
    themes: {},
    recentMemories: [],
    firstSeen: Date.now(),
    deepInsights: [],
  };
}

function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function rememberMessage(msg: Message): void {
  if (msg.role === "system") return;

  const entry = analyzeMessage(msg);
  state.recentMemories.push(entry);
  state.interactions++;

  if (state.recentMemories.length > MAX_RECENT) {
    distillOldMemories();
  }

  entry.tags.forEach((tag) => {
    state.themes[tag] = (state.themes[tag] || 0) + 1;
  });

  saveState();
}

function distillOldMemories(): void {
  const old = state.recentMemories.slice(0, -MAX_RECENT);
  state.recentMemories = state.recentMemories.slice(-MAX_RECENT);

  const heaviest = old
    .filter((m) => m.role === "user" && m.emotionalWeight >= 0.7)
    .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
    .slice(0, 3);

  for (const mem of heaviest) {
    const summary = mem.content.length > 120
      ? mem.content.slice(0, 120) + "..."
      : mem.content;
    const insight = `[${new Date(mem.timestamp).toLocaleDateString()}] They shared something heavy (${mem.tags.join(", ")}): "${summary}"`;
    if (state.deepInsights.length < MAX_INSIGHTS) {
      state.deepInsights.push(insight);
    }
  }
}

export type BondStage = "new" | "warming" | "trusted" | "bonded";

export function getBondStage(): BondStage {
  const n = state.interactions;
  if (n < 6) return "new";
  if (n < 21) return "warming";
  if (n < 51) return "trusted";
  return "bonded";
}

export function analyzeUserContent(content: string): {
  emotionalWeight: number;
  tags: string[];
} {
  let maxWeight = 0.1;
  const tags: string[] = [];

  for (const marker of EMOTIONAL_MARKERS) {
    if (marker.pattern.test(content)) {
      maxWeight = Math.max(maxWeight, marker.weight);
      if (!tags.includes(marker.tag)) tags.push(marker.tag);
    }
  }

  return { emotionalWeight: maxWeight, tags };
}

function analyzeMessage(msg: Message): MemoryEntry {
  const { emotionalWeight, tags } = analyzeUserContent(msg.content);
  return {
    content: msg.content,
    role: msg.role as "user" | "assistant",
    timestamp: msg.timestamp,
    emotionalWeight,
    tags,
  };
}

export function getRelationalContext(): string {
  const parts: string[] = [];

  if (state.interactions > 0) {
    const daysTogether = Math.floor((Date.now() - state.firstSeen) / 86400000);
    if (daysTogether > 0) {
      parts.push(`You have been with this person for ${daysTogether} day${daysTogether === 1 ? "" : "s"}, across ${state.interactions} exchanges.`);
    } else {
      parts.push(`You have shared ${state.interactions} exchanges together today.`);
    }
  }

  const significantThemes = Object.entries(state.themes)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (significantThemes.length > 0) {
    const themeStr = significantThemes.map(([theme]) => theme).join(", ");
    parts.push(`Recurring themes in their words: ${themeStr}.`);
  }

  if (state.deepInsights.length > 0) {
    parts.push("DEEP MEMORY (things they've shared over time that matter):");
    state.deepInsights.slice(-5).forEach((insight) => parts.push(`  - ${insight}`));
  }

  const recentHeavy = state.recentMemories
    .filter((m) => m.role === "user" && m.emotionalWeight >= 0.7)
    .slice(-3);

  if (recentHeavy.length > 0) {
    parts.push("They have recently shared things that carry deep emotional weight. Tread with care and presence.");
  }

  const hasCrisis = state.recentMemories.some(
    (m) => m.tags.includes("crisis") && Date.now() - m.timestamp < 1800000
  );

  if (hasCrisis) {
    parts.push(
      "IMPORTANT: They may be in crisis. Respond with immediate warmth and care. " +
      "Gently encourage them to reach out to a crisis helpline (988 Suicide & Crisis Lifeline) " +
      "while making clear you are here for them right now."
    );
  }

  return parts.join("\n");
}

export function getMemoryStats() {
  return {
    interactions: state.interactions,
    daysTogether: Math.floor((Date.now() - state.firstSeen) / 86400000),
    themes: Object.keys(state.themes).length,
    deepInsights: state.deepInsights.length,
  };
}
