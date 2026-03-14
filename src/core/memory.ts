/**
 * Relational Memory — inspired by SoulFrame's emotional memory
 * and ActivatePrime's 4-layer memory architecture.
 *
 * Tracks emotional patterns, key moments, and relational depth
 * across conversations so the AI truly knows who it's talking to.
 */

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
  themes: Map<string, number>;
  recentMemories: MemoryEntry[];
}

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
];

const MAX_RECENT = 50;

const state: RelationalState = {
  interactions: 0,
  themes: new Map(),
  recentMemories: [],
};

export function rememberMessage(msg: Message): void {
  if (msg.role === "system") return;

  const entry = analyzeMessage(msg);
  state.recentMemories.push(entry);
  state.interactions++;

  if (state.recentMemories.length > MAX_RECENT) {
    state.recentMemories = state.recentMemories.slice(-MAX_RECENT);
  }

  entry.tags.forEach((tag) => {
    state.themes.set(tag, (state.themes.get(tag) || 0) + 1);
  });
}

function analyzeMessage(msg: Message): MemoryEntry {
  let maxWeight = 0.1;
  const tags: string[] = [];

  for (const marker of EMOTIONAL_MARKERS) {
    if (marker.pattern.test(msg.content)) {
      maxWeight = Math.max(maxWeight, marker.weight);
      if (!tags.includes(marker.tag)) {
        tags.push(marker.tag);
      }
    }
  }

  return {
    content: msg.content,
    role: msg.role as "user" | "assistant",
    timestamp: msg.timestamp,
    emotionalWeight: maxWeight,
    tags,
  };
}

export function getRelationalContext(): string {
  const parts: string[] = [];

  if (state.interactions > 0) {
    parts.push(`You have shared ${state.interactions} exchanges together.`);
  }

  const significantThemes = [...state.themes.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (significantThemes.length > 0) {
    const themeStr = significantThemes
      .map(([theme]) => theme)
      .join(", ");
    parts.push(`Recurring themes in their words: ${themeStr}.`);
  }

  const recentHeavy = state.recentMemories
    .filter((m) => m.role === "user" && m.emotionalWeight >= 0.7)
    .slice(-3);

  if (recentHeavy.length > 0) {
    parts.push(
      "They have recently shared things that carry deep emotional weight. Tread with care and presence."
    );
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
